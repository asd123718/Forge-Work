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
import { toAction } from "../../../../base/common/actions.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { isNumber, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREFIX, CONFIGURATION_KEY_PREVENT_SLEEP, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, LOGGER_NAME, LOG_ID } from "../../../../platform/remoteTunnel/common/remoteTunnel.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService, isUntitledWorkspace } from "../../../../platform/workspace/common/workspace.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
const REMOTE_TUNNEL_CATEGORY = localize2("remoteTunnel.category", "Remote Tunnels");
const REMOTE_TUNNEL_CONNECTION_STATE_KEY = "remoteTunnelConnection";
const REMOTE_TUNNEL_CONNECTION_STATE = new RawContextKey(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected");
const REMOTE_TUNNEL_HAS_LINK = new RawContextKey("remoteTunnelHasLink", false);
const REMOTE_TUNNEL_USED_STORAGE_KEY = "remoteTunnelServiceUsed";
const REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY = "remoteTunnelServicePromptedPreview";
const REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY = "remoteTunnelExtensionRecommended";
const REMOTE_TUNNEL_HAS_USED_BEFORE = "remoteTunnelHasUsed";
const REMOTE_TUNNEL_EXTENSION_TIMEOUT = 4 * 60 * 1e3;
const INVALID_TOKEN_RETRIES = 2;
var RemoteTunnelCommandIds = /* @__PURE__ */ ((RemoteTunnelCommandIds2) => {
  RemoteTunnelCommandIds2["turnOn"] = "workbench.remoteTunnel.actions.turnOn";
  RemoteTunnelCommandIds2["turnOff"] = "workbench.remoteTunnel.actions.turnOff";
  RemoteTunnelCommandIds2["connecting"] = "workbench.remoteTunnel.actions.connecting";
  RemoteTunnelCommandIds2["manage"] = "workbench.remoteTunnel.actions.manage";
  RemoteTunnelCommandIds2["showLog"] = "workbench.remoteTunnel.actions.showLog";
  RemoteTunnelCommandIds2["configure"] = "workbench.remoteTunnel.actions.configure";
  RemoteTunnelCommandIds2["copyToClipboard"] = "workbench.remoteTunnel.actions.copyToClipboard";
  RemoteTunnelCommandIds2["learnMore"] = "workbench.remoteTunnel.actions.learnMore";
  return RemoteTunnelCommandIds2;
})(RemoteTunnelCommandIds || {});
var RemoteTunnelCommandLabels;
((RemoteTunnelCommandLabels2) => {
  RemoteTunnelCommandLabels2.turnOn = localize("remoteTunnel.actions.turnOn", "Turn on Remote Tunnel Access...");
  RemoteTunnelCommandLabels2.turnOff = localize("remoteTunnel.actions.turnOff", "Turn off Remote Tunnel Access...");
  RemoteTunnelCommandLabels2.showLog = localize("remoteTunnel.actions.showLog", "Show Remote Tunnel Service Log");
  RemoteTunnelCommandLabels2.configure = localize("remoteTunnel.actions.configure", "Configure Tunnel Name...");
  RemoteTunnelCommandLabels2.copyToClipboard = localize("remoteTunnel.actions.copyToClipboard", "Copy Browser URI to Clipboard");
  RemoteTunnelCommandLabels2.learnMore = localize("remoteTunnel.actions.learnMore", "Get Started with Tunnels");
})(RemoteTunnelCommandLabels || (RemoteTunnelCommandLabels = {}));
let RemoteTunnelWorkbenchContribution = class extends Disposable {
  constructor(authenticationService, dialogService, extensionService, contextKeyService, productService, storageService, loggerService, quickInputService, environmentService, remoteTunnelService, commandService, workspaceContextService, progressService, notificationService) {
    super();
    this.authenticationService = authenticationService;
    this.dialogService = dialogService;
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.quickInputService = quickInputService;
    this.environmentService = environmentService;
    this.remoteTunnelService = remoteTunnelService;
    this.commandService = commandService;
    this.workspaceContextService = workspaceContextService;
    this.progressService = progressService;
    this.notificationService = notificationService;
    this.expiredSessions = /* @__PURE__ */ new Set();
    this.logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${LOG_ID}.log`), { id: LOG_ID, name: LOGGER_NAME }));
    this.connectionStateContext = REMOTE_TUNNEL_CONNECTION_STATE.bindTo(this.contextKeyService);
    this.hasLinkContext = REMOTE_TUNNEL_HAS_LINK.bindTo(this.contextKeyService);
    const serverConfiguration = productService.tunnelApplicationConfig;
    if (!serverConfiguration || !productService.tunnelApplicationName) {
      this.logger.error("Missing 'tunnelApplicationConfig' or 'tunnelApplicationName' in product.json. Remote tunneling is not available.");
      this.serverConfiguration = { authenticationProviders: {}, editorWebUrl: "", extension: { extensionId: "", friendlyName: "" } };
      return;
    }
    this.serverConfiguration = serverConfiguration;
    this._register(this.remoteTunnelService.onDidChangeTunnelStatus((s) => this.handleTunnelStatusUpdate(s)));
    this.registerCommands();
    this.initialize();
    this.recommendRemoteExtensionIfNeeded();
  }
  handleTunnelStatusUpdate(status) {
    this.connectionInfo = void 0;
    this.hasLinkContext.set(false);
    if (status.type === "disconnected") {
      if (status.onTokenFailed) {
        this.expiredSessions.add(status.onTokenFailed.sessionId);
      }
      this.connectionStateContext.set("disconnected");
    } else if (status.type === "connecting") {
      this.connectionStateContext.set("connecting");
    } else if (status.type === "connected") {
      this.connectionInfo = status.info;
      this.hasLinkContext.set(!!status.info.link);
      this.connectionStateContext.set("connected");
    }
  }
  async recommendRemoteExtensionIfNeeded() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const remoteExtension = this.serverConfiguration.extension;
    const shouldRecommend = async () => {
      if (this.storageService.getBoolean(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, StorageScope.APPLICATION)) {
        return false;
      }
      if (await this.extensionService.getExtension(remoteExtension.extensionId)) {
        return false;
      }
      const usedOnHostMessage = this.storageService.get(REMOTE_TUNNEL_USED_STORAGE_KEY, StorageScope.APPLICATION);
      if (!usedOnHostMessage) {
        return false;
      }
      let usedTunnelName;
      try {
        const message = JSON.parse(usedOnHostMessage);
        if (!isObject(message)) {
          return false;
        }
        const { hostName, timeStamp } = message;
        if (!isString(hostName) || !isNumber(timeStamp) || (/* @__PURE__ */ new Date()).getTime() > timeStamp + REMOTE_TUNNEL_EXTENSION_TIMEOUT) {
          return false;
        }
        usedTunnelName = hostName;
      } catch (_) {
        return false;
      }
      const currentTunnelName = await this.remoteTunnelService.getTunnelName();
      if (!currentTunnelName || currentTunnelName === usedTunnelName) {
        return false;
      }
      return usedTunnelName;
    };
    const recommed = async () => {
      const usedOnHost = await shouldRecommend();
      if (!usedOnHost) {
        return false;
      }
      this.notificationService.notify({
        severity: Severity.Info,
        priority: NotificationPriority.OPTIONAL,
        message: localize(
          {
            key: "recommend.remoteExtension",
            comment: ["{0} will be a tunnel name, {1} will the link address to the web UI, {6} an extension name. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format"]
          },
          "Tunnel '{0}' is avaiable for remote access. The {1} extension can be used to connect to it.",
          usedOnHost,
          remoteExtension.friendlyName
        ),
        actions: {
          primary: [
            toAction({
              id: "showExtension",
              label: localize("action.showExtension", "Show Extension"),
              run: () => {
                return this.commandService.executeCommand("workbench.extensions.action.showExtensionsWithIds", [remoteExtension.extensionId]);
              }
            }),
            toAction({
              id: "doNotShowAgain",
              label: localize("action.doNotShowAgain", "Do not show again"),
              run: () => {
                this.storageService.store(REMOTE_TUNNEL_EXTENSION_RECOMMENDED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
              }
            })
          ]
        }
      });
      return true;
    };
    if (await shouldRecommend()) {
      const disposables = this._register(new DisposableStore());
      disposables.add(this.storageService.onDidChangeValue(StorageScope.APPLICATION, REMOTE_TUNNEL_USED_STORAGE_KEY, disposables)(async () => {
        const success = await recommed();
        if (success) {
          disposables.dispose();
        }
      }));
    }
  }
  async initialize() {
    const [mode, status] = await Promise.all([
      this.remoteTunnelService.getMode(),
      this.remoteTunnelService.getTunnelStatus()
    ]);
    this.handleTunnelStatusUpdate(status);
    if (mode.active && mode.session.token) {
      return;
    }
    const doInitialStateDiscovery = async (progress) => {
      const listener = progress && this.remoteTunnelService.onDidChangeTunnelStatus((status3) => {
        switch (status3.type) {
          case "connecting":
            if (status3.progress) {
              progress.report({ message: status3.progress });
            }
            break;
        }
      });
      let newSession;
      if (mode.active) {
        const token = await this.getSessionToken(mode.session);
        if (token) {
          newSession = { ...mode.session, token };
        }
      }
      const status2 = await this.remoteTunnelService.initialize(mode.active && newSession ? { ...mode, session: newSession } : INACTIVE_TUNNEL_MODE);
      listener?.dispose();
      if (status2.type === "connected") {
        this.connectionInfo = status2.info;
        this.connectionStateContext.set("connected");
        return;
      }
    };
    const hasUsed = this.storageService.getBoolean(REMOTE_TUNNEL_HAS_USED_BEFORE, StorageScope.APPLICATION, false);
    if (hasUsed) {
      await this.progressService.withProgress(
        {
          location: ProgressLocation.Window,
          title: localize({ key: "initialize.progress.title", comment: ["Only translate 'Looking for remote tunnel', do not change the format of the rest (markdown link format)"] }, "[Looking for remote tunnel](command:{0})", "workbench.remoteTunnel.actions.showLog" /* showLog */)
        },
        doInitialStateDiscovery
      );
    } else {
      doInitialStateDiscovery(void 0);
    }
  }
  getPreferredTokenFromSession(session) {
    return session.session.accessToken || session.session.idToken;
  }
  async startTunnel(asService) {
    if (this.connectionInfo) {
      return this.connectionInfo;
    }
    this.storageService.store(REMOTE_TUNNEL_HAS_USED_BEFORE, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    let tokenProblems = false;
    for (let i = 0; i < INVALID_TOKEN_RETRIES; i++) {
      tokenProblems = false;
      const authenticationSession = await this.getAuthenticationSession();
      if (authenticationSession === void 0) {
        this.logger.info("No authentication session available, not starting tunnel");
        return void 0;
      }
      const result = await this.progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize({ key: "startTunnel.progress.title", comment: ["Only translate 'Starting remote tunnel', do not change the format of the rest (markdown link format)"] }, "[Starting remote tunnel](command:{0})", "workbench.remoteTunnel.actions.showLog" /* showLog */)
        },
        (progress) => {
          return new Promise((s, e) => {
            let completed = false;
            const listener = this.remoteTunnelService.onDidChangeTunnelStatus((status) => {
              switch (status.type) {
                case "connecting":
                  if (status.progress) {
                    progress.report({ message: status.progress });
                  }
                  break;
                case "connected":
                  listener.dispose();
                  completed = true;
                  s(status.info);
                  if (status.serviceInstallFailed) {
                    this.notificationService.notify({
                      severity: Severity.Warning,
                      message: localize(
                        {
                          key: "remoteTunnel.serviceInstallFailed",
                          comment: ['{Locked="](command:{0})"}']
                        },
                        "Installation as a service failed, and we fell back to running the tunnel for this session. See the [error log](command:{0}) for details.",
                        "workbench.remoteTunnel.actions.showLog" /* showLog */
                      )
                    });
                  }
                  break;
                case "disconnected":
                  listener.dispose();
                  completed = true;
                  tokenProblems = !!status.onTokenFailed;
                  s(void 0);
                  break;
              }
            });
            const token = this.getPreferredTokenFromSession(authenticationSession);
            const account = { sessionId: authenticationSession.session.id, token, providerId: authenticationSession.providerId, accountLabel: authenticationSession.session.account.label };
            this.remoteTunnelService.startTunnel({ active: true, asService, session: account }).then((status) => {
              if (!completed && (status.type === "connected" || status.type === "disconnected")) {
                listener.dispose();
                if (status.type === "connected") {
                  s(status.info);
                } else {
                  tokenProblems = !!status.onTokenFailed;
                  s(void 0);
                }
              }
            });
          });
        }
      );
      if (result || !tokenProblems) {
        return result;
      }
    }
    return void 0;
  }
  async getAuthenticationSession() {
    const sessions = await this.getAllSessions();
    const disposables = new DisposableStore();
    const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    quickpick.ok = false;
    quickpick.placeholder = localize("accountPreference.placeholder", "Sign in to an account to enable remote access");
    quickpick.ignoreFocusOut = true;
    quickpick.items = await this.createQuickpickItems(sessions);
    return new Promise((resolve, reject) => {
      disposables.add(quickpick.onDidHide((e) => {
        resolve(void 0);
        disposables.dispose();
      }));
      disposables.add(quickpick.onDidAccept(async (e) => {
        const selection = quickpick.selectedItems[0];
        if ("provider" in selection) {
          const session = await this.authenticationService.createSession(selection.provider.id, selection.provider.scopes);
          resolve(this.createExistingSessionItem(session, selection.provider.id));
        } else if ("session" in selection) {
          resolve(selection);
        } else {
          resolve(void 0);
        }
        quickpick.hide();
      }));
      quickpick.show();
    });
  }
  createExistingSessionItem(session, providerId) {
    return {
      label: session.account.label,
      description: this.authenticationService.getProvider(providerId).label,
      session,
      providerId
    };
  }
  async createQuickpickItems(sessions) {
    const options = [];
    if (sessions.length) {
      options.push({ type: "separator", label: localize("signed in", "Signed In") });
      options.push(...sessions);
      options.push({ type: "separator", label: localize("others", "Others") });
    }
    for (const authenticationProvider of await this.getAuthenticationProviders()) {
      const signedInForProvider = sessions.some((account) => account.providerId === authenticationProvider.id);
      const provider = this.authenticationService.getProvider(authenticationProvider.id);
      if (!signedInForProvider || provider.supportsMultipleAccounts) {
        options.push({ label: localize({ key: "sign in using account", comment: ["{0} will be a auth provider (e.g. Github)"] }, "Sign in with {0}", provider.label), provider: authenticationProvider });
      }
    }
    return options;
  }
  /**
   * Returns all authentication sessions available from {@link getAuthenticationProviders}.
   */
  async getAllSessions() {
    const authenticationProviders = await this.getAuthenticationProviders();
    const accounts = /* @__PURE__ */ new Map();
    const currentAccount = await this.remoteTunnelService.getMode();
    let currentSession;
    for (const provider of authenticationProviders) {
      const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);
      for (const session of sessions) {
        if (!this.expiredSessions.has(session.id)) {
          const item = this.createExistingSessionItem(session, provider.id);
          accounts.set(item.session.account.id, item);
          if (currentAccount.active && currentAccount.session.sessionId === session.id) {
            currentSession = item;
          }
        }
      }
    }
    if (currentSession !== void 0) {
      accounts.set(currentSession.session.account.id, currentSession);
    }
    return [...accounts.values()];
  }
  async getSessionToken(session) {
    if (session) {
      const sessionItem = (await this.getAllSessions()).find((s) => s.session.id === session.sessionId);
      if (sessionItem) {
        return this.getPreferredTokenFromSession(sessionItem);
      }
    }
    return void 0;
  }
  /**
   * Returns all authentication providers which can be used to authenticate
   * to the remote storage service, based on product.json configuration
   * and registered authentication providers.
   */
  async getAuthenticationProviders() {
    const authenticationProviders = this.serverConfiguration.authenticationProviders;
    const configuredAuthenticationProviders = Object.keys(authenticationProviders).reduce((result, id) => {
      result.push({ id, scopes: authenticationProviders[id].scopes });
      return result;
    }, []);
    const availableAuthenticationProviders = this.authenticationService.declaredProviders;
    return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some((provider) => provider.id === id));
  }
  registerCommands() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.turnOn" /* turnOn */,
          title: RemoteTunnelCommandLabels.turnOn,
          category: REMOTE_TUNNEL_CATEGORY,
          precondition: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected"),
          menu: [
            {
              id: MenuId.CommandPalette
            },
            {
              id: MenuId.AccountsContext,
              group: "2_remoteTunnel",
              when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected")
            }
          ]
        });
      }
      async run(accessor) {
        const notificationService = accessor.get(INotificationService);
        const clipboardService = accessor.get(IClipboardService);
        const commandService = accessor.get(ICommandService);
        const storageService = accessor.get(IStorageService);
        const dialogService = accessor.get(IDialogService);
        const quickInputService = accessor.get(IQuickInputService);
        const productService = accessor.get(IProductService);
        const didNotifyPreview = storageService.getBoolean(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, StorageScope.APPLICATION, false);
        if (!didNotifyPreview) {
          const { confirmed } = await dialogService.confirm({
            message: localize("tunnel.preview", 'Remote Tunnels is currently in preview. Please report any problems using the "Help: Report Issue" command.'),
            primaryButton: localize({ key: "enable", comment: ["&& denotes a mnemonic"] }, "&&Enable")
          });
          if (!confirmed) {
            return;
          }
          storageService.store(REMOTE_TUNNEL_PROMPTED_PREVIEW_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
        }
        const disposables = new DisposableStore();
        const quickPick = quickInputService.createQuickPick();
        quickPick.placeholder = localize("tunnel.enable.placeholder", "Select how you want to enable access");
        quickPick.items = [
          { service: false, label: localize("tunnel.enable.session", "Turn on for this session"), description: localize("tunnel.enable.session.description", "Run whenever {0} is open", productService.nameShort) },
          { service: true, label: localize("tunnel.enable.service", "Install as a service"), description: localize("tunnel.enable.service.description", "Run whenever you're logged in") }
        ];
        const asService = await new Promise((resolve) => {
          disposables.add(quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]?.service)));
          disposables.add(quickPick.onDidHide(() => resolve(void 0)));
          quickPick.show();
        });
        quickPick.dispose();
        if (asService === void 0) {
          return;
        }
        const connectionInfo = await that.startTunnel(
          /* installAsService= */
          asService
        );
        if (connectionInfo) {
          const remoteExtension = that.serverConfiguration.extension;
          if (connectionInfo.link && connectionInfo.domain) {
            const linkToOpen = that.getLinkToOpen(connectionInfo.link);
            const linkToOpenForMarkdown = linkToOpen.toString(false).replace(/\)/g, "%29");
            notificationService.notify({
              severity: Severity.Info,
              message: localize(
                {
                  key: "progress.turnOn.final",
                  comment: ["{0} will be the tunnel name, {1} will the link address to the web UI, {6} an extension name, {7} a link to the extension documentation. [label](command:commandId) is a markdown link. Only translate the label, do not modify the format"]
                },
                "You can now access this machine anywhere via the secure tunnel [{0}](command:{4}). To connect via a different machine, use the generated [{1}]({2}) link or use the [{6}]({7}) extension in the desktop or web. You can [configure](command:{3}) or [turn off](command:{5}) this access via the VS Code Accounts menu.",
                connectionInfo.tunnelName,
                connectionInfo.domain,
                linkToOpenForMarkdown,
                "workbench.remoteTunnel.actions.manage" /* manage */,
                "workbench.remoteTunnel.actions.configure" /* configure */,
                "workbench.remoteTunnel.actions.turnOff" /* turnOff */,
                remoteExtension.friendlyName,
                "https://code.visualstudio.com/docs/remote/tunnels"
              ),
              actions: {
                primary: [
                  toAction({ id: "copyToClipboard", label: localize("action.copyToClipboard", "Copy Browser Link to Clipboard"), run: () => clipboardService.writeText(linkToOpen.toString(true)) }),
                  toAction({
                    id: "showExtension",
                    label: localize("action.showExtension", "Show Extension"),
                    run: () => {
                      return commandService.executeCommand("workbench.extensions.action.showExtensionsWithIds", [remoteExtension.extensionId]);
                    }
                  })
                ]
              }
            });
          } else {
            notificationService.notify({
              severity: Severity.Info,
              message: localize("progress.turnOn.final.noLink", "Remote Tunnel Access is enabled for {0}. You can [configure](command:{1}) or [turn off](command:{2}) this access via the VS Code Accounts menu.", connectionInfo.tunnelName, "workbench.remoteTunnel.actions.configure" /* configure */, "workbench.remoteTunnel.actions.turnOff" /* turnOff */)
            });
          }
          const usedOnHostMessage = { hostName: connectionInfo.tunnelName, timeStamp: (/* @__PURE__ */ new Date()).getTime() };
          storageService.store(REMOTE_TUNNEL_USED_STORAGE_KEY, JSON.stringify(usedOnHostMessage), StorageScope.APPLICATION, StorageTarget.USER);
        } else {
          notificationService.notify({
            severity: Severity.Info,
            message: localize(
              "progress.turnOn.failed",
              "Unable to turn on the remote tunnel access. Check the Remote Tunnel Service log for details."
            )
          });
          await commandService.executeCommand("workbench.remoteTunnel.actions.showLog" /* showLog */);
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.manage" /* manage */,
          title: localize("remoteTunnel.actions.manage.on.v2", "Remote Tunnel Access is On"),
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.AccountsContext,
            group: "2_remoteTunnel",
            when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connected")
          }]
        });
      }
      async run() {
        that.showManageOptions();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.connecting" /* connecting */,
          title: localize("remoteTunnel.actions.manage.connecting", "Remote Tunnel Access is Connecting"),
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.AccountsContext,
            group: "2_remoteTunnel",
            when: ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connecting")
          }]
        });
      }
      async run() {
        that.showManageOptions();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.turnOff" /* turnOff */,
          title: RemoteTunnelCommandLabels.turnOff,
          category: REMOTE_TUNNEL_CATEGORY,
          precondition: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "disconnected"),
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "")
          }]
        });
      }
      async run() {
        const message = that.connectionInfo?.isAttached ? localize("remoteTunnel.turnOffAttached.confirm", "Do you want to turn off Remote Tunnel Access? This will also stop the service that was started externally.") : localize("remoteTunnel.turnOff.confirm", "Do you want to turn off Remote Tunnel Access?");
        const { confirmed } = await that.dialogService.confirm({ message });
        if (confirmed) {
          that.remoteTunnelService.stopTunnel();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.showLog" /* showLog */,
          title: RemoteTunnelCommandLabels.showLog,
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "")
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        outputService.showChannel(LOG_ID);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.configure" /* configure */,
          title: RemoteTunnelCommandLabels.configure,
          category: REMOTE_TUNNEL_CATEGORY,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "")
          }]
        });
      }
      async run(accessor) {
        const preferencesService = accessor.get(IPreferencesService);
        preferencesService.openSettings({ query: CONFIGURATION_KEY_PREFIX });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.copyToClipboard" /* copyToClipboard */,
          title: RemoteTunnelCommandLabels.copyToClipboard,
          category: REMOTE_TUNNEL_CATEGORY,
          precondition: ContextKeyExpr.and(
            ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connected"),
            REMOTE_TUNNEL_HAS_LINK.isEqualTo(true)
          ),
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(
              ContextKeyExpr.equals(REMOTE_TUNNEL_CONNECTION_STATE_KEY, "connected"),
              REMOTE_TUNNEL_HAS_LINK.isEqualTo(true)
            )
          }]
        });
      }
      async run(accessor) {
        const clipboardService = accessor.get(IClipboardService);
        if (that.connectionInfo?.link) {
          const linkToOpen = that.getLinkToOpen(that.connectionInfo.link);
          clipboardService.writeText(linkToOpen.toString(true));
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.remoteTunnel.actions.learnMore" /* learnMore */,
          title: RemoteTunnelCommandLabels.learnMore,
          category: REMOTE_TUNNEL_CATEGORY,
          menu: []
        });
      }
      async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        await openerService.open("https://aka.ms/vscode-server-doc");
      }
    }));
  }
  getLinkToOpen(link) {
    const workspace = this.workspaceContextService.getWorkspace();
    const folders = workspace.folders;
    let resource;
    if (folders.length === 1) {
      resource = folders[0].uri;
    } else if (workspace.configuration && !isUntitledWorkspace(workspace.configuration, this.environmentService)) {
      resource = workspace.configuration;
    }
    const tunnelLink = URI.parse(link);
    if (resource?.scheme === Schemas.file) {
      return joinPath(tunnelLink, resource.path);
    }
    return joinPath(tunnelLink, this.environmentService.userHome.path);
  }
  async showManageOptions() {
    const account = await this.remoteTunnelService.getMode();
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = this.quickInputService.createQuickPick({ useSeparators: true });
      quickPick.placeholder = localize("manage.placeholder", "Select a command to invoke");
      disposables.add(quickPick);
      const items = [];
      items.push({ id: "workbench.remoteTunnel.actions.learnMore" /* learnMore */, label: RemoteTunnelCommandLabels.learnMore });
      if (this.connectionInfo) {
        quickPick.title = this.connectionInfo.isAttached ? localize({ key: "manage.title.attached", comment: ["{0} is the tunnel name"] }, "Remote Tunnel Access enabled for {0} (launched externally)", this.connectionInfo.tunnelName) : localize({ key: "manage.title.orunning", comment: ["{0} is the tunnel name"] }, "Remote Tunnel Access enabled for {0}", this.connectionInfo.tunnelName);
        if (this.connectionInfo.link && this.connectionInfo.domain) {
          items.push({ id: "workbench.remoteTunnel.actions.copyToClipboard" /* copyToClipboard */, label: RemoteTunnelCommandLabels.copyToClipboard, description: this.connectionInfo.domain });
        }
      } else {
        quickPick.title = localize("manage.title.off", "Remote Tunnel Access not enabled");
      }
      items.push({ id: "workbench.remoteTunnel.actions.showLog" /* showLog */, label: localize("manage.showLog", "Show Log") });
      items.push({ type: "separator" });
      items.push({ id: "workbench.remoteTunnel.actions.configure" /* configure */, label: localize("manage.tunnelName", "Change Tunnel Name"), description: this.connectionInfo?.tunnelName });
      items.push({ id: "workbench.remoteTunnel.actions.turnOff" /* turnOff */, label: RemoteTunnelCommandLabels.turnOff, description: account.active ? `${account.session.accountLabel} (${account.session.providerId})` : void 0 });
      quickPick.items = items;
      disposables.add(quickPick.onDidAccept(() => {
        if (quickPick.selectedItems[0] && quickPick.selectedItems[0].id) {
          this.commandService.executeCommand(quickPick.selectedItems[0].id);
        }
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        c();
      }));
      quickPick.show();
    });
  }
};
RemoteTunnelWorkbenchContribution = __decorateClass([
  __decorateParam(0, IAuthenticationService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ILoggerService),
  __decorateParam(7, IQuickInputService),
  __decorateParam(8, INativeEnvironmentService),
  __decorateParam(9, IRemoteTunnelService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IWorkspaceContextService),
  __decorateParam(12, IProgressService),
  __decorateParam(13, INotificationService)
], RemoteTunnelWorkbenchContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteTunnelWorkbenchContribution, LifecyclePhase.Restored);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  type: "object",
  properties: {
    [CONFIGURATION_KEY_HOST_NAME]: {
      description: localize("remoteTunnelAccess.machineName", "The name under which the remote tunnel access is registered. If not set, the host name is used."),
      type: "string",
      scope: ConfigurationScope.APPLICATION,
      ignoreSync: true,
      pattern: "^(\\w[\\w-]*)?$",
      patternErrorMessage: localize("remoteTunnelAccess.machineNameRegex", "The name must only consist of letters, numbers, underscore and dash. It must not start with a dash."),
      maxLength: 20,
      default: ""
    },
    [CONFIGURATION_KEY_PREVENT_SLEEP]: {
      description: localize("remoteTunnelAccess.preventSleep", "Prevent this computer from sleeping when remote tunnel access is turned on."),
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      default: false
    }
  }
});
export {
  REMOTE_TUNNEL_CATEGORY,
  REMOTE_TUNNEL_CONNECTION_STATE,
  REMOTE_TUNNEL_CONNECTION_STATE_KEY,
  RemoteTunnelWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVR1bm5lbFxcZWxlY3Ryb24tYnJvd3NlclxccmVtb3RlVHVubmVsLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVR1bm5lbEFwcGxpY2F0aW9uQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc051bWJlciwgaXNPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5LCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NTdGVwLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IsIFF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENPTkZJR1VSQVRJT05fS0VZX0hPU1RfTkFNRSwgQ09ORklHVVJBVElPTl9LRVlfUFJFRklYLCBDT05GSUdVUkFUSU9OX0tFWV9QUkVWRU5UX1NMRUVQLCBDb25uZWN0aW9uSW5mbywgSU5BQ1RJVkVfVFVOTkVMX01PREUsIElSZW1vdGVUdW5uZWxTZXJ2aWNlLCBJUmVtb3RlVHVubmVsU2Vzc2lvbiwgTE9HR0VSX05BTUUsIExPR19JRCwgVHVubmVsU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlVHVubmVsL2NvbW1vbi9yZW1vdGVUdW5uZWwuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgaXNVbnRpdGxlZFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuXG5leHBvcnQgY29uc3QgUkVNT1RFX1RVTk5FTF9DQVRFR09SWSA9IGxvY2FsaXplMigncmVtb3RlVHVubmVsLmNhdGVnb3J5JywgJ1JlbW90ZSBUdW5uZWxzJyk7XG5cbnR5cGUgQ09OVEVYVF9LRVlfU1RBVEVTID0gJ2Nvbm5lY3RlZCcgfCAnY29ubmVjdGluZycgfCAnZGlzY29ubmVjdGVkJztcblxuZXhwb3J0IGNvbnN0IFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVkgPSAncmVtb3RlVHVubmVsQ29ubmVjdGlvbic7XG5leHBvcnQgY29uc3QgUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFID0gbmV3IFJhd0NvbnRleHRLZXk8Q09OVEVYVF9LRVlfU1RBVEVTPihSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnZGlzY29ubmVjdGVkJyk7XG5jb25zdCBSRU1PVEVfVFVOTkVMX0hBU19MSU5LID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3JlbW90ZVR1bm5lbEhhc0xpbmsnLCBmYWxzZSk7XG5cbmNvbnN0IFJFTU9URV9UVU5ORUxfVVNFRF9TVE9SQUdFX0tFWSA9ICdyZW1vdGVUdW5uZWxTZXJ2aWNlVXNlZCc7XG5jb25zdCBSRU1PVEVfVFVOTkVMX1BST01QVEVEX1BSRVZJRVdfU1RPUkFHRV9LRVkgPSAncmVtb3RlVHVubmVsU2VydmljZVByb21wdGVkUHJldmlldyc7XG5jb25zdCBSRU1PVEVfVFVOTkVMX0VYVEVOU0lPTl9SRUNPTU1FTkRFRF9LRVkgPSAncmVtb3RlVHVubmVsRXh0ZW5zaW9uUmVjb21tZW5kZWQnO1xuY29uc3QgUkVNT1RFX1RVTk5FTF9IQVNfVVNFRF9CRUZPUkUgPSAncmVtb3RlVHVubmVsSGFzVXNlZCc7XG5jb25zdCBSRU1PVEVfVFVOTkVMX0VYVEVOU0lPTl9USU1FT1VUID0gNCAqIDYwICogMTAwMDsgLy8gc2hvdyB0aGUgcmVjb21tZW5kYXRpb24gdGhhdCBhIG1hY2hpbmUgc3RhcnRlZCB1c2luZyB0dW5uZWxzIGlmIGl0IGpvaW5lZCBsZXNzIHRoYW4gNCBtaW51dGVzIGFnb1xuXG5jb25zdCBJTlZBTElEX1RPS0VOX1JFVFJJRVMgPSAyO1xuXG5pbnRlcmZhY2UgVXNlZE9uSG9zdE1lc3NhZ2UgeyBob3N0TmFtZTogc3RyaW5nOyB0aW1lU3RhbXA6IG51bWJlciB9XG5cbnR5cGUgRXhpc3RpbmdTZXNzaW9uSXRlbSA9IHsgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uOyBwcm92aWRlcklkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfTtcbnR5cGUgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgPSB7IGlkOiBzdHJpbmc7IHNjb3Blczogc3RyaW5nW10gfTtcbnR5cGUgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiA9IElRdWlja1BpY2tJdGVtICYgeyBwcm92aWRlcjogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgfTtcblxuZW51bSBSZW1vdGVUdW5uZWxDb21tYW5kSWRzIHtcblx0dHVybk9uID0gJ3dvcmtiZW5jaC5yZW1vdGVUdW5uZWwuYWN0aW9ucy50dXJuT24nLFxuXHR0dXJuT2ZmID0gJ3dvcmtiZW5jaC5yZW1vdGVUdW5uZWwuYWN0aW9ucy50dXJuT2ZmJyxcblx0Y29ubmVjdGluZyA9ICd3b3JrYmVuY2gucmVtb3RlVHVubmVsLmFjdGlvbnMuY29ubmVjdGluZycsXG5cdG1hbmFnZSA9ICd3b3JrYmVuY2gucmVtb3RlVHVubmVsLmFjdGlvbnMubWFuYWdlJyxcblx0c2hvd0xvZyA9ICd3b3JrYmVuY2gucmVtb3RlVHVubmVsLmFjdGlvbnMuc2hvd0xvZycsXG5cdGNvbmZpZ3VyZSA9ICd3b3JrYmVuY2gucmVtb3RlVHVubmVsLmFjdGlvbnMuY29uZmlndXJlJyxcblx0Y29weVRvQ2xpcGJvYXJkID0gJ3dvcmtiZW5jaC5yZW1vdGVUdW5uZWwuYWN0aW9ucy5jb3B5VG9DbGlwYm9hcmQnLFxuXHRsZWFybk1vcmUgPSAnd29ya2JlbmNoLnJlbW90ZVR1bm5lbC5hY3Rpb25zLmxlYXJuTW9yZScsXG59XG5cbi8vIG5hbWUgc2hvd24gaW4gbm9maWNhdGlvbnNcbm5hbWVzcGFjZSBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzIHtcblx0ZXhwb3J0IGNvbnN0IHR1cm5PbiA9IGxvY2FsaXplKCdyZW1vdGVUdW5uZWwuYWN0aW9ucy50dXJuT24nLCAnVHVybiBvbiBSZW1vdGUgVHVubmVsIEFjY2Vzcy4uLicpO1xuXHRleHBvcnQgY29uc3QgdHVybk9mZiA9IGxvY2FsaXplKCdyZW1vdGVUdW5uZWwuYWN0aW9ucy50dXJuT2ZmJywgJ1R1cm4gb2ZmIFJlbW90ZSBUdW5uZWwgQWNjZXNzLi4uJyk7XG5cdGV4cG9ydCBjb25zdCBzaG93TG9nID0gbG9jYWxpemUoJ3JlbW90ZVR1bm5lbC5hY3Rpb25zLnNob3dMb2cnLCAnU2hvdyBSZW1vdGUgVHVubmVsIFNlcnZpY2UgTG9nJyk7XG5cdGV4cG9ydCBjb25zdCBjb25maWd1cmUgPSBsb2NhbGl6ZSgncmVtb3RlVHVubmVsLmFjdGlvbnMuY29uZmlndXJlJywgJ0NvbmZpZ3VyZSBUdW5uZWwgTmFtZS4uLicpO1xuXHRleHBvcnQgY29uc3QgY29weVRvQ2xpcGJvYXJkID0gbG9jYWxpemUoJ3JlbW90ZVR1bm5lbC5hY3Rpb25zLmNvcHlUb0NsaXBib2FyZCcsICdDb3B5IEJyb3dzZXIgVVJJIHRvIENsaXBib2FyZCcpO1xuXHRleHBvcnQgY29uc3QgbGVhcm5Nb3JlID0gbG9jYWxpemUoJ3JlbW90ZVR1bm5lbC5hY3Rpb25zLmxlYXJuTW9yZScsICdHZXQgU3RhcnRlZCB3aXRoIFR1bm5lbHMnKTtcbn1cblxuXG5leHBvcnQgY2xhc3MgUmVtb3RlVHVubmVsV29ya2JlbmNoQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29ubmVjdGlvblN0YXRlQ29udGV4dDogSUNvbnRleHRLZXk8Q09OVEVYVF9LRVlfU1RBVEVTPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNMaW5rQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXJ2ZXJDb25maWd1cmF0aW9uOiBJVHVubmVsQXBwbGljYXRpb25Db25maWc7XG5cblx0cHJpdmF0ZSBjb25uZWN0aW9uSW5mbzogQ29ubmVjdGlvbkluZm8gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IElMb2dnZXI7XG5cblx0cHJpdmF0ZSBleHBpcmVkU2Vzc2lvbnM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVUdW5uZWxTZXJ2aWNlIHByaXZhdGUgcmVtb3RlVHVubmVsU2VydmljZTogSVJlbW90ZVR1bm5lbFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMubG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIobG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lLCBgJHtMT0dfSUR9LmxvZ2ApLCB7IGlkOiBMT0dfSUQsIG5hbWU6IExPR0dFUl9OQU1FIH0pKTtcblxuXHRcdHRoaXMuY29ubmVjdGlvblN0YXRlQ29udGV4dCA9IFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNMaW5rQ29udGV4dCA9IFJFTU9URV9UVU5ORUxfSEFTX0xJTksuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2VydmVyQ29uZmlndXJhdGlvbiA9IHByb2R1Y3RTZXJ2aWNlLnR1bm5lbEFwcGxpY2F0aW9uQ29uZmlnO1xuXHRcdGlmICghc2VydmVyQ29uZmlndXJhdGlvbiB8fCAhcHJvZHVjdFNlcnZpY2UudHVubmVsQXBwbGljYXRpb25OYW1lKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5lcnJvcignTWlzc2luZyBcXCd0dW5uZWxBcHBsaWNhdGlvbkNvbmZpZ1xcJyBvciBcXCd0dW5uZWxBcHBsaWNhdGlvbk5hbWVcXCcgaW4gcHJvZHVjdC5qc29uLiBSZW1vdGUgdHVubmVsaW5nIGlzIG5vdCBhdmFpbGFibGUuJyk7XG5cdFx0XHR0aGlzLnNlcnZlckNvbmZpZ3VyYXRpb24gPSB7IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzOiB7fSwgZWRpdG9yV2ViVXJsOiAnJywgZXh0ZW5zaW9uOiB7IGV4dGVuc2lvbklkOiAnJywgZnJpZW5kbHlOYW1lOiAnJyB9IH07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc2VydmVyQ29uZmlndXJhdGlvbiA9IHNlcnZlckNvbmZpZ3VyYXRpb247XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VUdW5uZWxTdGF0dXMocyA9PiB0aGlzLmhhbmRsZVR1bm5lbFN0YXR1c1VwZGF0ZShzKSkpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckNvbW1hbmRzKCk7XG5cblx0XHR0aGlzLmluaXRpYWxpemUoKTtcblxuXHRcdHRoaXMucmVjb21tZW5kUmVtb3RlRXh0ZW5zaW9uSWZOZWVkZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlVHVubmVsU3RhdHVzVXBkYXRlKHN0YXR1czogVHVubmVsU3RhdHVzKSB7XG5cdFx0dGhpcy5jb25uZWN0aW9uSW5mbyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmhhc0xpbmtDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0aWYgKHN0YXR1cy50eXBlID09PSAnZGlzY29ubmVjdGVkJykge1xuXHRcdFx0aWYgKHN0YXR1cy5vblRva2VuRmFpbGVkKSB7XG5cdFx0XHRcdHRoaXMuZXhwaXJlZFNlc3Npb25zLmFkZChzdGF0dXMub25Ub2tlbkZhaWxlZC5zZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVDb250ZXh0LnNldCgnZGlzY29ubmVjdGVkJyk7XG5cdFx0fSBlbHNlIGlmIChzdGF0dXMudHlwZSA9PT0gJ2Nvbm5lY3RpbmcnKSB7XG5cdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZUNvbnRleHQuc2V0KCdjb25uZWN0aW5nJyk7XG5cdFx0fSBlbHNlIGlmIChzdGF0dXMudHlwZSA9PT0gJ2Nvbm5lY3RlZCcpIHtcblx0XHRcdHRoaXMuY29ubmVjdGlvbkluZm8gPSBzdGF0dXMuaW5mbztcblx0XHRcdHRoaXMuaGFzTGlua0NvbnRleHQuc2V0KCEhc3RhdHVzLmluZm8ubGluayk7XG5cdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZUNvbnRleHQuc2V0KCdjb25uZWN0ZWQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlY29tbWVuZFJlbW90ZUV4dGVuc2lvbklmTmVlZGVkKCkge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbiA9IHRoaXMuc2VydmVyQ29uZmlndXJhdGlvbi5leHRlbnNpb247XG5cdFx0Y29uc3Qgc2hvdWxkUmVjb21tZW5kID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihSRU1PVEVfVFVOTkVMX0VYVEVOU0lPTl9SRUNPTU1FTkRFRF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24ocmVtb3RlRXh0ZW5zaW9uLmV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1c2VkT25Ib3N0TWVzc2FnZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFJFTU9URV9UVU5ORUxfVVNFRF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdGlmICghdXNlZE9uSG9zdE1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHVzZWRUdW5uZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gSlNPTi5wYXJzZSh1c2VkT25Ib3N0TWVzc2FnZSk7XG5cdFx0XHRcdGlmICghaXNPYmplY3QobWVzc2FnZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBob3N0TmFtZSwgdGltZVN0YW1wIH0gPSBtZXNzYWdlIGFzIFVzZWRPbkhvc3RNZXNzYWdlO1xuXHRcdFx0XHRpZiAoIWlzU3RyaW5nKGhvc3ROYW1lKSEgfHwgIWlzTnVtYmVyKHRpbWVTdGFtcCkgfHwgbmV3IERhdGUoKS5nZXRUaW1lKCkgPiB0aW1lU3RhbXAgKyBSRU1PVEVfVFVOTkVMX0VYVEVOU0lPTl9USU1FT1VUKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVzZWRUdW5uZWxOYW1lID0gaG9zdE5hbWU7XG5cdFx0XHR9IGNhdGNoIChfKSB7XG5cdFx0XHRcdC8vIHByb2JsZW1zIHBhcnNpbmcgdGhlIG1lc3NhZ2UsIGxpa2x5IHRoZSBvbGQgbWVzc2FnZSBmb3JtYXRcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VycmVudFR1bm5lbE5hbWUgPSBhd2FpdCB0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2UuZ2V0VHVubmVsTmFtZSgpO1xuXHRcdFx0aWYgKCFjdXJyZW50VHVubmVsTmFtZSB8fCBjdXJyZW50VHVubmVsTmFtZSA9PT0gdXNlZFR1bm5lbE5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVzZWRUdW5uZWxOYW1lO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVjb21tZWQgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1c2VkT25Ib3N0ID0gYXdhaXQgc2hvdWxkUmVjb21tZW5kKCk7XG5cdFx0XHRpZiAoIXVzZWRPbkhvc3QpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuT1BUSU9OQUwsXG5cdFx0XHRcdG1lc3NhZ2U6XG5cdFx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3JlY29tbWVuZC5yZW1vdGVFeHRlbnNpb24nLFxuXHRcdFx0XHRcdFx0XHRjb21tZW50OiBbJ3swfSB3aWxsIGJlIGEgdHVubmVsIG5hbWUsIHsxfSB3aWxsIHRoZSBsaW5rIGFkZHJlc3MgdG8gdGhlIHdlYiBVSSwgezZ9IGFuIGV4dGVuc2lvbiBuYW1lLiBbbGFiZWxdKGNvbW1hbmQ6Y29tbWFuZElkKSBpcyBhIG1hcmtkb3duIGxpbmsuIE9ubHkgdHJhbnNsYXRlIHRoZSBsYWJlbCwgZG8gbm90IG1vZGlmeSB0aGUgZm9ybWF0J11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcIlR1bm5lbCAnezB9JyBpcyBhdmFpYWJsZSBmb3IgcmVtb3RlIGFjY2Vzcy4gVGhlIHsxfSBleHRlbnNpb24gY2FuIGJlIHVzZWQgdG8gY29ubmVjdCB0byBpdC5cIixcblx0XHRcdFx0XHRcdHVzZWRPbkhvc3QsIHJlbW90ZUV4dGVuc2lvbi5mcmllbmRseU5hbWVcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3Nob3dFeHRlbnNpb24nLCBsYWJlbDogbG9jYWxpemUoJ2FjdGlvbi5zaG93RXh0ZW5zaW9uJywgXCJTaG93IEV4dGVuc2lvblwiKSwgcnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93RXh0ZW5zaW9uc1dpdGhJZHMnLCBbcmVtb3RlRXh0ZW5zaW9uLmV4dGVuc2lvbklkXSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ2RvTm90U2hvd0FnYWluJywgbGFiZWw6IGxvY2FsaXplKCdhY3Rpb24uZG9Ob3RTaG93QWdhaW4nLCBcIkRvIG5vdCBzaG93IGFnYWluXCIpLCBydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFJFTU9URV9UVU5ORUxfRVhURU5TSU9OX1JFQ09NTUVOREVEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblx0XHRpZiAoYXdhaXQgc2hvdWxkUmVjb21tZW5kKCkpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBSRU1PVEVfVFVOTkVMX1VTRURfU1RPUkFHRV9LRVksIGRpc3Bvc2FibGVzKShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCByZWNvbW1lZCgpO1xuXHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbbW9kZSwgc3RhdHVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMucmVtb3RlVHVubmVsU2VydmljZS5nZXRNb2RlKCksXG5cdFx0XHR0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2UuZ2V0VHVubmVsU3RhdHVzKCksXG5cdFx0XSk7XG5cblx0XHR0aGlzLmhhbmRsZVR1bm5lbFN0YXR1c1VwZGF0ZShzdGF0dXMpO1xuXG5cdFx0aWYgKG1vZGUuYWN0aXZlICYmIG1vZGUuc2Vzc2lvbi50b2tlbikge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGluaXRpYWxpemVkLCB0b2tlbiBhdmFpbGFibGVcblx0XHR9XG5cblx0XHRjb25zdCBkb0luaXRpYWxTdGF0ZURpc2NvdmVyeSA9IGFzeW5jIChwcm9ncmVzcz86IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBwcm9ncmVzcyAmJiB0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2Uub25EaWRDaGFuZ2VUdW5uZWxTdGF0dXMoc3RhdHVzID0+IHtcblx0XHRcdFx0c3dpdGNoIChzdGF0dXMudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgJ2Nvbm5lY3RpbmcnOlxuXHRcdFx0XHRcdFx0aWYgKHN0YXR1cy5wcm9ncmVzcykge1xuXHRcdFx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBzdGF0dXMucHJvZ3Jlc3MgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgbmV3U2Vzc2lvbjogSVJlbW90ZVR1bm5lbFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobW9kZS5hY3RpdmUpIHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCB0aGlzLmdldFNlc3Npb25Ub2tlbihtb2RlLnNlc3Npb24pO1xuXHRcdFx0XHRpZiAodG9rZW4pIHtcblx0XHRcdFx0XHRuZXdTZXNzaW9uID0geyAuLi5tb2RlLnNlc3Npb24sIHRva2VuIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXR1cyA9IGF3YWl0IHRoaXMucmVtb3RlVHVubmVsU2VydmljZS5pbml0aWFsaXplKG1vZGUuYWN0aXZlICYmIG5ld1Nlc3Npb24gPyB7IC4uLm1vZGUsIHNlc3Npb246IG5ld1Nlc3Npb24gfSA6IElOQUNUSVZFX1RVTk5FTF9NT0RFKTtcblx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cblx0XHRcdGlmIChzdGF0dXMudHlwZSA9PT0gJ2Nvbm5lY3RlZCcpIHtcblx0XHRcdFx0dGhpcy5jb25uZWN0aW9uSW5mbyA9IHN0YXR1cy5pbmZvO1xuXHRcdFx0XHR0aGlzLmNvbm5lY3Rpb25TdGF0ZUNvbnRleHQuc2V0KCdjb25uZWN0ZWQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH07XG5cblxuXHRcdGNvbnN0IGhhc1VzZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oUkVNT1RFX1RVTk5FTF9IQVNfVVNFRF9CRUZPUkUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXG5cdFx0aWYgKGhhc1VzZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdpbml0aWFsaXplLnByb2dyZXNzLnRpdGxlJywgY29tbWVudDogWydPbmx5IHRyYW5zbGF0ZSBcXCdMb29raW5nIGZvciByZW1vdGUgdHVubmVsXFwnLCBkbyBub3QgY2hhbmdlIHRoZSBmb3JtYXQgb2YgdGhlIHJlc3QgKG1hcmtkb3duIGxpbmsgZm9ybWF0KSddIH0sIFwiW0xvb2tpbmcgZm9yIHJlbW90ZSB0dW5uZWxdKGNvbW1hbmQ6ezB9KVwiLCBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnNob3dMb2cpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkb0luaXRpYWxTdGF0ZURpc2NvdmVyeVxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG9Jbml0aWFsU3RhdGVEaXNjb3ZlcnkodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFByZWZlcnJlZFRva2VuRnJvbVNlc3Npb24oc2Vzc2lvbjogRXhpc3RpbmdTZXNzaW9uSXRlbSkge1xuXHRcdHJldHVybiBzZXNzaW9uLnNlc3Npb24uYWNjZXNzVG9rZW4gfHwgc2Vzc2lvbi5zZXNzaW9uLmlkVG9rZW47XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN0YXJ0VHVubmVsKGFzU2VydmljZTogYm9vbGVhbik6IFByb21pc2U8Q29ubmVjdGlvbkluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jb25uZWN0aW9uSW5mbykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29ubmVjdGlvbkluZm87XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShSRU1PVEVfVFVOTkVMX0hBU19VU0VEX0JFRk9SRSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0bGV0IHRva2VuUHJvYmxlbXMgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IElOVkFMSURfVE9LRU5fUkVUUklFUzsgaSsrKSB7XG5cdFx0XHR0b2tlblByb2JsZW1zID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0QXV0aGVudGljYXRpb25TZXNzaW9uKCk7XG5cdFx0XHRpZiAoYXV0aGVudGljYXRpb25TZXNzaW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuaW5mbygnTm8gYXV0aGVudGljYXRpb24gc2Vzc2lvbiBhdmFpbGFibGUsIG5vdCBzdGFydGluZyB0dW5uZWwnKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ3N0YXJ0VHVubmVsLnByb2dyZXNzLnRpdGxlJywgY29tbWVudDogWydPbmx5IHRyYW5zbGF0ZSBcXCdTdGFydGluZyByZW1vdGUgdHVubmVsXFwnLCBkbyBub3QgY2hhbmdlIHRoZSBmb3JtYXQgb2YgdGhlIHJlc3QgKG1hcmtkb3duIGxpbmsgZm9ybWF0KSddIH0sIFwiW1N0YXJ0aW5nIHJlbW90ZSB0dW5uZWxdKGNvbW1hbmQ6ezB9KVwiLCBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnNob3dMb2cpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxDb25uZWN0aW9uSW5mbyB8IHVuZGVmaW5lZD4oKHMsIGUpID0+IHtcblx0XHRcdFx0XHRcdGxldCBjb21wbGV0ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGhpcy5yZW1vdGVUdW5uZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlVHVubmVsU3RhdHVzKHN0YXR1cyA9PiB7XG5cdFx0XHRcdFx0XHRcdHN3aXRjaCAoc3RhdHVzLnR5cGUpIHtcblx0XHRcdFx0XHRcdFx0XHRjYXNlICdjb25uZWN0aW5nJzpcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChzdGF0dXMucHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogc3RhdHVzLnByb2dyZXNzIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0Y2FzZSAnY29ubmVjdGVkJzpcblx0XHRcdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHN0YXR1cy5pbmZvKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChzdGF0dXMuc2VydmljZUluc3RhbGxGYWlsZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGtleTogJ3JlbW90ZVR1bm5lbC5zZXJ2aWNlSW5zdGFsbEZhaWxlZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oY29tbWFuZDp7MH0pXCJ9J11cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcIkluc3RhbGxhdGlvbiBhcyBhIHNlcnZpY2UgZmFpbGVkLCBhbmQgd2UgZmVsbCBiYWNrIHRvIHJ1bm5pbmcgdGhlIHR1bm5lbCBmb3IgdGhpcyBzZXNzaW9uLiBTZWUgdGhlIFtlcnJvciBsb2ddKGNvbW1hbmQ6ezB9KSBmb3IgZGV0YWlscy5cIixcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFJlbW90ZVR1bm5lbENvbW1hbmRJZHMuc2hvd0xvZyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdGNhc2UgJ2Rpc2Nvbm5lY3RlZCc6XG5cdFx0XHRcdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb21wbGV0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0dG9rZW5Qcm9ibGVtcyA9ICEhc3RhdHVzLm9uVG9rZW5GYWlsZWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbiA9IHRoaXMuZ2V0UHJlZmVycmVkVG9rZW5Gcm9tU2Vzc2lvbihhdXRoZW50aWNhdGlvblNlc3Npb24pO1xuXHRcdFx0XHRcdFx0Y29uc3QgYWNjb3VudDogSVJlbW90ZVR1bm5lbFNlc3Npb24gPSB7IHNlc3Npb25JZDogYXV0aGVudGljYXRpb25TZXNzaW9uLnNlc3Npb24uaWQsIHRva2VuLCBwcm92aWRlcklkOiBhdXRoZW50aWNhdGlvblNlc3Npb24ucHJvdmlkZXJJZCwgYWNjb3VudExhYmVsOiBhdXRoZW50aWNhdGlvblNlc3Npb24uc2Vzc2lvbi5hY2NvdW50LmxhYmVsIH07XG5cdFx0XHRcdFx0XHR0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2Uuc3RhcnRUdW5uZWwoeyBhY3RpdmU6IHRydWUsIGFzU2VydmljZSwgc2Vzc2lvbjogYWNjb3VudCB9KS50aGVuKHN0YXR1cyA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghY29tcGxldGVkICYmIChzdGF0dXMudHlwZSA9PT0gJ2Nvbm5lY3RlZCcgfHwgc3RhdHVzLnR5cGUgPT09ICdkaXNjb25uZWN0ZWQnKSkge1xuXHRcdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc3RhdHVzLnR5cGUgPT09ICdjb25uZWN0ZWQnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHN0YXR1cy5pbmZvKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0dG9rZW5Qcm9ibGVtcyA9ICEhc3RhdHVzLm9uVG9rZW5GYWlsZWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRzKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGlmIChyZXN1bHQgfHwgIXRva2VuUHJvYmxlbXMpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QXV0aGVudGljYXRpb25TZXNzaW9uKCk6IFByb21pc2U8RXhpc3RpbmdTZXNzaW9uSXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5nZXRBbGxTZXNzaW9ucygpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxFeGlzdGluZ1Nlc3Npb25JdGVtIHwgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiB8IElRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHF1aWNrcGljay5vayA9IGZhbHNlO1xuXHRcdHF1aWNrcGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdhY2NvdW50UHJlZmVyZW5jZS5wbGFjZWhvbGRlcicsIFwiU2lnbiBpbiB0byBhbiBhY2NvdW50IHRvIGVuYWJsZSByZW1vdGUgYWNjZXNzXCIpO1xuXHRcdHF1aWNrcGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gYXdhaXQgdGhpcy5jcmVhdGVRdWlja3BpY2tJdGVtcyhzZXNzaW9ucyk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZEhpZGUoKGUpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRBY2NlcHQoYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gcXVpY2twaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRcdGlmICgncHJvdmlkZXInIGluIHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKHNlbGVjdGlvbi5wcm92aWRlci5pZCwgc2VsZWN0aW9uLnByb3ZpZGVyLnNjb3Blcyk7XG5cdFx0XHRcdFx0cmVzb2x2ZSh0aGlzLmNyZWF0ZUV4aXN0aW5nU2Vzc2lvbkl0ZW0oc2Vzc2lvbiwgc2VsZWN0aW9uLnByb3ZpZGVyLmlkKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoJ3Nlc3Npb24nIGluIHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdHJlc29sdmUoc2VsZWN0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cXVpY2twaWNrLmhpZGUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cXVpY2twaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRXhpc3RpbmdTZXNzaW9uSXRlbShzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24sIHByb3ZpZGVySWQ6IHN0cmluZyk6IEV4aXN0aW5nU2Vzc2lvbkl0ZW0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogc2Vzc2lvbi5hY2NvdW50LmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpLmxhYmVsLFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHByb3ZpZGVySWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVRdWlja3BpY2tJdGVtcyhzZXNzaW9uczogRXhpc3RpbmdTZXNzaW9uSXRlbVtdKTogUHJvbWlzZTwoRXhpc3RpbmdTZXNzaW9uSXRlbSB8IEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJPcHRpb24gfCBJUXVpY2tQaWNrU2VwYXJhdG9yIHwgSVF1aWNrUGlja0l0ZW0gJiB7IGNhbmNlbGVkQXV0aGVudGljYXRpb246IGJvb2xlYW4gfSlbXT4ge1xuXHRcdGNvbnN0IG9wdGlvbnM6IChFeGlzdGluZ1Nlc3Npb25JdGVtIHwgQXV0aGVudGljYXRpb25Qcm92aWRlck9wdGlvbiB8IElRdWlja1BpY2tTZXBhcmF0b3IgfCBJUXVpY2tQaWNrSXRlbSAmIHsgY2FuY2VsZWRBdXRoZW50aWNhdGlvbjogYm9vbGVhbiB9KVtdID0gW107XG5cblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRvcHRpb25zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzaWduZWQgaW4nLCBcIlNpZ25lZCBJblwiKSB9KTtcblx0XHRcdG9wdGlvbnMucHVzaCguLi5zZXNzaW9ucyk7XG5cdFx0XHRvcHRpb25zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdvdGhlcnMnLCBcIk90aGVyc1wiKSB9KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgb2YgKGF3YWl0IHRoaXMuZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnMoKSkpIHtcblx0XHRcdGNvbnN0IHNpZ25lZEluRm9yUHJvdmlkZXIgPSBzZXNzaW9ucy5zb21lKGFjY291bnQgPT4gYWNjb3VudC5wcm92aWRlcklkID09PSBhdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIoYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCk7XG5cdFx0XHRpZiAoIXNpZ25lZEluRm9yUHJvdmlkZXIgfHwgcHJvdmlkZXIuc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzKSB7XG5cdFx0XHRcdG9wdGlvbnMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ3NpZ24gaW4gdXNpbmcgYWNjb3VudCcsIGNvbW1lbnQ6IFsnezB9IHdpbGwgYmUgYSBhdXRoIHByb3ZpZGVyIChlLmcuIEdpdGh1YiknXSB9LCBcIlNpZ24gaW4gd2l0aCB7MH1cIiwgcHJvdmlkZXIubGFiZWwpLCBwcm92aWRlcjogYXV0aGVudGljYXRpb25Qcm92aWRlciB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFsbCBhdXRoZW50aWNhdGlvbiBzZXNzaW9ucyBhdmFpbGFibGUgZnJvbSB7QGxpbmsgZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnN9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRBbGxTZXNzaW9ucygpOiBQcm9taXNlPEV4aXN0aW5nU2Vzc2lvbkl0ZW1bXT4ge1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzID0gYXdhaXQgdGhpcy5nZXRBdXRoZW50aWNhdGlvblByb3ZpZGVycygpO1xuXHRcdGNvbnN0IGFjY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIEV4aXN0aW5nU2Vzc2lvbkl0ZW0+KCk7XG5cdFx0Y29uc3QgY3VycmVudEFjY291bnQgPSBhd2FpdCB0aGlzLnJlbW90ZVR1bm5lbFNlcnZpY2UuZ2V0TW9kZSgpO1xuXHRcdGxldCBjdXJyZW50U2Vzc2lvbjogRXhpc3RpbmdTZXNzaW9uSXRlbSB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgYXV0aGVudGljYXRpb25Qcm92aWRlcnMpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQsIHByb3ZpZGVyLnNjb3Blcyk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRpZiAoIXRoaXMuZXhwaXJlZFNlc3Npb25zLmhhcyhzZXNzaW9uLmlkKSkge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmNyZWF0ZUV4aXN0aW5nU2Vzc2lvbkl0ZW0oc2Vzc2lvbiwgcHJvdmlkZXIuaWQpO1xuXHRcdFx0XHRcdGFjY291bnRzLnNldChpdGVtLnNlc3Npb24uYWNjb3VudC5pZCwgaXRlbSk7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRBY2NvdW50LmFjdGl2ZSAmJiBjdXJyZW50QWNjb3VudC5zZXNzaW9uLnNlc3Npb25JZCA9PT0gc2Vzc2lvbi5pZCkge1xuXHRcdFx0XHRcdFx0Y3VycmVudFNlc3Npb24gPSBpdGVtO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50U2Vzc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhY2NvdW50cy5zZXQoY3VycmVudFNlc3Npb24uc2Vzc2lvbi5hY2NvdW50LmlkLCBjdXJyZW50U2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5hY2NvdW50cy52YWx1ZXMoKV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFNlc3Npb25Ub2tlbihzZXNzaW9uOiBJUmVtb3RlVHVubmVsU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHNlc3Npb25JdGVtID0gKGF3YWl0IHRoaXMuZ2V0QWxsU2Vzc2lvbnMoKSkuZmluZChzID0+IHMuc2Vzc2lvbi5pZCA9PT0gc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHNlc3Npb25JdGVtKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFByZWZlcnJlZFRva2VuRnJvbVNlc3Npb24oc2Vzc2lvbkl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyB3aGljaCBjYW4gYmUgdXNlZCB0byBhdXRoZW50aWNhdGVcblx0ICogdG8gdGhlIHJlbW90ZSBzdG9yYWdlIHNlcnZpY2UsIGJhc2VkIG9uIHByb2R1Y3QuanNvbiBjb25maWd1cmF0aW9uXG5cdCAqIGFuZCByZWdpc3RlcmVkIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlcnMoKTogUHJvbWlzZTxJQXV0aGVudGljYXRpb25Qcm92aWRlcltdPiB7XG5cdFx0Ly8gR2V0IHRoZSBsaXN0IG9mIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVycyBjb25maWd1cmVkIGluIHByb2R1Y3QuanNvblxuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzID0gdGhpcy5zZXJ2ZXJDb25maWd1cmF0aW9uLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKS5yZWR1Y2U8SUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJbXT4oKHJlc3VsdCwgaWQpID0+IHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgaWQsIHNjb3BlczogYXV0aGVudGljYXRpb25Qcm92aWRlcnNbaWRdLnNjb3BlcyB9KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgW10pO1xuXG5cdFx0Ly8gRmlsdGVyIG91dCBhbnl0aGluZyB0aGF0IGlzbid0IGN1cnJlbnRseSBhdmFpbGFibGUgdGhyb3VnaCB0aGUgYXV0aGVudGljYXRpb25TZXJ2aWNlXG5cdFx0Y29uc3QgYXZhaWxhYmxlQXV0aGVudGljYXRpb25Qcm92aWRlcnMgPSB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5kZWNsYXJlZFByb3ZpZGVycztcblxuXHRcdHJldHVybiBjb25maWd1cmVkQXV0aGVudGljYXRpb25Qcm92aWRlcnMuZmlsdGVyKCh7IGlkIH0pID0+IGF2YWlsYWJsZUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4gcHJvdmlkZXIuaWQgPT09IGlkKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMudHVybk9uLFxuXHRcdFx0XHRcdHRpdGxlOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLnR1cm5Pbixcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnZGlzY29ubmVjdGVkJyksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMl9yZW1vdGVUdW5uZWwnLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVksICdkaXNjb25uZWN0ZWQnKSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cblx0XHRcdFx0Y29uc3QgZGlkTm90aWZ5UHJldmlldyA9IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oUkVNT1RFX1RVTk5FTF9QUk9NUFRFRF9QUkVWSUVXX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKTtcblx0XHRcdFx0aWYgKCFkaWROb3RpZnlQcmV2aWV3KSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHVubmVsLnByZXZpZXcnLCAnUmVtb3RlIFR1bm5lbHMgaXMgY3VycmVudGx5IGluIHByZXZpZXcuIFBsZWFzZSByZXBvcnQgYW55IHByb2JsZW1zIHVzaW5nIHRoZSBcIkhlbHA6IFJlcG9ydCBJc3N1ZVwiIGNvbW1hbmQuJyksXG5cdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ2VuYWJsZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgJyYmRW5hYmxlJylcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFJFTU9URV9UVU5ORUxfUFJPTVBURURfUFJFVklFV19TVE9SQUdFX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrUGljayA9IHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSAmIHsgc2VydmljZTogYm9vbGVhbiB9PigpO1xuXHRcdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgndHVubmVsLmVuYWJsZS5wbGFjZWhvbGRlcicsICdTZWxlY3QgaG93IHlvdSB3YW50IHRvIGVuYWJsZSBhY2Nlc3MnKTtcblx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gW1xuXHRcdFx0XHRcdHsgc2VydmljZTogZmFsc2UsIGxhYmVsOiBsb2NhbGl6ZSgndHVubmVsLmVuYWJsZS5zZXNzaW9uJywgJ1R1cm4gb24gZm9yIHRoaXMgc2Vzc2lvbicpLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3R1bm5lbC5lbmFibGUuc2Vzc2lvbi5kZXNjcmlwdGlvbicsICdSdW4gd2hlbmV2ZXIgezB9IGlzIG9wZW4nLCBwcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpIH0sXG5cdFx0XHRcdFx0eyBzZXJ2aWNlOiB0cnVlLCBsYWJlbDogbG9jYWxpemUoJ3R1bm5lbC5lbmFibGUuc2VydmljZScsICdJbnN0YWxsIGFzIGEgc2VydmljZScpLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3R1bm5lbC5lbmFibGUuc2VydmljZS5kZXNjcmlwdGlvbicsICdSdW4gd2hlbmV2ZXIgeW91XFwncmUgbG9nZ2VkIGluJykgfVxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGNvbnN0IGFzU2VydmljZSA9IGF3YWl0IG5ldyBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4gcmVzb2x2ZShxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXT8uc2VydmljZSkpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpKTtcblx0XHRcdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXG5cdFx0XHRcdGlmIChhc1NlcnZpY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gbm8tb3Bcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gYXdhaXQgdGhhdC5zdGFydFR1bm5lbCgvKiBpbnN0YWxsQXNTZXJ2aWNlPSAqLyBhc1NlcnZpY2UpO1xuXG5cdFx0XHRcdGlmIChjb25uZWN0aW9uSW5mbykge1xuXHRcdFx0XHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbiA9IHRoYXQuc2VydmVyQ29uZmlndXJhdGlvbi5leHRlbnNpb247XG5cdFx0XHRcdFx0aWYgKGNvbm5lY3Rpb25JbmZvLmxpbmsgJiYgY29ubmVjdGlvbkluZm8uZG9tYWluKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rVG9PcGVuID0gdGhhdC5nZXRMaW5rVG9PcGVuKGNvbm5lY3Rpb25JbmZvLmxpbmspO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlua1RvT3BlbkZvck1hcmtkb3duID0gbGlua1RvT3Blbi50b1N0cmluZyhmYWxzZSkucmVwbGFjZSgvXFwpL2csICclMjknKTtcblx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6XG5cdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGtleTogJ3Byb2dyZXNzLnR1cm5Pbi5maW5hbCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFsnezB9IHdpbGwgYmUgdGhlIHR1bm5lbCBuYW1lLCB7MX0gd2lsbCB0aGUgbGluayBhZGRyZXNzIHRvIHRoZSB3ZWIgVUksIHs2fSBhbiBleHRlbnNpb24gbmFtZSwgezd9IGEgbGluayB0byB0aGUgZXh0ZW5zaW9uIGRvY3VtZW50YXRpb24uIFtsYWJlbF0oY29tbWFuZDpjb21tYW5kSWQpIGlzIGEgbWFya2Rvd24gbGluay4gT25seSB0cmFuc2xhdGUgdGhlIGxhYmVsLCBkbyBub3QgbW9kaWZ5IHRoZSBmb3JtYXQnXVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFwiWW91IGNhbiBub3cgYWNjZXNzIHRoaXMgbWFjaGluZSBhbnl3aGVyZSB2aWEgdGhlIHNlY3VyZSB0dW5uZWwgW3swfV0oY29tbWFuZDp7NH0pLiBUbyBjb25uZWN0IHZpYSBhIGRpZmZlcmVudCBtYWNoaW5lLCB1c2UgdGhlIGdlbmVyYXRlZCBbezF9XSh7Mn0pIGxpbmsgb3IgdXNlIHRoZSBbezZ9XSh7N30pIGV4dGVuc2lvbiBpbiB0aGUgZGVza3RvcCBvciB3ZWIuIFlvdSBjYW4gW2NvbmZpZ3VyZV0oY29tbWFuZDp7M30pIG9yIFt0dXJuIG9mZl0oY29tbWFuZDp7NX0pIHRoaXMgYWNjZXNzIHZpYSB0aGUgVlMgQ29kZSBBY2NvdW50cyBtZW51LlwiLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29ubmVjdGlvbkluZm8udHVubmVsTmFtZSwgY29ubmVjdGlvbkluZm8uZG9tYWluLCBsaW5rVG9PcGVuRm9yTWFya2Rvd24sIFJlbW90ZVR1bm5lbENvbW1hbmRJZHMubWFuYWdlLCBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLmNvbmZpZ3VyZSwgUmVtb3RlVHVubmVsQ29tbWFuZElkcy50dXJuT2ZmLCByZW1vdGVFeHRlbnNpb24uZnJpZW5kbHlOYW1lLCAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9yZW1vdGUvdHVubmVscydcblx0XHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oeyBpZDogJ2NvcHlUb0NsaXBib2FyZCcsIGxhYmVsOiBsb2NhbGl6ZSgnYWN0aW9uLmNvcHlUb0NsaXBib2FyZCcsIFwiQ29weSBCcm93c2VyIExpbmsgdG8gQ2xpcGJvYXJkXCIpLCBydW46ICgpID0+IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGxpbmtUb09wZW4udG9TdHJpbmcodHJ1ZSkpIH0pLFxuXHRcdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZDogJ3Nob3dFeHRlbnNpb24nLCBsYWJlbDogbG9jYWxpemUoJ2FjdGlvbi5zaG93RXh0ZW5zaW9uJywgXCJTaG93IEV4dGVuc2lvblwiKSwgcnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd0V4dGVuc2lvbnNXaXRoSWRzJywgW3JlbW90ZUV4dGVuc2lvbi5leHRlbnNpb25JZF0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwcm9ncmVzcy50dXJuT24uZmluYWwubm9MaW5rJywgXCJSZW1vdGUgVHVubmVsIEFjY2VzcyBpcyBlbmFibGVkIGZvciB7MH0uIFlvdSBjYW4gW2NvbmZpZ3VyZV0oY29tbWFuZDp7MX0pIG9yIFt0dXJuIG9mZl0oY29tbWFuZDp7Mn0pIHRoaXMgYWNjZXNzIHZpYSB0aGUgVlMgQ29kZSBBY2NvdW50cyBtZW51LlwiLCBjb25uZWN0aW9uSW5mby50dW5uZWxOYW1lLCBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLmNvbmZpZ3VyZSwgUmVtb3RlVHVubmVsQ29tbWFuZElkcy50dXJuT2ZmKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1c2VkT25Ib3N0TWVzc2FnZTogVXNlZE9uSG9zdE1lc3NhZ2UgPSB7IGhvc3ROYW1lOiBjb25uZWN0aW9uSW5mby50dW5uZWxOYW1lLCB0aW1lU3RhbXA6IG5ldyBEYXRlKCkuZ2V0VGltZSgpIH07XG5cdFx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoUkVNT1RFX1RVTk5FTF9VU0VEX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeSh1c2VkT25Ib3N0TWVzc2FnZSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwcm9ncmVzcy50dXJuT24uZmFpbGVkJyxcblx0XHRcdFx0XHRcdFx0XCJVbmFibGUgdG8gdHVybiBvbiB0aGUgcmVtb3RlIHR1bm5lbCBhY2Nlc3MuIENoZWNrIHRoZSBSZW1vdGUgVHVubmVsIFNlcnZpY2UgbG9nIGZvciBkZXRhaWxzLlwiKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnNob3dMb2cpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMubWFuYWdlLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVtb3RlVHVubmVsLmFjdGlvbnMubWFuYWdlLm9uLnYyJywgJ1JlbW90ZSBUdW5uZWwgQWNjZXNzIGlzIE9uJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFJFTU9URV9UVU5ORUxfQ0FURUdPUlksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQWNjb3VudHNDb250ZXh0LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcyX3JlbW90ZVR1bm5lbCcsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFX0tFWSwgJ2Nvbm5lY3RlZCcpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKSB7XG5cdFx0XHRcdHRoYXQuc2hvd01hbmFnZU9wdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMuY29ubmVjdGluZyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JlbW90ZVR1bm5lbC5hY3Rpb25zLm1hbmFnZS5jb25uZWN0aW5nJywgJ1JlbW90ZSBUdW5uZWwgQWNjZXNzIGlzIENvbm5lY3RpbmcnKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdFx0XHRncm91cDogJzJfcmVtb3RlVHVubmVsJyxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscyhSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnY29ubmVjdGluZycpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKSB7XG5cdFx0XHRcdHRoYXQuc2hvd01hbmFnZU9wdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy50dXJuT2ZmLFxuXHRcdFx0XHRcdHRpdGxlOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLnR1cm5PZmYsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFJFTU9URV9UVU5ORUxfQ0FURUdPUlksXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFX0tFWSwgJ2Rpc2Nvbm5lY3RlZCcpLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIubm90RXF1YWxzKFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVksICcnKSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKCkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID1cblx0XHRcdFx0XHR0aGF0LmNvbm5lY3Rpb25JbmZvPy5pc0F0dGFjaGVkID9cblx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGVUdW5uZWwudHVybk9mZkF0dGFjaGVkLmNvbmZpcm0nLCAnRG8geW91IHdhbnQgdG8gdHVybiBvZmYgUmVtb3RlIFR1bm5lbCBBY2Nlc3M/IFRoaXMgd2lsbCBhbHNvIHN0b3AgdGhlIHNlcnZpY2UgdGhhdCB3YXMgc3RhcnRlZCBleHRlcm5hbGx5LicpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGVUdW5uZWwudHVybk9mZi5jb25maXJtJywgJ0RvIHlvdSB3YW50IHRvIHR1cm4gb2ZmIFJlbW90ZSBUdW5uZWwgQWNjZXNzPycpO1xuXG5cdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGF0LmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7IG1lc3NhZ2UgfSk7XG5cdFx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0XHR0aGF0LnJlbW90ZVR1bm5lbFNlcnZpY2Uuc3RvcFR1bm5lbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnNob3dMb2csXG5cdFx0XHRcdFx0dGl0bGU6IFJlbW90ZVR1bm5lbENvbW1hbmRMYWJlbHMuc2hvd0xvZyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhSRU1PVEVfVFVOTkVMX0NPTk5FQ1RJT05fU1RBVEVfS0VZLCAnJyksXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBvdXRwdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKTtcblx0XHRcdFx0b3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbChMT0dfSUQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5jb25maWd1cmUsXG5cdFx0XHRcdFx0dGl0bGU6IFJlbW90ZVR1bm5lbENvbW1hbmRMYWJlbHMuY29uZmlndXJlLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBSRU1PVEVfVFVOTkVMX0NBVEVHT1JZLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIubm90RXF1YWxzKFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVksICcnKSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRcdFx0cHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IHF1ZXJ5OiBDT05GSUdVUkFUSU9OX0tFWV9QUkVGSVggfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLmNvcHlUb0NsaXBib2FyZCxcblx0XHRcdFx0XHR0aXRsZTogUmVtb3RlVHVubmVsQ29tbWFuZExhYmVscy5jb3B5VG9DbGlwYm9hcmQsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFJFTU9URV9UVU5ORUxfQ0FURUdPUlksXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoUkVNT1RFX1RVTk5FTF9DT05ORUNUSU9OX1NUQVRFX0tFWSwgJ2Nvbm5lY3RlZCcpLFxuXHRcdFx0XHRcdFx0UkVNT1RFX1RVTk5FTF9IQVNfTElOSy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFJFTU9URV9UVU5ORUxfQ09OTkVDVElPTl9TVEFURV9LRVksICdjb25uZWN0ZWQnKSxcblx0XHRcdFx0XHRcdFx0UkVNT1RFX1RVTk5FTF9IQVNfTElOSy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0XHRcdGlmICh0aGF0LmNvbm5lY3Rpb25JbmZvPy5saW5rKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGlua1RvT3BlbiA9IHRoYXQuZ2V0TGlua1RvT3Blbih0aGF0LmNvbm5lY3Rpb25JbmZvLmxpbmspO1xuXHRcdFx0XHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGxpbmtUb09wZW4udG9TdHJpbmcodHJ1ZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFJlbW90ZVR1bm5lbENvbW1hbmRJZHMubGVhcm5Nb3JlLFxuXHRcdFx0XHRcdHRpdGxlOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLmxlYXJuTW9yZSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX1RVTk5FTF9DQVRFR09SWSxcblx0XHRcdFx0XHRtZW51OiBbXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1zZXJ2ZXItZG9jJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMaW5rVG9PcGVuKGxpbms6IHN0cmluZyk6IFVSSSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBmb2xkZXJzID0gd29ya3NwYWNlLmZvbGRlcnM7XG5cdFx0bGV0IHJlc291cmNlO1xuXHRcdGlmIChmb2xkZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmVzb3VyY2UgPSBmb2xkZXJzWzBdLnVyaTtcblx0XHR9IGVsc2UgaWYgKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uICYmICFpc1VudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uLCB0aGlzLmVudmlyb25tZW50U2VydmljZSkpIHtcblx0XHRcdHJlc291cmNlID0gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb247XG5cdFx0fVxuXHRcdGNvbnN0IHR1bm5lbExpbmsgPSBVUkkucGFyc2UobGluayk7XG5cdFx0aWYgKHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0cmV0dXJuIGpvaW5QYXRoKHR1bm5lbExpbmssIHJlc291cmNlLnBhdGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gam9pblBhdGgodHVubmVsTGluaywgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUucGF0aCk7XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd01hbmFnZU9wdGlvbnMoKSB7XG5cdFx0Y29uc3QgYWNjb3VudCA9IGF3YWl0IHRoaXMucmVtb3RlVHVubmVsU2VydmljZS5nZXRNb2RlKCk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pO1xuXHRcdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ21hbmFnZS5wbGFjZWhvbGRlcicsICdTZWxlY3QgYSBjb21tYW5kIHRvIGludm9rZScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljayk7XG5cdFx0XHRjb25zdCBpdGVtczogQXJyYXk8UXVpY2tQaWNrSXRlbT4gPSBbXTtcblx0XHRcdGl0ZW1zLnB1c2goeyBpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5sZWFybk1vcmUsIGxhYmVsOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLmxlYXJuTW9yZSB9KTtcblx0XHRcdGlmICh0aGlzLmNvbm5lY3Rpb25JbmZvKSB7XG5cdFx0XHRcdHF1aWNrUGljay50aXRsZSA9XG5cdFx0XHRcdFx0dGhpcy5jb25uZWN0aW9uSW5mby5pc0F0dGFjaGVkID9cblx0XHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnbWFuYWdlLnRpdGxlLmF0dGFjaGVkJywgY29tbWVudDogWyd7MH0gaXMgdGhlIHR1bm5lbCBuYW1lJ10gfSwgJ1JlbW90ZSBUdW5uZWwgQWNjZXNzIGVuYWJsZWQgZm9yIHswfSAobGF1bmNoZWQgZXh0ZXJuYWxseSknLCB0aGlzLmNvbm5lY3Rpb25JbmZvLnR1bm5lbE5hbWUpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnbWFuYWdlLnRpdGxlLm9ydW5uaW5nJywgY29tbWVudDogWyd7MH0gaXMgdGhlIHR1bm5lbCBuYW1lJ10gfSwgJ1JlbW90ZSBUdW5uZWwgQWNjZXNzIGVuYWJsZWQgZm9yIHswfScsIHRoaXMuY29ubmVjdGlvbkluZm8udHVubmVsTmFtZSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuY29ubmVjdGlvbkluZm8ubGluayAmJiB0aGlzLmNvbm5lY3Rpb25JbmZvLmRvbWFpbikge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goeyBpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5jb3B5VG9DbGlwYm9hcmQsIGxhYmVsOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLmNvcHlUb0NsaXBib2FyZCwgZGVzY3JpcHRpb246IHRoaXMuY29ubmVjdGlvbkluZm8uZG9tYWluIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSgnbWFuYWdlLnRpdGxlLm9mZicsICdSZW1vdGUgVHVubmVsIEFjY2VzcyBub3QgZW5hYmxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0aXRlbXMucHVzaCh7IGlkOiBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnNob3dMb2csIGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlLnNob3dMb2cnLCAnU2hvdyBMb2cnKSB9KTtcblx0XHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdGl0ZW1zLnB1c2goeyBpZDogUmVtb3RlVHVubmVsQ29tbWFuZElkcy5jb25maWd1cmUsIGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlLnR1bm5lbE5hbWUnLCAnQ2hhbmdlIFR1bm5lbCBOYW1lJyksIGRlc2NyaXB0aW9uOiB0aGlzLmNvbm5lY3Rpb25JbmZvPy50dW5uZWxOYW1lIH0pO1xuXHRcdFx0aXRlbXMucHVzaCh7IGlkOiBSZW1vdGVUdW5uZWxDb21tYW5kSWRzLnR1cm5PZmYsIGxhYmVsOiBSZW1vdGVUdW5uZWxDb21tYW5kTGFiZWxzLnR1cm5PZmYsIGRlc2NyaXB0aW9uOiBhY2NvdW50LmFjdGl2ZSA/IGAke2FjY291bnQuc2Vzc2lvbi5hY2NvdW50TGFiZWx9ICgke2FjY291bnQuc2Vzc2lvbi5wcm92aWRlcklkfSlgIDogdW5kZWZpbmVkIH0pO1xuXG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRpZiAocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0gJiYgcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uaWQpIHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGMoKTtcblx0XHRcdH0pKTtcblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuXG5jb25zdCB3b3JrYmVuY2hSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFJlbW90ZVR1bm5lbFdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdFtDT05GSUdVUkFUSU9OX0tFWV9IT1NUX05BTUVdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZVR1bm5lbEFjY2Vzcy5tYWNoaW5lTmFtZScsIFwiVGhlIG5hbWUgdW5kZXIgd2hpY2ggdGhlIHJlbW90ZSB0dW5uZWwgYWNjZXNzIGlzIHJlZ2lzdGVyZWQuIElmIG5vdCBzZXQsIHRoZSBob3N0IG5hbWUgaXMgdXNlZC5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRpZ25vcmVTeW5jOiB0cnVlLFxuXHRcdFx0cGF0dGVybjogJ14oXFxcXHdbXFxcXHctXSopPyQnLFxuXHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbG9jYWxpemUoJ3JlbW90ZVR1bm5lbEFjY2Vzcy5tYWNoaW5lTmFtZVJlZ2V4JywgXCJUaGUgbmFtZSBtdXN0IG9ubHkgY29uc2lzdCBvZiBsZXR0ZXJzLCBudW1iZXJzLCB1bmRlcnNjb3JlIGFuZCBkYXNoLiBJdCBtdXN0IG5vdCBzdGFydCB3aXRoIGEgZGFzaC5cIiksXG5cdFx0XHRtYXhMZW5ndGg6IDIwLFxuXHRcdFx0ZGVmYXVsdDogJydcblx0XHR9LFxuXHRcdFtDT05GSUdVUkFUSU9OX0tFWV9QUkVWRU5UX1NMRUVQXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVUdW5uZWxBY2Nlc3MucHJldmVudFNsZWVwJywgXCJQcmV2ZW50IHRoaXMgY29tcHV0ZXIgZnJvbSBzbGVlcGluZyB3aGVuIHJlbW90ZSB0dW5uZWwgYWNjZXNzIGlzIHR1cm5lZCBvbi5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLFVBQVUsZ0JBQWdCO0FBQzdDLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGNBQWMseUJBQXlCLDBCQUFrRDtBQUNsRyxTQUFTLGdCQUE2QixvQkFBb0IscUJBQXFCO0FBQy9FLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUNBQWlDO0FBRTFDLFNBQWtCLHNCQUFzQjtBQUN4QyxTQUFTLHNCQUFzQixzQkFBc0IsZ0JBQWdCO0FBQ3JFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW9CLGtCQUFpQyx3QkFBd0I7QUFDN0UsU0FBUywwQkFBOEU7QUFDdkYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkIsMEJBQTBCLGlDQUFpRCxzQkFBc0Isc0JBQTRDLGFBQWEsY0FBNEI7QUFDNU4sU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUywwQkFBMEIsMkJBQTJCO0FB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
