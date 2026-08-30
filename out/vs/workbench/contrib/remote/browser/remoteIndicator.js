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
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from "../../../services/remote/common/remoteAgentService.js";
import { RunOnceScheduler, retry } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { MenuId, IMenuService, MenuItemAction, MenuRegistry, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { StatusbarAlignment, IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { Schemas } from "../../../../base/common/network.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { PlatformToString, isWeb, platform } from "../../../../base/common/platform.js";
import { truncate } from "../../../../base/common/strings.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { getRemoteName } from "../../../../platform/remote/common/remoteHosts.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { getCodiconAriaLabel } from "../../../../base/common/iconLabels.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ReloadWindowAction } from "../../../browser/actions/windowActions.js";
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IExtensionsWorkbenchService, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from "../../extensions/common/extensions.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IsSessionsWindowContext, RemoteNameContext, VirtualWorkspaceContext } from "../../../common/contextkeys.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { infoIcon } from "../../extensions/browser/extensionsIcons.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import Severity from "../../../../base/common/severity.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
let RemoteStatusIndicator = class extends Disposable {
  constructor(statusbarService, environmentService, labelService, contextKeyService, menuService, quickInputService, commandService, extensionService, remoteAgentService, remoteAuthorityResolverService, hostService, workspaceContextService, logService, extensionGalleryService, telemetryService, productService, extensionManagementService, extensionsWorkbenchService, dialogService, lifecycleService, openerService, configurationService) {
    super();
    this.statusbarService = statusbarService;
    this.environmentService = environmentService;
    this.labelService = labelService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.extensionService = extensionService;
    this.remoteAgentService = remoteAgentService;
    this.remoteAuthorityResolverService = remoteAuthorityResolverService;
    this.hostService = hostService;
    this.workspaceContextService = workspaceContextService;
    this.logService = logService;
    this.extensionGalleryService = extensionGalleryService;
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.extensionManagementService = extensionManagementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.dialogService = dialogService;
    this.lifecycleService = lifecycleService;
    this.openerService = openerService;
    this.configurationService = configurationService;
    this.virtualWorkspaceLocation = void 0;
    this.connectionState = void 0;
    this.connectionToken = void 0;
    this.networkState = void 0;
    this.measureNetworkConnectionLatencyScheduler = void 0;
    this.loggedInvalidGroupNames = /* @__PURE__ */ Object.create(null);
    this._remoteExtensionMetadata = void 0;
    this.remoteMetadataInitialized = false;
    this._onDidChangeEntries = this._register(new Emitter());
    this.onDidChangeEntries = this._onDidChangeEntries.event;
    this.unrestrictedRemoteIndicatorMenu = this._register(this.menuService.createMenu(MenuId.StatusBarWindowIndicatorMenu, this.contextKeyService));
    this.remoteIndicatorMenu = this._register(this.menuService.createMenu(MenuId.StatusBarRemoteIndicatorMenu, this.contextKeyService));
    this.connectionStateContextKey = new RawContextKey("remoteConnectionState", "").bindTo(this.contextKeyService);
    if (this.remoteAuthority) {
      this.connectionState = "initializing";
      this.connectionStateContextKey.set(this.connectionState);
    } else {
      this.updateVirtualWorkspaceLocation();
    }
    this.registerActions();
    this.registerListeners();
    this.updateWhenInstalledExtensionsRegistered();
    this.updateRemoteStatusIndicator();
  }
  get remoteExtensionMetadata() {
    if (!this._remoteExtensionMetadata) {
      const remoteExtensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
      this._remoteExtensionMetadata = Object.values(remoteExtensionTips).filter((value) => value.startEntry !== void 0).map((value) => {
        return {
          id: value.extensionId,
          installed: false,
          friendlyName: value.friendlyName,
          isPlatformCompatible: false,
          dependencies: [],
          helpLink: value.startEntry?.helpLink ?? "",
          startConnectLabel: value.startEntry?.startConnectLabel ?? "",
          startCommand: value.startEntry?.startCommand ?? "",
          priority: value.startEntry?.priority ?? 10,
          supportedPlatforms: value.supportedPlatforms
        };
      });
      this.remoteExtensionMetadata.sort((ext1, ext2) => ext1.priority - ext2.priority);
    }
    return this._remoteExtensionMetadata;
  }
  get remoteAuthority() {
    return this.environmentService.remoteAuthority;
  }
  registerActions() {
    const category = nls.localize2("remote.category", "Remote");
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID,
          category,
          title: nls.localize2("remote.showMenu", "Show Remote Menu"),
          f1: true,
          keybinding: {
            weight: KeybindingWeight.WorkbenchContrib,
            primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyO
          }
        });
        this.run = () => that.showRemoteMenu();
      }
    }));
    if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID) {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            category,
            title: nls.localize2("remote.close", "Close Remote Connection"),
            f1: true,
            precondition: ContextKeyExpr.and(ContextKeyExpr.or(RemoteNameContext, VirtualWorkspaceContext), IsSessionsWindowContext.negate())
          });
          this.run = () => that.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
        }
      }));
      if (this.remoteAuthority) {
        MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
          group: "6_close",
          command: {
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            title: nls.localize({ key: "miCloseRemote", comment: ["&& denotes a mnemonic"] }, "Close Re&&mote Connection")
          },
          when: IsSessionsWindowContext.negate(),
          order: 3.5
        });
      }
    }
    if (this.extensionGalleryService.isEnabled()) {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: RemoteStatusIndicator.INSTALL_REMOTE_EXTENSIONS_ID,
            category,
            title: nls.localize2("remote.install", "Install Remote Development Extensions"),
            f1: true
          });
          this.run = (accessor, input) => {
            const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
            return extensionsWorkbenchService.openSearch(`@recommended:remotes`);
          };
        }
      }));
    }
  }
  registerListeners() {
    const updateRemoteActions = () => {
      this.remoteMenuActionsGroups = void 0;
      this.updateRemoteStatusIndicator();
    };
    this._register(this.unrestrictedRemoteIndicatorMenu.onDidChange(updateRemoteActions));
    this._register(this.remoteIndicatorMenu.onDidChange(updateRemoteActions));
    this._register(this.labelService.onDidChangeFormatters(() => this.updateRemoteStatusIndicator()));
    const remoteIndicator = this.environmentService.options?.windowIndicator;
    if (remoteIndicator && remoteIndicator.onDidChange) {
      this._register(remoteIndicator.onDidChange(() => this.updateRemoteStatusIndicator()));
    }
    if (this.remoteAuthority) {
      const connection = this.remoteAgentService.getConnection();
      if (connection) {
        this._register(connection.onDidStateChange((e) => {
          switch (e.type) {
            case PersistentConnectionEventType.ConnectionLost:
            case PersistentConnectionEventType.ReconnectionRunning:
            case PersistentConnectionEventType.ReconnectionWait:
              this.setConnectionState("reconnecting");
              break;
            case PersistentConnectionEventType.ReconnectionPermanentFailure:
              this.setConnectionState("disconnected");
              break;
            case PersistentConnectionEventType.ConnectionGain:
              this.setConnectionState("connected");
              break;
          }
        }));
      }
    } else {
      this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => {
        this.updateVirtualWorkspaceLocation();
        this.updateRemoteStatusIndicator();
      }));
    }
    if (isWeb) {
      this._register(Event.any(
        this._register(new DomEmitter(mainWindow, "online")).event,
        this._register(new DomEmitter(mainWindow, "offline")).event
      )(() => this.setNetworkState(navigator.onLine ? "online" : "offline")));
    }
    this._register(this.extensionService.onDidChangeExtensions(async (result) => {
      for (const ext of result.added) {
        const index = this.remoteExtensionMetadata.findIndex((value) => ExtensionIdentifier.equals(value.id, ext.identifier));
        if (index > -1) {
          this.remoteExtensionMetadata[index].installed = true;
        }
      }
    }));
    this._register(this.extensionManagementService.onDidUninstallExtension(async (result) => {
      const index = this.remoteExtensionMetadata.findIndex((value) => ExtensionIdentifier.equals(value.id, result.identifier.id));
      if (index > -1) {
        this.remoteExtensionMetadata[index].installed = false;
      }
    }));
  }
  async initializeRemoteMetadata() {
    if (this.remoteMetadataInitialized) {
      return;
    }
    const currentPlatform = PlatformToString(platform);
    for (let i = 0; i < this.remoteExtensionMetadata.length; i++) {
      const extensionId = this.remoteExtensionMetadata[i].id;
      const supportedPlatforms = this.remoteExtensionMetadata[i].supportedPlatforms;
      const isInstalled = (await this.extensionManagementService.getInstalled()).find((value) => ExtensionIdentifier.equals(value.identifier.id, extensionId)) ? true : false;
      this.remoteExtensionMetadata[i].installed = isInstalled;
      if (isInstalled) {
        this.remoteExtensionMetadata[i].isPlatformCompatible = true;
      } else if (supportedPlatforms && !supportedPlatforms.includes(currentPlatform)) {
        this.remoteExtensionMetadata[i].isPlatformCompatible = false;
      } else {
        this.remoteExtensionMetadata[i].isPlatformCompatible = true;
      }
    }
    this.remoteMetadataInitialized = true;
    this._onDidChangeEntries.fire();
    this.updateRemoteStatusIndicator();
  }
  updateVirtualWorkspaceLocation() {
    this.virtualWorkspaceLocation = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace());
  }
  async updateWhenInstalledExtensionsRegistered() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const remoteAuthority = this.remoteAuthority;
    if (remoteAuthority) {
      (async () => {
        try {
          const { authority } = await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority);
          this.connectionToken = authority.connectionToken;
          this.setConnectionState("connected");
        } catch (error) {
          this.setConnectionState("disconnected");
        }
      })();
    }
    this.updateRemoteStatusIndicator();
    this.initializeRemoteMetadata();
  }
  setConnectionState(newState) {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      if (this.connectionState === "reconnecting") {
        this.connectionStateContextKey.set("disconnected");
      } else {
        this.connectionStateContextKey.set(this.connectionState);
      }
      this.updateRemoteStatusIndicator();
      if (newState === "connected") {
        this.scheduleMeasureNetworkConnectionLatency();
      }
    }
  }
  scheduleMeasureNetworkConnectionLatency() {
    if (!this.remoteAuthority || // only when having a remote connection
    this.measureNetworkConnectionLatencyScheduler) {
      return;
    }
    this.measureNetworkConnectionLatencyScheduler = this._register(new RunOnceScheduler(() => this.measureNetworkConnectionLatency(), RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_DELAY));
    this.measureNetworkConnectionLatencyScheduler.schedule(RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_FIRST_RUN_DELAY);
  }
  async measureNetworkConnectionLatency() {
    if (this.hostService.hasFocus && this.networkState !== "offline") {
      const measurement = await remoteConnectionLatencyMeasurer.measure(this.remoteAgentService);
      if (measurement) {
        if (measurement.high) {
          this.setNetworkState("high-latency");
        } else if (this.networkState === "high-latency") {
          this.setNetworkState("online");
        }
      }
    }
    this.measureNetworkConnectionLatencyScheduler?.schedule();
  }
  setNetworkState(newState) {
    if (this.networkState !== newState) {
      const oldState = this.networkState;
      this.networkState = newState;
      if (newState === "high-latency") {
        this.logService.warn(`Remote network connection appears to have high latency (${remoteConnectionLatencyMeasurer.latency?.current?.toFixed(2)}ms last, ${remoteConnectionLatencyMeasurer.latency?.average?.toFixed(2)}ms average)`);
      }
      if (this.connectionToken) {
        if (newState === "online" && oldState === "high-latency") {
          this.logNetworkConnectionHealthTelemetry(this.connectionToken, "good");
        } else if (newState === "high-latency" && oldState === "online") {
          this.logNetworkConnectionHealthTelemetry(this.connectionToken, "poor");
        }
      }
      this.updateRemoteStatusIndicator();
    }
  }
  logNetworkConnectionHealthTelemetry(connectionToken, connectionHealth) {
    this.telemetryService.publicLog2("remoteConnectionHealth", {
      remoteName: getRemoteName(this.remoteAuthority),
      reconnectionToken: connectionToken,
      connectionHealth
    });
  }
  validatedGroup(group) {
    if (!group.match(/^(remote|virtualfs)_(\d\d)_(([a-z][a-z0-9+.-]*)_(.*))$/)) {
      if (!this.loggedInvalidGroupNames[group]) {
        this.loggedInvalidGroupNames[group] = true;
        this.logService.warn(`Invalid group name used in "statusBar/remoteIndicator" menu contribution: ${group}. Entries ignored. Expected format: 'remote_$ORDER_$REMOTENAME_$GROUPING or 'virtualfs_$ORDER_$FILESCHEME_$GROUPING.`);
      }
      return false;
    }
    return true;
  }
  getRemoteMenuActions(doNotUseCache) {
    if (!this.remoteMenuActionsGroups || doNotUseCache) {
      this.remoteMenuActionsGroups = this.remoteIndicatorMenu.getActions().filter((a) => this.validatedGroup(a[0])).concat(this.unrestrictedRemoteIndicatorMenu.getActions());
    }
    return this.remoteMenuActionsGroups;
  }
  updateRemoteStatusIndicator() {
    const remoteIndicator = this.environmentService.options?.windowIndicator;
    if (remoteIndicator) {
      let remoteIndicatorLabel = remoteIndicator.label.trim();
      if (!remoteIndicatorLabel.startsWith("$(")) {
        remoteIndicatorLabel = `$(remote) ${remoteIndicatorLabel}`;
      }
      this.renderRemoteStatusIndicator(truncate(remoteIndicatorLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH), remoteIndicator.tooltip, remoteIndicator.command);
      return;
    }
    if (this.remoteAuthority) {
      const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.remoteAuthority) || this.remoteAuthority;
      switch (this.connectionState) {
        case "initializing":
          this.renderRemoteStatusIndicator(
            nls.localize("host.open", "Opening Remote..."),
            nls.localize("host.open", "Opening Remote..."),
            void 0,
            true
            /* progress */
          );
          break;
        case "reconnecting":
          this.renderRemoteStatusIndicator(
            `${nls.localize("host.reconnecting", "Reconnecting to {0}...", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`,
            void 0,
            void 0,
            true
            /* progress */
          );
          break;
        case "disconnected":
          this.renderRemoteStatusIndicator(`$(alert) ${nls.localize("disconnectedFrom", "Disconnected from {0}", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`);
          break;
        default: {
          const tooltip = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
          const hostNameTooltip = this.labelService.getHostTooltip(Schemas.vscodeRemote, this.remoteAuthority);
          if (hostNameTooltip) {
            tooltip.appendMarkdown(hostNameTooltip);
          } else {
            tooltip.appendText(nls.localize({ key: "host.tooltip", comment: ["{0} is a remote host name, e.g. Dev Container"] }, "Editing on {0}", hostLabel));
          }
          this.renderRemoteStatusIndicator(`$(remote) ${truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, tooltip);
        }
      }
      return;
    }
    if (this.virtualWorkspaceLocation) {
      const workspaceLabel = this.labelService.getHostLabel(this.virtualWorkspaceLocation.scheme, this.virtualWorkspaceLocation.authority);
      if (workspaceLabel) {
        const tooltip = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
        const hostNameTooltip = this.labelService.getHostTooltip(this.virtualWorkspaceLocation.scheme, this.virtualWorkspaceLocation.authority);
        if (hostNameTooltip) {
          tooltip.appendMarkdown(hostNameTooltip);
        } else {
          tooltip.appendText(nls.localize({ key: "workspace.tooltip", comment: ["{0} is a remote workspace name, e.g. GitHub"] }, "Editing on {0}", workspaceLabel));
        }
        if (!isWeb || this.remoteAuthority) {
          tooltip.appendMarkdown("\n\n");
          tooltip.appendMarkdown(nls.localize(
            { key: "workspace.tooltip2", comment: ["[features are not available]({1}) is a link. Only translate `features are not available`. Do not change brackets and parentheses or {0}"] },
            "Some [features are not available]({0}) for resources located on a virtual file system.",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`
          ));
        }
        this.renderRemoteStatusIndicator(`$(remote) ${truncate(workspaceLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, tooltip);
        return;
      }
    }
    this.renderRemoteStatusIndicator(RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL, nls.localize("noHost.tooltip", "Open a Remote Window"));
    return;
  }
  renderRemoteStatusIndicator(initialText, initialTooltip, command, showProgress) {
    const { text, tooltip, ariaLabel } = this.withNetworkStatus(initialText, initialTooltip, showProgress);
    const properties = {
      name: nls.localize("remoteHost", "Remote Host"),
      kind: this.networkState === "offline" ? "offline" : text !== RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL ? "remote" : void 0,
      // only emphasize when applicable
      ariaLabel,
      text,
      showProgress,
      tooltip,
      command: command ?? RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID
    };
    if (this.remoteStatusEntry) {
      this.remoteStatusEntry.update(properties);
    } else {
      this.remoteStatusEntry = this.statusbarService.addEntry(
        properties,
        "status.host",
        StatusbarAlignment.LEFT,
        Number.POSITIVE_INFINITY
        /* first entry */
      );
    }
  }
  withNetworkStatus(initialText, initialTooltip, showProgress) {
    let text = initialText;
    let tooltip = initialTooltip;
    let ariaLabel = getCodiconAriaLabel(text);
    function textWithAlert() {
      if (!showProgress && initialText.startsWith(RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL)) {
        return initialText.replace(RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL, "$(alert)");
      }
      return initialText;
    }
    switch (this.networkState) {
      case "offline": {
        const offlineMessage = nls.localize("networkStatusOfflineTooltip", "Network appears to be offline, certain features might be unavailable.");
        text = textWithAlert();
        tooltip = this.appendTooltipLine(tooltip, offlineMessage);
        ariaLabel = `${ariaLabel}, ${offlineMessage}`;
        break;
      }
      case "high-latency":
        text = textWithAlert();
        tooltip = this.appendTooltipLine(tooltip, nls.localize("networkStatusHighLatencyTooltip", "Network appears to have high latency ({0}ms last, {1}ms average), certain features may be slow to respond.", remoteConnectionLatencyMeasurer.latency?.current?.toFixed(2), remoteConnectionLatencyMeasurer.latency?.average?.toFixed(2)));
        break;
    }
    return { text, tooltip, ariaLabel };
  }
  appendTooltipLine(tooltip, line) {
    let markdownTooltip;
    if (typeof tooltip === "string") {
      markdownTooltip = new MarkdownString(tooltip, { isTrusted: true, supportThemeIcons: true });
    } else {
      markdownTooltip = tooltip ?? new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    }
    if (markdownTooltip.value.length > 0) {
      markdownTooltip.appendMarkdown("\n\n");
    }
    markdownTooltip.appendMarkdown(line);
    return markdownTooltip;
  }
  async installExtension(extensionId, remoteLabel) {
    try {
      await this.extensionsWorkbenchService.install(extensionId, {
        isMachineScoped: false,
        donotIncludePackAndDependencies: false,
        context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
      });
    } catch (error) {
      if (!this.lifecycleService.willShutdown) {
        const { confirmed } = await this.dialogService.confirm({
          type: Severity.Error,
          message: nls.localize("unknownSetupError", "An error occurred while setting up {0}. Would you like to try again?", remoteLabel),
          detail: error && !isCancellationError(error) ? toErrorMessage(error) : void 0,
          primaryButton: nls.localize("retry", "Retry")
        });
        if (confirmed) {
          return this.installExtension(extensionId, remoteLabel);
        }
      }
      throw error;
    }
  }
  async runRemoteStartCommand(extensionId, startCommand) {
    await retry(async () => {
      const ext = await this.extensionService.getExtension(extensionId);
      if (!ext) {
        throw Error("Failed to find installed remote extension");
      }
      return ext;
    }, 300, 10);
    this.commandService.executeCommand(startCommand);
    this.telemetryService.publicLog2("workbenchActionExecuted", {
      id: "remoteInstallAndRun",
      detail: extensionId,
      from: "remote indicator"
    });
  }
  showRemoteMenu() {
    const getCategoryLabel = (action) => {
      if (action.item.category) {
        return typeof action.item.category === "string" ? action.item.category : action.item.category.value;
      }
      return void 0;
    };
    const matchCurrentRemote = () => {
      if (this.remoteAuthority) {
        return new RegExp(`^remote_\\d\\d_${getRemoteName(this.remoteAuthority)}_`);
      } else if (this.virtualWorkspaceLocation) {
        return new RegExp(`^virtualfs_\\d\\d_${this.virtualWorkspaceLocation.scheme}_`);
      }
      return void 0;
    };
    const computeItems = () => {
      let actionGroups = this.getRemoteMenuActions(true);
      const items = [];
      const currentRemoteMatcher = matchCurrentRemote();
      if (currentRemoteMatcher) {
        actionGroups = actionGroups.sort((g1, g2) => {
          const isCurrentRemote1 = currentRemoteMatcher.test(g1[0]);
          const isCurrentRemote2 = currentRemoteMatcher.test(g2[0]);
          if (isCurrentRemote1 !== isCurrentRemote2) {
            return isCurrentRemote1 ? -1 : 1;
          }
          if (g1[0] !== "" && g2[0] === "") {
            return -1;
          } else if (g1[0] === "" && g2[0] !== "") {
            return 1;
          }
          return g1[0].localeCompare(g2[0]);
        });
      }
      let lastCategoryName = void 0;
      for (const actionGroup of actionGroups) {
        let hasGroupCategory = false;
        for (const action of actionGroup[1]) {
          if (action instanceof MenuItemAction) {
            if (!hasGroupCategory) {
              const category = getCategoryLabel(action);
              if (category !== lastCategoryName) {
                items.push({ type: "separator", label: category });
                lastCategoryName = category;
              }
              hasGroupCategory = true;
            }
            const label = typeof action.item.title === "string" ? action.item.title : action.item.title.value;
            items.push({
              type: "item",
              id: action.item.id,
              label
            });
          }
        }
      }
      const showExtensionRecommendations = this.configurationService.getValue("workbench.remoteIndicator.showExtensionRecommendations");
      if (showExtensionRecommendations && this.extensionGalleryService.isEnabled() && this.remoteMetadataInitialized) {
        const notInstalledItems = [];
        for (const metadata of this.remoteExtensionMetadata) {
          if (!metadata.installed && metadata.isPlatformCompatible) {
            const label = metadata.startConnectLabel;
            const buttons = [{
              iconClass: ThemeIcon.asClassName(infoIcon),
              tooltip: nls.localize("remote.startActions.help", "Learn More")
            }];
            notInstalledItems.push({ type: "item", id: metadata.id, label, buttons });
          }
        }
        items.push({
          type: "separator",
          label: nls.localize("remote.startActions.install", "Install")
        });
        items.push(...notInstalledItems);
      }
      items.push({
        type: "separator"
      });
      const entriesBeforeConfig = items.length;
      if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID) {
        if (this.remoteAuthority) {
          items.push({
            type: "item",
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            label: nls.localize("closeRemoteConnection.title", "Close Remote Connection")
          });
          if (this.connectionState === "disconnected") {
            items.push({
              type: "item",
              id: ReloadWindowAction.ID,
              label: nls.localize("reloadWindow", "Reload Window")
            });
          }
        } else if (this.virtualWorkspaceLocation) {
          items.push({
            type: "item",
            id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
            label: nls.localize("closeVirtualWorkspace.title", "Close Remote Workspace")
          });
        }
      }
      if (items.length === entriesBeforeConfig) {
        items.pop();
      }
      return items;
    };
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    quickPick.placeholder = nls.localize("remoteActions", "Select an option to open a Remote Window");
    quickPick.items = computeItems();
    quickPick.sortByLabel = false;
    quickPick.canSelectMany = false;
    disposables.add(Event.once(quickPick.onDidAccept)((async (_) => {
      const selectedItems = quickPick.selectedItems;
      if (selectedItems.length === 1) {
        const commandId = selectedItems[0].id;
        const remoteExtension = this.remoteExtensionMetadata.find((value) => ExtensionIdentifier.equals(value.id, commandId));
        if (remoteExtension) {
          quickPick.items = [];
          quickPick.busy = true;
          quickPick.placeholder = nls.localize("remote.startActions.installingExtension", "Installing extension... ");
          try {
            await this.installExtension(remoteExtension.id, selectedItems[0].label);
          } catch (error) {
            return;
          } finally {
            quickPick.hide();
          }
          await this.runRemoteStartCommand(remoteExtension.id, remoteExtension.startCommand);
        } else {
          this.telemetryService.publicLog2("workbenchActionExecuted", {
            id: commandId,
            from: "remote indicator"
          });
          this.commandService.executeCommand(commandId);
          quickPick.hide();
        }
      }
    })));
    disposables.add(Event.once(quickPick.onDidTriggerItemButton)(async (e) => {
      const remoteExtension = this.remoteExtensionMetadata.find((value) => ExtensionIdentifier.equals(value.id, e.item.id));
      if (remoteExtension) {
        await this.openerService.open(URI.parse(remoteExtension.helpLink));
      }
    }));
    disposables.add(this.unrestrictedRemoteIndicatorMenu.onDidChange(() => quickPick.items = computeItems()));
    disposables.add(this.remoteIndicatorMenu.onDidChange(() => quickPick.items = computeItems()));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    if (!this.remoteMetadataInitialized) {
      quickPick.busy = true;
      disposables.add(this.onDidChangeEntries(() => {
        quickPick.busy = false;
        quickPick.items = computeItems();
      }));
    }
    quickPick.show();
  }
};
RemoteStatusIndicator.ID = "workbench.contrib.remoteStatusIndicator";
RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID = "workbench.action.remote.showMenu";
RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID = "workbench.action.remote.close";
RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID = !isWeb;
// web does not have a "Close Remote" command
RemoteStatusIndicator.INSTALL_REMOTE_EXTENSIONS_ID = "workbench.action.remote.extensions";
RemoteStatusIndicator.DEFAULT_REMOTE_STATUS_LABEL = "$(remote)";
RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH = 40;
RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_DELAY = 60 * 1e3;
RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_FIRST_RUN_DELAY = 10 * 1e3;
RemoteStatusIndicator = __decorateClass([
  __decorateParam(0, IStatusbarService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IRemoteAgentService),
  __decorateParam(9, IRemoteAuthorityResolverService),
  __decorateParam(10, IHostService),
  __decorateParam(11, IWorkspaceContextService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IExtensionGalleryService),
  __decorateParam(14, ITelemetryService),
  __decorateParam(15, IProductService),
  __decorateParam(16, IExtensionManagementService),
  __decorateParam(17, IExtensionsWorkbenchService),
  __decorateParam(18, IDialogService),
  __decorateParam(19, ILifecycleService),
  __decorateParam(20, IOpenerService),
  __decorateParam(21, IConfigurationService)
], RemoteStatusIndicator);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.remoteIndicator.showExtensionRecommendations": {
      type: "boolean",
      markdownDescription: nls.localize("remote.showExtensionRecommendations", "When enabled, remote extensions recommendations will be shown in the Remote Indicator menu."),
      default: true
    }
  }
});
export {
  RemoteStatusIndicator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3NlclxccmVtb3RlSW5kaWNhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlLCByZW1vdGVDb25uZWN0aW9uTGF0ZW5jeU1lYXN1cmVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgcmV0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIElNZW51U2VydmljZSwgTWVudUl0ZW1BY3Rpb24sIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBTdWJtZW51SXRlbUFjdGlvbiwgSU1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdGF0dXNiYXJBbGlnbm1lbnQsIElTdGF0dXNiYXJTZXJ2aWNlLCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhckVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUXVpY2tQaWNrSXRlbSwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tJbnB1dEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IFBsYXRmb3JtTmFtZSwgUGxhdGZvcm1Ub1N0cmluZywgaXNXZWIsIHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgdHJ1bmNhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZU5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUhvc3RzLmpzJztcbmltcG9ydCB7IGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBnZXRDb2RpY29uQXJpYUxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlbG9hZFdpbmRvd0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93aW5kb3dBY3Rpb25zLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfV0FMS1RIUk9VR0hfQ09OVEVYVCwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgTElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIFJlbW90ZU5hbWVDb250ZXh0LCBWaXJ0dWFsV29ya3NwYWNlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERvbUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZXZlbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGluZm9JY29uIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG50eXBlIEFjdGlvbkdyb3VwID0gW3N0cmluZywgQXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dO1xuXG5pbnRlcmZhY2UgUmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEge1xuXHRpZDogc3RyaW5nO1xuXHRpbnN0YWxsZWQ6IGJvb2xlYW47XG5cdGRlcGVuZGVuY2llczogc3RyaW5nW107XG5cdGlzUGxhdGZvcm1Db21wYXRpYmxlOiBib29sZWFuO1xuXHRoZWxwTGluazogc3RyaW5nO1xuXHRzdGFydENvbm5lY3RMYWJlbDogc3RyaW5nO1xuXHRzdGFydENvbW1hbmQ6IHN0cmluZztcblx0cHJpb3JpdHk6IG51bWJlcjtcblx0c3VwcG9ydGVkUGxhdGZvcm1zPzogUGxhdGZvcm1OYW1lW107XG59XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVTdGF0dXNJbmRpY2F0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnJlbW90ZVN0YXR1c0luZGljYXRvcic7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVNT1RFX0FDVElPTlNfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnJlbW90ZS5zaG93TWVudSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENMT1NFX1JFTU9URV9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucmVtb3RlLmNsb3NlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0hPV19DTE9TRV9SRU1PVEVfQ09NTUFORF9JRCA9ICFpc1dlYjsgLy8gd2ViIGRvZXMgbm90IGhhdmUgYSBcIkNsb3NlIFJlbW90ZVwiIGNvbW1hbmRcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSU5TVEFMTF9SRU1PVEVfRVhURU5TSU9OU19JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnJlbW90ZS5leHRlbnNpb25zJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUZBVUxUX1JFTU9URV9TVEFUVVNfTEFCRUwgPSAnJChyZW1vdGUpJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRU1PVEVfU1RBVFVTX0xBQkVMX01BWF9MRU5HVEggPSA0MDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRU1PVEVfQ09OTkVDVElPTl9MQVRFTkNZX1NDSEVEVUxFUl9ERUxBWSA9IDYwICogMTAwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVNT1RFX0NPTk5FQ1RJT05fTEFURU5DWV9TQ0hFRFVMRVJfRklSU1RfUlVOX0RFTEFZID0gMTAgKiAxMDAwO1xuXG5cdHByaXZhdGUgcmVtb3RlU3RhdHVzRW50cnk6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlSW5kaWNhdG9yTWVudTogSU1lbnU7IFx0XHRcdFx0Ly8gZmlsdGVycyBpdHMgZW50cmllcyBiYXNlZCBvbiB0aGUgY3VycmVudCByZW1vdGUgbmFtZSBvZiB0aGUgd2luZG93XG5cdHByaXZhdGUgcmVhZG9ubHkgdW5yZXN0cmljdGVkUmVtb3RlSW5kaWNhdG9yTWVudTogSU1lbnU7IFx0Ly8gZG9lcyBub3QgZmlsdGVyIGl0cyBlbnRyaWVzIGJhc2VkIG9uIHRoZSBjdXJyZW50IHJlbW90ZSBuYW1lIG9mIHRoZSB3aW5kb3dcblxuXHRwcml2YXRlIHJlbW90ZU1lbnVBY3Rpb25zR3JvdXBzOiBBY3Rpb25Hcm91cFtdIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgdmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uOiB7IHNjaGVtZTogc3RyaW5nOyBhdXRob3JpdHk6IHN0cmluZyB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY29ubmVjdGlvblN0YXRlOiAnaW5pdGlhbGl6aW5nJyB8ICdjb25uZWN0ZWQnIHwgJ3JlY29ubmVjdGluZycgfCAnZGlzY29ubmVjdGVkJyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBjb25uZWN0aW9uU3RhdGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTwnJyB8ICdpbml0aWFsaXppbmcnIHwgJ2Rpc2Nvbm5lY3RlZCcgfCAnY29ubmVjdGVkJz47XG5cblx0cHJpdmF0ZSBuZXR3b3JrU3RhdGU6ICdvbmxpbmUnIHwgJ29mZmxpbmUnIHwgJ2hpZ2gtbGF0ZW5jeScgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWVhc3VyZU5ldHdvcmtDb25uZWN0aW9uTGF0ZW5jeVNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGxvZ2dlZEludmFsaWRHcm91cE5hbWVzOiB7IFtncm91cDogc3RyaW5nXTogYm9vbGVhbiB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRwcml2YXRlIF9yZW1vdGVFeHRlbnNpb25NZXRhZGF0YTogUmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgcmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEoKTogUmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbXSB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVFeHRlbnNpb25NZXRhZGF0YSkge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uVGlwcyA9IHsgLi4udGhpcy5wcm9kdWN0U2VydmljZS5yZW1vdGVFeHRlbnNpb25UaXBzLCAuLi50aGlzLnByb2R1Y3RTZXJ2aWNlLnZpcnR1YWxXb3Jrc3BhY2VFeHRlbnNpb25UaXBzIH07XG5cdFx0XHR0aGlzLl9yZW1vdGVFeHRlbnNpb25NZXRhZGF0YSA9IE9iamVjdC52YWx1ZXMocmVtb3RlRXh0ZW5zaW9uVGlwcykuZmlsdGVyKHZhbHVlID0+IHZhbHVlLnN0YXJ0RW50cnkgIT09IHVuZGVmaW5lZCkubWFwKHZhbHVlID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogdmFsdWUuZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0aW5zdGFsbGVkOiBmYWxzZSxcblx0XHRcdFx0XHRmcmllbmRseU5hbWU6IHZhbHVlLmZyaWVuZGx5TmFtZSxcblx0XHRcdFx0XHRpc1BsYXRmb3JtQ29tcGF0aWJsZTogZmFsc2UsXG5cdFx0XHRcdFx0ZGVwZW5kZW5jaWVzOiBbXSxcblx0XHRcdFx0XHRoZWxwTGluazogdmFsdWUuc3RhcnRFbnRyeT8uaGVscExpbmsgPz8gJycsXG5cdFx0XHRcdFx0c3RhcnRDb25uZWN0TGFiZWw6IHZhbHVlLnN0YXJ0RW50cnk/LnN0YXJ0Q29ubmVjdExhYmVsID8/ICcnLFxuXHRcdFx0XHRcdHN0YXJ0Q29tbWFuZDogdmFsdWUuc3RhcnRFbnRyeT8uc3RhcnRDb21tYW5kID8/ICcnLFxuXHRcdFx0XHRcdHByaW9yaXR5OiB2YWx1ZS5zdGFydEVudHJ5Py5wcmlvcml0eSA/PyAxMCxcblx0XHRcdFx0XHRzdXBwb3J0ZWRQbGF0Zm9ybXM6IHZhbHVlLnN1cHBvcnRlZFBsYXRmb3Jtc1xuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGEuc29ydCgoZXh0MSwgZXh0MikgPT4gZXh0MS5wcmlvcml0eSAtIGV4dDIucHJpb3JpdHkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVFeHRlbnNpb25NZXRhZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHJlbW90ZUF1dGhvcml0eSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW90ZU1ldGFkYXRhSW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFbnRyaWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRyaWVzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlRW50cmllcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51bnJlc3RyaWN0ZWRSZW1vdGVJbmRpY2F0b3JNZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5TdGF0dXNCYXJXaW5kb3dJbmRpY2F0b3JNZW51LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSk7IC8vIHRvIGJlIHJlbW92ZWQgb25jZSBtaWdyYXRpb24gY29tcGxldGVkXG5cdFx0dGhpcy5yZW1vdGVJbmRpY2F0b3JNZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5TdGF0dXNCYXJSZW1vdGVJbmRpY2F0b3JNZW51LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTwnJyB8ICdpbml0aWFsaXppbmcnIHwgJ2Rpc2Nvbm5lY3RlZCcgfCAnY29ubmVjdGVkJz4oJ3JlbW90ZUNvbm5lY3Rpb25TdGF0ZScsICcnKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBjb25uZWN0aW9uIHN0YXRlXG5cdFx0aWYgKHRoaXMucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZSA9ICdpbml0aWFsaXppbmcnO1xuXHRcdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVDb250ZXh0S2V5LnNldCh0aGlzLmNvbm5lY3Rpb25TdGF0ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudXBkYXRlVmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cblx0XHR0aGlzLnVwZGF0ZVdoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdHRoaXMudXBkYXRlUmVtb3RlU3RhdHVzSW5kaWNhdG9yKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBjYXRlZ29yeSA9IG5scy5sb2NhbGl6ZTIoJ3JlbW90ZS5jYXRlZ29yeScsIFwiUmVtb3RlXCIpO1xuXG5cdFx0Ly8gU2hvdyBSZW1vdGUgTWVudVxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlJFTU9URV9BQ1RJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3JlbW90ZS5zaG93TWVudScsIFwiU2hvdyBSZW1vdGUgTWVudVwiKSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Tyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuID0gKCkgPT4gdGhhdC5zaG93UmVtb3RlTWVudSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsb3NlIFJlbW90ZSBDb25uZWN0aW9uXG5cdFx0aWYgKFJlbW90ZVN0YXR1c0luZGljYXRvci5TSE9XX0NMT1NFX1JFTU9URV9DT01NQU5EX0lEKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IFJlbW90ZVN0YXR1c0luZGljYXRvci5DTE9TRV9SRU1PVEVfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3JlbW90ZS5jbG9zZScsIFwiQ2xvc2UgUmVtb3RlIENvbm5lY3Rpb25cIiksXG5cdFx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKFJlbW90ZU5hbWVDb250ZXh0LCBWaXJ0dWFsV29ya3NwYWNlQ29udGV4dCksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJ1biA9ICgpID0+IHRoYXQuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyh7IGZvcmNlUmV1c2VXaW5kb3c6IHRydWUsIHJlbW90ZUF1dGhvcml0eTogbnVsbCB9KTtcblx0XHRcdH0pKTtcblx0XHRcdGlmICh0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJGaWxlTWVudSwge1xuXHRcdFx0XHRcdGdyb3VwOiAnNl9jbG9zZScsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6IFJlbW90ZVN0YXR1c0luZGljYXRvci5DTE9TRV9SRU1PVEVfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUNsb3NlUmVtb3RlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkNsb3NlIFJlJiZtb3RlIENvbm5lY3Rpb25cIilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdG9yZGVyOiAzLjVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogUmVtb3RlU3RhdHVzSW5kaWNhdG9yLklOU1RBTExfUkVNT1RFX0VYVEVOU0lPTlNfSUQsXG5cdFx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZW1vdGUuaW5zdGFsbCcsIFwiSW5zdGFsbCBSZW1vdGUgRGV2ZWxvcG1lbnQgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cnVuID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpbnB1dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgQHJlY29tbWVuZGVkOnJlbW90ZXNgKTtcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gTWVudSBjaGFuZ2VzXG5cdFx0Y29uc3QgdXBkYXRlUmVtb3RlQWN0aW9ucyA9ICgpID0+IHtcblx0XHRcdHRoaXMucmVtb3RlTWVudUFjdGlvbnNHcm91cHMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZVJlbW90ZVN0YXR1c0luZGljYXRvcigpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVucmVzdHJpY3RlZFJlbW90ZUluZGljYXRvck1lbnUub25EaWRDaGFuZ2UodXBkYXRlUmVtb3RlQWN0aW9ucykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlSW5kaWNhdG9yTWVudS5vbkRpZENoYW5nZSh1cGRhdGVSZW1vdGVBY3Rpb25zKSk7XG5cblx0XHQvLyBVcGRhdGUgaW5kaWNhdG9yIHdoZW4gZm9ybWF0dGVyIGNoYW5nZXMgYXMgaXQgbWF5IGhhdmUgYW4gaW1wYWN0IG9uIHRoZSByZW1vdGUgbGFiZWxcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhYmVsU2VydmljZS5vbkRpZENoYW5nZUZvcm1hdHRlcnMoKCkgPT4gdGhpcy51cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKSkpO1xuXG5cdFx0Ly8gVXBkYXRlIGJhc2VkIG9uIHJlbW90ZSBpbmRpY2F0b3IgY2hhbmdlcyBpZiBhbnlcblx0XHRjb25zdCByZW1vdGVJbmRpY2F0b3IgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy53aW5kb3dJbmRpY2F0b3I7XG5cdFx0aWYgKHJlbW90ZUluZGljYXRvciAmJiByZW1vdGVJbmRpY2F0b3Iub25EaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlbW90ZUluZGljYXRvci5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVJlbW90ZVN0YXR1c0luZGljYXRvcigpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTGlzdGVuIHRvIGNoYW5nZXMgb2YgdGhlIGNvbm5lY3Rpb25cblx0XHRpZiAodGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihjb25uZWN0aW9uLm9uRGlkU3RhdGVDaGFuZ2UoKGUpID0+IHtcblx0XHRcdFx0XHRzd2l0Y2ggKGUudHlwZSkge1xuXHRcdFx0XHRcdFx0Y2FzZSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5Db25uZWN0aW9uTG9zdDpcblx0XHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuUmVjb25uZWN0aW9uUnVubmluZzpcblx0XHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuUmVjb25uZWN0aW9uV2FpdDpcblx0XHRcdFx0XHRcdFx0dGhpcy5zZXRDb25uZWN0aW9uU3RhdGUoJ3JlY29ubmVjdGluZycpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZTpcblx0XHRcdFx0XHRcdFx0dGhpcy5zZXRDb25uZWN0aW9uU3RhdGUoJ2Rpc2Nvbm5lY3RlZCcpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuQ29ubmVjdGlvbkdhaW46XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0Q29ubmVjdGlvblN0YXRlKCdjb25uZWN0ZWQnKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlUmVtb3RlU3RhdHVzSW5kaWNhdG9yKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gT25saW5lIC8gT2ZmbGluZSBjaGFuZ2VzICh3ZWIgb25seSlcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIobWFpbldpbmRvdywgJ29ubGluZScpKS5ldmVudCxcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIobWFpbldpbmRvdywgJ29mZmxpbmUnKSkuZXZlbnRcblx0XHRcdCkoKCkgPT4gdGhpcy5zZXROZXR3b3JrU3RhdGUobmF2aWdhdG9yLm9uTGluZSA/ICdvbmxpbmUnIDogJ29mZmxpbmUnKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoYXN5bmMgKHJlc3VsdCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHQgb2YgcmVzdWx0LmFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YS5maW5kSW5kZXgodmFsdWUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModmFsdWUuaWQsIGV4dC5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YVtpbmRleF0uaW5zdGFsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24oYXN5bmMgKHJlc3VsdCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhLmZpbmRJbmRleCh2YWx1ZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh2YWx1ZS5pZCwgcmVzdWx0LmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbaW5kZXhdLmluc3RhbGxlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZVJlbW90ZU1ldGFkYXRhKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKHRoaXMucmVtb3RlTWV0YWRhdGFJbml0aWFsaXplZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRQbGF0Zm9ybSA9IFBsYXRmb3JtVG9TdHJpbmcocGxhdGZvcm0pO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSB0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhW2ldLmlkO1xuXHRcdFx0Y29uc3Qgc3VwcG9ydGVkUGxhdGZvcm1zID0gdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YVtpXS5zdXBwb3J0ZWRQbGF0Zm9ybXM7XG5cdFx0XHRjb25zdCBpc0luc3RhbGxlZCA9IChhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpKS5maW5kKHZhbHVlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHZhbHVlLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbklkKSkgPyB0cnVlIDogZmFsc2U7XG5cblx0XHRcdHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbaV0uaW5zdGFsbGVkID0gaXNJbnN0YWxsZWQ7XG5cdFx0XHRpZiAoaXNJbnN0YWxsZWQpIHtcblx0XHRcdFx0dGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YVtpXS5pc1BsYXRmb3JtQ29tcGF0aWJsZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdXBwb3J0ZWRQbGF0Zm9ybXMgJiYgIXN1cHBvcnRlZFBsYXRmb3Jtcy5pbmNsdWRlcyhjdXJyZW50UGxhdGZvcm0pKSB7XG5cdFx0XHRcdHRoaXMucmVtb3RlRXh0ZW5zaW9uTWV0YWRhdGFbaV0uaXNQbGF0Zm9ybUNvbXBhdGlibGUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhW2ldLmlzUGxhdGZvcm1Db21wYXRpYmxlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlbW90ZU1ldGFkYXRhSW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRW50cmllcy5maXJlKCk7XG5cdFx0dGhpcy51cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKCkge1xuXHRcdHRoaXMudmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uID0gZ2V0VmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVXaGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5yZW1vdGVBdXRob3JpdHk7XG5cdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXG5cdFx0XHQvLyBUcnkgdG8gcmVzb2x2ZSB0aGUgYXV0aG9yaXR5IHRvIGZpZ3VyZSBvdXQgY29ubmVjdGlvbiBzdGF0ZVxuXHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB7IGF1dGhvcml0eSB9ID0gYXdhaXQgdGhpcy5yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUF1dGhvcml0eShyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHRcdHRoaXMuY29ubmVjdGlvblRva2VuID0gYXV0aG9yaXR5LmNvbm5lY3Rpb25Ub2tlbjtcblxuXHRcdFx0XHRcdHRoaXMuc2V0Q29ubmVjdGlvblN0YXRlKCdjb25uZWN0ZWQnKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLnNldENvbm5lY3Rpb25TdGF0ZSgnZGlzY29ubmVjdGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKTtcblx0XHR0aGlzLmluaXRpYWxpemVSZW1vdGVNZXRhZGF0YSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRDb25uZWN0aW9uU3RhdGUobmV3U3RhdGU6ICdkaXNjb25uZWN0ZWQnIHwgJ2Nvbm5lY3RlZCcgfCAncmVjb25uZWN0aW5nJyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbm5lY3Rpb25TdGF0ZSAhPT0gbmV3U3RhdGUpIHtcblx0XHRcdHRoaXMuY29ubmVjdGlvblN0YXRlID0gbmV3U3RhdGU7XG5cblx0XHRcdC8vIHNpbXBsaWZ5IGNvbnRleHQga2V5IHdoaWNoIGRvZXNuJ3Qgc3VwcG9ydCBgY29ubmVjdGluZ2Bcblx0XHRcdGlmICh0aGlzLmNvbm5lY3Rpb25TdGF0ZSA9PT0gJ3JlY29ubmVjdGluZycpIHtcblx0XHRcdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVDb250ZXh0S2V5LnNldCgnZGlzY29ubmVjdGVkJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZUNvbnRleHRLZXkuc2V0KHRoaXMuY29ubmVjdGlvblN0YXRlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaW5kaWNhdGUgc3RhdHVzXG5cdFx0XHR0aGlzLnVwZGF0ZVJlbW90ZVN0YXR1c0luZGljYXRvcigpO1xuXG5cdFx0XHQvLyBzdGFydCBtZWFzdXJpbmcgY29ubmVjdGlvbiBsYXRlbmN5IG9uY2UgY29ubmVjdGVkXG5cdFx0XHRpZiAobmV3U3RhdGUgPT09ICdjb25uZWN0ZWQnKSB7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVNZWFzdXJlTmV0d29ya0Nvbm5lY3Rpb25MYXRlbmN5KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZU1lYXN1cmVOZXR3b3JrQ29ubmVjdGlvbkxhdGVuY3koKTogdm9pZCB7XG5cdFx0aWYgKFxuXHRcdFx0IXRoaXMucmVtb3RlQXV0aG9yaXR5IHx8XHRcdFx0XHRcdFx0Ly8gb25seSB3aGVuIGhhdmluZyBhIHJlbW90ZSBjb25uZWN0aW9uXG5cdFx0XHR0aGlzLm1lYXN1cmVOZXR3b3JrQ29ubmVjdGlvbkxhdGVuY3lTY2hlZHVsZXJcdC8vIGFscmVhZHkgc2NoZWR1bGVkXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5tZWFzdXJlTmV0d29ya0Nvbm5lY3Rpb25MYXRlbmN5U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5tZWFzdXJlTmV0d29ya0Nvbm5lY3Rpb25MYXRlbmN5KCksIFJlbW90ZVN0YXR1c0luZGljYXRvci5SRU1PVEVfQ09OTkVDVElPTl9MQVRFTkNZX1NDSEVEVUxFUl9ERUxBWSkpO1xuXHRcdHRoaXMubWVhc3VyZU5ldHdvcmtDb25uZWN0aW9uTGF0ZW5jeVNjaGVkdWxlci5zY2hlZHVsZShSZW1vdGVTdGF0dXNJbmRpY2F0b3IuUkVNT1RFX0NPTk5FQ1RJT05fTEFURU5DWV9TQ0hFRFVMRVJfRklSU1RfUlVOX0RFTEFZKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWVhc3VyZU5ldHdvcmtDb25uZWN0aW9uTGF0ZW5jeSgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE1lYXN1cmUgbGF0ZW5jeSBpZiB3ZSBhcmUgb25saW5lXG5cdFx0Ly8gYnV0IG9ubHkgd2hlbiB0aGUgd2luZG93IGhhcyBmb2N1cyB0byBwcmV2ZW50IGNvbnN0YW50bHlcblx0XHQvLyB3YWtpbmcgdXAgdGhlIGNvbm5lY3Rpb24gdG8gdGhlIHJlbW90ZVxuXG5cdFx0aWYgKHRoaXMuaG9zdFNlcnZpY2UuaGFzRm9jdXMgJiYgdGhpcy5uZXR3b3JrU3RhdGUgIT09ICdvZmZsaW5lJykge1xuXHRcdFx0Y29uc3QgbWVhc3VyZW1lbnQgPSBhd2FpdCByZW1vdGVDb25uZWN0aW9uTGF0ZW5jeU1lYXN1cmVyLm1lYXN1cmUodGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRcdFx0aWYgKG1lYXN1cmVtZW50KSB7XG5cdFx0XHRcdGlmIChtZWFzdXJlbWVudC5oaWdoKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXROZXR3b3JrU3RhdGUoJ2hpZ2gtbGF0ZW5jeScpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMubmV0d29ya1N0YXRlID09PSAnaGlnaC1sYXRlbmN5Jykge1xuXHRcdFx0XHRcdHRoaXMuc2V0TmV0d29ya1N0YXRlKCdvbmxpbmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubWVhc3VyZU5ldHdvcmtDb25uZWN0aW9uTGF0ZW5jeVNjaGVkdWxlcj8uc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0TmV0d29ya1N0YXRlKG5ld1N0YXRlOiAnb25saW5lJyB8ICdvZmZsaW5lJyB8ICdoaWdoLWxhdGVuY3knKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubmV0d29ya1N0YXRlICE9PSBuZXdTdGF0ZSkge1xuXHRcdFx0Y29uc3Qgb2xkU3RhdGUgPSB0aGlzLm5ldHdvcmtTdGF0ZTtcblx0XHRcdHRoaXMubmV0d29ya1N0YXRlID0gbmV3U3RhdGU7XG5cblx0XHRcdGlmIChuZXdTdGF0ZSA9PT0gJ2hpZ2gtbGF0ZW5jeScpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFJlbW90ZSBuZXR3b3JrIGNvbm5lY3Rpb24gYXBwZWFycyB0byBoYXZlIGhpZ2ggbGF0ZW5jeSAoJHtyZW1vdGVDb25uZWN0aW9uTGF0ZW5jeU1lYXN1cmVyLmxhdGVuY3k/LmN1cnJlbnQ/LnRvRml4ZWQoMil9bXMgbGFzdCwgJHtyZW1vdGVDb25uZWN0aW9uTGF0ZW5jeU1lYXN1cmVyLmxhdGVuY3k/LmF2ZXJhZ2U/LnRvRml4ZWQoMil9bXMgYXZlcmFnZSlgKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY29ubmVjdGlvblRva2VuKSB7XG5cdFx0XHRcdGlmIChuZXdTdGF0ZSA9PT0gJ29ubGluZScgJiYgb2xkU3RhdGUgPT09ICdoaWdoLWxhdGVuY3knKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dOZXR3b3JrQ29ubmVjdGlvbkhlYWx0aFRlbGVtZXRyeSh0aGlzLmNvbm5lY3Rpb25Ub2tlbiwgJ2dvb2QnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChuZXdTdGF0ZSA9PT0gJ2hpZ2gtbGF0ZW5jeScgJiYgb2xkU3RhdGUgPT09ICdvbmxpbmUnKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dOZXR3b3JrQ29ubmVjdGlvbkhlYWx0aFRlbGVtZXRyeSh0aGlzLmNvbm5lY3Rpb25Ub2tlbiwgJ3Bvb3InKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyB1cGRhdGUgc3RhdHVzXG5cdFx0XHR0aGlzLnVwZGF0ZVJlbW90ZVN0YXR1c0luZGljYXRvcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9nTmV0d29ya0Nvbm5lY3Rpb25IZWFsdGhUZWxlbWV0cnkoY29ubmVjdGlvblRva2VuOiBzdHJpbmcsIGNvbm5lY3Rpb25IZWFsdGg6ICdnb29kJyB8ICdwb29yJyk6IHZvaWQge1xuXHRcdHR5cGUgUmVtb3RlQ29ubmVjdGlvbkhlYWx0aENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRjb21tZW50OiAnVGhlIHJlbW90ZSBjb25uZWN0aW9uIGhlYWx0aCBoYXMgY2hhbmdlZCAocm91bmQgdHJpcCB0aW1lKSc7XG5cdFx0XHRyZW1vdGVOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIHJlc29sdmVyLicgfTtcblx0XHRcdHJlY29ubmVjdGlvblRva2VuOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGNvbm5lY3Rpb24uJyB9O1xuXHRcdFx0Y29ubmVjdGlvbkhlYWx0aDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBoZWFsdGggb2YgdGhlIGNvbm5lY3Rpb246IGdvb2Qgb3IgcG9vci4nIH07XG5cdFx0fTtcblx0XHR0eXBlIFJlbW90ZUNvbm5lY3Rpb25IZWFsdGhFdmVudCA9IHtcblx0XHRcdHJlbW90ZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmc7XG5cdFx0XHRjb25uZWN0aW9uSGVhbHRoOiAnZ29vZCcgfCAncG9vcic7XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSZW1vdGVDb25uZWN0aW9uSGVhbHRoRXZlbnQsIFJlbW90ZUNvbm5lY3Rpb25IZWFsdGhDbGFzc2lmaWNhdGlvbj4oJ3JlbW90ZUNvbm5lY3Rpb25IZWFsdGgnLCB7XG5cdFx0XHRyZW1vdGVOYW1lOiBnZXRSZW1vdGVOYW1lKHRoaXMucmVtb3RlQXV0aG9yaXR5KSxcblx0XHRcdHJlY29ubmVjdGlvblRva2VuOiBjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRjb25uZWN0aW9uSGVhbHRoXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlZEdyb3VwKGdyb3VwOiBzdHJpbmcpIHtcblx0XHRpZiAoIWdyb3VwLm1hdGNoKC9eKHJlbW90ZXx2aXJ0dWFsZnMpXyhcXGRcXGQpXygoW2Etel1bYS16MC05Ky4tXSopXyguKikpJC8pKSB7XG5cdFx0XHRpZiAoIXRoaXMubG9nZ2VkSW52YWxpZEdyb3VwTmFtZXNbZ3JvdXBdKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VkSW52YWxpZEdyb3VwTmFtZXNbZ3JvdXBdID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEludmFsaWQgZ3JvdXAgbmFtZSB1c2VkIGluIFwic3RhdHVzQmFyL3JlbW90ZUluZGljYXRvclwiIG1lbnUgY29udHJpYnV0aW9uOiAke2dyb3VwfS4gRW50cmllcyBpZ25vcmVkLiBFeHBlY3RlZCBmb3JtYXQ6ICdyZW1vdGVfJE9SREVSXyRSRU1PVEVOQU1FXyRHUk9VUElORyBvciAndmlydHVhbGZzXyRPUkRFUl8kRklMRVNDSEVNRV8kR1JPVVBJTkcuYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZW1vdGVNZW51QWN0aW9ucyhkb05vdFVzZUNhY2hlPzogYm9vbGVhbik6IEFjdGlvbkdyb3VwW10ge1xuXHRcdGlmICghdGhpcy5yZW1vdGVNZW51QWN0aW9uc0dyb3VwcyB8fCBkb05vdFVzZUNhY2hlKSB7XG5cdFx0XHR0aGlzLnJlbW90ZU1lbnVBY3Rpb25zR3JvdXBzID0gdGhpcy5yZW1vdGVJbmRpY2F0b3JNZW51LmdldEFjdGlvbnMoKS5maWx0ZXIoYSA9PiB0aGlzLnZhbGlkYXRlZEdyb3VwKGFbMF0pKS5jb25jYXQodGhpcy51bnJlc3RyaWN0ZWRSZW1vdGVJbmRpY2F0b3JNZW51LmdldEFjdGlvbnMoKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlbW90ZU1lbnVBY3Rpb25zR3JvdXBzO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSZW1vdGVTdGF0dXNJbmRpY2F0b3IoKTogdm9pZCB7XG5cblx0XHQvLyBSZW1vdGUgSW5kaWNhdG9yOiBzaG93IGlmIHByb3ZpZGVkIHZpYSBvcHRpb25zLCBlLmcuIGJ5IHRoZSB3ZWIgZW1iZWRkZXIgQVBJXG5cdFx0Y29uc3QgcmVtb3RlSW5kaWNhdG9yID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8ud2luZG93SW5kaWNhdG9yO1xuXHRcdGlmIChyZW1vdGVJbmRpY2F0b3IpIHtcblx0XHRcdGxldCByZW1vdGVJbmRpY2F0b3JMYWJlbCA9IHJlbW90ZUluZGljYXRvci5sYWJlbC50cmltKCk7XG5cdFx0XHRpZiAoIXJlbW90ZUluZGljYXRvckxhYmVsLnN0YXJ0c1dpdGgoJyQoJykpIHtcblx0XHRcdFx0cmVtb3RlSW5kaWNhdG9yTGFiZWwgPSBgJChyZW1vdGUpICR7cmVtb3RlSW5kaWNhdG9yTGFiZWx9YDsgLy8gZW5zdXJlIHRoZSBpbmRpY2F0b3IgaGFzIGEgY29kaWNvblxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlclJlbW90ZVN0YXR1c0luZGljYXRvcih0cnVuY2F0ZShyZW1vdGVJbmRpY2F0b3JMYWJlbCwgUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlJFTU9URV9TVEFUVVNfTEFCRUxfTUFYX0xFTkdUSCksIHJlbW90ZUluZGljYXRvci50b29sdGlwLCByZW1vdGVJbmRpY2F0b3IuY29tbWFuZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBmb3IgcmVtb3RlIHdpbmRvd3Mgb24gdGhlIGRlc2t0b3Bcblx0XHRpZiAodGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdGNvbnN0IGhvc3RMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChTY2hlbWFzLnZzY29kZVJlbW90ZSwgdGhpcy5yZW1vdGVBdXRob3JpdHkpIHx8IHRoaXMucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0c3dpdGNoICh0aGlzLmNvbm5lY3Rpb25TdGF0ZSkge1xuXHRcdFx0XHRjYXNlICdpbml0aWFsaXppbmcnOlxuXHRcdFx0XHRcdHRoaXMucmVuZGVyUmVtb3RlU3RhdHVzSW5kaWNhdG9yKG5scy5sb2NhbGl6ZSgnaG9zdC5vcGVuJywgXCJPcGVuaW5nIFJlbW90ZS4uLlwiKSwgbmxzLmxvY2FsaXplKCdob3N0Lm9wZW4nLCBcIk9wZW5pbmcgUmVtb3RlLi4uXCIpLCB1bmRlZmluZWQsIHRydWUgLyogcHJvZ3Jlc3MgKi8pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdyZWNvbm5lY3RpbmcnOlxuXHRcdFx0XHRcdHRoaXMucmVuZGVyUmVtb3RlU3RhdHVzSW5kaWNhdG9yKGAke25scy5sb2NhbGl6ZSgnaG9zdC5yZWNvbm5lY3RpbmcnLCBcIlJlY29ubmVjdGluZyB0byB7MH0uLi5cIiwgdHJ1bmNhdGUoaG9zdExhYmVsLCBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuUkVNT1RFX1NUQVRVU19MQUJFTF9NQVhfTEVOR1RIKSl9YCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUgLyogcHJvZ3Jlc3MgKi8pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdkaXNjb25uZWN0ZWQnOlxuXHRcdFx0XHRcdHRoaXMucmVuZGVyUmVtb3RlU3RhdHVzSW5kaWNhdG9yKGAkKGFsZXJ0KSAke25scy5sb2NhbGl6ZSgnZGlzY29ubmVjdGVkRnJvbScsIFwiRGlzY29ubmVjdGVkIGZyb20gezB9XCIsIHRydW5jYXRlKGhvc3RMYWJlbCwgUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlJFTU9URV9TVEFUVVNfTEFCRUxfTUFYX0xFTkdUSCkpfWApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbHRpcCA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGNvbnN0IGhvc3ROYW1lVG9vbHRpcCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RUb29sdGlwKFNjaGVtYXMudnNjb2RlUmVtb3RlLCB0aGlzLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRcdFx0aWYgKGhvc3ROYW1lVG9vbHRpcCkge1xuXHRcdFx0XHRcdFx0dG9vbHRpcC5hcHBlbmRNYXJrZG93bihob3N0TmFtZVRvb2x0aXApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0b29sdGlwLmFwcGVuZFRleHQobmxzLmxvY2FsaXplKHsga2V5OiAnaG9zdC50b29sdGlwJywgY29tbWVudDogWyd7MH0gaXMgYSByZW1vdGUgaG9zdCBuYW1lLCBlLmcuIERldiBDb250YWluZXInXSB9LCBcIkVkaXRpbmcgb24gezB9XCIsIGhvc3RMYWJlbCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnJlbmRlclJlbW90ZVN0YXR1c0luZGljYXRvcihgJChyZW1vdGUpICR7dHJ1bmNhdGUoaG9zdExhYmVsLCBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuUkVNT1RFX1NUQVRVU19MQUJFTF9NQVhfTEVOR1RIKX1gLCB0b29sdGlwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTaG93IHdoZW4gaW4gYSB2aXJ0dWFsIHdvcmtzcGFjZVxuXHRcdGlmICh0aGlzLnZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbikge1xuXG5cdFx0XHQvLyBXb3Jrc3BhY2Ugd2l0aCBsYWJlbDogaW5kaWNhdGUgZWRpdGluZyBzb3VyY2Vcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUxhYmVsID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKHRoaXMudmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uLnNjaGVtZSwgdGhpcy52aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24uYXV0aG9yaXR5KTtcblx0XHRcdGlmICh3b3Jrc3BhY2VMYWJlbCkge1xuXHRcdFx0XHRjb25zdCB0b29sdGlwID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRcdGNvbnN0IGhvc3ROYW1lVG9vbHRpcCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RUb29sdGlwKHRoaXMudmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uLnNjaGVtZSwgdGhpcy52aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24uYXV0aG9yaXR5KTtcblx0XHRcdFx0aWYgKGhvc3ROYW1lVG9vbHRpcCkge1xuXHRcdFx0XHRcdHRvb2x0aXAuYXBwZW5kTWFya2Rvd24oaG9zdE5hbWVUb29sdGlwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0b29sdGlwLmFwcGVuZFRleHQobmxzLmxvY2FsaXplKHsga2V5OiAnd29ya3NwYWNlLnRvb2x0aXAnLCBjb21tZW50OiBbJ3swfSBpcyBhIHJlbW90ZSB3b3Jrc3BhY2UgbmFtZSwgZS5nLiBHaXRIdWInXSB9LCBcIkVkaXRpbmcgb24gezB9XCIsIHdvcmtzcGFjZUxhYmVsKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFpc1dlYiB8fCB0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdHRvb2x0aXAuYXBwZW5kTWFya2Rvd24oJ1xcblxcbicpO1xuXHRcdFx0XHRcdHRvb2x0aXAuYXBwZW5kTWFya2Rvd24obmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICd3b3Jrc3BhY2UudG9vbHRpcDInLCBjb21tZW50OiBbJ1tmZWF0dXJlcyBhcmUgbm90IGF2YWlsYWJsZV0oezF9KSBpcyBhIGxpbmsuIE9ubHkgdHJhbnNsYXRlIGBmZWF0dXJlcyBhcmUgbm90IGF2YWlsYWJsZWAuIERvIG5vdCBjaGFuZ2UgYnJhY2tldHMgYW5kIHBhcmVudGhlc2VzIG9yIHswfSddIH0sXG5cdFx0XHRcdFx0XHRcIlNvbWUgW2ZlYXR1cmVzIGFyZSBub3QgYXZhaWxhYmxlXSh7MH0pIGZvciByZXNvdXJjZXMgbG9jYXRlZCBvbiBhIHZpcnR1YWwgZmlsZSBzeXN0ZW0uXCIsXG5cdFx0XHRcdFx0XHRgY29tbWFuZDoke0xJU1RfV09SS1NQQUNFX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlNfQ09NTUFORF9JRH1gXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5yZW5kZXJSZW1vdGVTdGF0dXNJbmRpY2F0b3IoYCQocmVtb3RlKSAke3RydW5jYXRlKHdvcmtzcGFjZUxhYmVsLCBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuUkVNT1RFX1NUQVRVU19MQUJFTF9NQVhfTEVOR1RIKX1gLCB0b29sdGlwKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyUmVtb3RlU3RhdHVzSW5kaWNhdG9yKFJlbW90ZVN0YXR1c0luZGljYXRvci5ERUZBVUxUX1JFTU9URV9TVEFUVVNfTEFCRUwsIG5scy5sb2NhbGl6ZSgnbm9Ib3N0LnRvb2x0aXAnLCBcIk9wZW4gYSBSZW1vdGUgV2luZG93XCIpKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclJlbW90ZVN0YXR1c0luZGljYXRvcihpbml0aWFsVGV4dDogc3RyaW5nLCBpbml0aWFsVG9vbHRpcD86IHN0cmluZyB8IE1hcmtkb3duU3RyaW5nLCBjb21tYW5kPzogc3RyaW5nLCBzaG93UHJvZ3Jlc3M/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgeyB0ZXh0LCB0b29sdGlwLCBhcmlhTGFiZWwgfSA9IHRoaXMud2l0aE5ldHdvcmtTdGF0dXMoaW5pdGlhbFRleHQsIGluaXRpYWxUb29sdGlwLCBzaG93UHJvZ3Jlc3MpO1xuXG5cdFx0Y29uc3QgcHJvcGVydGllczogSVN0YXR1c2JhckVudHJ5ID0ge1xuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdyZW1vdGVIb3N0JywgXCJSZW1vdGUgSG9zdFwiKSxcblx0XHRcdGtpbmQ6IHRoaXMubmV0d29ya1N0YXRlID09PSAnb2ZmbGluZScgPyAnb2ZmbGluZScgOiB0ZXh0ICE9PSBSZW1vdGVTdGF0dXNJbmRpY2F0b3IuREVGQVVMVF9SRU1PVEVfU1RBVFVTX0xBQkVMID8gJ3JlbW90ZScgOiB1bmRlZmluZWQsIC8vIG9ubHkgZW1waGFzaXplIHdoZW4gYXBwbGljYWJsZVxuXHRcdFx0YXJpYUxhYmVsLFxuXHRcdFx0dGV4dCxcblx0XHRcdHNob3dQcm9ncmVzcyxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRjb21tYW5kOiBjb21tYW5kID8/IFJlbW90ZVN0YXR1c0luZGljYXRvci5SRU1PVEVfQUNUSU9OU19DT01NQU5EX0lEXG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLnJlbW90ZVN0YXR1c0VudHJ5KSB7XG5cdFx0XHR0aGlzLnJlbW90ZVN0YXR1c0VudHJ5LnVwZGF0ZShwcm9wZXJ0aWVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW1vdGVTdGF0dXNFbnRyeSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShwcm9wZXJ0aWVzLCAnc3RhdHVzLmhvc3QnLCBTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIC8qIGZpcnN0IGVudHJ5ICovKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdpdGhOZXR3b3JrU3RhdHVzKGluaXRpYWxUZXh0OiBzdHJpbmcsIGluaXRpYWxUb29sdGlwPzogc3RyaW5nIHwgTWFya2Rvd25TdHJpbmcsIHNob3dQcm9ncmVzcz86IGJvb2xlYW4pOiB7IHRleHQ6IHN0cmluZzsgdG9vbHRpcDogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkOyBhcmlhTGFiZWw6IHN0cmluZyB9IHtcblx0XHRsZXQgdGV4dCA9IGluaXRpYWxUZXh0O1xuXHRcdGxldCB0b29sdGlwID0gaW5pdGlhbFRvb2x0aXA7XG5cdFx0bGV0IGFyaWFMYWJlbCA9IGdldENvZGljb25BcmlhTGFiZWwodGV4dCk7XG5cblx0XHRmdW5jdGlvbiB0ZXh0V2l0aEFsZXJ0KCk6IHN0cmluZyB7XG5cblx0XHRcdC8vIGBpbml0aWFsVGV4dGAgY2FuIGhhdmUgYSBjb2RpY29uIGluIHRoZSBiZWdpbm5pbmcgdGhhdCBhbHJlYWR5XG5cdFx0XHQvLyBpbmRpY2F0ZXMgc29tZSBraW5kIG9mIHN0YXR1cywgb3Igd2UgbWF5IGhhdmUgYmVlbiBhc2tlZCB0b1xuXHRcdFx0Ly8gc2hvdyBwcm9ncmVzcywgd2hlcmUgYSBzcGlubmluZyBjb2RpY29uIGFwcGVhcnMuIHdlIG9ubHkgd2FudFxuXHRcdFx0Ly8gdG8gcmVwbGFjZSB3aXRoIGFuIGFsZXJ0IGljb24gZm9yIHdoZW4gYSBub3JtYWwgcmVtb3RlIGluZGljYXRvclxuXHRcdFx0Ly8gaXMgc2hvd24uXG5cblx0XHRcdGlmICghc2hvd1Byb2dyZXNzICYmIGluaXRpYWxUZXh0LnN0YXJ0c1dpdGgoUmVtb3RlU3RhdHVzSW5kaWNhdG9yLkRFRkFVTFRfUkVNT1RFX1NUQVRVU19MQUJFTCkpIHtcblx0XHRcdFx0cmV0dXJuIGluaXRpYWxUZXh0LnJlcGxhY2UoUmVtb3RlU3RhdHVzSW5kaWNhdG9yLkRFRkFVTFRfUkVNT1RFX1NUQVRVU19MQUJFTCwgJyQoYWxlcnQpJyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBpbml0aWFsVGV4dDtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHRoaXMubmV0d29ya1N0YXRlKSB7XG5cdFx0XHRjYXNlICdvZmZsaW5lJzoge1xuXHRcdFx0XHRjb25zdCBvZmZsaW5lTWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbmV0d29ya1N0YXR1c09mZmxpbmVUb29sdGlwJywgXCJOZXR3b3JrIGFwcGVhcnMgdG8gYmUgb2ZmbGluZSwgY2VydGFpbiBmZWF0dXJlcyBtaWdodCBiZSB1bmF2YWlsYWJsZS5cIik7XG5cblx0XHRcdFx0dGV4dCA9IHRleHRXaXRoQWxlcnQoKTtcblx0XHRcdFx0dG9vbHRpcCA9IHRoaXMuYXBwZW5kVG9vbHRpcExpbmUodG9vbHRpcCwgb2ZmbGluZU1lc3NhZ2UpO1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBgJHthcmlhTGFiZWx9LCAke29mZmxpbmVNZXNzYWdlfWA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaGlnaC1sYXRlbmN5Jzpcblx0XHRcdFx0dGV4dCA9IHRleHRXaXRoQWxlcnQoKTtcblx0XHRcdFx0dG9vbHRpcCA9IHRoaXMuYXBwZW5kVG9vbHRpcExpbmUodG9vbHRpcCwgbmxzLmxvY2FsaXplKCduZXR3b3JrU3RhdHVzSGlnaExhdGVuY3lUb29sdGlwJywgXCJOZXR3b3JrIGFwcGVhcnMgdG8gaGF2ZSBoaWdoIGxhdGVuY3kgKHswfW1zIGxhc3QsIHsxfW1zIGF2ZXJhZ2UpLCBjZXJ0YWluIGZlYXR1cmVzIG1heSBiZSBzbG93IHRvIHJlc3BvbmQuXCIsIHJlbW90ZUNvbm5lY3Rpb25MYXRlbmN5TWVhc3VyZXIubGF0ZW5jeT8uY3VycmVudD8udG9GaXhlZCgyKSwgcmVtb3RlQ29ubmVjdGlvbkxhdGVuY3lNZWFzdXJlci5sYXRlbmN5Py5hdmVyYWdlPy50b0ZpeGVkKDIpKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRleHQsIHRvb2x0aXAsIGFyaWFMYWJlbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRUb29sdGlwTGluZSh0b29sdGlwOiBzdHJpbmcgfCBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCwgbGluZTogc3RyaW5nKTogTWFya2Rvd25TdHJpbmcge1xuXHRcdGxldCBtYXJrZG93blRvb2x0aXA6IE1hcmtkb3duU3RyaW5nO1xuXHRcdGlmICh0eXBlb2YgdG9vbHRpcCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG1hcmtkb3duVG9vbHRpcCA9IG5ldyBNYXJrZG93blN0cmluZyh0b29sdGlwLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hcmtkb3duVG9vbHRpcCA9IHRvb2x0aXAgPz8gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1hcmtkb3duVG9vbHRpcC52YWx1ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRtYXJrZG93blRvb2x0aXAuYXBwZW5kTWFya2Rvd24oJ1xcblxcbicpO1xuXHRcdH1cblxuXHRcdG1hcmtkb3duVG9vbHRpcC5hcHBlbmRNYXJrZG93bihsaW5lKTtcblxuXHRcdHJldHVybiBtYXJrZG93blRvb2x0aXA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluc3RhbGxFeHRlbnNpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZywgcmVtb3RlTGFiZWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoZXh0ZW5zaW9uSWQsIHtcblx0XHRcdFx0aXNNYWNoaW5lU2NvcGVkOiBmYWxzZSxcblx0XHRcdFx0ZG9ub3RJbmNsdWRlUGFja0FuZERlcGVuZGVuY2llczogZmFsc2UsXG5cdFx0XHRcdGNvbnRleHQ6IHsgW0VYVEVOU0lPTl9JTlNUQUxMX1NLSVBfV0FMS1RIUk9VR0hfQ09OVEVYVF06IHRydWUgfVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5rbm93blNldHVwRXJyb3InLCBcIkFuIGVycm9yIG9jY3VycmVkIHdoaWxlIHNldHRpbmcgdXAgezB9LiBXb3VsZCB5b3UgbGlrZSB0byB0cnkgYWdhaW4/XCIsIHJlbW90ZUxhYmVsKSxcblx0XHRcdFx0XHRkZXRhaWw6IGVycm9yICYmICFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSA/IHRvRXJyb3JNZXNzYWdlKGVycm9yKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoJ3JldHJ5JywgXCJSZXRyeVwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbGxFeHRlbnNpb24oZXh0ZW5zaW9uSWQsIHJlbW90ZUxhYmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBydW5SZW1vdGVTdGFydENvbW1hbmQoZXh0ZW5zaW9uSWQ6IHN0cmluZywgc3RhcnRDb21tYW5kOiBzdHJpbmcpIHtcblxuXHRcdC8vIGNoZWNrIHRvIGVuc3VyZSB0aGUgZXh0ZW5zaW9uIGlzIGluc3RhbGxlZFxuXHRcdGF3YWl0IHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4dCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZXh0ZW5zaW9uSWQpO1xuXHRcdFx0aWYgKCFleHQpIHtcblx0XHRcdFx0dGhyb3cgRXJyb3IoJ0ZhaWxlZCB0byBmaW5kIGluc3RhbGxlZCByZW1vdGUgZXh0ZW5zaW9uJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXh0O1xuXHRcdH0sIDMwMCwgMTApO1xuXG5cdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChzdGFydENvbW1hbmQpO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHtcblx0XHRcdGlkOiAncmVtb3RlSW5zdGFsbEFuZFJ1bicsXG5cdFx0XHRkZXRhaWw6IGV4dGVuc2lvbklkLFxuXHRcdFx0ZnJvbTogJ3JlbW90ZSBpbmRpY2F0b3InXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dSZW1vdGVNZW51KCkge1xuXHRcdGNvbnN0IGdldENhdGVnb3J5TGFiZWwgPSAoYWN0aW9uOiBNZW51SXRlbUFjdGlvbikgPT4ge1xuXHRcdFx0aWYgKGFjdGlvbi5pdGVtLmNhdGVnb3J5KSB7XG5cdFx0XHRcdHJldHVybiB0eXBlb2YgYWN0aW9uLml0ZW0uY2F0ZWdvcnkgPT09ICdzdHJpbmcnID8gYWN0aW9uLml0ZW0uY2F0ZWdvcnkgOiBhY3Rpb24uaXRlbS5jYXRlZ29yeS52YWx1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1hdGNoQ3VycmVudFJlbW90ZSA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlZ0V4cChgXnJlbW90ZV9cXFxcZFxcXFxkXyR7Z2V0UmVtb3RlTmFtZSh0aGlzLnJlbW90ZUF1dGhvcml0eSl9X2ApO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlZ0V4cChgXnZpcnR1YWxmc19cXFxcZFxcXFxkXyR7dGhpcy52aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24uc2NoZW1lfV9gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbXB1dGVJdGVtcyA9ICgpID0+IHtcblx0XHRcdGxldCBhY3Rpb25Hcm91cHMgPSB0aGlzLmdldFJlbW90ZU1lbnVBY3Rpb25zKHRydWUpO1xuXG5cdFx0XHRjb25zdCBpdGVtczogUXVpY2tQaWNrSXRlbVtdID0gW107XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRSZW1vdGVNYXRjaGVyID0gbWF0Y2hDdXJyZW50UmVtb3RlKCk7XG5cdFx0XHRpZiAoY3VycmVudFJlbW90ZU1hdGNoZXIpIHtcblx0XHRcdFx0Ly8gY29tbWFuZHMgZm9yIHRoZSBjdXJyZW50IHJlbW90ZSBnbyBmaXJzdFxuXHRcdFx0XHRhY3Rpb25Hcm91cHMgPSBhY3Rpb25Hcm91cHMuc29ydCgoZzEsIGcyKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaXNDdXJyZW50UmVtb3RlMSA9IGN1cnJlbnRSZW1vdGVNYXRjaGVyLnRlc3QoZzFbMF0pO1xuXHRcdFx0XHRcdGNvbnN0IGlzQ3VycmVudFJlbW90ZTIgPSBjdXJyZW50UmVtb3RlTWF0Y2hlci50ZXN0KGcyWzBdKTtcblx0XHRcdFx0XHRpZiAoaXNDdXJyZW50UmVtb3RlMSAhPT0gaXNDdXJyZW50UmVtb3RlMikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGlzQ3VycmVudFJlbW90ZTEgPyAtMSA6IDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIGxlZ2FjeSBpbmRpY2F0b3IgY29tbWFuZHMgZ28gbGFzdFxuXHRcdFx0XHRcdGlmIChnMVswXSAhPT0gJycgJiYgZzJbMF0gPT09ICcnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChnMVswXSA9PT0gJycgJiYgZzJbMF0gIT09ICcnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGcxWzBdLmxvY2FsZUNvbXBhcmUoZzJbMF0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGxhc3RDYXRlZ29yeU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb25Hcm91cCBvZiBhY3Rpb25Hcm91cHMpIHtcblx0XHRcdFx0bGV0IGhhc0dyb3VwQ2F0ZWdvcnkgPSBmYWxzZTtcblx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9uR3JvdXBbMV0pIHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRcdGlmICghaGFzR3JvdXBDYXRlZ29yeSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjYXRlZ29yeSA9IGdldENhdGVnb3J5TGFiZWwoYWN0aW9uKTtcblx0XHRcdFx0XHRcdFx0aWYgKGNhdGVnb3J5ICE9PSBsYXN0Q2F0ZWdvcnlOYW1lKSB7XG5cdFx0XHRcdFx0XHRcdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogY2F0ZWdvcnkgfSk7XG5cdFx0XHRcdFx0XHRcdFx0bGFzdENhdGVnb3J5TmFtZSA9IGNhdGVnb3J5O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGhhc0dyb3VwQ2F0ZWdvcnkgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSB0eXBlb2YgYWN0aW9uLml0ZW0udGl0bGUgPT09ICdzdHJpbmcnID8gYWN0aW9uLml0ZW0udGl0bGUgOiBhY3Rpb24uaXRlbS50aXRsZS52YWx1ZTtcblx0XHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnaXRlbScsXG5cdFx0XHRcdFx0XHRcdGlkOiBhY3Rpb24uaXRlbS5pZCxcblx0XHRcdFx0XHRcdFx0bGFiZWxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzaG93RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignd29ya2JlbmNoLnJlbW90ZUluZGljYXRvci5zaG93RXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zJyk7XG5cdFx0XHRpZiAoc2hvd0V4dGVuc2lvblJlY29tbWVuZGF0aW9ucyAmJiB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpICYmIHRoaXMucmVtb3RlTWV0YWRhdGFJbml0aWFsaXplZCkge1xuXG5cdFx0XHRcdGNvbnN0IG5vdEluc3RhbGxlZEl0ZW1zOiBRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBtZXRhZGF0YSBvZiB0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhKSB7XG5cdFx0XHRcdFx0aWYgKCFtZXRhZGF0YS5pbnN0YWxsZWQgJiYgbWV0YWRhdGEuaXNQbGF0Zm9ybUNvbXBhdGlibGUpIHtcblx0XHRcdFx0XHRcdC8vIENyZWF0ZSBJbnN0YWxsIFF1aWNrUGljayB3aXRoIGEgaGVscCBsaW5rXG5cdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IG1ldGFkYXRhLnN0YXJ0Q29ubmVjdExhYmVsO1xuXHRcdFx0XHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFt7XG5cdFx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGluZm9JY29uKSxcblx0XHRcdFx0XHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdyZW1vdGUuc3RhcnRBY3Rpb25zLmhlbHAnLCBcIkxlYXJuIE1vcmVcIilcblx0XHRcdFx0XHRcdH1dO1xuXHRcdFx0XHRcdFx0bm90SW5zdGFsbGVkSXRlbXMucHVzaCh7IHR5cGU6ICdpdGVtJywgaWQ6IG1ldGFkYXRhLmlkLCBsYWJlbDogbGFiZWwsIGJ1dHRvbnM6IGJ1dHRvbnMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS5zdGFydEFjdGlvbnMuaW5zdGFsbCcsICdJbnN0YWxsJylcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGl0ZW1zLnB1c2goLi4ubm90SW5zdGFsbGVkSXRlbXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcidcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlbnRyaWVzQmVmb3JlQ29uZmlnID0gaXRlbXMubGVuZ3RoO1xuXG5cdFx0XHRpZiAoUmVtb3RlU3RhdHVzSW5kaWNhdG9yLlNIT1dfQ0xPU0VfUkVNT1RFX0NPTU1BTkRfSUQpIHtcblx0XHRcdFx0aWYgKHRoaXMucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiAnaXRlbScsXG5cdFx0XHRcdFx0XHRpZDogUmVtb3RlU3RhdHVzSW5kaWNhdG9yLkNMT1NFX1JFTU9URV9DT01NQU5EX0lELFxuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY2xvc2VSZW1vdGVDb25uZWN0aW9uLnRpdGxlJywgJ0Nsb3NlIFJlbW90ZSBDb25uZWN0aW9uJylcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmICh0aGlzLmNvbm5lY3Rpb25TdGF0ZSA9PT0gJ2Rpc2Nvbm5lY3RlZCcpIHtcblx0XHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnaXRlbScsXG5cdFx0XHRcdFx0XHRcdGlkOiBSZWxvYWRXaW5kb3dBY3Rpb24uSUQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbG9hZFdpbmRvdycsICdSZWxvYWQgV2luZG93Jylcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLnZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbikge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0XHRcdFx0aWQ6IFJlbW90ZVN0YXR1c0luZGljYXRvci5DTE9TRV9SRU1PVEVfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Nsb3NlVmlydHVhbFdvcmtzcGFjZS50aXRsZScsICdDbG9zZSBSZW1vdGUgV29ya3NwYWNlJylcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSBlbnRyaWVzQmVmb3JlQ29uZmlnKSB7XG5cdFx0XHRcdGl0ZW1zLnBvcCgpOyAvLyByZW1vdmUgdGhlIHNlcGFyYXRvciBhZ2FpblxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaXRlbXM7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgncmVtb3RlQWN0aW9ucycsIFwiU2VsZWN0IGFuIG9wdGlvbiB0byBvcGVuIGEgUmVtb3RlIFdpbmRvd1wiKTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBjb21wdXRlSXRlbXMoKTtcblx0XHRxdWlja1BpY2suc29ydEJ5TGFiZWwgPSBmYWxzZTtcblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHF1aWNrUGljay5vbkRpZEFjY2VwdCkoKGFzeW5jIF8gPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtcyA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zO1xuXHRcdFx0aWYgKHNlbGVjdGVkSXRlbXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IHNlbGVjdGVkSXRlbXNbMF0uaWQhO1xuXHRcdFx0XHRjb25zdCByZW1vdGVFeHRlbnNpb24gPSB0aGlzLnJlbW90ZUV4dGVuc2lvbk1ldGFkYXRhLmZpbmQodmFsdWUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModmFsdWUuaWQsIGNvbW1hbmRJZCkpO1xuXHRcdFx0XHRpZiAocmVtb3RlRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gW107XG5cdFx0XHRcdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdFx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnN0YXJ0QWN0aW9ucy5pbnN0YWxsaW5nRXh0ZW5zaW9uJywgJ0luc3RhbGxpbmcgZXh0ZW5zaW9uLi4uICcpO1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFsbEV4dGVuc2lvbihyZW1vdGVFeHRlbnNpb24uaWQsIHNlbGVjdGVkSXRlbXNbMF0ubGFiZWwpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucnVuUmVtb3RlU3RhcnRDb21tYW5kKHJlbW90ZUV4dGVuc2lvbi5pZCwgcmVtb3RlRXh0ZW5zaW9uLnN0YXJ0Q29tbWFuZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywge1xuXHRcdFx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0XHRcdGZyb206ICdyZW1vdGUgaW5kaWNhdG9yJ1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkKTtcblx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHF1aWNrUGljay5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKShhc3luYyAoZSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uID0gdGhpcy5yZW1vdGVFeHRlbnNpb25NZXRhZGF0YS5maW5kKHZhbHVlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHZhbHVlLmlkLCBlLml0ZW0uaWQpKTtcblx0XHRcdGlmIChyZW1vdGVFeHRlbnNpb24pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHJlbW90ZUV4dGVuc2lvbi5oZWxwTGluaykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIHJlZnJlc2ggdGhlIGl0ZW1zIHdoZW4gYWN0aW9ucyBjaGFuZ2Vcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy51bnJlc3RyaWN0ZWRSZW1vdGVJbmRpY2F0b3JNZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHF1aWNrUGljay5pdGVtcyA9IGNvbXB1dGVJdGVtcygpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVtb3RlSW5kaWNhdG9yTWVudS5vbkRpZENoYW5nZSgoKSA9PiBxdWlja1BpY2suaXRlbXMgPSBjb21wdXRlSXRlbXMoKSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRpZiAoIXRoaXMucmVtb3RlTWV0YWRhdGFJbml0aWFsaXplZCkge1xuXHRcdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VFbnRyaWVzKCgpID0+IHtcblx0XHRcdFx0Ly8gSWYgcXVpY2sgcGljayBpcyBvcGVuLCB1cGRhdGUgdGhlIHF1aWNrIHBpY2sgaXRlbXMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24uXG5cdFx0XHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGNvbXB1dGVJdGVtcygpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0Li4ud29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdCd3b3JrYmVuY2gucmVtb3RlSW5kaWNhdG9yLnNob3dFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMnOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW1vdGUuc2hvd0V4dGVuc2lvblJlY29tbWVuZGF0aW9ucycsIFwiV2hlbiBlbmFibGVkLCByZW1vdGUgZXh0ZW5zaW9ucyByZWNvbW1lbmRhdGlvbnMgd2lsbCBiZSBzaG93biBpbiB0aGUgUmVtb3RlIEluZGljYXRvciBtZW51LlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0fSxcblx0XHR9XG5cdH0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxxQkFBcUIsdUNBQXVDO0FBQ3JFLFNBQVMsa0JBQWtCLGFBQWE7QUFDeEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFFBQVEs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
