import { localize, localize2 } from "../../../../../nls.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { Action } from "../../../../../base/common/actions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { isCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { EndOfLinePreference } from "../../../../../editor/common/model.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { SnippetController2 } from "../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { ITunnelHostService } from "../../../../../workbench/contrib/chat/common/tunnelHost.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IRemoteAgentHostService, parseRemoteAgentHostInput, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostInputValidationError, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { ISSHRemoteAgentHostService, isSSHHostKeyDeniedError, SSHAuthMethod } from "../../../../../platform/agentHost/common/sshRemoteAgentHost.js";
import { isTunnelHosted, ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX } from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { IWSLRemoteAgentHostService, WSL_INSTALL_DOCS_URL } from "../../../../../platform/agentHost/common/wslRemoteAgentHost.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { SessionsCategories } from "../../../../common/categories.js";
import { categorizeSSHConnectError, logSSHConnectAttempt } from "../../../../common/sessionsTelemetry.js";
import { SessionWorkspacePickerGroupContext } from "../../../../common/contextkeys.js";
import { Menus } from "../../../../browser/menus.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { isAgentHostProvider } from "../../../../common/agentHostSessionsProvider.js";
import { runServerUpgrade } from "./remoteHostOptions.js";
import { SESSION_WORKSPACE_GROUP_REMOTE } from "../../../../services/sessions/common/session.js";
import { ISessionsPartService } from "../../../../services/sessions/browser/sessionsPartService.js";
const RemoteAgentHostCommandIds = {
  addRemoteAgentHost: "sessions.remoteAgentHost.add",
  connectViaSSH: "workbench.action.sessions.connectViaSSH",
  addNewSSHHost: "workbench.action.sessions.addNewSSHHost",
  configureSSHHosts: "workbench.action.sessions.configureSSHHosts",
  connectViaTunnel: "workbench.action.sessions.connectViaTunnel",
  connectViaWSL: "workbench.action.sessions.connectViaWSL",
  manageRemoteAgentHosts: "workbench.action.sessions.manageRemoteAgentHosts",
  updateRemoteAgentHost: "workbench.action.sessions.updateRemoteAgentHost"
};
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.addRemoteAgentHost,
      title: localize2("addRemoteAgentHost", "Add Remote Agent Host..."),
      category: SessionsCategories.Sessions,
      f1: true,
      precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)
    });
  }
  async run(accessor) {
    const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
    const quickInputService = accessor.get(IQuickInputService);
    const notificationService = accessor.get(INotificationService);
    const address = await quickInputService.input({
      title: localize("addRemoteTitle", "Add Remote Agent Host"),
      prompt: localize("addRemotePrompt", "Paste a host, host:port, or WebSocket URL. Example: {0}", "ws://127.0.0.1:8089"),
      placeHolder: "ws://127.0.0.1:8080?tkn=abc-123",
      ignoreFocusLost: true,
      validateInput: async (value) => {
        const result = parseRemoteAgentHostInput(value);
        if (result.error === RemoteAgentHostInputValidationError.Empty) {
          return localize("addRemoteValidationEmpty", "Enter a remote agent host address.");
        }
        if (result.error === RemoteAgentHostInputValidationError.Invalid) {
          return localize("addRemoteValidationInvalid", "Enter a valid host, host:port, or WebSocket URL.");
        }
        return void 0;
      }
    });
    if (!address) {
      return;
    }
    const parsed = parseRemoteAgentHostInput(address);
    if (!parsed.parsed) {
      return;
    }
    const defaultName = parsed.parsed.suggestedName;
    const name = await quickInputService.input({
      title: localize("nameRemoteTitle", "Name Remote Agent Host"),
      prompt: localize("nameRemotePrompt", "Enter a display name for this remote agent host."),
      placeHolder: localize("nameRemotePlaceholder", "My Remote"),
      value: defaultName,
      valueSelection: [0, defaultName.length],
      ignoreFocusLost: true,
      validateInput: async (value) => value.trim() ? void 0 : localize("nameRemoteValidationEmpty", "Enter a name for this remote agent host.")
    });
    if (!name?.trim()) {
      return;
    }
    try {
      await remoteAgentHostService.addRemoteAgentHost({
        name: name.trim(),
        connectionToken: parsed.parsed.connectionToken,
        connection: {
          type: RemoteAgentHostEntryType.WebSocket,
          address: parsed.parsed.address
        }
      });
    } catch {
      notificationService.error(localize("addRemoteFailed", "Failed to connect to remote agent host {0}.", parsed.parsed.address));
    }
  }
});
function parseSSHHostInput(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return void 0;
  }
  const atIdx = trimmed.indexOf("@");
  if (atIdx === 0 || atIdx === trimmed.length - 1) {
    return void 0;
  }
  let username;
  let hostPart;
  if (atIdx !== -1) {
    username = trimmed.substring(0, atIdx);
    hostPart = trimmed.substring(atIdx + 1);
  } else {
    hostPart = trimmed;
  }
  if (!hostPart) {
    return void 0;
  }
  let host;
  let port;
  const colonIdx = hostPart.lastIndexOf(":");
  if (colonIdx !== -1) {
    host = hostPart.substring(0, colonIdx);
    const portStr = hostPart.substring(colonIdx + 1);
    if (!host) {
      return void 0;
    }
    if (portStr) {
      const portNum = Number(portStr);
      if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
        return void 0;
      }
      port = portNum;
    }
  } else {
    host = hostPart;
  }
  if (!host) {
    return void 0;
  }
  return { host, username, port };
}
function validateSSHHostInput(value) {
  const v = value.trim();
  if (!v) {
    return localize("sshHostEmpty", "Enter an SSH host.");
  }
  const atIdx = v.indexOf("@");
  if (atIdx === 0) {
    return localize("sshUsernameMissingInHost", "Enter a username before '@'.");
  }
  if (atIdx === v.length - 1) {
    return localize("sshHostMissingAfterAt", "Enter a host name after '@'.");
  }
  const hostPart = atIdx !== -1 ? v.substring(atIdx + 1) : v;
  if (!hostPart) {
    return localize("sshHostMissingAfterAt", "Enter a host name after '@'.");
  }
  const colonIdx = hostPart.lastIndexOf(":");
  if (colonIdx !== -1) {
    const hostName = hostPart.substring(0, colonIdx);
    const portStr = hostPart.substring(colonIdx + 1);
    if (!hostName) {
      return localize("sshHostMissingAfterAt", "Enter a host name after '@'.");
    }
    if (portStr) {
      const portNum = Number(portStr);
      if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
        return localize("sshHostInvalidPort", "Enter a valid port number.");
      }
    }
  }
  return void 0;
}
async function promptToConnectViaSSH(accessor, options = {}) {
  const sshService = accessor.get(ISSHRemoteAgentHostService);
  const quickInputService = accessor.get(IQuickInputService);
  const notificationService = accessor.get(INotificationService);
  const instantiationService = accessor.get(IInstantiationService);
  const commandService = accessor.get(ICommandService);
  const configHosts = await sshService.listSSHConfigHosts().catch(() => []);
  const aliasItems = configHosts.map((h) => ({
    kind: "alias",
    hostAlias: h,
    label: h
  }));
  const addHostItem = {
    kind: "add-config",
    label: "$(plus) " + localize("sshAddNewHost", "Add New SSH Host..."),
    alwaysShow: true
  };
  const configureHostsItem = {
    kind: "configure",
    label: localize("sshConfigureHosts", "Configure SSH Hosts..."),
    alwaysShow: true
  };
  const newHostItem = {
    kind: "new-host",
    hostInput: "",
    label: "",
    alwaysShow: true
  };
  const result = await new Promise((resolve) => {
    const store = new DisposableStore();
    const picker = store.add(quickInputService.createQuickPick());
    picker.title = localize("sshHostTitle", "Connect via SSH");
    picker.placeholder = localize("sshHostPickerPlaceholder", "Select configured SSH host or enter user@host");
    picker.ignoreFocusOut = true;
    picker.matchOnDescription = true;
    if (options.showBackButton) {
      picker.buttons = [quickInputService.backButton];
    }
    let newHostVisible = false;
    const updateItems = () => {
      const items = [...aliasItems];
      if (newHostVisible) {
        items.push(newHostItem);
      }
      items.push(addHostItem);
      items.push(configureHostsItem);
      picker.items = items;
    };
    updateItems();
    store.add(picker.onDidChangeValue((value) => {
      const parsed2 = parseSSHHostInput(value);
      if (parsed2) {
        newHostItem.hostInput = value.trim();
        newHostItem.label = `\u27A4 ${value.trim()}`;
        if (!newHostVisible) {
          newHostVisible = true;
          updateItems();
        } else {
          picker.items = picker.items;
        }
      } else if (newHostVisible) {
        newHostVisible = false;
        updateItems();
      }
    }));
    store.add(picker.onDidTriggerButton((button) => {
      if (button === quickInputService.backButton) {
        resolve("back");
        picker.hide();
      }
    }));
    store.add(picker.onDidAccept(() => {
      const selected = picker.selectedItems[0];
      resolve(selected);
      picker.hide();
    }));
    store.add(picker.onDidHide(() => {
      resolve(void 0);
      store.dispose();
    }));
    picker.show();
  });
  if (result === "back") {
    return "back";
  }
  if (!result) {
    return;
  }
  if (result.kind === "add-config" || result.kind === "configure") {
    const cmdId = result.kind === "add-config" ? RemoteAgentHostCommandIds.addNewSSHHost : RemoteAgentHostCommandIds.configureSSHHosts;
    const onBackToSSH = () => instantiationService.invokeFunction((a) => promptToConnectViaSSH(a, options));
    await commandService.executeCommand(cmdId, onBackToSSH);
    return;
  }
  if (result.kind === "alias") {
    await instantiationService.invokeFunction(
      (accessor2) => connectToConfiguredSSHHost(accessor2, result.hostAlias)
    );
    return;
  }
  const newHost = result;
  const parsed = parseSSHHostInput(newHost.hostInput);
  if (!parsed) {
    notificationService.error(validateSSHHostInput(newHost.hostInput) ?? localize("sshHostInvalid", "Invalid SSH host."));
    return;
  }
  await instantiationService.invokeFunction(
    (accessor2) => promptForCredentialsAndConnect(accessor2, parsed.host, parsed.username, parsed.port)
  );
}
async function connectToConfiguredSSHHost(accessor, hostAlias) {
  const sshService = accessor.get(ISSHRemoteAgentHostService);
  const notificationService = accessor.get(INotificationService);
  const instantiationService = accessor.get(IInstantiationService);
  let resolvedConfig;
  try {
    resolvedConfig = await sshService.resolveSSHConfig(hostAlias);
  } catch (err) {
    notificationService.error(localize("sshResolveConfigFailed", "Failed to resolve SSH config for {0}: {1}", hostAlias, String(err)));
    return;
  }
  const host = resolvedConfig.hostname;
  const username = resolvedConfig.user;
  const port = resolvedConfig.port !== 22 ? resolvedConfig.port : void 0;
  const suggestedName = hostAlias;
  const defaultKeyPath = resolvedConfig.identityFile[0];
  if (username) {
    const config = {
      host,
      port,
      username,
      authMethod: SSHAuthMethod.Agent,
      privateKeyPath: defaultKeyPath,
      identityAgent: resolvedConfig.identityAgent,
      agentForward: resolvedConfig.forwardAgent || void 0,
      name: suggestedName,
      sshConfigHost: hostAlias
    };
    const connection = await instantiationService.invokeFunction(
      (accessor2) => connectWithProgress(accessor2, config, suggestedName)
    );
    if (connection) {
      await instantiationService.invokeFunction((accessor2) => promptForRemoteFolder(accessor2, connection));
    }
    return;
  }
  await instantiationService.invokeFunction(
    (accessor2) => promptForCredentialsAndConnect(accessor2, host, void 0, port, suggestedName, defaultKeyPath, resolvedConfig.identityAgent)
  );
}
async function promptForCredentialsAndConnect(accessor, host, username, port, suggestedName, defaultKeyPath, identityAgent) {
  const quickInputService = accessor.get(IQuickInputService);
  const instantiationService = accessor.get(IInstantiationService);
  if (!username) {
    const usernameInput = await quickInputService.input({
      title: localize("sshUsernameTitle", "SSH Username"),
      prompt: localize("sshUsernamePrompt", "Enter the username for {0}.", host),
      placeHolder: "root",
      ignoreFocusLost: true,
      validateInput: async (value) => value.trim() ? void 0 : localize("sshUsernameEmpty", "Enter a username.")
    });
    if (!usernameInput) {
      return;
    }
    username = usernameInput.trim();
  }
  const authPicks = [
    {
      method: SSHAuthMethod.Agent,
      label: localize("sshAuthAgent", "SSH Agent"),
      description: localize("sshAuthAgentDesc", "Use the running SSH agent for authentication")
    },
    {
      method: SSHAuthMethod.KeyFile,
      label: localize("sshAuthKey", "Private Key File"),
      description: localize("sshAuthKeyDesc", "Authenticate with a private key file")
    },
    {
      method: SSHAuthMethod.Password,
      label: localize("sshAuthPassword", "Password"),
      description: localize("sshAuthPasswordDesc", "Authenticate with a password")
    }
  ];
  const authPicked = await quickInputService.pick(authPicks, {
    title: localize("sshAuthTitle", "Authentication Method"),
    placeHolder: localize("sshAuthPlaceholder", "Choose how to authenticate with {0}", host)
  });
  if (!authPicked) {
    return;
  }
  const authMethod = authPicked.method;
  let privateKeyPath;
  let password;
  if (authMethod === SSHAuthMethod.KeyFile) {
    const keyPath = await quickInputService.input({
      title: localize("sshKeyTitle", "Private Key Path"),
      prompt: localize("sshKeyPrompt", "Enter the path to your SSH private key."),
      placeHolder: "~/.ssh/id_rsa",
      value: defaultKeyPath ?? "~/.ssh/id_rsa",
      ignoreFocusLost: true,
      validateInput: async (value) => value.trim() ? void 0 : localize("sshKeyEmpty", "Enter a key file path.")
    });
    if (!keyPath) {
      return;
    }
    privateKeyPath = keyPath.trim();
  } else if (authMethod === SSHAuthMethod.Password) {
    const pw = await quickInputService.input({
      title: localize("sshPasswordTitle", "SSH Password"),
      prompt: localize("sshPasswordPrompt", "Enter the password for {0}@{1}.", username, host),
      password: true,
      ignoreFocusLost: true,
      validateInput: async (value) => value ? void 0 : localize("sshPasswordEmpty", "Enter a password.")
    });
    if (!pw) {
      return;
    }
    password = pw;
  }
  const defaultName = suggestedName ?? `${username}@${host}`;
  const name = await quickInputService.input({
    title: localize("sshNameTitle", "Name Remote"),
    prompt: localize("sshNamePrompt", "Enter a display name for this SSH remote."),
    placeHolder: localize("sshNamePlaceholder", "My Remote"),
    value: defaultName,
    valueSelection: [0, defaultName.length],
    ignoreFocusLost: true,
    validateInput: async (value) => value.trim() ? void 0 : localize("sshNameEmpty", "Enter a name.")
  });
  if (!name) {
    return;
  }
  const config = {
    host,
    port,
    username,
    authMethod,
    privateKeyPath,
    identityAgent,
    password,
    name: name.trim()
  };
  const connection = await instantiationService.invokeFunction(
    (accessor2) => connectWithProgress(accessor2, config, host)
  );
  if (connection) {
    await instantiationService.invokeFunction((accessor2) => promptForRemoteFolder(accessor2, connection));
  }
}
async function connectWithProgress(accessor, config, displayHost) {
  const sshService = accessor.get(ISSHRemoteAgentHostService);
  const notificationService = accessor.get(INotificationService);
  const telemetryService = accessor.get(ITelemetryService);
  const stopwatch = StopWatch.create(false);
  const handle = notificationService.notify({
    severity: Severity.Info,
    message: localize("sshConnecting", "Connecting to {0} via SSH...", displayHost),
    progress: { infinite: true }
  });
  const expectedKey = config.sshConfigHost ? `ssh:${config.sshConfigHost}` : `${config.username}@${config.host}:${config.port ?? 22}`;
  const progressListener = sshService.onDidReportConnectProgress?.((progress) => {
    if (progress.connectionKey === expectedKey) {
      handle.updateMessage(progress.message);
    }
  });
  try {
    const connection = await sshService.connect(config);
    logSSHConnectAttempt(telemetryService, {
      operation: "connect",
      userInitiated: config.userInitiated ?? true,
      attempt: 1,
      durationMs: stopwatch.elapsed(),
      success: true,
      willRetry: false
    });
    handle.close();
    return connection;
  } catch (err) {
    logSSHConnectAttempt(telemetryService, {
      operation: "connect",
      userInitiated: config.userInitiated ?? true,
      attempt: 1,
      durationMs: stopwatch.elapsed(),
      success: false,
      willRetry: false,
      errorCategory: categorizeSSHConnectError(err)
    });
    handle.close();
    if (isCancellationError(err) || isSSHHostKeyDeniedError(err)) {
      return void 0;
    }
    notificationService.error(localize("sshConnectFailed", "Failed to connect via SSH to {0}: {1}", displayHost, String(err)));
    return void 0;
  } finally {
    progressListener?.dispose();
  }
}
async function promptForRemoteFolder(accessor, connection) {
  const sessionsProvidersService = accessor.get(ISessionsProvidersService);
  const sessionsService = accessor.get(ISessionsService);
  const sessionsPartService = accessor.get(ISessionsPartService);
  const provider = sessionsProvidersService.getProviders().find((p) => isAgentHostProvider(p) && p.remoteAddress === connection.localAddress);
  if (!provider) {
    return;
  }
  const browseAction = provider.browseActions[0];
  if (!browseAction) {
    return;
  }
  const workspace = await browseAction.run();
  if (!workspace) {
    return;
  }
  const folderUri = workspace.folders[0]?.root;
  if (!folderUri) {
    return;
  }
  sessionsService.openNewSession();
  sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId)?.selectWorkspace(folderUri);
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.connectViaSSH,
      title: localize2("connectViaSSH", "Connect to Remote Agent Host via SSH"),
      shortTitle: localize2("connectViaSSHShort", "SSH..."),
      category: SessionsCategories.Sessions,
      f1: true,
      icon: Codicon.remote,
      precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
      menu: {
        id: Menus.SessionWorkspaceManage,
        order: 20,
        when: SessionWorkspacePickerGroupContext.isEqualTo(SESSION_WORKSPACE_GROUP_REMOTE)
      }
    });
  }
  async run(accessor, onBack) {
    const result = await promptToConnectViaSSH(accessor, { showBackButton: !!onBack });
    if (result === "back") {
      onBack?.();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.addNewSSHHost,
      title: localize2("addNewSSHHost", "Add New SSH Host..."),
      category: SessionsCategories.Sessions,
      f1: true,
      precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)
    });
  }
  async run(accessor) {
    const sshService = accessor.get(ISSHRemoteAgentHostService);
    const editorService = accessor.get(IEditorService);
    const fileService = accessor.get(IFileService);
    const notificationService = accessor.get(INotificationService);
    let configUri;
    try {
      configUri = await sshService.ensureUserSSHConfig();
    } catch (err) {
      notificationService.error(localize("sshConfigCreateFailed", "Failed to create SSH config file: {0}", String(err)));
      return;
    }
    const editorPane = await editorService.openEditor({ resource: configUri, options: { pinned: true } });
    if (!editorPane) {
      return;
    }
    const control = editorPane.getControl();
    if (!isCodeEditor(control) || !control.hasModel()) {
      return;
    }
    const editor = control;
    const model = editor.getModel();
    if (!model) {
      return;
    }
    let appendNewline = false;
    try {
      const stat = await fileService.stat(configUri);
      if (stat.size > 0) {
        const content = model.getValueInRange(model.getFullModelRange(), EndOfLinePreference.LF);
        appendNewline = content.length > 0 && !content.endsWith("\n");
      }
    } catch {
    }
    const lastLine = model.getLineCount();
    const lastCol = model.getLineMaxColumn(lastLine);
    editor.setSelection(new Range(lastLine, lastCol, lastLine, lastCol));
    const snippet = (appendNewline ? "\n" : "") + "Host ${1:alias}\n    HostName ${2:hostname}\n    User ${3:user}\n";
    SnippetController2.get(editor)?.insert(snippet);
    editor.focus();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.configureSSHHosts,
      title: localize2("configureSSHHosts", "Configure SSH Hosts..."),
      category: SessionsCategories.Sessions,
      f1: true,
      precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)
    });
  }
  async run(accessor, onBack) {
    const sshService = accessor.get(ISSHRemoteAgentHostService);
    const editorService = accessor.get(IEditorService);
    const quickInputService = accessor.get(IQuickInputService);
    const notificationService = accessor.get(INotificationService);
    let configFiles;
    try {
      configFiles = await sshService.listSSHConfigFiles();
    } catch (err) {
      notificationService.error(localize("sshConfigListFailed", "Failed to list SSH config files: {0}", String(err)));
      return;
    }
    if (configFiles.length === 0) {
      try {
        const uri = await sshService.ensureUserSSHConfig();
        await editorService.openEditor({ resource: uri, options: { pinned: true } });
      } catch (err) {
        notificationService.error(localize("sshConfigOpenFailed", "Failed to open SSH config file: {0}", String(err)));
      }
      return;
    }
    const userConfigUri = configFiles[0];
    const items = configFiles.map((uri, index) => ({
      label: uri.fsPath,
      uri,
      isUserConfig: index === 0
    }));
    if (items.length === 1 && !onBack) {
      const picked2 = items[0];
      try {
        const uri = picked2.isUserConfig ? await sshService.ensureUserSSHConfig().catch(() => userConfigUri) : picked2.uri;
        await editorService.openEditor({ resource: uri, options: { pinned: true } });
      } catch (err) {
        notificationService.error(localize("sshConfigOpenFailed", "Failed to open SSH config file: {0}", String(err)));
      }
      return;
    }
    const picked = await new Promise((resolve) => {
      const store = new DisposableStore();
      const picker = store.add(quickInputService.createQuickPick());
      picker.title = localize("sshConfigPickTitle", "Select SSH configuration file to edit");
      picker.placeholder = localize("sshConfigPickPlaceholder", "Select an SSH configuration file");
      picker.items = items;
      if (onBack) {
        picker.buttons = [quickInputService.backButton];
      }
      store.add(picker.onDidTriggerButton((button) => {
        if (button === quickInputService.backButton) {
          resolve("back");
          picker.hide();
        }
      }));
      store.add(picker.onDidAccept(() => {
        resolve(picker.selectedItems[0]);
        picker.hide();
      }));
      store.add(picker.onDidHide(() => {
        resolve(void 0);
        store.dispose();
      }));
      picker.show();
    });
    if (picked === "back") {
      onBack?.();
      return;
    }
    if (!picked) {
      return;
    }
    try {
      const uri = picked.isUserConfig ? await sshService.ensureUserSSHConfig().catch(() => userConfigUri) : picked.uri;
      await editorService.openEditor({ resource: uri, options: { pinned: true } });
    } catch (err) {
      notificationService.error(localize("sshConfigOpenFailed", "Failed to open SSH config file: {0}", String(err)));
    }
  }
});
async function promptToConnectViaTunnel(accessor, options = {}) {
  const tunnelService = accessor.get(ITunnelAgentHostService);
  const quickInputService = accessor.get(IQuickInputService);
  const notificationService = accessor.get(INotificationService);
  const authenticationService = accessor.get(IAuthenticationService);
  const instantiationService = accessor.get(IInstantiationService);
  const productService = accessor.get(IProductService);
  const dialogService = accessor.get(IDialogService);
  const tunnelHostService = isWeb ? void 0 : accessor.get(ITunnelHostService);
  const authProvider = "github";
  const scopes = productService.tunnelApplicationConfig?.authenticationProviders?.[authProvider]?.scopes ?? [];
  try {
    if (!(await authenticationService.getSessions(authProvider, scopes)).length) {
      await authenticationService.createSession(authProvider, scopes, { activateImmediate: true });
    }
  } catch {
    notificationService.error(localize("tunnelAuthFailed", "Authentication failed. Please try again."));
    return;
  }
  const store = new DisposableStore();
  const tunnelPicker = store.add(quickInputService.createQuickPick());
  tunnelPicker.title = localize("tunnelPickTitle", "Connect via Dev Tunnel");
  tunnelPicker.placeholder = localize("tunnelPickPlaceholder", "Select a dev tunnel to connect to");
  tunnelPicker.busy = true;
  if (options.showBackButton) {
    tunnelPicker.buttons = [quickInputService.backButton];
  }
  tunnelPicker.show();
  let tunnels;
  try {
    tunnels = await tunnelService.listTunnels();
  } catch (err) {
    store.dispose();
    notificationService.error(localize("tunnelListFailed", "Failed to list dev tunnels: {0}", err instanceof Error ? err.message : String(err)));
    return;
  }
  if (tunnels.length === 0) {
    store.dispose();
    notificationService.info(localize("tunnelNoneFound", "No dev tunnels with agent host support were found. Start a tunnel with 'code tunnel' on another machine."));
    return;
  }
  const deleteTunnelButton = {
    iconClass: ThemeIcon.asClassName(Codicon.trash),
    tooltip: localize("tunnelDeleteTooltip", "Delete Dev Tunnel")
  };
  const isHostedTunnel = (tunnel) => isTunnelHosted(tunnelHostService?.sharingInfo, tunnel);
  const toTunnelPickItems = (tunnelInfos) => tunnelInfos.filter((tunnel) => !isHostedTunnel(tunnel)).map((tunnel) => ({
    label: tunnel.name,
    description: tunnel.hostConnectionCount > 0 ? localize("tunnelPickOnline", "{0} \xB7 Online", tunnel.tunnelId) : localize("tunnelPickOffline", "{0} \xB7 Offline", tunnel.tunnelId),
    buttons: tunnelService.canDeleteTunnels ? [deleteTunnelButton] : void 0,
    tunnel
  }));
  const updateTunnelPickerItems = () => {
    tunnelPicker.items = toTunnelPickItems(tunnels);
  };
  if (toTunnelPickItems(tunnels).length === 0) {
    store.dispose();
    notificationService.info(localize("tunnelOnlyLocalFound", "This machine is already hosting the only available dev tunnel."));
    return;
  }
  updateTunnelPickerItems();
  if (tunnelHostService) {
    store.add(tunnelHostService.onDidChangeStatus(updateTunnelPickerItems));
  }
  tunnelPicker.busy = false;
  const picked = await new Promise((resolve) => {
    let isDeleting = false;
    store.add(tunnelPicker.onDidTriggerButton((button) => {
      if (button === quickInputService.backButton) {
        resolve("back");
        tunnelPicker.hide();
      }
    }));
    store.add(tunnelPicker.onDidAccept(() => {
      if (isDeleting) {
        return;
      }
      const picked2 = tunnelPicker.selectedItems[0];
      if (picked2 && isHostedTunnel(picked2.tunnel)) {
        updateTunnelPickerItems();
        return;
      }
      resolve(picked2);
      tunnelPicker.hide();
    }));
    store.add(tunnelPicker.onDidTriggerItemButton(async (event) => {
      if (event.button !== deleteTunnelButton || isDeleting) {
        return;
      }
      const previousIgnoreFocusOut = tunnelPicker.ignoreFocusOut;
      isDeleting = true;
      tunnelPicker.ignoreFocusOut = true;
      let keepOpen = true;
      try {
        const confirmation = await dialogService.confirm({
          type: "warning",
          message: localize("tunnelDeleteConfirmation", "Are you sure you want to delete dev tunnel '{0}'?", event.item.tunnel.name),
          detail: localize("tunnelDeleteDetail", "The tunnel may be recreated if a machine starts hosting it again."),
          primaryButton: localize("tunnelDeleteButton", "&&Delete")
        });
        if (!confirmation.confirmed) {
          return;
        }
        tunnelPicker.busy = true;
        await tunnelService.deleteTunnel(event.item.tunnel);
        tunnels = await tunnelService.listTunnels();
        if (toTunnelPickItems(tunnels).length === 0) {
          keepOpen = false;
          notificationService.info(localize("tunnelNoneFoundAfterDelete", "No dev tunnels with agent host support were found. Start a tunnel with 'code tunnel' on another machine."));
          return;
        }
        updateTunnelPickerItems();
      } catch (err) {
        notificationService.error(localize("tunnelDeleteFailed", "Failed to delete dev tunnel '{0}': {1}", event.item.tunnel.name, err instanceof Error ? err.message : String(err)));
      } finally {
        tunnelPicker.busy = false;
        tunnelPicker.ignoreFocusOut = previousIgnoreFocusOut;
        isDeleting = false;
        if (keepOpen) {
          tunnelPicker.show();
        } else {
          resolve(void 0);
          tunnelPicker.hide();
          store.dispose();
        }
      }
    }));
    store.add(tunnelPicker.onDidHide(() => {
      if (isDeleting) {
        return;
      }
      resolve(void 0);
      store.dispose();
    }));
  });
  if (picked === "back") {
    return "back";
  }
  if (!picked) {
    return;
  }
  const handle = notificationService.notify({
    severity: Severity.Info,
    message: localize("tunnelConnecting", "Connecting to tunnel '{0}'...", picked.tunnel.name),
    progress: { infinite: true }
  });
  try {
    await tunnelService.connect(picked.tunnel, authProvider);
    handle.close();
  } catch (err) {
    handle.close();
    notificationService.error(localize("tunnelConnectFailed", "Failed to connect to tunnel '{0}': {1}", picked.tunnel.name, err instanceof Error ? err.message : String(err)));
    return;
  }
  await instantiationService.invokeFunction((accessor2) => promptForTunnelFolder(accessor2, picked.tunnel));
}
async function promptForTunnelFolder(accessor, tunnel) {
  const sessionsProvidersService = accessor.get(ISessionsProvidersService);
  const sessionsService = accessor.get(ISessionsService);
  const sessionsPartService = accessor.get(ISessionsPartService);
  const tunnelAddress = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
  const provider = sessionsProvidersService.getProviders().find((p) => isAgentHostProvider(p) && p.remoteAddress === tunnelAddress);
  if (!provider) {
    return;
  }
  const browseAction = provider.browseActions[0];
  if (!browseAction) {
    return;
  }
  const workspace = await browseAction.run();
  if (!workspace) {
    return;
  }
  const folderUri = workspace.folders[0]?.root;
  if (!folderUri) {
    return;
  }
  sessionsService.openNewSession();
  sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId)?.selectWorkspace(folderUri, provider.id);
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.connectViaTunnel,
      title: localize2("connectViaTunnel", "Connect to Remote Agent Host via Dev Tunnel"),
      shortTitle: localize2("connectViaTunnelShort", "Tunnels..."),
      category: SessionsCategories.Sessions,
      f1: true,
      icon: Codicon.cloud,
      precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
      menu: {
        id: Menus.SessionWorkspaceManage,
        order: 10,
        when: SessionWorkspacePickerGroupContext.isEqualTo(SESSION_WORKSPACE_GROUP_REMOTE)
      }
    });
  }
  async run(accessor, onBack) {
    const result = await promptToConnectViaTunnel(accessor, { showBackButton: !!onBack });
    if (result === "back") {
      onBack?.();
    }
  }
});
async function promptToConnectViaWSL(accessor, options = {}) {
  const wslService = accessor.get(IWSLRemoteAgentHostService);
  const notificationService = accessor.get(INotificationService);
  const quickInputService = accessor.get(IQuickInputService);
  const openerService = accessor.get(IOpenerService);
  const instantiationService = accessor.get(IInstantiationService);
  const logService = accessor.get(ILogService);
  const installAction = new Action(
    "wsl.openDocs",
    localize("wslInstallDocsAction", "Install WSL"),
    void 0,
    true,
    () => openerService.open(URI.parse(WSL_INSTALL_DOCS_URL))
  );
  if (!await wslService.isWSLAvailable()) {
    notificationService.notify({
      severity: Severity.Info,
      message: localize("wslNotInstalled", "Windows Subsystem for Linux is not installed or not enabled."),
      actions: { primary: [installAction] }
    });
    return;
  }
  let distros;
  try {
    distros = await wslService.listDistros();
  } catch (err) {
    logService.error("[WSL] listDistros failed", err);
    notificationService.error(localize("wslListFailed", "Failed to list WSL distributions: {0}", toErrorMessage(err)));
    return;
  }
  if (distros.length === 0) {
    notificationService.notify({
      severity: Severity.Info,
      message: localize("wslNoDistros", "No WSL 2 distributions are installed."),
      actions: { primary: [installAction] }
    });
    return;
  }
  const items = distros.map((d) => ({
    label: d.name,
    description: d.isRunning ? localize("wslDistroRunning", "Running") : localize("wslDistroStopped", "Stopped"),
    detail: d.isDefault ? localize("wslDistroDefault", "Default distribution") : void 0,
    distro: d
  }));
  let picked;
  if (items.length === 1 && !options.showBackButton) {
    picked = items[0];
  } else {
    const result = await new Promise((resolve) => {
      const store = new DisposableStore();
      const picker = store.add(quickInputService.createQuickPick());
      picker.title = localize("wslPickTitle", "Connect via WSL");
      picker.placeholder = localize("wslPickPlaceholder", "Select a WSL distribution to connect to");
      picker.items = items;
      if (options.showBackButton) {
        picker.buttons = [quickInputService.backButton];
      }
      store.add(picker.onDidTriggerButton((button) => {
        if (button === quickInputService.backButton) {
          resolve("back");
          picker.hide();
        }
      }));
      store.add(picker.onDidAccept(() => {
        resolve(picker.selectedItems[0]);
        picker.hide();
      }));
      store.add(picker.onDidHide(() => {
        resolve(void 0);
        store.dispose();
      }));
      picker.show();
    });
    if (result === "back") {
      return "back";
    }
    if (!result) {
      return;
    }
    picked = result;
  }
  const handle = notificationService.notify({
    severity: Severity.Info,
    message: localize("wslConnecting", "Connecting to WSL distribution '{0}'...", picked.distro.name),
    progress: { infinite: true }
  });
  const expectedKey = `wsl:${picked.distro.name}`;
  const progressListener = wslService.onDidReportConnectProgress?.((progress) => {
    if (progress.connectionKey === expectedKey) {
      handle.updateMessage(progress.message);
    }
  });
  try {
    await wslService.connect({ distro: picked.distro.name, name: picked.distro.name });
    handle.close();
  } catch (err) {
    handle.close();
    if (isCancellationError(err)) {
      return;
    }
    logService.error(`[WSL] Connect to '${picked.distro.name}' failed`, err);
    notificationService.error(localize("wslConnectFailed", "Failed to connect to WSL distribution '{0}': {1}", picked.distro.name, toErrorMessage(err)));
    return;
  } finally {
    progressListener?.dispose();
  }
  await instantiationService.invokeFunction((accessor2) => promptForWSLFolder(accessor2, picked.distro.name));
}
async function promptForWSLFolder(accessor, distro) {
  const sessionsProvidersService = accessor.get(ISessionsProvidersService);
  const sessionsService = accessor.get(ISessionsService);
  const sessionsPartService = accessor.get(ISessionsPartService);
  const wslAddress = `wsl:${distro}`;
  const provider = sessionsProvidersService.getProviders().find((p) => isAgentHostProvider(p) && p.remoteAddress === wslAddress);
  if (!provider) {
    return;
  }
  const browseAction = provider.browseActions[0];
  if (!browseAction) {
    return;
  }
  const workspace = await browseAction.run();
  if (!workspace) {
    return;
  }
  const folderUri = workspace.folders[0]?.root;
  if (!folderUri) {
    return;
  }
  sessionsService.openNewSession();
  sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId)?.selectWorkspace(folderUri, provider.id);
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.connectViaWSL,
      title: localize2("connectViaWSL", "Connect to Remote Agent Host via WSL"),
      shortTitle: localize2("connectViaWSLShort", "WSL..."),
      category: SessionsCategories.Sessions,
      f1: true,
      icon: Codicon.terminalLinux,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("isWindows", true),
        ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)
      ),
      menu: {
        id: Menus.SessionWorkspaceManage,
        order: 15,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("isWindows", true),
          SessionWorkspacePickerGroupContext.isEqualTo(SESSION_WORKSPACE_GROUP_REMOTE)
        )
      }
    });
  }
  async run(accessor, onBack) {
    const result = await promptToConnectViaWSL(accessor, { showBackButton: !!onBack });
    if (result === "back") {
      onBack?.();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RemoteAgentHostCommandIds.updateRemoteAgentHost,
      title: localize2("updateRemoteAgentHost", "Update Remote Agent Host Server..."),
      category: SessionsCategories.Sessions,
      f1: true,
      precondition: ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true)
    });
  }
  async run(accessor) {
    const sessionsProvidersService = accessor.get(ISessionsProvidersService);
    const quickInputService = accessor.get(IQuickInputService);
    const notificationService = accessor.get(INotificationService);
    const instantiationService = accessor.get(IInstantiationService);
    const remoteHosts = sessionsProvidersService.getProviders().filter(isAgentHostProvider).filter((provider) => !!provider.remoteAddress);
    let incompatibleCount = 0;
    const upgradable = remoteHosts.map((provider) => {
      const status = provider.connectionStatus?.get();
      if (!RemoteAgentHostConnectionStatus.isIncompatible(status)) {
        return void 0;
      }
      incompatibleCount++;
      return status.vscodeUpgradeMethod ? { provider, method: status.vscodeUpgradeMethod } : void 0;
    }).filter((entry) => !!entry);
    if (upgradable.length === 0) {
      notificationService.info(incompatibleCount > 0 ? localize("updateRemoteAgentHost.noneUpgradable", "No remote agent hosts can be updated from here. Incompatible hosts must be updated manually, then reconnected.") : localize("updateRemoteAgentHost.none", "No remote agent hosts need updating."));
      return;
    }
    let target = upgradable[0];
    if (upgradable.length > 1) {
      const picked = await quickInputService.pick(
        upgradable.map((entry) => ({
          label: entry.provider.label,
          description: entry.provider.remoteAddress,
          entry
        })),
        { placeHolder: localize("updateRemoteAgentHost.pick", "Select a remote agent host to update") }
      );
      if (!picked) {
        return;
      }
      target = picked.entry;
    }
    await instantiationService.invokeFunction(runServerUpgrade, target.provider, target.method);
  }
});
export {
  RemoteAgentHostCommandIds,
  parseSSHHostInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXHJlbW90ZUFnZW50SG9zdEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IElUdW5uZWxIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3R1bm5lbEhvc3QuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgcGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLCBSZW1vdGVBZ2VudEhvc3RJbnB1dFZhbGlkYXRpb25FcnJvciwgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIGlzU1NISG9zdEtleURlbmllZEVycm9yLCBTU0hBdXRoTWV0aG9kLCB0eXBlIElTU0hBZ2VudEhvc3RDb25maWcsIHR5cGUgSVNTSEFnZW50SG9zdENvbm5lY3Rpb24sIHR5cGUgSVNTSFJlc29sdmVkQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgaXNUdW5uZWxIb3N0ZWQsIElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlLCBUVU5ORUxfQUREUkVTU19QUkVGSVgsIHR5cGUgSVR1bm5lbEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3R1bm5lbEFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBJV1NMUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgV1NMX0lOU1RBTExfRE9DU19VUkwsIHR5cGUgSVdTTERpc3RybyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vd3NsUmVtb3RlQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFNlc3Npb25zQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IGNhdGVnb3JpemVTU0hDb25uZWN0RXJyb3IsIGxvZ1NTSENvbm5lY3RBdHRlbXB0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25zVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFNlc3Npb25Xb3Jrc3BhY2VQaWNrZXJHcm91cENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIGlzQWdlbnRIb3N0UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBydW5TZXJ2ZXJVcGdyYWRlIH0gZnJvbSAnLi9yZW1vdGVIb3N0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQYXJ0U2VydmljZS5qcyc7XG5cbi8qKiBBY3Rpb24gLyBjb21tYW5kIElEcyByZWdpc3RlcmVkIGJ5IHRoaXMgZmlsZS4gKi9cbmV4cG9ydCBjb25zdCBSZW1vdGVBZ2VudEhvc3RDb21tYW5kSWRzID0ge1xuXHRhZGRSZW1vdGVBZ2VudEhvc3Q6ICdzZXNzaW9ucy5yZW1vdGVBZ2VudEhvc3QuYWRkJyxcblx0Y29ubmVjdFZpYVNTSDogJ3dvcmtiZW5jaC5hY3Rpb24uc2Vzc2lvbnMuY29ubmVjdFZpYVNTSCcsXG5cdGFkZE5ld1NTSEhvc3Q6ICd3b3JrYmVuY2guYWN0aW9uLnNlc3Npb25zLmFkZE5ld1NTSEhvc3QnLFxuXHRjb25maWd1cmVTU0hIb3N0czogJ3dvcmtiZW5jaC5hY3Rpb24uc2Vzc2lvbnMuY29uZmlndXJlU1NISG9zdHMnLFxuXHRjb25uZWN0VmlhVHVubmVsOiAnd29ya2JlbmNoLmFjdGlvbi5zZXNzaW9ucy5jb25uZWN0VmlhVHVubmVsJyxcblx0Y29ubmVjdFZpYVdTTDogJ3dvcmtiZW5jaC5hY3Rpb24uc2Vzc2lvbnMuY29ubmVjdFZpYVdTTCcsXG5cdG1hbmFnZVJlbW90ZUFnZW50SG9zdHM6ICd3b3JrYmVuY2guYWN0aW9uLnNlc3Npb25zLm1hbmFnZVJlbW90ZUFnZW50SG9zdHMnLFxuXHR1cGRhdGVSZW1vdGVBZ2VudEhvc3Q6ICd3b3JrYmVuY2guYWN0aW9uLnNlc3Npb25zLnVwZGF0ZVJlbW90ZUFnZW50SG9zdCcsXG59IGFzIGNvbnN0O1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJlbW90ZUFnZW50SG9zdENvbW1hbmRJZHMuYWRkUmVtb3RlQWdlbnRIb3N0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWRkUmVtb3RlQWdlbnRIb3N0JywgXCJBZGQgUmVtb3RlIEFnZW50IEhvc3QuLi5cIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7UmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWR9YCwgdHJ1ZSksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gUHJvbXB0IGZvciBhZGRyZXNzXG5cdFx0Y29uc3QgYWRkcmVzcyA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWRkUmVtb3RlVGl0bGUnLCBcIkFkZCBSZW1vdGUgQWdlbnQgSG9zdFwiKSxcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ2FkZFJlbW90ZVByb21wdCcsIFwiUGFzdGUgYSBob3N0LCBob3N0OnBvcnQsIG9yIFdlYlNvY2tldCBVUkwuIEV4YW1wbGU6IHswfVwiLCAnd3M6Ly8xMjcuMC4wLjE6ODA4OScpLFxuXHRcdFx0cGxhY2VIb2xkZXI6ICd3czovLzEyNy4wLjAuMTo4MDgwP3Rrbj1hYmMtMTIzJyxcblx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHRcdHZhbGlkYXRlSW5wdXQ6IGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dCh2YWx1ZSk7XG5cdFx0XHRcdGlmIChyZXN1bHQuZXJyb3IgPT09IFJlbW90ZUFnZW50SG9zdElucHV0VmFsaWRhdGlvbkVycm9yLkVtcHR5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZGRSZW1vdGVWYWxpZGF0aW9uRW1wdHknLCBcIkVudGVyIGEgcmVtb3RlIGFnZW50IGhvc3QgYWRkcmVzcy5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlc3VsdC5lcnJvciA9PT0gUmVtb3RlQWdlbnRIb3N0SW5wdXRWYWxpZGF0aW9uRXJyb3IuSW52YWxpZCkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWRkUmVtb3RlVmFsaWRhdGlvbkludmFsaWQnLCBcIkVudGVyIGEgdmFsaWQgaG9zdCwgaG9zdDpwb3J0LCBvciBXZWJTb2NrZXQgVVJMLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRpZiAoIWFkZHJlc3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VSZW1vdGVBZ2VudEhvc3RJbnB1dChhZGRyZXNzKTtcblx0XHRpZiAoIXBhcnNlZC5wYXJzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQcm9tcHQgZm9yIGRpc3BsYXkgbmFtZVxuXHRcdGNvbnN0IGRlZmF1bHROYW1lID0gcGFyc2VkLnBhcnNlZC5zdWdnZXN0ZWROYW1lO1xuXHRcdGNvbnN0IG5hbWUgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ25hbWVSZW1vdGVUaXRsZScsIFwiTmFtZSBSZW1vdGUgQWdlbnQgSG9zdFwiKSxcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ25hbWVSZW1vdGVQcm9tcHQnLCBcIkVudGVyIGEgZGlzcGxheSBuYW1lIGZvciB0aGlzIHJlbW90ZSBhZ2VudCBob3N0LlwiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbmFtZVJlbW90ZVBsYWNlaG9sZGVyJywgXCJNeSBSZW1vdGVcIiksXG5cdFx0XHR2YWx1ZTogZGVmYXVsdE5hbWUsXG5cdFx0XHR2YWx1ZVNlbGVjdGlvbjogWzAsIGRlZmF1bHROYW1lLmxlbmd0aF0sXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyB2YWx1ZSA9PiB2YWx1ZS50cmltKCkgPyB1bmRlZmluZWQgOiBsb2NhbGl6ZSgnbmFtZVJlbW90ZVZhbGlkYXRpb25FbXB0eScsIFwiRW50ZXIgYSBuYW1lIGZvciB0aGlzIHJlbW90ZSBhZ2VudCBob3N0LlwiKSxcblx0XHR9KTtcblx0XHRpZiAoIW5hbWU/LnRyaW0oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbm5lY3Rcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmVtb3RlQWdlbnRIb3N0U2VydmljZS5hZGRSZW1vdGVBZ2VudEhvc3Qoe1xuXHRcdFx0XHRuYW1lOiBuYW1lLnRyaW0oKSxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiBwYXJzZWQucGFyc2VkLmNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQsXG5cdFx0XHRcdFx0YWRkcmVzczogcGFyc2VkLnBhcnNlZC5hZGRyZXNzLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdhZGRSZW1vdGVGYWlsZWQnLCBcIkZhaWxlZCB0byBjb25uZWN0IHRvIHJlbW90ZSBhZ2VudCBob3N0IHswfS5cIiwgcGFyc2VkLnBhcnNlZC5hZGRyZXNzKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gLS0tLSBDb25uZWN0IHZpYSBTU0ggLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVNTSEF1dGhNZXRob2RQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0cmVhZG9ubHkgbWV0aG9kOiBTU0hBdXRoTWV0aG9kO1xufVxuXG4vKipcbiAqIFBhcnNlIGEgZnJlZS1mb3JtIFNTSCBjb25uZWN0aW9uIHN0cmluZyBvZiB0aGUgZm9ybSBgW3VzZXJAXWhvc3RbOnBvcnRdYC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIGVtcHR5IG9yIGludmFsaWQgaW5wdXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNTSEhvc3RJbnB1dCh2YWx1ZTogc3RyaW5nKTogeyBob3N0OiBzdHJpbmc7IHVzZXJuYW1lPzogc3RyaW5nOyBwb3J0PzogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuXHRpZiAoIXRyaW1tZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGF0SWR4ID0gdHJpbW1lZC5pbmRleE9mKCdAJyk7XG5cdGlmIChhdElkeCA9PT0gMCB8fCBhdElkeCA9PT0gdHJpbW1lZC5sZW5ndGggLSAxKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgdXNlcm5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IGhvc3RQYXJ0OiBzdHJpbmc7XG5cdGlmIChhdElkeCAhPT0gLTEpIHtcblx0XHR1c2VybmFtZSA9IHRyaW1tZWQuc3Vic3RyaW5nKDAsIGF0SWR4KTtcblx0XHRob3N0UGFydCA9IHRyaW1tZWQuc3Vic3RyaW5nKGF0SWR4ICsgMSk7XG5cdH0gZWxzZSB7XG5cdFx0aG9zdFBhcnQgPSB0cmltbWVkO1xuXHR9XG5cdGlmICghaG9zdFBhcnQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBob3N0OiBzdHJpbmc7XG5cdGxldCBwb3J0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGNvbG9uSWR4ID0gaG9zdFBhcnQubGFzdEluZGV4T2YoJzonKTtcblx0aWYgKGNvbG9uSWR4ICE9PSAtMSkge1xuXHRcdGhvc3QgPSBob3N0UGFydC5zdWJzdHJpbmcoMCwgY29sb25JZHgpO1xuXHRcdGNvbnN0IHBvcnRTdHIgPSBob3N0UGFydC5zdWJzdHJpbmcoY29sb25JZHggKyAxKTtcblx0XHRpZiAoIWhvc3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChwb3J0U3RyKSB7XG5cdFx0XHRjb25zdCBwb3J0TnVtID0gTnVtYmVyKHBvcnRTdHIpO1xuXHRcdFx0aWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHBvcnROdW0pIHx8IHBvcnROdW0gPD0gMCB8fCBwb3J0TnVtID4gNjU1MzUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHBvcnQgPSBwb3J0TnVtO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRob3N0ID0gaG9zdFBhcnQ7XG5cdH1cblx0aWYgKCFob3N0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyBob3N0LCB1c2VybmFtZSwgcG9ydCB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVNTSEhvc3RJbnB1dCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdiA9IHZhbHVlLnRyaW0oKTtcblx0aWYgKCF2KSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzc2hIb3N0RW1wdHknLCBcIkVudGVyIGFuIFNTSCBob3N0LlwiKTtcblx0fVxuXHRjb25zdCBhdElkeCA9IHYuaW5kZXhPZignQCcpO1xuXHRpZiAoYXRJZHggPT09IDApIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3NzaFVzZXJuYW1lTWlzc2luZ0luSG9zdCcsIFwiRW50ZXIgYSB1c2VybmFtZSBiZWZvcmUgJ0AnLlwiKTtcblx0fVxuXHRpZiAoYXRJZHggPT09IHYubGVuZ3RoIC0gMSkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnc3NoSG9zdE1pc3NpbmdBZnRlckF0JywgXCJFbnRlciBhIGhvc3QgbmFtZSBhZnRlciAnQCcuXCIpO1xuXHR9XG5cdGNvbnN0IGhvc3RQYXJ0ID0gYXRJZHggIT09IC0xID8gdi5zdWJzdHJpbmcoYXRJZHggKyAxKSA6IHY7XG5cdGlmICghaG9zdFBhcnQpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3NzaEhvc3RNaXNzaW5nQWZ0ZXJBdCcsIFwiRW50ZXIgYSBob3N0IG5hbWUgYWZ0ZXIgJ0AnLlwiKTtcblx0fVxuXHRjb25zdCBjb2xvbklkeCA9IGhvc3RQYXJ0Lmxhc3RJbmRleE9mKCc6Jyk7XG5cdGlmIChjb2xvbklkeCAhPT0gLTEpIHtcblx0XHRjb25zdCBob3N0TmFtZSA9IGhvc3RQYXJ0LnN1YnN0cmluZygwLCBjb2xvbklkeCk7XG5cdFx0Y29uc3QgcG9ydFN0ciA9IGhvc3RQYXJ0LnN1YnN0cmluZyhjb2xvbklkeCArIDEpO1xuXHRcdGlmICghaG9zdE5hbWUpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc3NoSG9zdE1pc3NpbmdBZnRlckF0JywgXCJFbnRlciBhIGhvc3QgbmFtZSBhZnRlciAnQCcuXCIpO1xuXHRcdH1cblx0XHRpZiAocG9ydFN0cikge1xuXHRcdFx0Y29uc3QgcG9ydE51bSA9IE51bWJlcihwb3J0U3RyKTtcblx0XHRcdGlmICghTnVtYmVyLmlzSW50ZWdlcihwb3J0TnVtKSB8fCBwb3J0TnVtIDw9IDAgfHwgcG9ydE51bSA+IDY1NTM1KSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc3NoSG9zdEludmFsaWRQb3J0JywgXCJFbnRlciBhIHZhbGlkIHBvcnQgbnVtYmVyLlwiKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElTU0hBbGlhc1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSBraW5kOiAnYWxpYXMnO1xuXHRyZWFkb25seSBob3N0QWxpYXM6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElTU0hOZXdIb3N0UGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGtpbmQ6ICduZXctaG9zdCc7XG5cdGhvc3RJbnB1dDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVNTSEZvb3RlclBpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSBraW5kOiAnYWRkLWNvbmZpZycgfCAnY29uZmlndXJlJztcbn1cblxudHlwZSBTU0hIb3N0UGlja2VySXRlbSA9IElTU0hBbGlhc1BpY2tJdGVtIHwgSVNTSE5ld0hvc3RQaWNrSXRlbSB8IElTU0hGb290ZXJQaWNrSXRlbTtcblxuYXN5bmMgZnVuY3Rpb24gcHJvbXB0VG9Db25uZWN0VmlhU1NIKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0b3B0aW9uczogeyBzaG93QmFja0J1dHRvbj86IGJvb2xlYW4gfSA9IHt9LFxuKTogUHJvbWlzZTwnYmFjaycgfCB2b2lkPiB7XG5cdGNvbnN0IHNzaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UpO1xuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRjb25zdCBjb25maWdIb3N0cyA9IGF3YWl0IHNzaFNlcnZpY2UubGlzdFNTSENvbmZpZ0hvc3RzKCkuY2F0Y2goKCkgPT4gW10gYXMgc3RyaW5nW10pO1xuXG5cdGNvbnN0IGFsaWFzSXRlbXM6IElTU0hBbGlhc1BpY2tJdGVtW10gPSBjb25maWdIb3N0cy5tYXAoaCA9PiAoe1xuXHRcdGtpbmQ6ICdhbGlhcycsXG5cdFx0aG9zdEFsaWFzOiBoLFxuXHRcdGxhYmVsOiBoLFxuXHR9KSk7XG5cdGNvbnN0IGFkZEhvc3RJdGVtOiBJU1NIRm9vdGVyUGlja0l0ZW0gPSB7XG5cdFx0a2luZDogJ2FkZC1jb25maWcnLFxuXHRcdGxhYmVsOiAnJChwbHVzKSAnICsgbG9jYWxpemUoJ3NzaEFkZE5ld0hvc3QnLCBcIkFkZCBOZXcgU1NIIEhvc3QuLi5cIiksXG5cdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0fTtcblx0Y29uc3QgY29uZmlndXJlSG9zdHNJdGVtOiBJU1NIRm9vdGVyUGlja0l0ZW0gPSB7XG5cdFx0a2luZDogJ2NvbmZpZ3VyZScsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdzc2hDb25maWd1cmVIb3N0cycsIFwiQ29uZmlndXJlIFNTSCBIb3N0cy4uLlwiKSxcblx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHR9O1xuXHRjb25zdCBuZXdIb3N0SXRlbTogSVNTSE5ld0hvc3RQaWNrSXRlbSA9IHtcblx0XHRraW5kOiAnbmV3LWhvc3QnLFxuXHRcdGhvc3RJbnB1dDogJycsXG5cdFx0bGFiZWw6ICcnLFxuXHRcdGFsd2F5c1Nob3c6IHRydWUsXG5cdH07XG5cblx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8J2JhY2snIHwgU1NISG9zdFBpY2tlckl0ZW0gfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcGlja2VyID0gc3RvcmUuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxTU0hIb3N0UGlja2VySXRlbT4oKSk7XG5cdFx0cGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ3NzaEhvc3RUaXRsZScsIFwiQ29ubmVjdCB2aWEgU1NIXCIpO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzc2hIb3N0UGlja2VyUGxhY2Vob2xkZXInLCBcIlNlbGVjdCBjb25maWd1cmVkIFNTSCBob3N0IG9yIGVudGVyIHVzZXJAaG9zdFwiKTtcblx0XHRwaWNrZXIuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdGlmIChvcHRpb25zLnNob3dCYWNrQnV0dG9uKSB7XG5cdFx0XHRwaWNrZXIuYnV0dG9ucyA9IFtxdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uXTtcblx0XHR9XG5cblx0XHRsZXQgbmV3SG9zdFZpc2libGUgPSBmYWxzZTtcblx0XHRjb25zdCB1cGRhdGVJdGVtcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zOiBTU0hIb3N0UGlja2VySXRlbVtdID0gWy4uLmFsaWFzSXRlbXNdO1xuXHRcdFx0aWYgKG5ld0hvc3RWaXNpYmxlKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2gobmV3SG9zdEl0ZW0pO1xuXHRcdFx0fVxuXHRcdFx0aXRlbXMucHVzaChhZGRIb3N0SXRlbSk7XG5cdFx0XHRpdGVtcy5wdXNoKGNvbmZpZ3VyZUhvc3RzSXRlbSk7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHR9O1xuXHRcdHVwZGF0ZUl0ZW1zKCk7XG5cblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VTU0hIb3N0SW5wdXQodmFsdWUpO1xuXHRcdFx0aWYgKHBhcnNlZCkge1xuXHRcdFx0XHRuZXdIb3N0SXRlbS5ob3N0SW5wdXQgPSB2YWx1ZS50cmltKCk7XG5cdFx0XHRcdG5ld0hvc3RJdGVtLmxhYmVsID0gYFxcdTI3YTQgJHt2YWx1ZS50cmltKCl9YDtcblx0XHRcdFx0aWYgKCFuZXdIb3N0VmlzaWJsZSkge1xuXHRcdFx0XHRcdG5ld0hvc3RWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHR1cGRhdGVJdGVtcygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEZvcmNlIGl0ZW0gcmVmcmVzaCBzbyB0aGUgbGFiZWwgdXBkYXRlc1xuXHRcdFx0XHRcdHBpY2tlci5pdGVtcyA9IHBpY2tlci5pdGVtcztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChuZXdIb3N0VmlzaWJsZSkge1xuXHRcdFx0XHRuZXdIb3N0VmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHR1cGRhdGVJdGVtcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRpZiAoYnV0dG9uID09PSBxdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uKSB7XG5cdFx0XHRcdHJlc29sdmUoJ2JhY2snKTtcblx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IHBpY2tlci5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0cmVzb2x2ZShzZWxlY3RlZCk7XG5cdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHRcdHBpY2tlci5zaG93KCk7XG5cdH0pO1xuXG5cdGlmIChyZXN1bHQgPT09ICdiYWNrJykge1xuXHRcdHJldHVybiAnYmFjayc7XG5cdH1cblxuXHRpZiAoIXJlc3VsdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChyZXN1bHQua2luZCA9PT0gJ2FkZC1jb25maWcnIHx8IHJlc3VsdC5raW5kID09PSAnY29uZmlndXJlJykge1xuXHRcdGNvbnN0IGNtZElkID0gcmVzdWx0LmtpbmQgPT09ICdhZGQtY29uZmlnJ1xuXHRcdFx0PyBSZW1vdGVBZ2VudEhvc3RDb21tYW5kSWRzLmFkZE5ld1NTSEhvc3Rcblx0XHRcdDogUmVtb3RlQWdlbnRIb3N0Q29tbWFuZElkcy5jb25maWd1cmVTU0hIb3N0cztcblx0XHQvLyBQYXNzIGJhY2sgY2FsbGJhY2sgc28gc3ViLXBpY2tlciBjYW4gbmF2aWdhdGUgYmFjayB0byB0aGlzIFNTSCBwaWNrZXJcblx0XHRjb25zdCBvbkJhY2tUb1NTSCA9ICgpID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGEgPT4gcHJvbXB0VG9Db25uZWN0VmlhU1NIKGEsIG9wdGlvbnMpKTtcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjbWRJZCwgb25CYWNrVG9TU0gpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmIChyZXN1bHQua2luZCA9PT0gJ2FsaWFzJykge1xuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+XG5cdFx0XHRjb25uZWN0VG9Db25maWd1cmVkU1NISG9zdChhY2Nlc3NvciwgcmVzdWx0Lmhvc3RBbGlhcylcblx0XHQpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIGtpbmQgPT09ICduZXctaG9zdCdcblx0Y29uc3QgbmV3SG9zdCA9IHJlc3VsdCBhcyBJU1NITmV3SG9zdFBpY2tJdGVtO1xuXHRjb25zdCBwYXJzZWQgPSBwYXJzZVNTSEhvc3RJbnB1dChuZXdIb3N0Lmhvc3RJbnB1dCk7XG5cdGlmICghcGFyc2VkKSB7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcih2YWxpZGF0ZVNTSEhvc3RJbnB1dChuZXdIb3N0Lmhvc3RJbnB1dCkgPz8gbG9jYWxpemUoJ3NzaEhvc3RJbnZhbGlkJywgXCJJbnZhbGlkIFNTSCBob3N0LlwiKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+XG5cdFx0cHJvbXB0Rm9yQ3JlZGVudGlhbHNBbmRDb25uZWN0KGFjY2Vzc29yLCBwYXJzZWQuaG9zdCwgcGFyc2VkLnVzZXJuYW1lLCBwYXJzZWQucG9ydClcblx0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29ubmVjdFRvQ29uZmlndXJlZFNTSEhvc3QoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRob3N0QWxpYXM6IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzc2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0bGV0IHJlc29sdmVkQ29uZmlnOiBJU1NIUmVzb2x2ZWRDb25maWc7XG5cdHRyeSB7XG5cdFx0cmVzb2x2ZWRDb25maWcgPSBhd2FpdCBzc2hTZXJ2aWNlLnJlc29sdmVTU0hDb25maWcoaG9zdEFsaWFzKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnc3NoUmVzb2x2ZUNvbmZpZ0ZhaWxlZCcsIFwiRmFpbGVkIHRvIHJlc29sdmUgU1NIIGNvbmZpZyBmb3IgezB9OiB7MX1cIiwgaG9zdEFsaWFzLCBTdHJpbmcoZXJyKSkpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGhvc3QgPSByZXNvbHZlZENvbmZpZy5ob3N0bmFtZTtcblx0Y29uc3QgdXNlcm5hbWUgPSByZXNvbHZlZENvbmZpZy51c2VyO1xuXHRjb25zdCBwb3J0ID0gcmVzb2x2ZWRDb25maWcucG9ydCAhPT0gMjIgPyByZXNvbHZlZENvbmZpZy5wb3J0IDogdW5kZWZpbmVkO1xuXHRjb25zdCBzdWdnZXN0ZWROYW1lID0gaG9zdEFsaWFzO1xuXG5cdC8vIFBhc3MgdGhyb3VnaCB0aGUgZmlyc3QgcmVzb2x2ZWQgSWRlbnRpdHlGaWxlIChpZiBhbnkpIGFzIHRoZSBleHBsaWNpdFxuXHQvLyBrZXkuIFRoZSBtYWluIHByb2Nlc3MgaXMgcmVzcG9uc2libGUgZm9yIGRlLWR1cGxpY2F0aW5nIGFnYWluc3QgaXRzXG5cdC8vIGRlZmF1bHQta2V5IHNjYW4sIHNvIHdlIGRvbid0IG5lZWQgdG8gZmlsdGVyIGhlcmUuXG5cdGNvbnN0IGRlZmF1bHRLZXlQYXRoID0gcmVzb2x2ZWRDb25maWcuaWRlbnRpdHlGaWxlWzBdO1xuXG5cdGlmICh1c2VybmFtZSkge1xuXHRcdGNvbnN0IGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyA9IHtcblx0XHRcdGhvc3QsXG5cdFx0XHRwb3J0LFxuXHRcdFx0dXNlcm5hbWUsXG5cdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdFx0cHJpdmF0ZUtleVBhdGg6IGRlZmF1bHRLZXlQYXRoLFxuXHRcdFx0aWRlbnRpdHlBZ2VudDogcmVzb2x2ZWRDb25maWcuaWRlbnRpdHlBZ2VudCxcblx0XHRcdGFnZW50Rm9yd2FyZDogcmVzb2x2ZWRDb25maWcuZm9yd2FyZEFnZW50IHx8IHVuZGVmaW5lZCxcblx0XHRcdG5hbWU6IHN1Z2dlc3RlZE5hbWUsXG5cdFx0XHRzc2hDb25maWdIb3N0OiBob3N0QWxpYXMsXG5cdFx0fTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT5cblx0XHRcdGNvbm5lY3RXaXRoUHJvZ3Jlc3MoYWNjZXNzb3IsIGNvbmZpZywgc3VnZ2VzdGVkTmFtZSlcblx0XHQpO1xuXHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBwcm9tcHRGb3JSZW1vdGVGb2xkZXIoYWNjZXNzb3IsIGNvbm5lY3Rpb24pKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gRmFsbGJhY2s6IGFsaWFzIHJlc29sdmVkIHdpdGhvdXQgYSB1c2VyIFx1MjAxNCBmYWxsIHRocm91Z2ggdG8gbWFudWFsIGZsb3dcblx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT5cblx0XHRwcm9tcHRGb3JDcmVkZW50aWFsc0FuZENvbm5lY3QoYWNjZXNzb3IsIGhvc3QsIHVuZGVmaW5lZCwgcG9ydCwgc3VnZ2VzdGVkTmFtZSwgZGVmYXVsdEtleVBhdGgsIHJlc29sdmVkQ29uZmlnLmlkZW50aXR5QWdlbnQpXG5cdCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByb21wdEZvckNyZWRlbnRpYWxzQW5kQ29ubmVjdChcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdGhvc3Q6IHN0cmluZyxcblx0dXNlcm5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0cG9ydDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRzdWdnZXN0ZWROYW1lPzogc3RyaW5nLFxuXHRkZWZhdWx0S2V5UGF0aD86IHN0cmluZyxcblx0aWRlbnRpdHlBZ2VudD86IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdGlmICghdXNlcm5hbWUpIHtcblx0XHRjb25zdCB1c2VybmFtZUlucHV0ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzc2hVc2VybmFtZVRpdGxlJywgXCJTU0ggVXNlcm5hbWVcIiksXG5cdFx0XHRwcm9tcHQ6IGxvY2FsaXplKCdzc2hVc2VybmFtZVByb21wdCcsIFwiRW50ZXIgdGhlIHVzZXJuYW1lIGZvciB7MH0uXCIsIGhvc3QpLFxuXHRcdFx0cGxhY2VIb2xkZXI6ICdyb290Jyxcblx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHRcdHZhbGlkYXRlSW5wdXQ6IGFzeW5jIHZhbHVlID0+IHZhbHVlLnRyaW0oKSA/IHVuZGVmaW5lZCA6IGxvY2FsaXplKCdzc2hVc2VybmFtZUVtcHR5JywgXCJFbnRlciBhIHVzZXJuYW1lLlwiKSxcblx0XHR9KTtcblx0XHRpZiAoIXVzZXJuYW1lSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dXNlcm5hbWUgPSB1c2VybmFtZUlucHV0LnRyaW0oKTtcblx0fVxuXG5cdGNvbnN0IGF1dGhQaWNrczogSVNTSEF1dGhNZXRob2RQaWNrSXRlbVtdID0gW1xuXHRcdHtcblx0XHRcdG1ldGhvZDogU1NIQXV0aE1ldGhvZC5BZ2VudCxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc3NoQXV0aEFnZW50JywgXCJTU0ggQWdlbnRcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NzaEF1dGhBZ2VudERlc2MnLCBcIlVzZSB0aGUgcnVubmluZyBTU0ggYWdlbnQgZm9yIGF1dGhlbnRpY2F0aW9uXCIpLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0bWV0aG9kOiBTU0hBdXRoTWV0aG9kLktleUZpbGUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NzaEF1dGhLZXknLCBcIlByaXZhdGUgS2V5IEZpbGVcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NzaEF1dGhLZXlEZXNjJywgXCJBdXRoZW50aWNhdGUgd2l0aCBhIHByaXZhdGUga2V5IGZpbGVcIiksXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRtZXRob2Q6IFNTSEF1dGhNZXRob2QuUGFzc3dvcmQsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NzaEF1dGhQYXNzd29yZCcsIFwiUGFzc3dvcmRcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NzaEF1dGhQYXNzd29yZERlc2MnLCBcIkF1dGhlbnRpY2F0ZSB3aXRoIGEgcGFzc3dvcmRcIiksXG5cdFx0fSxcblx0XTtcblxuXHRjb25zdCBhdXRoUGlja2VkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhhdXRoUGlja3MsIHtcblx0XHR0aXRsZTogbG9jYWxpemUoJ3NzaEF1dGhUaXRsZScsIFwiQXV0aGVudGljYXRpb24gTWV0aG9kXCIpLFxuXHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc3NoQXV0aFBsYWNlaG9sZGVyJywgXCJDaG9vc2UgaG93IHRvIGF1dGhlbnRpY2F0ZSB3aXRoIHswfVwiLCBob3N0KSxcblx0fSk7XG5cdGlmICghYXV0aFBpY2tlZCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBhdXRoTWV0aG9kID0gYXV0aFBpY2tlZC5tZXRob2Q7XG5cblx0bGV0IHByaXZhdGVLZXlQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBwYXNzd29yZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGlmIChhdXRoTWV0aG9kID09PSBTU0hBdXRoTWV0aG9kLktleUZpbGUpIHtcblx0XHRjb25zdCBrZXlQYXRoID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzc2hLZXlUaXRsZScsIFwiUHJpdmF0ZSBLZXkgUGF0aFwiKSxcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ3NzaEtleVByb21wdCcsIFwiRW50ZXIgdGhlIHBhdGggdG8geW91ciBTU0ggcHJpdmF0ZSBrZXkuXCIpLFxuXHRcdFx0cGxhY2VIb2xkZXI6ICd+Ly5zc2gvaWRfcnNhJyxcblx0XHRcdHZhbHVlOiBkZWZhdWx0S2V5UGF0aCA/PyAnfi8uc3NoL2lkX3JzYScsXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyB2YWx1ZSA9PiB2YWx1ZS50cmltKCkgPyB1bmRlZmluZWQgOiBsb2NhbGl6ZSgnc3NoS2V5RW1wdHknLCBcIkVudGVyIGEga2V5IGZpbGUgcGF0aC5cIiksXG5cdFx0fSk7XG5cdFx0aWYgKCFrZXlQYXRoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHByaXZhdGVLZXlQYXRoID0ga2V5UGF0aC50cmltKCk7XG5cdH0gZWxzZSBpZiAoYXV0aE1ldGhvZCA9PT0gU1NIQXV0aE1ldGhvZC5QYXNzd29yZCkge1xuXHRcdGNvbnN0IHB3ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzc2hQYXNzd29yZFRpdGxlJywgXCJTU0ggUGFzc3dvcmRcIiksXG5cdFx0XHRwcm9tcHQ6IGxvY2FsaXplKCdzc2hQYXNzd29yZFByb21wdCcsIFwiRW50ZXIgdGhlIHBhc3N3b3JkIGZvciB7MH1AezF9LlwiLCB1c2VybmFtZSwgaG9zdCksXG5cdFx0XHRwYXNzd29yZDogdHJ1ZSxcblx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHRcdHZhbGlkYXRlSW5wdXQ6IGFzeW5jIHZhbHVlID0+IHZhbHVlID8gdW5kZWZpbmVkIDogbG9jYWxpemUoJ3NzaFBhc3N3b3JkRW1wdHknLCBcIkVudGVyIGEgcGFzc3dvcmQuXCIpLFxuXHRcdH0pO1xuXHRcdGlmICghcHcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cGFzc3dvcmQgPSBwdztcblx0fVxuXG5cdGNvbnN0IGRlZmF1bHROYW1lID0gc3VnZ2VzdGVkTmFtZSA/PyBgJHt1c2VybmFtZX1AJHtob3N0fWA7XG5cdGNvbnN0IG5hbWUgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0dGl0bGU6IGxvY2FsaXplKCdzc2hOYW1lVGl0bGUnLCBcIk5hbWUgUmVtb3RlXCIpLFxuXHRcdHByb21wdDogbG9jYWxpemUoJ3NzaE5hbWVQcm9tcHQnLCBcIkVudGVyIGEgZGlzcGxheSBuYW1lIGZvciB0aGlzIFNTSCByZW1vdGUuXCIpLFxuXHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc3NoTmFtZVBsYWNlaG9sZGVyJywgXCJNeSBSZW1vdGVcIiksXG5cdFx0dmFsdWU6IGRlZmF1bHROYW1lLFxuXHRcdHZhbHVlU2VsZWN0aW9uOiBbMCwgZGVmYXVsdE5hbWUubGVuZ3RoXSxcblx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0dmFsaWRhdGVJbnB1dDogYXN5bmMgdmFsdWUgPT4gdmFsdWUudHJpbSgpID8gdW5kZWZpbmVkIDogbG9jYWxpemUoJ3NzaE5hbWVFbXB0eScsIFwiRW50ZXIgYSBuYW1lLlwiKSxcblx0fSk7XG5cdGlmICghbmFtZSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGNvbmZpZzogSVNTSEFnZW50SG9zdENvbmZpZyA9IHtcblx0XHRob3N0LFxuXHRcdHBvcnQsXG5cdFx0dXNlcm5hbWUsXG5cdFx0YXV0aE1ldGhvZCxcblx0XHRwcml2YXRlS2V5UGF0aCxcblx0XHRpZGVudGl0eUFnZW50LFxuXHRcdHBhc3N3b3JkLFxuXHRcdG5hbWU6IG5hbWUudHJpbSgpLFxuXHR9O1xuXG5cdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PlxuXHRcdGNvbm5lY3RXaXRoUHJvZ3Jlc3MoYWNjZXNzb3IsIGNvbmZpZywgaG9zdClcblx0KTtcblx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBwcm9tcHRGb3JSZW1vdGVGb2xkZXIoYWNjZXNzb3IsIGNvbm5lY3Rpb24pKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBjb25uZWN0V2l0aFByb2dyZXNzKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0Y29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnLFxuXHRkaXNwbGF5SG9zdDogc3RyaW5nLFxuKTogUHJvbWlzZTxJU1NIQWdlbnRIb3N0Q29ubmVjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBzc2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRjb25zdCBzdG9wd2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblxuXHRjb25zdCBoYW5kbGUgPSBub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0bWVzc2FnZTogbG9jYWxpemUoJ3NzaENvbm5lY3RpbmcnLCBcIkNvbm5lY3RpbmcgdG8gezB9IHZpYSBTU0guLi5cIiwgZGlzcGxheUhvc3QpLFxuXHRcdHByb2dyZXNzOiB7IGluZmluaXRlOiB0cnVlIH0sXG5cdH0pO1xuXG5cdC8vIEJ1aWxkIHRoZSBleHBlY3RlZCBjb25uZWN0aW9uIGtleSB0byBmaWx0ZXIgcHJvZ3Jlc3MgZXZlbnRzLlxuXHQvLyBNdXN0IG1hdGNoIHRoZSBrZXkgbG9naWMgaW4gdGhlIHNoYXJlZCBwcm9jZXNzIHNlcnZpY2UuXG5cdGNvbnN0IGV4cGVjdGVkS2V5ID0gY29uZmlnLnNzaENvbmZpZ0hvc3Rcblx0XHQ/IGBzc2g6JHtjb25maWcuc3NoQ29uZmlnSG9zdH1gXG5cdFx0OiBgJHtjb25maWcudXNlcm5hbWV9QCR7Y29uZmlnLmhvc3R9OiR7Y29uZmlnLnBvcnQgPz8gMjJ9YDtcblxuXHRjb25zdCBwcm9ncmVzc0xpc3RlbmVyID0gc3NoU2VydmljZS5vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcz8uKHByb2dyZXNzID0+IHtcblx0XHRpZiAocHJvZ3Jlc3MuY29ubmVjdGlvbktleSA9PT0gZXhwZWN0ZWRLZXkpIHtcblx0XHRcdGhhbmRsZS51cGRhdGVNZXNzYWdlKHByb2dyZXNzLm1lc3NhZ2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dHJ5IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgc3NoU2VydmljZS5jb25uZWN0KGNvbmZpZyk7XG5cdFx0bG9nU1NIQ29ubmVjdEF0dGVtcHQodGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0b3BlcmF0aW9uOiAnY29ubmVjdCcsXG5cdFx0XHR1c2VySW5pdGlhdGVkOiBjb25maWcudXNlckluaXRpYXRlZCA/PyB0cnVlLFxuXHRcdFx0YXR0ZW1wdDogMSxcblx0XHRcdGR1cmF0aW9uTXM6IHN0b3B3YXRjaC5lbGFwc2VkKCksXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0d2lsbFJldHJ5OiBmYWxzZSxcblx0XHR9KTtcblx0XHRoYW5kbGUuY2xvc2UoKTtcblx0XHRyZXR1cm4gY29ubmVjdGlvbjtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0bG9nU1NIQ29ubmVjdEF0dGVtcHQodGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0b3BlcmF0aW9uOiAnY29ubmVjdCcsXG5cdFx0XHR1c2VySW5pdGlhdGVkOiBjb25maWcudXNlckluaXRpYXRlZCA/PyB0cnVlLFxuXHRcdFx0YXR0ZW1wdDogMSxcblx0XHRcdGR1cmF0aW9uTXM6IHN0b3B3YXRjaC5lbGFwc2VkKCksXG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdHdpbGxSZXRyeTogZmFsc2UsXG5cdFx0XHRlcnJvckNhdGVnb3J5OiBjYXRlZ29yaXplU1NIQ29ubmVjdEVycm9yKGVyciksXG5cdFx0fSk7XG5cdFx0aGFuZGxlLmNsb3NlKCk7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSB8fCBpc1NTSEhvc3RLZXlEZW5pZWRFcnJvcihlcnIpKSB7XG5cdFx0XHQvLyBBIHJlZnVzZWQgaG9zdCBrZXkgbmVlZHMgbm8gZ2VuZXJpYyBlcnJvciBvbiB0b3A6IGVpdGhlciB0aGUgdXNlclxuXHRcdFx0Ly8gZGVjbGluZWQgdGhlIHByb21wdCB0aGVtc2VsdmVzLCBvciB0aGUgaG9zdCBrZXkgVUkgaGFzIGFscmVhZHlcblx0XHRcdC8vIHNob3duIGEgc3BlY2lmaWMgbm90aWZpY2F0aW9uIHdpdGggYSB3YXkgdG8gcmVjb3Zlci5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3NzaENvbm5lY3RGYWlsZWQnLCBcIkZhaWxlZCB0byBjb25uZWN0IHZpYSBTU0ggdG8gezB9OiB7MX1cIiwgZGlzcGxheUhvc3QsIFN0cmluZyhlcnIpKSk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSBmaW5hbGx5IHtcblx0XHRwcm9ncmVzc0xpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBBZnRlciBhIHN1Y2Nlc3NmdWwgU1NIIGNvbm5lY3Rpb24sIHNob3cgdGhlIHJlbW90ZSBmb2xkZXIgcGlja2VyIGFuZFxuICogcHJlLXNlbGVjdCB0aGUgY2hvc2VuIGZvbGRlciBpbiB0aGUgd29ya3NwYWNlIHBpY2tlci5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcHJvbXB0Rm9yUmVtb3RlRm9sZGVyKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0Y29ubmVjdGlvbjogSVNTSEFnZW50SG9zdENvbm5lY3Rpb24sXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3Qgc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UpO1xuXHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXG5cdC8vIFRoZSBwcm92aWRlciBpcyBjcmVhdGVkIHN5bmNocm9ub3VzbHkgZHVyaW5nIGFkZE1hbmFnZWRDb25uZWN0aW9uJ3Ncblx0Ly8gb25EaWRDaGFuZ2VDb25uZWN0aW9ucyBldmVudCwgc28gaXQgc2hvdWxkIGV4aXN0IGJ5IG5vdy5cblx0Y29uc3QgcHJvdmlkZXIgPSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkuZmluZCgocCk6IHAgaXMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgPT4gaXNBZ2VudEhvc3RQcm92aWRlcihwKSAmJiBwLnJlbW90ZUFkZHJlc3MgPT09IGNvbm5lY3Rpb24ubG9jYWxBZGRyZXNzKTtcblx0aWYgKCFwcm92aWRlcikge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIFVzZSB0aGUgcHJvdmlkZXIncyBleGlzdGluZyBicm93c2UgYWN0aW9uIHRvIHNob3cgdGhlIGZvbGRlciBwaWNrZXJcblx0Y29uc3QgYnJvd3NlQWN0aW9uID0gcHJvdmlkZXIuYnJvd3NlQWN0aW9uc1swXTtcblx0aWYgKCFicm93c2VBY3Rpb24pIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBicm93c2VBY3Rpb24ucnVuKCk7XG5cdGlmICghd29ya3NwYWNlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IGZvbGRlclVyaSA9IHdvcmtzcGFjZS5mb2xkZXJzWzBdPy5yb290O1xuXHRpZiAoIWZvbGRlclVyaSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHNlc3Npb25zU2VydmljZS5vcGVuTmV3U2Vzc2lvbigpO1xuXHRzZXNzaW9uc1BhcnRTZXJ2aWNlLmdldFNlc3Npb25WaWV3KHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQpPy5zZWxlY3RXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZW1vdGVBZ2VudEhvc3RDb21tYW5kSWRzLmNvbm5lY3RWaWFTU0gsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25uZWN0VmlhU1NIJywgXCJDb25uZWN0IHRvIFJlbW90ZSBBZ2VudCBIb3N0IHZpYSBTU0hcIiksXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ2Nvbm5lY3RWaWFTU0hTaG9ydCcsIFwiU1NILi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZW1vdGUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7UmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWR9YCwgdHJ1ZSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uV29ya3NwYWNlTWFuYWdlLFxuXHRcdFx0XHRvcmRlcjogMjAsXG5cdFx0XHRcdHdoZW46IFNlc3Npb25Xb3Jrc3BhY2VQaWNrZXJHcm91cENvbnRleHQuaXNFcXVhbFRvKFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvbkJhY2s/OiAoKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbXB0VG9Db25uZWN0VmlhU1NIKGFjY2Vzc29yLCB7IHNob3dCYWNrQnV0dG9uOiAhIW9uQmFjayB9KTtcblx0XHRpZiAocmVzdWx0ID09PSAnYmFjaycpIHtcblx0XHRcdG9uQmFjaz8uKCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZW1vdGVBZ2VudEhvc3RDb21tYW5kSWRzLmFkZE5ld1NTSEhvc3QsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZGROZXdTU0hIb3N0JywgXCJBZGQgTmV3IFNTSCBIb3N0Li4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkfWAsIHRydWUpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3NoU2VydmljZSA9IGFjY2Vzc29yLmdldChJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdGxldCBjb25maWdVcmk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbmZpZ1VyaSA9IGF3YWl0IHNzaFNlcnZpY2UuZW5zdXJlVXNlclNTSENvbmZpZygpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnc3NoQ29uZmlnQ3JlYXRlRmFpbGVkJywgXCJGYWlsZWQgdG8gY3JlYXRlIFNTSCBjb25maWcgZmlsZTogezB9XCIsIFN0cmluZyhlcnIpKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjb25maWdVcmksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gc2F0aXNmaWVzIElUZXh0RWRpdG9yT3B0aW9ucyB9KTtcblx0XHRpZiAoIWVkaXRvclBhbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udHJvbCA9IGVkaXRvclBhbmUuZ2V0Q29udHJvbCgpO1xuXHRcdGlmICghaXNDb2RlRWRpdG9yKGNvbnRyb2wpIHx8ICFjb250cm9sLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udHJvbCBhcyBJQ29kZUVkaXRvcjtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBcHBlbmQgYSBzbmlwcGV0IGF0IGVuZCBvZiBkb2N1bWVudC4gUmVhZCBmaWxlIGNvbnRlbnQgZm9yIGxlbmd0aDtcblx0XHQvLyBmYWxsIGJhY2sgdG8gbW9kZWwgbGVuZ3RoIHRvIGF2b2lkIHJhY2VzLlxuXHRcdGxldCBhcHBlbmROZXdsaW5lID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBmaWxlU2VydmljZS5zdGF0KGNvbmZpZ1VyaSk7XG5cdFx0XHRpZiAoc3RhdC5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIEVuZE9mTGluZVByZWZlcmVuY2UuTEYpO1xuXHRcdFx0XHRhcHBlbmROZXdsaW5lID0gY29udGVudC5sZW5ndGggPiAwICYmICFjb250ZW50LmVuZHNXaXRoKCdcXG4nKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH1cblx0XHRjb25zdCBsYXN0TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGxhc3RDb2wgPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxhc3RMaW5lKTtcblx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZShsYXN0TGluZSwgbGFzdENvbCwgbGFzdExpbmUsIGxhc3RDb2wpKTtcblxuXHRcdGNvbnN0IHNuaXBwZXQgPSAoYXBwZW5kTmV3bGluZSA/ICdcXG4nIDogJycpICsgJ0hvc3QgJHsxOmFsaWFzfVxcbiAgICBIb3N0TmFtZSAkezI6aG9zdG5hbWV9XFxuICAgIFVzZXIgJHszOnVzZXJ9XFxuJztcblx0XHRTbmlwcGV0Q29udHJvbGxlcjIuZ2V0KGVkaXRvcik/Lmluc2VydChzbmlwcGV0KTtcblx0XHRlZGl0b3IuZm9jdXMoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVtb3RlQWdlbnRIb3N0Q29tbWFuZElkcy5jb25maWd1cmVTU0hIb3N0cyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbmZpZ3VyZVNTSEhvc3RzJywgXCJDb25maWd1cmUgU1NIIEhvc3RzLi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFNlc3Npb25zQ2F0ZWdvcmllcy5TZXNzaW9ucyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkfWAsIHRydWUpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvbkJhY2s/OiAoKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3NoU2VydmljZSA9IGFjY2Vzc29yLmdldChJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdGxldCBjb25maWdGaWxlczogVVJJW107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbmZpZ0ZpbGVzID0gYXdhaXQgc3NoU2VydmljZS5saXN0U1NIQ29uZmlnRmlsZXMoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3NzaENvbmZpZ0xpc3RGYWlsZWQnLCBcIkZhaWxlZCB0byBsaXN0IFNTSCBjb25maWcgZmlsZXM6IHswfVwiLCBTdHJpbmcoZXJyKSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFsd2F5cyBvZmZlciB0aGUgdXNlci1jb25maWcgZmFsbGJhY2sgc28gd2UgaGF2ZSBzb21ldGhpbmcgb3BlbmFibGUuXG5cdFx0aWYgKGNvbmZpZ0ZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgc3NoU2VydmljZS5lbnN1cmVVc2VyU1NIQ29uZmlnKCk7XG5cdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gc2F0aXNmaWVzIElUZXh0RWRpdG9yT3B0aW9ucyB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdzc2hDb25maWdPcGVuRmFpbGVkJywgXCJGYWlsZWQgdG8gb3BlbiBTU0ggY29uZmlnIGZpbGU6IHswfVwiLCBTdHJpbmcoZXJyKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGludGVyZmFjZSBJU1NIQ29uZmlnRmlsZVBpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdFx0XHRyZWFkb25seSBpc1VzZXJDb25maWc6IGJvb2xlYW47XG5cdFx0fVxuXHRcdGNvbnN0IHVzZXJDb25maWdVcmkgPSBjb25maWdGaWxlc1swXTtcblx0XHRjb25zdCBpdGVtczogSVNTSENvbmZpZ0ZpbGVQaWNrSXRlbVtdID0gY29uZmlnRmlsZXMubWFwKCh1cmksIGluZGV4KSA9PiAoe1xuXHRcdFx0bGFiZWw6IHVyaS5mc1BhdGgsXG5cdFx0XHR1cmksXG5cdFx0XHRpc1VzZXJDb25maWc6IGluZGV4ID09PSAwLFxuXHRcdH0pKTtcblxuXHRcdC8vIElmIHRoZXJlJ3Mgb25seSBvbmUgZmlsZSwgc2tpcCB0aGUgcGlja2VyIGFuZCBvcGVuIGl0IGRpcmVjdGx5LlxuXHRcdC8vIElmIG9uQmFjayBpcyBwcm92aWRlZCB3ZSBzdGlsbCBuZWVkIHRvIHNob3cgdGhlIHBpY2tlciB0byBvZmZlciBuYXZpZ2F0aW9uLlxuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDEgJiYgIW9uQmFjaykge1xuXHRcdFx0Y29uc3QgcGlja2VkID0gaXRlbXNbMF07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBwaWNrZWQuaXNVc2VyQ29uZmlnXG5cdFx0XHRcdFx0PyBhd2FpdCBzc2hTZXJ2aWNlLmVuc3VyZVVzZXJTU0hDb25maWcoKS5jYXRjaCgoKSA9PiB1c2VyQ29uZmlnVXJpKVxuXHRcdFx0XHRcdDogcGlja2VkLnVyaTtcblx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSBzYXRpc2ZpZXMgSVRleHRFZGl0b3JPcHRpb25zIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3NzaENvbmZpZ09wZW5GYWlsZWQnLCBcIkZhaWxlZCB0byBvcGVuIFNTSCBjb25maWcgZmlsZTogezB9XCIsIFN0cmluZyhlcnIpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgbmV3IFByb21pc2U8J2JhY2snIHwgSVNTSENvbmZpZ0ZpbGVQaWNrSXRlbSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHBpY2tlciA9IHN0b3JlLmFkZChxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVNTSENvbmZpZ0ZpbGVQaWNrSXRlbT4oKSk7XG5cdFx0XHRwaWNrZXIudGl0bGUgPSBsb2NhbGl6ZSgnc3NoQ29uZmlnUGlja1RpdGxlJywgXCJTZWxlY3QgU1NIIGNvbmZpZ3VyYXRpb24gZmlsZSB0byBlZGl0XCIpO1xuXHRcdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NzaENvbmZpZ1BpY2tQbGFjZWhvbGRlcicsIFwiU2VsZWN0IGFuIFNTSCBjb25maWd1cmF0aW9uIGZpbGVcIik7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHRcdGlmIChvbkJhY2spIHtcblx0XHRcdFx0cGlja2VyLmJ1dHRvbnMgPSBbcXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbl07XG5cdFx0XHR9XG5cdFx0XHRzdG9yZS5hZGQocGlja2VyLm9uRGlkVHJpZ2dlckJ1dHRvbihidXR0b24gPT4ge1xuXHRcdFx0XHRpZiAoYnV0dG9uID09PSBxdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgnYmFjaycpO1xuXHRcdFx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHBpY2tlci5zZWxlY3RlZEl0ZW1zWzBdKTtcblx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRwaWNrZXIuc2hvdygpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHBpY2tlZCA9PT0gJ2JhY2snKSB7XG5cdFx0XHRvbkJhY2s/LigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXBpY2tlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBJZiB0aGUgdXNlciBwaWNrZWQgdGhlIHVzZXIgY29uZmlnLCBlbnN1cmUgaXQgZXhpc3RzIChjcmVhdGluZyBpdCBvbiBkZW1hbmQpXG5cdFx0XHQvLyBiZWZvcmUgb3BlbmluZyBzbyB3ZSBkb24ndCB0cnkgdG8gb3BlbiBhIGZpbGUgdGhhdCdzIG5vdCB0aGVyZSB5ZXQuXG5cdFx0XHRjb25zdCB1cmkgPSBwaWNrZWQuaXNVc2VyQ29uZmlnXG5cdFx0XHRcdD8gYXdhaXQgc3NoU2VydmljZS5lbnN1cmVVc2VyU1NIQ29uZmlnKCkuY2F0Y2goKCkgPT4gdXNlckNvbmZpZ1VyaSlcblx0XHRcdFx0OiBwaWNrZWQudXJpO1xuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSBzYXRpc2ZpZXMgSVRleHRFZGl0b3JPcHRpb25zIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnc3NoQ29uZmlnT3BlbkZhaWxlZCcsIFwiRmFpbGVkIHRvIG9wZW4gU1NIIGNvbmZpZyBmaWxlOiB7MH1cIiwgU3RyaW5nKGVycikpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyAtLS0tIENvbm5lY3QgdmlhIERldiBUdW5uZWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVR1bm5lbFBpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSB0dW5uZWw6IElUdW5uZWxJbmZvO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9tcHRUb0Nvbm5lY3RWaWFUdW5uZWwoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRvcHRpb25zOiB7IHNob3dCYWNrQnV0dG9uPzogYm9vbGVhbiB9ID0ge30sXG4pOiBQcm9taXNlPCdiYWNrJyB8IHZvaWQ+IHtcblx0Y29uc3QgdHVubmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVHVubmVsQWdlbnRIb3N0U2VydmljZSk7XG5cdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBhdXRoZW50aWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRjb25zdCB0dW5uZWxIb3N0U2VydmljZSA9IGlzV2ViID8gdW5kZWZpbmVkIDogYWNjZXNzb3IuZ2V0KElUdW5uZWxIb3N0U2VydmljZSk7XG5cblx0Ly8gU3RlcCAxOiBEZXRlcm1pbmUgYXV0aCBwcm92aWRlciBcdTIwMTQgdHJ5IGNhY2hlZCBzZXNzaW9ucyBmaXJzdCwgdGhlbiBwcm9tcHRcblx0Ly8gVGhpcyB1c2VkIHRvIGNhbGwgdHVubmVsU2VydmljZS5nZXRBdXRoUHJvdmlkZXIsIGJ1dCBmb3Igbm93IHdlJ3JlIEdpdGh1Yi1cblx0Ly8gb25seSBmb3IgdGhlIHJlbW90ZSBBSCBjb25uZWN0aW9uLlxuXHRjb25zdCBhdXRoUHJvdmlkZXIgPSAnZ2l0aHViJztcblxuXHQvLyBUcmlnZ2VyIGludGVyYWN0aXZlIGF1dGggZm9yIHRoZSBjaG9zZW4gcHJvdmlkZXJcblx0Y29uc3Qgc2NvcGVzID0gcHJvZHVjdFNlcnZpY2UudHVubmVsQXBwbGljYXRpb25Db25maWc/LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzPy5bYXV0aFByb3ZpZGVyXT8uc2NvcGVzID8/IFtdO1xuXHR0cnkge1xuXHRcdGlmICghKGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhhdXRoUHJvdmlkZXIsIHNjb3BlcykpLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24oYXV0aFByb3ZpZGVyLCBzY29wZXMsIHsgYWN0aXZhdGVJbW1lZGlhdGU6IHRydWUgfSk7XG5cdFx0fVxuXHR9IGNhdGNoIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCd0dW5uZWxBdXRoRmFpbGVkJywgXCJBdXRoZW50aWNhdGlvbiBmYWlsZWQuIFBsZWFzZSB0cnkgYWdhaW4uXCIpKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBTdGVwIDI6IFNob3cgdHVubmVsIHBpY2tlciBpbW1lZGlhdGVseSBpbiBidXN5IHN0YXRlIHdoaWxlIGVudW1lcmF0aW5nXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCB0dW5uZWxQaWNrZXIgPSBzdG9yZS5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElUdW5uZWxQaWNrSXRlbT4oKSk7XG5cdHR1bm5lbFBpY2tlci50aXRsZSA9IGxvY2FsaXplKCd0dW5uZWxQaWNrVGl0bGUnLCBcIkNvbm5lY3QgdmlhIERldiBUdW5uZWxcIik7XG5cdHR1bm5lbFBpY2tlci5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCd0dW5uZWxQaWNrUGxhY2Vob2xkZXInLCBcIlNlbGVjdCBhIGRldiB0dW5uZWwgdG8gY29ubmVjdCB0b1wiKTtcblx0dHVubmVsUGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRpZiAob3B0aW9ucy5zaG93QmFja0J1dHRvbikge1xuXHRcdHR1bm5lbFBpY2tlci5idXR0b25zID0gW3F1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b25dO1xuXHR9XG5cdHR1bm5lbFBpY2tlci5zaG93KCk7XG5cblx0bGV0IHR1bm5lbHM6IElUdW5uZWxJbmZvW107XG5cdHRyeSB7XG5cdFx0dHVubmVscyA9IGF3YWl0IHR1bm5lbFNlcnZpY2UubGlzdFR1bm5lbHMoKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3R1bm5lbExpc3RGYWlsZWQnLCBcIkZhaWxlZCB0byBsaXN0IGRldiB0dW5uZWxzOiB7MH1cIiwgZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKHR1bm5lbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgndHVubmVsTm9uZUZvdW5kJywgXCJObyBkZXYgdHVubmVscyB3aXRoIGFnZW50IGhvc3Qgc3VwcG9ydCB3ZXJlIGZvdW5kLiBTdGFydCBhIHR1bm5lbCB3aXRoICdjb2RlIHR1bm5lbCcgb24gYW5vdGhlciBtYWNoaW5lLlwiKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgZGVsZXRlVHVubmVsQnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRyYXNoKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgndHVubmVsRGVsZXRlVG9vbHRpcCcsIFwiRGVsZXRlIERldiBUdW5uZWxcIiksXG5cdH07XG5cdGNvbnN0IGlzSG9zdGVkVHVubmVsID0gKHR1bm5lbDogSVR1bm5lbEluZm8pOiBib29sZWFuID0+IGlzVHVubmVsSG9zdGVkKHR1bm5lbEhvc3RTZXJ2aWNlPy5zaGFyaW5nSW5mbywgdHVubmVsKTtcblx0Y29uc3QgdG9UdW5uZWxQaWNrSXRlbXMgPSAodHVubmVsSW5mb3M6IHJlYWRvbmx5IElUdW5uZWxJbmZvW10pOiBJVHVubmVsUGlja0l0ZW1bXSA9PiB0dW5uZWxJbmZvc1xuXHRcdC5maWx0ZXIodHVubmVsID0+ICFpc0hvc3RlZFR1bm5lbCh0dW5uZWwpKVxuXHRcdC5tYXAodHVubmVsID0+ICh7XG5cdFx0XHRsYWJlbDogdHVubmVsLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogdHVubmVsLmhvc3RDb25uZWN0aW9uQ291bnQgPiAwXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3R1bm5lbFBpY2tPbmxpbmUnLCBcInswfSBcdTAwQjcgT25saW5lXCIsIHR1bm5lbC50dW5uZWxJZClcblx0XHRcdFx0OiBsb2NhbGl6ZSgndHVubmVsUGlja09mZmxpbmUnLCBcInswfSBcdTAwQjcgT2ZmbGluZVwiLCB0dW5uZWwudHVubmVsSWQpLFxuXHRcdFx0YnV0dG9uczogdHVubmVsU2VydmljZS5jYW5EZWxldGVUdW5uZWxzID8gW2RlbGV0ZVR1bm5lbEJ1dHRvbl0gOiB1bmRlZmluZWQsXG5cdFx0XHR0dW5uZWwsXG5cdFx0fSkpO1xuXG5cdGNvbnN0IHVwZGF0ZVR1bm5lbFBpY2tlckl0ZW1zID0gKCkgPT4ge1xuXHRcdHR1bm5lbFBpY2tlci5pdGVtcyA9IHRvVHVubmVsUGlja0l0ZW1zKHR1bm5lbHMpO1xuXHR9O1xuXHRpZiAodG9UdW5uZWxQaWNrSXRlbXModHVubmVscykubGVuZ3RoID09PSAwKSB7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgndHVubmVsT25seUxvY2FsRm91bmQnLCBcIlRoaXMgbWFjaGluZSBpcyBhbHJlYWR5IGhvc3RpbmcgdGhlIG9ubHkgYXZhaWxhYmxlIGRldiB0dW5uZWwuXCIpKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHR1cGRhdGVUdW5uZWxQaWNrZXJJdGVtcygpO1xuXHRpZiAodHVubmVsSG9zdFNlcnZpY2UpIHtcblx0XHRzdG9yZS5hZGQodHVubmVsSG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VTdGF0dXModXBkYXRlVHVubmVsUGlja2VySXRlbXMpKTtcblx0fVxuXHR0dW5uZWxQaWNrZXIuYnVzeSA9IGZhbHNlO1xuXG5cdC8vIFN0ZXAgMzogV2FpdCBmb3IgdXNlciBzZWxlY3Rpb25cblx0Y29uc3QgcGlja2VkID0gYXdhaXQgbmV3IFByb21pc2U8J2JhY2snIHwgSVR1bm5lbFBpY2tJdGVtIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHQvLyBXaGlsZSB0aGUgbW9kYWwgZGVsZXRlIGNvbmZpcm1hdGlvbiBpcyB1cCB0aGUgcGlja2VyIGxvc2VzIGZvY3VzIGFuZFxuXHRcdC8vIG1heSBoaWRlIGl0c2VsZi4gYGlzRGVsZXRpbmdgIHN1cHByZXNzZXMgdGhlIGhpZGUgaGFuZGxlciBmb3IgdGhhdFxuXHRcdC8vIHdpbmRvdyBzbyB0aGUgcGljayBpc24ndCBjYW5jZWxsZWQsIGFuZCB0aGUgcGlja2VyIGlzIHJlLXNob3duIG9uY2Vcblx0XHQvLyB0aGUgY29uZmlybWF0aW9uIHJlc29sdmVzLlxuXHRcdGxldCBpc0RlbGV0aW5nID0gZmFsc2U7XG5cdFx0c3RvcmUuYWRkKHR1bm5lbFBpY2tlci5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdGlmIChidXR0b24gPT09IHF1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b24pIHtcblx0XHRcdFx0cmVzb2x2ZSgnYmFjaycpO1xuXHRcdFx0XHR0dW5uZWxQaWNrZXIuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQodHVubmVsUGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGlmIChpc0RlbGV0aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBpY2tlZCA9IHR1bm5lbFBpY2tlci5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0aWYgKHBpY2tlZCAmJiBpc0hvc3RlZFR1bm5lbChwaWNrZWQudHVubmVsKSkge1xuXHRcdFx0XHR1cGRhdGVUdW5uZWxQaWNrZXJJdGVtcygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlKHBpY2tlZCk7XG5cdFx0XHR0dW5uZWxQaWNrZXIuaGlkZSgpO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQodHVubmVsUGlja2VyLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oYXN5bmMgZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmJ1dHRvbiAhPT0gZGVsZXRlVHVubmVsQnV0dG9uIHx8IGlzRGVsZXRpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmV2aW91c0lnbm9yZUZvY3VzT3V0ID0gdHVubmVsUGlja2VyLmlnbm9yZUZvY3VzT3V0O1xuXHRcdFx0aXNEZWxldGluZyA9IHRydWU7XG5cdFx0XHR0dW5uZWxQaWNrZXIuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0bGV0IGtlZXBPcGVuID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbiA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0dW5uZWxEZWxldGVDb25maXJtYXRpb24nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgZGV2IHR1bm5lbCAnezB9Jz9cIiwgZXZlbnQuaXRlbS50dW5uZWwubmFtZSksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgndHVubmVsRGVsZXRlRGV0YWlsJywgXCJUaGUgdHVubmVsIG1heSBiZSByZWNyZWF0ZWQgaWYgYSBtYWNoaW5lIHN0YXJ0cyBob3N0aW5nIGl0IGFnYWluLlwiKSxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgndHVubmVsRGVsZXRlQnV0dG9uJywgXCImJkRlbGV0ZVwiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghY29uZmlybWF0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHR1bm5lbFBpY2tlci5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0YXdhaXQgdHVubmVsU2VydmljZS5kZWxldGVUdW5uZWwoZXZlbnQuaXRlbS50dW5uZWwpO1xuXHRcdFx0XHR0dW5uZWxzID0gYXdhaXQgdHVubmVsU2VydmljZS5saXN0VHVubmVscygpO1xuXHRcdFx0XHRpZiAodG9UdW5uZWxQaWNrSXRlbXModHVubmVscykubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0a2VlcE9wZW4gPSBmYWxzZTtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ3R1bm5lbE5vbmVGb3VuZEFmdGVyRGVsZXRlJywgXCJObyBkZXYgdHVubmVscyB3aXRoIGFnZW50IGhvc3Qgc3VwcG9ydCB3ZXJlIGZvdW5kLiBTdGFydCBhIHR1bm5lbCB3aXRoICdjb2RlIHR1bm5lbCcgb24gYW5vdGhlciBtYWNoaW5lLlwiKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dXBkYXRlVHVubmVsUGlja2VySXRlbXMoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCd0dW5uZWxEZWxldGVGYWlsZWQnLCBcIkZhaWxlZCB0byBkZWxldGUgZGV2IHR1bm5lbCAnezB9JzogezF9XCIsIGV2ZW50Lml0ZW0udHVubmVsLm5hbWUsIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dHVubmVsUGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRcdFx0dHVubmVsUGlja2VyLmlnbm9yZUZvY3VzT3V0ID0gcHJldmlvdXNJZ25vcmVGb2N1c091dDtcblx0XHRcdFx0aXNEZWxldGluZyA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoa2VlcE9wZW4pIHtcblx0XHRcdFx0XHR0dW5uZWxQaWNrZXIuc2hvdygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFRoZSBwaWNrZXIgbWF5IGFscmVhZHkgYmUgaGlkZGVuIGJlaGluZCB0aGUgY29uZmlybWF0aW9uXG5cdFx0XHRcdFx0Ly8gZGlhbG9nLCBpbiB3aGljaCBjYXNlIGBoaWRlKClgIGlzIGEgbm8tb3AgYW5kIHdvdWxkIG5ldmVyXG5cdFx0XHRcdFx0Ly8gZmlyZSBgb25EaWRIaWRlYCwgc28gc2V0dGxlIHRoZSBwaWNrIGV4cGxpY2l0bHkgaGVyZS5cblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0dHVubmVsUGlja2VyLmhpZGUoKTtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHR1bm5lbFBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0aWYgKGlzRGVsZXRpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblx0fSk7XG5cblx0aWYgKHBpY2tlZCA9PT0gJ2JhY2snKSB7XG5cdFx0cmV0dXJuICdiYWNrJztcblx0fVxuXHRpZiAoIXBpY2tlZCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIFN0ZXAgNDogQ29ubmVjdCB0byB0aGUgdHVubmVsIHdpdGggcHJvZ3Jlc3Mgbm90aWZpY2F0aW9uXG5cdGNvbnN0IGhhbmRsZSA9IG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHVubmVsQ29ubmVjdGluZycsIFwiQ29ubmVjdGluZyB0byB0dW5uZWwgJ3swfScuLi5cIiwgcGlja2VkLnR1bm5lbC5uYW1lKSxcblx0XHRwcm9ncmVzczogeyBpbmZpbml0ZTogdHJ1ZSB9LFxuXHR9KTtcblxuXHR0cnkge1xuXHRcdC8vIGBjb25uZWN0YCBjYWNoZXMgdGhlIHR1bm5lbCBpbnRlcm5hbGx5IGJlZm9yZSB3aXJpbmcgdGhlIGxpdmVcblx0XHQvLyBjb25uZWN0aW9uIFx1MjAxNCBubyBzZXBhcmF0ZSBgY2FjaGVUdW5uZWxgIGNhbGwgbmVlZGVkIGhlcmUuXG5cdFx0YXdhaXQgdHVubmVsU2VydmljZS5jb25uZWN0KHBpY2tlZC50dW5uZWwsIGF1dGhQcm92aWRlcik7XG5cdFx0aGFuZGxlLmNsb3NlKCk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGhhbmRsZS5jbG9zZSgpO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3R1bm5lbENvbm5lY3RGYWlsZWQnLCBcIkZhaWxlZCB0byBjb25uZWN0IHRvIHR1bm5lbCAnezB9JzogezF9XCIsIHBpY2tlZC50dW5uZWwubmFtZSwgZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gU3RlcCA1OiBPcGVuIGZvbGRlciBwaWNrZXIgKHNhbWUgcGF0dGVybiBhcyBTU0gpXG5cdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHByb21wdEZvclR1bm5lbEZvbGRlcihhY2Nlc3NvciwgcGlja2VkLnR1bm5lbCkpO1xufVxuXG4vKipcbiAqIEFmdGVyIGEgc3VjY2Vzc2Z1bCB0dW5uZWwgY29ubmVjdGlvbiwgc2hvdyB0aGUgcmVtb3RlIGZvbGRlciBwaWNrZXIgYW5kXG4gKiBwcmUtc2VsZWN0IHRoZSBjaG9zZW4gZm9sZGVyIGluIHRoZSB3b3Jrc3BhY2UgcGlja2VyLlxuICovXG5hc3luYyBmdW5jdGlvbiBwcm9tcHRGb3JUdW5uZWxGb2xkZXIoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHR0dW5uZWw6IElUdW5uZWxJbmZvLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKTtcblx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXHRjb25zdCBzZXNzaW9uc1BhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1BhcnRTZXJ2aWNlKTtcblxuXHRjb25zdCB0dW5uZWxBZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsLnR1bm5lbElkfWA7XG5cblx0Ly8gVGhlIHByb3ZpZGVyIGlzIGNyZWF0ZWQgYnkgVHVubmVsQWdlbnRIb3N0Q29udHJpYnV0aW9uIHdoZW4gdGhlXG5cdC8vIHR1bm5lbCBpcyBjYWNoZWQgKHZpYSBvbkRpZENoYW5nZVR1bm5lbHMgLyBfcmVjb25jaWxlUHJvdmlkZXJzKS5cblx0Y29uc3QgcHJvdmlkZXIgPSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkuZmluZCgocCk6IHAgaXMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgPT4gaXNBZ2VudEhvc3RQcm92aWRlcihwKSAmJiBwLnJlbW90ZUFkZHJlc3MgPT09IHR1bm5lbEFkZHJlc3MpO1xuXHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gVXNlIHRoZSBwcm92aWRlcidzIGV4aXN0aW5nIGJyb3dzZSBhY3Rpb24gdG8gc2hvdyB0aGUgZm9sZGVyIHBpY2tlclxuXHRjb25zdCBicm93c2VBY3Rpb24gPSBwcm92aWRlci5icm93c2VBY3Rpb25zWzBdO1xuXHRpZiAoIWJyb3dzZUFjdGlvbikge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGJyb3dzZUFjdGlvbi5ydW4oKTtcblx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgZm9sZGVyVXJpID0gd29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdGlmICghZm9sZGVyVXJpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9uKCk7XG5cdHNlc3Npb25zUGFydFNlcnZpY2UuZ2V0U2Vzc2lvblZpZXcoc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCk/LnNlbGVjdFdvcmtzcGFjZShmb2xkZXJVcmksIHByb3ZpZGVyLmlkKTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZW1vdGVBZ2VudEhvc3RDb21tYW5kSWRzLmNvbm5lY3RWaWFUdW5uZWwsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25uZWN0VmlhVHVubmVsJywgXCJDb25uZWN0IHRvIFJlbW90ZSBBZ2VudCBIb3N0IHZpYSBEZXYgVHVubmVsXCIpLFxuXHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdjb25uZWN0VmlhVHVubmVsU2hvcnQnLCBcIlR1bm5lbHMuLi5cIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3VkLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkfWAsIHRydWUpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudXMuU2Vzc2lvbldvcmtzcGFjZU1hbmFnZSxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBTZXNzaW9uV29ya3NwYWNlUGlja2VyR3JvdXBDb250ZXh0LmlzRXF1YWxUbyhTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb25CYWNrPzogKCkgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb21wdFRvQ29ubmVjdFZpYVR1bm5lbChhY2Nlc3NvciwgeyBzaG93QmFja0J1dHRvbjogISFvbkJhY2sgfSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gJ2JhY2snKSB7XG5cdFx0XHRvbkJhY2s/LigpO1xuXHRcdH1cblx0fVxufSk7XG5cbi8vIC0tLS0gQ29ubmVjdCB2aWEgV1NMIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElXU0xEaXN0cm9QaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0cmVhZG9ubHkgZGlzdHJvOiBJV1NMRGlzdHJvO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9tcHRUb0Nvbm5lY3RWaWFXU0woXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRvcHRpb25zOiB7IHNob3dCYWNrQnV0dG9uPzogYm9vbGVhbiB9ID0ge30sXG4pOiBQcm9taXNlPCdiYWNrJyB8IHZvaWQ+IHtcblx0Y29uc3Qgd3NsU2VydmljZSA9IGFjY2Vzc29yLmdldChJV1NMUmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cblx0Y29uc3QgaW5zdGFsbEFjdGlvbiA9IG5ldyBBY3Rpb24oXG5cdFx0J3dzbC5vcGVuRG9jcycsXG5cdFx0bG9jYWxpemUoJ3dzbEluc3RhbGxEb2NzQWN0aW9uJywgXCJJbnN0YWxsIFdTTFwiKSxcblx0XHR1bmRlZmluZWQsXG5cdFx0dHJ1ZSxcblx0XHQoKSA9PiBvcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKFdTTF9JTlNUQUxMX0RPQ1NfVVJMKSksXG5cdCk7XG5cblx0aWYgKCEoYXdhaXQgd3NsU2VydmljZS5pc1dTTEF2YWlsYWJsZSgpKSkge1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3dzbE5vdEluc3RhbGxlZCcsIFwiV2luZG93cyBTdWJzeXN0ZW0gZm9yIExpbnV4IGlzIG5vdCBpbnN0YWxsZWQgb3Igbm90IGVuYWJsZWQuXCIpLFxuXHRcdFx0YWN0aW9uczogeyBwcmltYXJ5OiBbaW5zdGFsbEFjdGlvbl0gfSxcblx0XHR9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRsZXQgZGlzdHJvczogSVdTTERpc3Ryb1tdO1xuXHR0cnkge1xuXHRcdGRpc3Ryb3MgPSBhd2FpdCB3c2xTZXJ2aWNlLmxpc3REaXN0cm9zKCk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ1tXU0xdIGxpc3REaXN0cm9zIGZhaWxlZCcsIGVycik7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnd3NsTGlzdEZhaWxlZCcsIFwiRmFpbGVkIHRvIGxpc3QgV1NMIGRpc3RyaWJ1dGlvbnM6IHswfVwiLCB0b0Vycm9yTWVzc2FnZShlcnIpKSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKGRpc3Ryb3MubGVuZ3RoID09PSAwKSB7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnd3NsTm9EaXN0cm9zJywgXCJObyBXU0wgMiBkaXN0cmlidXRpb25zIGFyZSBpbnN0YWxsZWQuXCIpLFxuXHRcdFx0YWN0aW9uczogeyBwcmltYXJ5OiBbaW5zdGFsbEFjdGlvbl0gfSxcblx0XHR9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBpdGVtczogSVdTTERpc3Ryb1BpY2tJdGVtW10gPSBkaXN0cm9zLm1hcChkID0+ICh7XG5cdFx0bGFiZWw6IGQubmFtZSxcblx0XHRkZXNjcmlwdGlvbjogZC5pc1J1bm5pbmcgPyBsb2NhbGl6ZSgnd3NsRGlzdHJvUnVubmluZycsIFwiUnVubmluZ1wiKSA6IGxvY2FsaXplKCd3c2xEaXN0cm9TdG9wcGVkJywgXCJTdG9wcGVkXCIpLFxuXHRcdGRldGFpbDogZC5pc0RlZmF1bHQgPyBsb2NhbGl6ZSgnd3NsRGlzdHJvRGVmYXVsdCcsIFwiRGVmYXVsdCBkaXN0cmlidXRpb25cIikgOiB1bmRlZmluZWQsXG5cdFx0ZGlzdHJvOiBkLFxuXHR9KSk7XG5cblx0bGV0IHBpY2tlZDogSVdTTERpc3Ryb1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXHRpZiAoaXRlbXMubGVuZ3RoID09PSAxICYmICFvcHRpb25zLnNob3dCYWNrQnV0dG9uKSB7XG5cdFx0cGlja2VkID0gaXRlbXNbMF07XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8J2JhY2snIHwgSVdTTERpc3Ryb1BpY2tJdGVtIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcGlja2VyID0gc3RvcmUuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJV1NMRGlzdHJvUGlja0l0ZW0+KCkpO1xuXHRcdFx0cGlja2VyLnRpdGxlID0gbG9jYWxpemUoJ3dzbFBpY2tUaXRsZScsIFwiQ29ubmVjdCB2aWEgV1NMXCIpO1xuXHRcdFx0cGlja2VyLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3dzbFBpY2tQbGFjZWhvbGRlcicsIFwiU2VsZWN0IGEgV1NMIGRpc3RyaWJ1dGlvbiB0byBjb25uZWN0IHRvXCIpO1xuXHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRpZiAob3B0aW9ucy5zaG93QmFja0J1dHRvbikge1xuXHRcdFx0XHRwaWNrZXIuYnV0dG9ucyA9IFtxdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uXTtcblx0XHRcdH1cblx0XHRcdHN0b3JlLmFkZChwaWNrZXIub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRcdGlmIChidXR0b24gPT09IHF1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b24pIHtcblx0XHRcdFx0XHRyZXNvbHZlKCdiYWNrJyk7XG5cdFx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGlja2VyLnNlbGVjdGVkSXRlbXNbMF0pO1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdHBpY2tlci5zaG93KCk7XG5cdFx0fSk7XG5cblx0XHRpZiAocmVzdWx0ID09PSAnYmFjaycpIHtcblx0XHRcdHJldHVybiAnYmFjayc7XG5cdFx0fVxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHBpY2tlZCA9IHJlc3VsdDtcblx0fVxuXG5cdGNvbnN0IGhhbmRsZSA9IG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnd3NsQ29ubmVjdGluZycsIFwiQ29ubmVjdGluZyB0byBXU0wgZGlzdHJpYnV0aW9uICd7MH0nLi4uXCIsIHBpY2tlZC5kaXN0cm8ubmFtZSksXG5cdFx0cHJvZ3Jlc3M6IHsgaW5maW5pdGU6IHRydWUgfSxcblx0fSk7XG5cblx0Y29uc3QgZXhwZWN0ZWRLZXkgPSBgd3NsOiR7cGlja2VkLmRpc3Ryby5uYW1lfWA7XG5cdGNvbnN0IHByb2dyZXNzTGlzdGVuZXIgPSB3c2xTZXJ2aWNlLm9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzPy4ocHJvZ3Jlc3MgPT4ge1xuXHRcdGlmIChwcm9ncmVzcy5jb25uZWN0aW9uS2V5ID09PSBleHBlY3RlZEtleSkge1xuXHRcdFx0aGFuZGxlLnVwZGF0ZU1lc3NhZ2UocHJvZ3Jlc3MubWVzc2FnZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0cnkge1xuXHRcdGF3YWl0IHdzbFNlcnZpY2UuY29ubmVjdCh7IGRpc3RybzogcGlja2VkLmRpc3Ryby5uYW1lLCBuYW1lOiBwaWNrZWQuZGlzdHJvLm5hbWUgfSk7XG5cdFx0aGFuZGxlLmNsb3NlKCk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGhhbmRsZS5jbG9zZSgpO1xuXHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bG9nU2VydmljZS5lcnJvcihgW1dTTF0gQ29ubmVjdCB0byAnJHtwaWNrZWQuZGlzdHJvLm5hbWV9JyBmYWlsZWRgLCBlcnIpO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3dzbENvbm5lY3RGYWlsZWQnLCBcIkZhaWxlZCB0byBjb25uZWN0IHRvIFdTTCBkaXN0cmlidXRpb24gJ3swfSc6IHsxfVwiLCBwaWNrZWQuZGlzdHJvLm5hbWUsIHRvRXJyb3JNZXNzYWdlKGVycikpKTtcblx0XHRyZXR1cm47XG5cdH0gZmluYWxseSB7XG5cdFx0cHJvZ3Jlc3NMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHR9XG5cblx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gcHJvbXB0Rm9yV1NMRm9sZGVyKGFjY2Vzc29yLCBwaWNrZWQuZGlzdHJvLm5hbWUpKTtcbn1cblxuLyoqXG4gKiBBZnRlciBhIHN1Y2Nlc3NmdWwgV1NMIGNvbm5lY3Rpb24sIHNob3cgdGhlIHJlbW90ZSBmb2xkZXIgcGlja2VyIGFuZFxuICogcHJlLXNlbGVjdCB0aGUgY2hvc2VuIGZvbGRlciBpbiB0aGUgd29ya3NwYWNlIHBpY2tlci5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcHJvbXB0Rm9yV1NMRm9sZGVyKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0ZGlzdHJvOiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3Qgc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UpO1xuXHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IHNlc3Npb25zUGFydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUGFydFNlcnZpY2UpO1xuXG5cdGNvbnN0IHdzbEFkZHJlc3MgPSBgd3NsOiR7ZGlzdHJvfWA7XG5cdGNvbnN0IHByb3ZpZGVyID0gc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpLmZpbmQoKHApOiBwIGlzIElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyID0+IGlzQWdlbnRIb3N0UHJvdmlkZXIocCkgJiYgcC5yZW1vdGVBZGRyZXNzID09PSB3c2xBZGRyZXNzKTtcblx0aWYgKCFwcm92aWRlcikge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGJyb3dzZUFjdGlvbiA9IHByb3ZpZGVyLmJyb3dzZUFjdGlvbnNbMF07XG5cdGlmICghYnJvd3NlQWN0aW9uKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgYnJvd3NlQWN0aW9uLnJ1bigpO1xuXHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBmb2xkZXJVcmkgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0aWYgKCFmb2xkZXJVcmkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRzZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb24oKTtcblx0c2Vzc2lvbnNQYXJ0U2VydmljZS5nZXRTZXNzaW9uVmlldyhzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkKT8uc2VsZWN0V29ya3NwYWNlKGZvbGRlclVyaSwgcHJvdmlkZXIuaWQpO1xufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJlbW90ZUFnZW50SG9zdENvbW1hbmRJZHMuY29ubmVjdFZpYVdTTCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nvbm5lY3RWaWFXU0wnLCBcIkNvbm5lY3QgdG8gUmVtb3RlIEFnZW50IEhvc3QgdmlhIFdTTFwiKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignY29ubmVjdFZpYVdTTFNob3J0JywgXCJXU0wuLi5cIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsTGludXgsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdpc1dpbmRvd3MnLCB0cnVlKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZH1gLCB0cnVlKSxcblx0XHRcdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uV29ya3NwYWNlTWFuYWdlLFxuXHRcdFx0XHRvcmRlcjogMTUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2lzV2luZG93cycsIHRydWUpLFxuXHRcdFx0XHRcdFNlc3Npb25Xb3Jrc3BhY2VQaWNrZXJHcm91cENvbnRleHQuaXNFcXVhbFRvKFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSksXG5cdFx0XHRcdCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvbkJhY2s/OiAoKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvbXB0VG9Db25uZWN0VmlhV1NMKGFjY2Vzc29yLCB7IHNob3dCYWNrQnV0dG9uOiAhIW9uQmFjayB9KTtcblx0XHRpZiAocmVzdWx0ID09PSAnYmFjaycpIHtcblx0XHRcdG9uQmFjaz8uKCk7XG5cdFx0fVxuXHR9XG59KTtcblxuLyoqXG4gKiBGb3JjZS11cGRhdGUgYSByZW1vdGUgYWdlbnQgaG9zdCBzZXJ2ZXIgdGhhdCByZWplY3RlZCBvdXIgcHJvdG9jb2xcbiAqIHZlcnNpb24gYmVjYXVzZSBpdCBpcyBydW5uaW5nIGFuIG9sZCBidWlsZC4gQ29ubmVjdGluZyB0byBzdWNoIGEgaG9zdFxuICogbGVhdmVzIGl0IGluIHRoZSBgaW5jb21wYXRpYmxlYCBzdGF0ZTsgd2hlbiB0aGUgaG9zdCB3YXMgc3Bhd25lZCBieSBhXG4gKiBWUyBDb2RlIENMSSB3aWxsaW5nIHRvIHJlY2VpdmUgdXBncmFkZSBzaWduYWxzIGl0IGFkdmVydGlzZXMgYW4gdXBncmFkZVxuICogbWV0aG9kLCB3aGljaCB0aGlzIGNvbW1hbmQgaW52b2tlcyB2aWEgdGhlIHNoYXJlZCB7QGxpbmsgcnVuU2VydmVyVXBncmFkZX1cbiAqIGZsb3cuIEV4cG9zZWQgaW4gdGhlIGNvbW1hbmQgcGFsZXR0ZSBzbyB0aGUgdXBkYXRlIGlzIHJlYWNoYWJsZSB3aXRob3V0XG4gKiBmaXJzdCBvcGVuaW5nIHRoZSBob3N0J3Mgb3B0aW9ucyBxdWlja3BpY2suXG4gKi9cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVtb3RlQWdlbnRIb3N0Q29tbWFuZElkcy51cGRhdGVSZW1vdGVBZ2VudEhvc3QsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd1cGRhdGVSZW1vdGVBZ2VudEhvc3QnLCBcIlVwZGF0ZSBSZW1vdGUgQWdlbnQgSG9zdCBTZXJ2ZXIuLi5cIiksXG5cdFx0XHRjYXRlZ29yeTogU2Vzc2lvbnNDYXRlZ29yaWVzLlNlc3Npb25zLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7UmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWR9YCwgdHJ1ZSksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVtb3RlSG9zdHMgPSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKClcblx0XHRcdC5maWx0ZXIoaXNBZ2VudEhvc3RQcm92aWRlcilcblx0XHRcdC5maWx0ZXIocHJvdmlkZXIgPT4gISFwcm92aWRlci5yZW1vdGVBZGRyZXNzKTtcblx0XHRsZXQgaW5jb21wYXRpYmxlQ291bnQgPSAwO1xuXHRcdGNvbnN0IHVwZ3JhZGFibGUgPSByZW1vdGVIb3N0c1xuXHRcdFx0Lm1hcChwcm92aWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXM/LmdldCgpO1xuXHRcdFx0XHRpZiAoIVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoc3RhdHVzKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5jb21wYXRpYmxlQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHN0YXR1cy52c2NvZGVVcGdyYWRlTWV0aG9kID8geyBwcm92aWRlciwgbWV0aG9kOiBzdGF0dXMudnNjb2RlVXBncmFkZU1ldGhvZCB9IDogdW5kZWZpbmVkO1xuXHRcdFx0fSlcblx0XHRcdC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgeyBwcm92aWRlcjogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI7IG1ldGhvZDogc3RyaW5nIH0gPT4gISFlbnRyeSk7XG5cblx0XHRpZiAodXBncmFkYWJsZS5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIERpc3Rpbmd1aXNoIFwibm90aGluZyBpcyBpbmNvbXBhdGlibGVcIiBmcm9tIFwiaW5jb21wYXRpYmxlIGhvc3RzIGV4aXN0XG5cdFx0XHQvLyBidXQgbm9uZSB3YXMgc3Bhd25lZCBieSBhIFZTIENvZGUgQ0xJIHRoYXQgY2FuIHVwZGF0ZSBpdCBpbiBwbGFjZVwiLlxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGluY29tcGF0aWJsZUNvdW50ID4gMFxuXHRcdFx0XHQ/IGxvY2FsaXplKCd1cGRhdGVSZW1vdGVBZ2VudEhvc3Qubm9uZVVwZ3JhZGFibGUnLCBcIk5vIHJlbW90ZSBhZ2VudCBob3N0cyBjYW4gYmUgdXBkYXRlZCBmcm9tIGhlcmUuIEluY29tcGF0aWJsZSBob3N0cyBtdXN0IGJlIHVwZGF0ZWQgbWFudWFsbHksIHRoZW4gcmVjb25uZWN0ZWQuXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3VwZGF0ZVJlbW90ZUFnZW50SG9zdC5ub25lJywgXCJObyByZW1vdGUgYWdlbnQgaG9zdHMgbmVlZCB1cGRhdGluZy5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB0YXJnZXQgPSB1cGdyYWRhYmxlWzBdO1xuXHRcdGlmICh1cGdyYWRhYmxlLmxlbmd0aCA+IDEpIHtcblx0XHRcdHR5cGUgVXBkYXRlSG9zdFBpY2tJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IGVudHJ5OiB7IHByb3ZpZGVyOiBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcjsgbWV0aG9kOiBzdHJpbmcgfSB9O1xuXHRcdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljazxVcGRhdGVIb3N0UGlja0l0ZW0+KFxuXHRcdFx0XHR1cGdyYWRhYmxlLm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0XHRcdGxhYmVsOiBlbnRyeS5wcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZW50cnkucHJvdmlkZXIucmVtb3RlQWRkcmVzcyxcblx0XHRcdFx0XHRlbnRyeSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHR7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgndXBkYXRlUmVtb3RlQWdlbnRIb3N0LnBpY2snLCBcIlNlbGVjdCBhIHJlbW90ZSBhZ2VudCBob3N0IHRvIHVwZGF0ZVwiKSB9LFxuXHRcdFx0KTtcblx0XHRcdGlmICghcGlja2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRhcmdldCA9IHBpY2tlZC5lbnRyeTtcblx0XHR9XG5cblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihydW5TZXJ2ZXJVcGdyYWRlLCB0YXJnZXQucHJvdmlkZXIsIHRhcmdldC5tZXRob2QpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFFN0IsU0FBc0Isb0JBQW9CO0FBQzFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QiwyQkFBMkIsaUNBQWlDLDBCQUEwQixxQ0FBcUMsd0NBQXdDO0FBQ3JNLFNBQVMsNEJBQTRCLHlCQUF5QixxQkFBc0c7QUFDcEssU0FBUyxnQkFBZ0IseUJBQXlCLDZCQUErQztBQUNqRyxTQUFTLDRCQUE0Qiw0QkFBNkM7QUFDbEYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQTRCLDBCQUEwQztBQUN0RSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQiw0QkFBNEI7QUFDaEUsU0FBUywwQ0FB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
