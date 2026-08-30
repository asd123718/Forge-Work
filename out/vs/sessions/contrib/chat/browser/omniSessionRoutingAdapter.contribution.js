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
import { Codicon } from "../../../../base/common/codicons.js";
import { getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IChatSessionsService } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { IChatSessionRoutingProviderService, ROUTER_FIELD_CLIP_LENGTH } from "../../../../workbench/contrib/chat/common/sessionRouter.js";
import { isAgentHostProvider } from "../../../common/agentHostSessionsProvider.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsRecentWorkspacesService } from "../../../services/sessions/browser/sessionsRecentWorkspacesService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ChatInteractivity, SESSION_WORKSPACE_GROUP_LOCAL, SessionStatus } from "../../../services/sessions/common/session.js";
import { ISessionsManagementService, WorkspaceNotTrustedError } from "../../../services/sessions/common/sessionsManagement.js";
import { SessionWorkspaceFallback } from "./sessionWorkspaceFallback.js";
import { buildSessionWorkspacePickerCatalog } from "./sessionWorkspacePickerModel.js";
class OmniSessionRoutingAdapter extends Disposable {
  constructor(sessionsManagementService, sessionsService, chatSessionsService, sessionsProvidersService, recentWorkspacesService, configurationService, fileDialogService, fileService, uriIdentityService, logService, notificationService) {
    super();
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsService = sessionsService;
    this.chatSessionsService = chatSessionsService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.recentWorkspacesService = recentWorkspacesService;
    this.configurationService = configurationService;
    this.fileDialogService = fileDialogService;
    this.logService = logService;
    this.notificationService = notificationService;
    this.sessions = /* @__PURE__ */ new Map();
    this.sessionResourceAliases = /* @__PURE__ */ new Map();
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidChangeNewSessionWorkspaceCatalog = this._register(new Emitter());
    this.onDidChangeNewSessionWorkspaceCatalog = this._onDidChangeNewSessionWorkspaceCatalog.event;
    this.localBrowseAction = {
      label: localize("omniSessionRouting.selectLocalWorkspace", "Select..."),
      group: SESSION_WORKSPACE_GROUP_LOCAL,
      icon: Codicon.folderOpened,
      providerId: "",
      run: async () => void 0
    };
    this.sessionWorkspaceFallback = this._register(new SessionWorkspaceFallback({
      canUseProvider: () => true,
      isProviderUnavailable: (providerId) => this._isProviderUnavailable(providerId),
      resolveWorkspace: (folderUri, preferredProviderId) => this._resolveWorkspace(folderUri, preferredProviderId)
    }, this.sessionsProvidersService, fileService, uriIdentityService));
    this._register(this.sessionWorkspaceFallback.onDidChange(() => this._onDidChangeNewSessionWorkspaceCatalog.fire()));
    this._refreshSessions();
    this._register(this.sessionsManagementService.onDidChangeSessions(() => {
      this._refreshSessions();
      this._onDidChangeSessions.fire();
    }));
    this._register(this.sessionsManagementService.onDidReplaceSession(({ from, to }) => {
      this.sessionResourceAliases.set(from.resource.toString(), to.resource);
      this.sessionResourceAliases.set(from.mainChat.get().resource.toString(), to.mainChat.get().resource);
      this._refreshSessions();
      this._onDidChangeSessions.fire();
    }));
    this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
      this._refreshSessions();
      this._onDidChangeSessions.fire();
      this._onDidChangeNewSessionWorkspaceCatalog.fire();
    }));
    this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
      this.sessionWorkspaceFallback.refreshProviders();
      this._onDidChangeNewSessionWorkspaceCatalog.fire();
    }));
    this._register(this.recentWorkspacesService.onDidChangeRecentWorkspaces(() => this._onDidChangeNewSessionWorkspaceCatalog.fire()));
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
        this._onDidChangeNewSessionWorkspaceCatalog.fire();
      }
    }));
  }
  getCandidateSessions(token) {
    if (token.isCancellationRequested) {
      return [];
    }
    this._refreshSessions();
    return [...this.sessions.values()].map((session) => this._toCandidate(session));
  }
  async getSessionSnapshot(resource, token) {
    if (token.isCancellationRequested) {
      return void 0;
    }
    const target = this._resolveTarget(this._resolveSessionResourceAlias(resource).toString());
    if (!target) {
      return void 0;
    }
    const candidate = this._toCandidate(target.session);
    try {
      const history = await this.chatSessionsService.getChatSessionHistory(target.chat.resource, token);
      return token.isCancellationRequested ? void 0 : this._withHistory(candidate, history);
    } catch (error) {
      if (!isCancellationError(error) && !token.isCancellationRequested) {
        this.logService.trace("[omniSessionRouting] Failed to read session response preview", error);
      }
      return token.isCancellationRequested ? void 0 : candidate;
    }
  }
  watchSession(resource, listener) {
    const store = new DisposableStore();
    const observableWatcher = store.add(new MutableDisposable());
    let watchedSession;
    let watchedChat;
    const bind = () => {
      const target = this._resolveTarget(this._resolveSessionResourceAlias(resource).toString());
      if (target?.session === watchedSession && target?.chat === watchedChat) {
        return;
      }
      watchedSession = target?.session;
      watchedChat = target?.chat;
      const session = target?.session;
      observableWatcher.value = session ? autorun((reader) => {
        session.title.read(reader);
        session.status.read(reader);
        session.updatedAt.read(reader);
        session.lastTurnEnd.read(reader);
        listener();
      }) : void 0;
    };
    store.add(this.onDidChangeSessions(bind));
    bind();
    return store;
  }
  async getNewSessionWorkspaceCatalog() {
    const providers = this.sessionsProvidersService.getProviders();
    const catalog = buildSessionWorkspacePickerCatalog({
      providers,
      recentWorkspaces: this.recentWorkspacesService.getRecentWorkspaces(),
      ownRecentWorkspaces: this.recentWorkspacesService.getRecentWorkspaces(false),
      localBrowseAction: providers.some((provider) => provider.supportsLocalWorkspaces) ? this.localBrowseAction : void 0,
      remoteAgentHostsEnabled: this.configurationService.getValue(RemoteAgentHostsEnabledSettingId),
      isProviderUnavailable: (providerId) => this._isProviderUnavailable(providerId)
    });
    const defaultWorkspace = catalog.defaultWorkspace ?? await this.sessionWorkspaceFallback.findWorkspace();
    return {
      groups: catalog.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        tooltip: tab.tooltip,
        icon: tab.icon
      })),
      workspaces: catalog.workspaces.map((recent) => this._toRoutingWorkspace(recent.workspace, recent.providerId)),
      browseActions: catalog.browseActions.map((action) => ({
        id: this._getBrowseActionId(action),
        providerId: action.providerId || void 0,
        group: action.group,
        label: localize("omniSessionRouting.selectWorkspace", "Select..."),
        description: action.description,
        icon: action.icon,
        disabled: !!action.providerId && this._isProviderUnavailable(action.providerId)
      })),
      defaultWorkspace: defaultWorkspace ? this._toRoutingWorkspace(defaultWorkspace.workspace, defaultWorkspace.providerId) : void 0
    };
  }
  selectNewSessionWorkspace(workspace) {
    const provider = this.sessionsProvidersService.getProvider(workspace.providerId);
    if (!provider?.resolveWorkspace(workspace.uri)) {
      throw new Error(localize("omniSessionRouting.workspaceProviderUnavailable", "The selected workspace provider is no longer available."));
    }
    this.recentWorkspacesService.addRecentWorkspace(workspace.uri, workspace.providerId, true);
  }
  async browseNewSessionWorkspace(actionId, token) {
    if (token.isCancellationRequested) {
      return void 0;
    }
    try {
      if (actionId === "local") {
        return await this._browseForLocalWorkspace(token);
      }
      const action = this._findBrowseAction(actionId);
      if (!action) {
        throw new Error(localize("omniSessionRouting.workspaceBrowseUnavailable", "The selected workspace browser is no longer available."));
      }
      const workspace = await action.run();
      if (!workspace || token.isCancellationRequested) {
        return void 0;
      }
      const folderUri = workspace.folders[0]?.root;
      const provider = this.sessionsProvidersService.getProvider(action.providerId);
      if (!folderUri || !provider?.resolveWorkspace(folderUri)) {
        throw new Error(localize("omniSessionRouting.workspaceProviderUnavailable", "The selected workspace provider is no longer available."));
      }
      return this._toRoutingWorkspace(workspace, action.providerId);
    } catch (error) {
      if (!isCancellationError(error) && !token.isCancellationRequested) {
        this.logService.error("[omniSessionRouting] Failed to browse for a workspace", error);
        this.notificationService.error(localize("omniSessionRouting.workspaceBrowseFailed", "Unable to select a workspace."));
      }
      return void 0;
    }
  }
  resolveSessionResource(sessionId) {
    return this._resolveTarget(sessionId)?.chat.resource;
  }
  async dispatchToSession(sessionId, message, options, token) {
    if (token.isCancellationRequested) {
      return this._cancelled();
    }
    const target = this._resolveTarget(sessionId);
    if (!target) {
      return {
        status: "rejected",
        reasonCode: "providerRemoved",
        reason: localize("omniSessionRouting.sessionUnavailable", "The selected session is no longer available.")
      };
    }
    const unsupported = this._getUnsupportedOptions(options);
    if (unsupported) {
      return unsupported;
    }
    try {
      const activityBaseline = target.session.lastTurnEnd.get()?.getTime() ?? target.session.updatedAt.get().getTime();
      await this.sessionsManagementService.sendRequest(target.session, target.chat, {
        query: message,
        attachedContext: options.attachedContext?.length ? [...options.attachedContext] : void 0,
        background: true
      });
      return { status: "sent", resource: target.chat.resource, activityBaseline };
    } catch (error) {
      return this._toRejectedResult(error, target.chat.resource);
    }
  }
  async dispatchToNewSession(target, message, options, token) {
    if (token.isCancellationRequested) {
      return this._cancelled();
    }
    const unsupported = this._getUnsupportedOptions(options);
    if (unsupported) {
      return unsupported;
    }
    const sendOptions = {
      query: message,
      attachedContext: options.attachedContext?.length ? [...options.attachedContext] : void 0,
      background: true
    };
    if (target.providerId) {
      const provider = this.sessionsProvidersService.getProvider(target.providerId);
      const canCreate = target.folder ? !!provider?.resolveWorkspace(target.folder) : !!provider?.supportsQuickChats;
      if (!canCreate) {
        return {
          status: "rejected",
          reasonCode: "providerRemoved",
          reason: localize("omniSessionRouting.workspaceProviderUnavailable", "The selected workspace provider is no longer available.")
        };
      }
    }
    const createOptions = this._toCreateOptions(options, target.providerId);
    try {
      const session = target.folder ? await this.sessionsManagementService.createAndSendNewChatRequest(target.folder, sendOptions, createOptions, token) : await this.sessionsManagementService.createAndSendQuickChatRequest(sendOptions, createOptions, token);
      if (!session) {
        return {
          status: "rejected",
          reasonCode: "providerRemoved",
          reason: localize("omniSessionRouting.sessionNotCreated", "The Sessions provider could not create the new session.")
        };
      }
      return { status: "sent", resource: session.mainChat.get().resource, activityBaseline: session.createdAt.getTime() };
    } catch (error) {
      return this._toRejectedResult(error);
    }
  }
  revealSession(resource) {
    const resolved = this._resolveSessionResourceAlias(resource);
    return this.sessionsService.openSession(this._resolveTarget(resolved.toString())?.session.resource ?? resolved);
  }
  _resolveSessionResourceAlias(resource) {
    let resolved = resource;
    const visited = /* @__PURE__ */ new Set();
    while (!visited.has(resolved.toString())) {
      visited.add(resolved.toString());
      const replacement = this.sessionResourceAliases.get(resolved.toString());
      if (!replacement) {
        break;
      }
      resolved = replacement;
    }
    return resolved;
  }
  _refreshSessions() {
    this.sessions.clear();
    for (const session of this.sessionsManagementService.getSessions()) {
      if (this._getRoutableChat(session)) {
        this.sessions.set(session.sessionId, session);
      }
    }
  }
  _toRoutingWorkspace(workspace, providerId) {
    const folderUri = workspace.folders[0]?.root ?? workspace.uri;
    return {
      uri: folderUri,
      providerId,
      group: workspace.group,
      label: workspace.label,
      description: workspace.description,
      icon: workspace.icon,
      disabled: this._isProviderUnavailable(providerId)
    };
  }
  _resolveWorkspace(folderUri, preferredProviderId) {
    if (preferredProviderId) {
      const provider = this.sessionsProvidersService.getProvider(preferredProviderId);
      const workspace = provider?.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: preferredProviderId, workspace };
      }
    }
    for (const provider of this.sessionsProvidersService.getProviders()) {
      const workspace = provider.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: provider.id, workspace };
      }
    }
    return void 0;
  }
  _getBrowseActionId(action) {
    if (action === this.localBrowseAction) {
      return "local";
    }
    const provider = this.sessionsProvidersService.getProvider(action.providerId);
    const index = provider?.browseActions.indexOf(action) ?? -1;
    return `provider:${encodeURIComponent(action.providerId)}:${index}`;
  }
  _findBrowseAction(actionId) {
    for (const provider of this.sessionsProvidersService.getProviders()) {
      for (let index = 0; index < provider.browseActions.length; index++) {
        const action = provider.browseActions[index];
        if (actionId === `provider:${encodeURIComponent(provider.id)}:${index}`) {
          return action;
        }
      }
    }
    return void 0;
  }
  async _browseForLocalWorkspace(token) {
    const providers = this.sessionsProvidersService.getProviders().filter((provider) => provider.supportsLocalWorkspaces);
    if (!providers.length) {
      throw new Error(localize("omniSessionRouting.localWorkspaceProviderUnavailable", "No local workspace provider is available."));
    }
    const selected = await this.fileDialogService.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false
    });
    if (!selected?.length || token.isCancellationRequested) {
      return void 0;
    }
    for (const provider of providers) {
      const workspace = provider.resolveWorkspace(selected[0]);
      if (workspace) {
        return this._toRoutingWorkspace(workspace, provider.id);
      }
    }
    throw new Error(localize("omniSessionRouting.localWorkspaceUnsupported", "No Sessions provider can use the selected folder."));
  }
  _isProviderUnavailable(providerId) {
    const provider = this.sessionsProvidersService.getProvider(providerId);
    if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
      return false;
    }
    const status = provider.connectionStatus.get();
    return RemoteAgentHostConnectionStatus.isIncompatible(status) || !RemoteAgentHostConnectionStatus.isConnected(status) && !provider.canConnectOnDemand;
  }
  _resolveTarget(sessionId) {
    this._refreshSessions();
    const session = this.sessions.get(sessionId) ?? this._findSessionByResource(sessionId);
    if (!session) {
      return void 0;
    }
    const chat = this._findChatByResource(session, sessionId) ?? this._getRoutableChat(session);
    return chat ? { session, chat } : void 0;
  }
  _findSessionByResource(value) {
    let resource;
    try {
      resource = URI.parse(value);
    } catch {
      return void 0;
    }
    const session = this.sessionsManagementService.getSession(resource) ?? this.sessionsManagementService.getSessionForChatResource(resource)?.session;
    return session && this.sessions.has(session.sessionId) ? session : void 0;
  }
  _findChatByResource(session, value) {
    return session.chats.get().find((chat) => chat.resource.toString() === value && this._isRoutableChat(chat));
  }
  _getRoutableChat(session) {
    if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || session.isAutomation?.get()) {
      return void 0;
    }
    const mainChat = session.mainChat.get();
    if (this._isRoutableChat(mainChat)) {
      return mainChat;
    }
    return [...session.chats.get()].filter((chat) => this._isRoutableChat(chat)).sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime())[0];
  }
  _isRoutableChat(chat) {
    return chat.status.get() !== SessionStatus.Untitled && !chat.isArchived.get() && chat.interactivity.get() === ChatInteractivity.Full;
  }
  _toCandidate(session) {
    const workspace = session.workspace.get();
    const folder = workspace?.folders[0];
    const gitHubInfo = folder?.gitRepository?.gitHubInfo.get();
    return {
      sessionId: session.sessionId,
      resource: session.resource,
      label: session.title.get(),
      repo: gitHubInfo ? `${gitHubInfo.owner}/${gitHubInfo.repo}` : void 0,
      cwd: folder?.workingDirectory.path,
      status: this._statusToString(session.status.get()),
      lastActivity: session.lastTurnEnd.get()?.getTime() ?? session.updatedAt.get().getTime(),
      description: this._markdownToText(session.description.get())
    };
  }
  _withHistory(candidate, history) {
    let lastResponse;
    for (const item of history) {
      if (item.type !== "response") {
        continue;
      }
      for (let index = item.parts.length - 1; index >= 0; index--) {
        const part = item.parts[index];
        if (part.kind === "markdownContent" && part.content.value.trim()) {
          lastResponse = part.content.value.trim().slice(0, ROUTER_FIELD_CLIP_LENGTH * 2);
          break;
        }
      }
    }
    return lastResponse ? { ...candidate, lastResponse } : candidate;
  }
  _statusToString(status) {
    switch (status) {
      case SessionStatus.InProgress:
        return "working";
      case SessionStatus.NeedsInput:
        return "needsInput";
      case SessionStatus.Completed:
        return "idle";
      case SessionStatus.Error:
        return "failed";
      case SessionStatus.Untitled:
        return "draft";
    }
  }
  _markdownToText(value) {
    const text = value?.value.trim();
    return text || void 0;
  }
  _getUnsupportedOptions(options) {
    if (options.userSelectedTools && Object.values(options.userSelectedTools.get()).some((enabled) => !enabled)) {
      return this._unsupported(localize("omniSessionRouting.toolsUnsupported", "The selected tool configuration cannot be sent through Sessions."));
    }
    if (options.resolvedVariables?.length) {
      return this._unsupported(localize("omniSessionRouting.variablesUnsupported", "Resolved request variables cannot be sent through Sessions."));
    }
    if (options.agentHostSessionConfig && Object.keys(options.agentHostSessionConfig).length) {
      return this._unsupported(localize("omniSessionRouting.sessionConfigurationUnsupported", "The selected Agent Host session configuration cannot be sent through Sessions."));
    }
    return void 0;
  }
  _toCreateOptions(options, providerId) {
    const modeId = options.modeInfo?.modeInstructions?.uri?.toString() ?? options.modeInfo?.modeInstructions?.name ?? options.modeInfo?.kind;
    const createOptions = {
      providerId,
      modelId: options.userSelectedModelId,
      modeId,
      permissionLevel: options.modeInfo?.permissionLevel
    };
    return createOptions.providerId || createOptions.modelId || createOptions.modeId || createOptions.permissionLevel ? createOptions : void 0;
  }
  _unsupported(reason) {
    return { status: "rejected", reasonCode: "unsupportedOptions", reason };
  }
  _cancelled(resource) {
    return {
      status: "rejected",
      resource,
      reasonCode: "cancelled",
      reason: localize("omniSessionRouting.cancelled", "The request was cancelled.")
    };
  }
  _toRejectedResult(error, resource) {
    if (isCancellationError(error)) {
      return this._cancelled(resource);
    }
    if (error instanceof WorkspaceNotTrustedError) {
      return {
        status: "rejected",
        resource,
        reasonCode: "workspaceNotTrusted",
        reason: localize("omniSessionRouting.workspaceNotTrusted", "The selected workspace or folder is not trusted.")
      };
    }
    return { status: "rejected", resource, reason: getErrorMessage(error) };
  }
}
let OmniSessionRoutingContribution = class extends Disposable {
  constructor(routingProviderService, sessionsManagementService, sessionsService, chatSessionsService, sessionsProvidersService, recentWorkspacesService, configurationService, fileDialogService, fileService, uriIdentityService, logService, notificationService) {
    super();
    const adapter = this._register(new OmniSessionRoutingAdapter(
      sessionsManagementService,
      sessionsService,
      chatSessionsService,
      sessionsProvidersService,
      recentWorkspacesService,
      configurationService,
      fileDialogService,
      fileService,
      uriIdentityService,
      logService,
      notificationService
    ));
    this._register(routingProviderService.registerProvider(adapter));
  }
};
OmniSessionRoutingContribution.ID = "workbench.contrib.omniSessionRouting";
OmniSessionRoutingContribution = __decorateClass([
  __decorateParam(0, IChatSessionRoutingProviderService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IChatSessionsService),
  __decorateParam(4, ISessionsProvidersService),
  __decorateParam(5, ISessionsRecentWorkspacesService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, ILogService),
  __decorateParam(11, INotificationService)
], OmniSessionRoutingContribution);
registerWorkbenchContribution2(OmniSessionRoutingContribution.ID, OmniSessionRoutingContribution, WorkbenchPhase.BlockRestore);
export {
  OmniSessionRoutingAdapter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcb21uaVNlc3Npb25Sb3V0aW5nQWRhcHRlci5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW0sIElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQsIElDaGF0U2Vzc2lvblJvdXRpbmdOZXdTZXNzaW9uVGFyZ2V0LCBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXIsIElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlclNlcnZpY2UsIElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UsIElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2VDYXRhbG9nLCBJUm91dGFibGVTZXNzaW9uLCBST1VURVJfRklFTERfQ0xJUF9MRU5HVEggfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9zZXNzaW9uUm91dGVyLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbnRlcmFjdGl2aXR5LCBJQ2hhdCwgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlLCBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbiwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMsIElTZW5kUmVxdWVzdE9wdGlvbnMsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBXb3Jrc3BhY2VOb3RUcnVzdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IFNlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjayB9IGZyb20gJy4vc2Vzc2lvbldvcmtzcGFjZUZhbGxiYWNrLmpzJztcbmltcG9ydCB7IGJ1aWxkU2Vzc2lvbldvcmtzcGFjZVBpY2tlckNhdGFsb2cgfSBmcm9tICcuL3Nlc3Npb25Xb3Jrc3BhY2VQaWNrZXJNb2RlbC5qcyc7XG5cbmludGVyZmFjZSBJU2Vzc2lvblJvdXRpbmdUYXJnZXQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBJU2Vzc2lvbjtcblx0cmVhZG9ubHkgY2hhdDogSUNoYXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBPbW5pU2Vzc2lvblJvdXRpbmdBZGFwdGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uUmVzb3VyY2VBbGlhc2VzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VOZXdTZXNzaW9uV29ya3NwYWNlQ2F0YWxvZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nID0gdGhpcy5fb25EaWRDaGFuZ2VOZXdTZXNzaW9uV29ya3NwYWNlQ2F0YWxvZy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uV29ya3NwYWNlRmFsbGJhY2s6IFNlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjaztcblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbEJyb3dzZUFjdGlvbjogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24gPSB7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCdvbW5pU2Vzc2lvblJvdXRpbmcuc2VsZWN0TG9jYWxXb3Jrc3BhY2UnLCBcIlNlbGVjdC4uLlwiKSxcblx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXJPcGVuZWQsXG5cdFx0cHJvdmlkZXJJZDogJycsXG5cdFx0cnVuOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVjZW50V29ya3NwYWNlc1NlcnZpY2U6IElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHR1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2Vzc2lvbldvcmtzcGFjZUZhbGxiYWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjayh7XG5cdFx0XHRjYW5Vc2VQcm92aWRlcjogKCkgPT4gdHJ1ZSxcblx0XHRcdGlzUHJvdmlkZXJVbmF2YWlsYWJsZTogcHJvdmlkZXJJZCA9PiB0aGlzLl9pc1Byb3ZpZGVyVW5hdmFpbGFibGUocHJvdmlkZXJJZCksXG5cdFx0XHRyZXNvbHZlV29ya3NwYWNlOiAoZm9sZGVyVXJpLCBwcmVmZXJyZWRQcm92aWRlcklkKSA9PiB0aGlzLl9yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSwgcHJlZmVycmVkUHJvdmlkZXJJZCksXG5cdFx0fSwgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjay5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZU5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9ucygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZFJlcGxhY2VTZXNzaW9uKCh7IGZyb20sIHRvIH0pID0+IHtcblx0XHRcdHRoaXMuc2Vzc2lvblJlc291cmNlQWxpYXNlcy5zZXQoZnJvbS5yZXNvdXJjZS50b1N0cmluZygpLCB0by5yZXNvdXJjZSk7XG5cdFx0XHR0aGlzLnNlc3Npb25SZXNvdXJjZUFsaWFzZXMuc2V0KGZyb20ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSwgdG8ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25zKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9ucygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXNzaW9uV29ya3NwYWNlRmFsbGJhY2sucmVmcmVzaFByb3ZpZGVycygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VOZXdTZXNzaW9uV29ya3NwYWNlQ2F0YWxvZy5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVjZW50V29ya3NwYWNlc1NlcnZpY2Uub25EaWRDaGFuZ2VSZWNlbnRXb3Jrc3BhY2VzKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTmV3U2Vzc2lvbldvcmtzcGFjZUNhdGFsb2cuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRDYW5kaWRhdGVTZXNzaW9ucyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiByZWFkb25seSBJUm91dGFibGVTZXNzaW9uW10ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbnMoKTtcblx0XHRyZXR1cm4gWy4uLnRoaXMuc2Vzc2lvbnMudmFsdWVzKCldLm1hcChzZXNzaW9uID0+IHRoaXMuX3RvQ2FuZGlkYXRlKHNlc3Npb24pKTtcblx0fVxuXG5cdGFzeW5jIGdldFNlc3Npb25TbmFwc2hvdChyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSb3V0YWJsZVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQodGhpcy5fcmVzb2x2ZVNlc3Npb25SZXNvdXJjZUFsaWFzKHJlc291cmNlKS50b1N0cmluZygpKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLl90b0NhbmRpZGF0ZSh0YXJnZXQuc2Vzc2lvbik7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhpc3RvcnkgPSBhd2FpdCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25IaXN0b3J5KHRhcmdldC5jaGF0LnJlc291cmNlLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPyB1bmRlZmluZWQgOiB0aGlzLl93aXRoSGlzdG9yeShjYW5kaWRhdGUsIGhpc3RvcnkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tvbW5pU2Vzc2lvblJvdXRpbmddIEZhaWxlZCB0byByZWFkIHNlc3Npb24gcmVzcG9uc2UgcHJldmlldycsIGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA/IHVuZGVmaW5lZCA6IGNhbmRpZGF0ZTtcblx0XHR9XG5cdH1cblxuXHR3YXRjaFNlc3Npb24ocmVzb3VyY2U6IFVSSSwgbGlzdGVuZXI6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgb2JzZXJ2YWJsZVdhdGNoZXIgPSBzdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRsZXQgd2F0Y2hlZFNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB3YXRjaGVkQ2hhdDogSUNoYXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYmluZCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQodGhpcy5fcmVzb2x2ZVNlc3Npb25SZXNvdXJjZUFsaWFzKHJlc291cmNlKS50b1N0cmluZygpKTtcblx0XHRcdGlmICh0YXJnZXQ/LnNlc3Npb24gPT09IHdhdGNoZWRTZXNzaW9uICYmIHRhcmdldD8uY2hhdCA9PT0gd2F0Y2hlZENoYXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0d2F0Y2hlZFNlc3Npb24gPSB0YXJnZXQ/LnNlc3Npb247XG5cdFx0XHR3YXRjaGVkQ2hhdCA9IHRhcmdldD8uY2hhdDtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0YXJnZXQ/LnNlc3Npb247XG5cdFx0XHRvYnNlcnZhYmxlV2F0Y2hlci52YWx1ZSA9IHNlc3Npb24gPyBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdHNlc3Npb24udGl0bGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRzZXNzaW9uLnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHNlc3Npb24udXBkYXRlZEF0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0c2Vzc2lvbi5sYXN0VHVybkVuZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxpc3RlbmVyKCk7XG5cdFx0XHR9KSA6IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0aGlzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoYmluZCkpO1xuXHRcdGJpbmQoKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRhc3luYyBnZXROZXdTZXNzaW9uV29ya3NwYWNlQ2F0YWxvZygpOiBQcm9taXNlPElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2VDYXRhbG9nPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCk7XG5cdFx0Y29uc3QgY2F0YWxvZyA9IGJ1aWxkU2Vzc2lvbldvcmtzcGFjZVBpY2tlckNhdGFsb2coe1xuXHRcdFx0cHJvdmlkZXJzLFxuXHRcdFx0cmVjZW50V29ya3NwYWNlczogdGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRXb3Jrc3BhY2VzKCksXG5cdFx0XHRvd25SZWNlbnRXb3Jrc3BhY2VzOiB0aGlzLnJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudFdvcmtzcGFjZXMoZmFsc2UpLFxuXHRcdFx0bG9jYWxCcm93c2VBY3Rpb246IHByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHByb3ZpZGVyLnN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzKSA/IHRoaXMubG9jYWxCcm93c2VBY3Rpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRyZW1vdGVBZ2VudEhvc3RzRW5hYmxlZDogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCksXG5cdFx0XHRpc1Byb3ZpZGVyVW5hdmFpbGFibGU6IHByb3ZpZGVySWQgPT4gdGhpcy5faXNQcm92aWRlclVuYXZhaWxhYmxlKHByb3ZpZGVySWQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGRlZmF1bHRXb3Jrc3BhY2UgPSBjYXRhbG9nLmRlZmF1bHRXb3Jrc3BhY2UgPz8gYXdhaXQgdGhpcy5zZXNzaW9uV29ya3NwYWNlRmFsbGJhY2suZmluZFdvcmtzcGFjZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRncm91cHM6IGNhdGFsb2cudGFicy5tYXAodGFiID0+ICh7XG5cdFx0XHRcdGlkOiB0YWIuaWQsXG5cdFx0XHRcdGxhYmVsOiB0YWIubGFiZWwsXG5cdFx0XHRcdHRvb2x0aXA6IHRhYi50b29sdGlwLFxuXHRcdFx0XHRpY29uOiB0YWIuaWNvbixcblx0XHRcdH0pKSxcblx0XHRcdHdvcmtzcGFjZXM6IGNhdGFsb2cud29ya3NwYWNlcy5tYXAocmVjZW50ID0+IHRoaXMuX3RvUm91dGluZ1dvcmtzcGFjZShyZWNlbnQud29ya3NwYWNlLCByZWNlbnQucHJvdmlkZXJJZCkpLFxuXHRcdFx0YnJvd3NlQWN0aW9uczogY2F0YWxvZy5icm93c2VBY3Rpb25zLm1hcChhY3Rpb24gPT4gKHtcblx0XHRcdFx0aWQ6IHRoaXMuX2dldEJyb3dzZUFjdGlvbklkKGFjdGlvbiksXG5cdFx0XHRcdHByb3ZpZGVySWQ6IGFjdGlvbi5wcm92aWRlcklkIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0Z3JvdXA6IGFjdGlvbi5ncm91cCxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvbW5pU2Vzc2lvblJvdXRpbmcuc2VsZWN0V29ya3NwYWNlJywgXCJTZWxlY3QuLi5cIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBhY3Rpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdGljb246IGFjdGlvbi5pY29uLFxuXHRcdFx0XHRkaXNhYmxlZDogISFhY3Rpb24ucHJvdmlkZXJJZCAmJiB0aGlzLl9pc1Byb3ZpZGVyVW5hdmFpbGFibGUoYWN0aW9uLnByb3ZpZGVySWQpLFxuXHRcdFx0fSkpLFxuXHRcdFx0ZGVmYXVsdFdvcmtzcGFjZTogZGVmYXVsdFdvcmtzcGFjZVxuXHRcdFx0XHQ/IHRoaXMuX3RvUm91dGluZ1dvcmtzcGFjZShkZWZhdWx0V29ya3NwYWNlLndvcmtzcGFjZSwgZGVmYXVsdFdvcmtzcGFjZS5wcm92aWRlcklkKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0c2VsZWN0TmV3U2Vzc2lvbldvcmtzcGFjZSh3b3Jrc3BhY2U6IElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKHdvcmtzcGFjZS5wcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyPy5yZXNvbHZlV29ya3NwYWNlKHdvcmtzcGFjZS51cmkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ29tbmlTZXNzaW9uUm91dGluZy53b3Jrc3BhY2VQcm92aWRlclVuYXZhaWxhYmxlJywgXCJUaGUgc2VsZWN0ZWQgd29ya3NwYWNlIHByb3ZpZGVyIGlzIG5vIGxvbmdlciBhdmFpbGFibGUuXCIpKTtcblx0XHR9XG5cdFx0dGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5hZGRSZWNlbnRXb3Jrc3BhY2Uod29ya3NwYWNlLnVyaSwgd29ya3NwYWNlLnByb3ZpZGVySWQsIHRydWUpO1xuXHR9XG5cblx0YXN5bmMgYnJvd3NlTmV3U2Vzc2lvbldvcmtzcGFjZShhY3Rpb25JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYWN0aW9uSWQgPT09ICdsb2NhbCcpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2Jyb3dzZUZvckxvY2FsV29ya3NwYWNlKHRva2VuKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuX2ZpbmRCcm93c2VBY3Rpb24oYWN0aW9uSWQpO1xuXHRcdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdvbW5pU2Vzc2lvblJvdXRpbmcud29ya3NwYWNlQnJvd3NlVW5hdmFpbGFibGUnLCBcIlRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UgYnJvd3NlciBpcyBubyBsb25nZXIgYXZhaWxhYmxlLlwiKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBhY3Rpb24ucnVuKCk7XG5cdFx0XHRpZiAoIXdvcmtzcGFjZSB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gd29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKGFjdGlvbi5wcm92aWRlcklkKTtcblx0XHRcdGlmICghZm9sZGVyVXJpIHx8ICFwcm92aWRlcj8ucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnb21uaVNlc3Npb25Sb3V0aW5nLndvcmtzcGFjZVByb3ZpZGVyVW5hdmFpbGFibGUnLCBcIlRoZSBzZWxlY3RlZCB3b3Jrc3BhY2UgcHJvdmlkZXIgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZS5cIikpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3RvUm91dGluZ1dvcmtzcGFjZSh3b3Jrc3BhY2UsIGFjdGlvbi5wcm92aWRlcklkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbb21uaVNlc3Npb25Sb3V0aW5nXSBGYWlsZWQgdG8gYnJvd3NlIGZvciBhIHdvcmtzcGFjZScsIGVycm9yKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdvbW5pU2Vzc2lvblJvdXRpbmcud29ya3NwYWNlQnJvd3NlRmFpbGVkJywgXCJVbmFibGUgdG8gc2VsZWN0IGEgd29ya3NwYWNlLlwiKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHJlc29sdmVTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvbklkOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlVGFyZ2V0KHNlc3Npb25JZCk/LmNoYXQucmVzb3VyY2U7XG5cdH1cblxuXHRhc3luYyBkaXNwYXRjaFRvU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCBvcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQ+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYW5jZWxsZWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZVRhcmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGF0dXM6ICdyZWplY3RlZCcsXG5cdFx0XHRcdHJlYXNvbkNvZGU6ICdwcm92aWRlclJlbW92ZWQnLFxuXHRcdFx0XHRyZWFzb246IGxvY2FsaXplKCdvbW5pU2Vzc2lvblJvdXRpbmcuc2Vzc2lvblVuYXZhaWxhYmxlJywgXCJUaGUgc2VsZWN0ZWQgc2Vzc2lvbiBpcyBubyBsb25nZXIgYXZhaWxhYmxlLlwiKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IHVuc3VwcG9ydGVkID0gdGhpcy5fZ2V0VW5zdXBwb3J0ZWRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdGlmICh1bnN1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuIHVuc3VwcG9ydGVkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhY3Rpdml0eUJhc2VsaW5lID0gdGFyZ2V0LnNlc3Npb24ubGFzdFR1cm5FbmQuZ2V0KCk/LmdldFRpbWUoKSA/PyB0YXJnZXQuc2Vzc2lvbi51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpO1xuXHRcdFx0YXdhaXQgdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNlbmRSZXF1ZXN0KHRhcmdldC5zZXNzaW9uLCB0YXJnZXQuY2hhdCwge1xuXHRcdFx0XHRxdWVyeTogbWVzc2FnZSxcblx0XHRcdFx0YXR0YWNoZWRDb250ZXh0OiBvcHRpb25zLmF0dGFjaGVkQ29udGV4dD8ubGVuZ3RoID8gWy4uLm9wdGlvbnMuYXR0YWNoZWRDb250ZXh0XSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0YmFja2dyb3VuZDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAnc2VudCcsIHJlc291cmNlOiB0YXJnZXQuY2hhdC5yZXNvdXJjZSwgYWN0aXZpdHlCYXNlbGluZSB9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9SZWplY3RlZFJlc3VsdChlcnJvciwgdGFyZ2V0LmNoYXQucmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRpc3BhdGNoVG9OZXdTZXNzaW9uKHRhcmdldDogSUNoYXRTZXNzaW9uUm91dGluZ05ld1Nlc3Npb25UYXJnZXQsIG1lc3NhZ2U6IHN0cmluZywgb3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0PiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FuY2VsbGVkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVuc3VwcG9ydGVkID0gdGhpcy5fZ2V0VW5zdXBwb3J0ZWRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdGlmICh1bnN1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuIHVuc3VwcG9ydGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0cXVlcnk6IG1lc3NhZ2UsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IG9wdGlvbnMuYXR0YWNoZWRDb250ZXh0Py5sZW5ndGggPyBbLi4ub3B0aW9ucy5hdHRhY2hlZENvbnRleHRdIDogdW5kZWZpbmVkLFxuXHRcdFx0YmFja2dyb3VuZDogdHJ1ZSxcblx0XHR9O1xuXHRcdGlmICh0YXJnZXQucHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcih0YXJnZXQucHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCBjYW5DcmVhdGUgPSB0YXJnZXQuZm9sZGVyID8gISFwcm92aWRlcj8ucmVzb2x2ZVdvcmtzcGFjZSh0YXJnZXQuZm9sZGVyKSA6ICEhcHJvdmlkZXI/LnN1cHBvcnRzUXVpY2tDaGF0cztcblx0XHRcdGlmICghY2FuQ3JlYXRlKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3RhdHVzOiAncmVqZWN0ZWQnLFxuXHRcdFx0XHRcdHJlYXNvbkNvZGU6ICdwcm92aWRlclJlbW92ZWQnLFxuXHRcdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ29tbmlTZXNzaW9uUm91dGluZy53b3Jrc3BhY2VQcm92aWRlclVuYXZhaWxhYmxlJywgXCJUaGUgc2VsZWN0ZWQgd29ya3NwYWNlIHByb3ZpZGVyIGlzIG5vIGxvbmdlciBhdmFpbGFibGUuXCIpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjcmVhdGVPcHRpb25zID0gdGhpcy5fdG9DcmVhdGVPcHRpb25zKG9wdGlvbnMsIHRhcmdldC5wcm92aWRlcklkKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRhcmdldC5mb2xkZXJcblx0XHRcdFx0PyBhd2FpdCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KHRhcmdldC5mb2xkZXIsIHNlbmRPcHRpb25zLCBjcmVhdGVPcHRpb25zLCB0b2tlbilcblx0XHRcdFx0OiBhd2FpdCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3Qoc2VuZE9wdGlvbnMsIGNyZWF0ZU9wdGlvbnMsIHRva2VuKTtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXR1czogJ3JlamVjdGVkJyxcblx0XHRcdFx0XHRyZWFzb25Db2RlOiAncHJvdmlkZXJSZW1vdmVkJyxcblx0XHRcdFx0XHRyZWFzb246IGxvY2FsaXplKCdvbW5pU2Vzc2lvblJvdXRpbmcuc2Vzc2lvbk5vdENyZWF0ZWQnLCBcIlRoZSBTZXNzaW9ucyBwcm92aWRlciBjb3VsZCBub3QgY3JlYXRlIHRoZSBuZXcgc2Vzc2lvbi5cIiksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdzZW50JywgcmVzb3VyY2U6IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UsIGFjdGl2aXR5QmFzZWxpbmU6IHNlc3Npb24uY3JlYXRlZEF0LmdldFRpbWUoKSB9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9SZWplY3RlZFJlc3VsdChlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cmV2ZWFsU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblJlc291cmNlQWxpYXMocmVzb3VyY2UpO1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb25zU2VydmljZS5vcGVuU2Vzc2lvbih0aGlzLl9yZXNvbHZlVGFyZ2V0KHJlc29sdmVkLnRvU3RyaW5nKCkpPy5zZXNzaW9uLnJlc291cmNlID8/IHJlc29sdmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVTZXNzaW9uUmVzb3VyY2VBbGlhcyhyZXNvdXJjZTogVVJJKTogVVJJIHtcblx0XHRsZXQgcmVzb2x2ZWQgPSByZXNvdXJjZTtcblx0XHRjb25zdCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0d2hpbGUgKCF2aXNpdGVkLmhhcyhyZXNvbHZlZC50b1N0cmluZygpKSkge1xuXHRcdFx0dmlzaXRlZC5hZGQocmVzb2x2ZWQudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IHRoaXMuc2Vzc2lvblJlc291cmNlQWxpYXNlcy5nZXQocmVzb2x2ZWQudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoIXJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZWQgPSByZXBsYWNlbWVudDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc29sdmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaFNlc3Npb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25zKCkpIHtcblx0XHRcdGlmICh0aGlzLl9nZXRSb3V0YWJsZUNoYXQoc2Vzc2lvbikpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvUm91dGluZ1dvcmtzcGFjZSh3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlLCBwcm92aWRlcklkOiBzdHJpbmcpOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlIHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdCA/PyB3b3Jrc3BhY2UudXJpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IGZvbGRlclVyaSxcblx0XHRcdHByb3ZpZGVySWQsXG5cdFx0XHRncm91cDogd29ya3NwYWNlLmdyb3VwLFxuXHRcdFx0bGFiZWw6IHdvcmtzcGFjZS5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiB3b3Jrc3BhY2UuZGVzY3JpcHRpb24sXG5cdFx0XHRpY29uOiB3b3Jrc3BhY2UuaWNvbixcblx0XHRcdGRpc2FibGVkOiB0aGlzLl9pc1Byb3ZpZGVyVW5hdmFpbGFibGUocHJvdmlkZXJJZCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkksIHByZWZlcnJlZFByb3ZpZGVySWQ/OiBzdHJpbmcpOiB7IHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZzsgcmVhZG9ubHkgd29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocHJlZmVycmVkUHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcmVmZXJyZWRQcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyPy5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSk7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB7IHByb3ZpZGVySWQ6IHByZWZlcnJlZFByb3ZpZGVySWQsIHdvcmtzcGFjZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSk7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB7IHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCB3b3Jrc3BhY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEJyb3dzZUFjdGlvbklkKGFjdGlvbjogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24pOiBzdHJpbmcge1xuXHRcdGlmIChhY3Rpb24gPT09IHRoaXMubG9jYWxCcm93c2VBY3Rpb24pIHtcblx0XHRcdHJldHVybiAnbG9jYWwnO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKGFjdGlvbi5wcm92aWRlcklkKTtcblx0XHRjb25zdCBpbmRleCA9IHByb3ZpZGVyPy5icm93c2VBY3Rpb25zLmluZGV4T2YoYWN0aW9uKSA/PyAtMTtcblx0XHRyZXR1cm4gYHByb3ZpZGVyOiR7ZW5jb2RlVVJJQ29tcG9uZW50KGFjdGlvbi5wcm92aWRlcklkKX06JHtpbmRleH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEJyb3dzZUFjdGlvbihhY3Rpb25JZDogc3RyaW5nKTogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpIHtcblx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwcm92aWRlci5icm93c2VBY3Rpb25zLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBwcm92aWRlci5icm93c2VBY3Rpb25zW2luZGV4XTtcblx0XHRcdFx0aWYgKGFjdGlvbklkID09PSBgcHJvdmlkZXI6JHtlbmNvZGVVUklDb21wb25lbnQocHJvdmlkZXIuaWQpfToke2luZGV4fWApIHtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9icm93c2VGb3JMb2NhbFdvcmtzcGFjZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKS5maWx0ZXIocHJvdmlkZXIgPT4gcHJvdmlkZXIuc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXMpO1xuXHRcdGlmICghcHJvdmlkZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdvbW5pU2Vzc2lvblJvdXRpbmcubG9jYWxXb3Jrc3BhY2VQcm92aWRlclVuYXZhaWxhYmxlJywgXCJObyBsb2NhbCB3b3Jrc3BhY2UgcHJvdmlkZXIgaXMgYXZhaWxhYmxlLlwiKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0aWYgKCFzZWxlY3RlZD8ubGVuZ3RoIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHByb3ZpZGVycykge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZShzZWxlY3RlZFswXSk7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl90b1JvdXRpbmdXb3Jrc3BhY2Uod29ya3NwYWNlLCBwcm92aWRlci5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnb21uaVNlc3Npb25Sb3V0aW5nLmxvY2FsV29ya3NwYWNlVW5zdXBwb3J0ZWQnLCBcIk5vIFNlc3Npb25zIHByb3ZpZGVyIGNhbiB1c2UgdGhlIHNlbGVjdGVkIGZvbGRlci5cIikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNQcm92aWRlclVuYXZhaWxhYmxlKHByb3ZpZGVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFwcm92aWRlciB8fCAhaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikgfHwgIXByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdHVzID0gcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cy5nZXQoKTtcblx0XHRyZXR1cm4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShzdGF0dXMpXG5cdFx0XHR8fCAoIVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoc3RhdHVzKSAmJiAhcHJvdmlkZXIuY2FuQ29ubmVjdE9uRGVtYW5kKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVUYXJnZXQoc2Vzc2lvbklkOiBzdHJpbmcpOiBJU2Vzc2lvblJvdXRpbmdUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpID8/IHRoaXMuX2ZpbmRTZXNzaW9uQnlSZXNvdXJjZShzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdCA9IHRoaXMuX2ZpbmRDaGF0QnlSZXNvdXJjZShzZXNzaW9uLCBzZXNzaW9uSWQpID8/IHRoaXMuX2dldFJvdXRhYmxlQ2hhdChzZXNzaW9uKTtcblx0XHRyZXR1cm4gY2hhdCA/IHsgc2Vzc2lvbiwgY2hhdCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZFNlc3Npb25CeVJlc291cmNlKHZhbHVlOiBzdHJpbmcpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHJlc291cmNlOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc291cmNlID0gVVJJLnBhcnNlKHZhbHVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSlcblx0XHRcdD8/IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKHJlc291cmNlKT8uc2Vzc2lvbjtcblx0XHRyZXR1cm4gc2Vzc2lvbiAmJiB0aGlzLnNlc3Npb25zLmhhcyhzZXNzaW9uLnNlc3Npb25JZCkgPyBzZXNzaW9uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZENoYXRCeVJlc291cmNlKHNlc3Npb246IElTZXNzaW9uLCB2YWx1ZTogc3RyaW5nKTogSUNoYXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBzZXNzaW9uLmNoYXRzLmdldCgpLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHZhbHVlICYmIHRoaXMuX2lzUm91dGFibGVDaGF0KGNoYXQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJvdXRhYmxlQ2hhdChzZXNzaW9uOiBJU2Vzc2lvbik6IElDaGF0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWRcblx0XHRcdHx8IHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKVxuXHRcdFx0fHwgc2Vzc2lvbi5pc0F1dG9tYXRpb24/LmdldCgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtYWluQ2hhdCA9IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCk7XG5cdFx0aWYgKHRoaXMuX2lzUm91dGFibGVDaGF0KG1haW5DaGF0KSkge1xuXHRcdFx0cmV0dXJuIG1haW5DaGF0O1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLnNlc3Npb24uY2hhdHMuZ2V0KCldXG5cdFx0XHQuZmlsdGVyKGNoYXQgPT4gdGhpcy5faXNSb3V0YWJsZUNoYXQoY2hhdCkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYi51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpIC0gYS51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpKVswXTtcblx0fVxuXG5cdHByaXZhdGUgX2lzUm91dGFibGVDaGF0KGNoYXQ6IElDaGF0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNoYXQuc3RhdHVzLmdldCgpICE9PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkXG5cdFx0XHQmJiAhY2hhdC5pc0FyY2hpdmVkLmdldCgpXG5cdFx0XHQmJiBjaGF0LmludGVyYWN0aXZpdHkuZ2V0KCkgPT09IENoYXRJbnRlcmFjdGl2aXR5LkZ1bGw7XG5cdH1cblxuXHRwcml2YXRlIF90b0NhbmRpZGF0ZShzZXNzaW9uOiBJU2Vzc2lvbik6IElSb3V0YWJsZVNlc3Npb24ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpO1xuXHRcdGNvbnN0IGZvbGRlciA9IHdvcmtzcGFjZT8uZm9sZGVyc1swXTtcblx0XHRjb25zdCBnaXRIdWJJbmZvID0gZm9sZGVyPy5naXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLmdldCgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogc2Vzc2lvbi50aXRsZS5nZXQoKSxcblx0XHRcdHJlcG86IGdpdEh1YkluZm8gPyBgJHtnaXRIdWJJbmZvLm93bmVyfS8ke2dpdEh1YkluZm8ucmVwb31gIDogdW5kZWZpbmVkLFxuXHRcdFx0Y3dkOiBmb2xkZXI/LndvcmtpbmdEaXJlY3RvcnkucGF0aCxcblx0XHRcdHN0YXR1czogdGhpcy5fc3RhdHVzVG9TdHJpbmcoc2Vzc2lvbi5zdGF0dXMuZ2V0KCkpLFxuXHRcdFx0bGFzdEFjdGl2aXR5OiBzZXNzaW9uLmxhc3RUdXJuRW5kLmdldCgpPy5nZXRUaW1lKCkgPz8gc2Vzc2lvbi51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX21hcmtkb3duVG9UZXh0KHNlc3Npb24uZGVzY3JpcHRpb24uZ2V0KCkpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF93aXRoSGlzdG9yeShjYW5kaWRhdGU6IElSb3V0YWJsZVNlc3Npb24sIGhpc3Rvcnk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10pOiBJUm91dGFibGVTZXNzaW9uIHtcblx0XHRsZXQgbGFzdFJlc3BvbnNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGhpc3RvcnkpIHtcblx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdyZXNwb25zZScpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IGl0ZW0ucGFydHMubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gaXRlbS5wYXJ0c1tpbmRleF07XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnICYmIHBhcnQuY29udGVudC52YWx1ZS50cmltKCkpIHtcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2UgPSBwYXJ0LmNvbnRlbnQudmFsdWUudHJpbSgpLnNsaWNlKDAsIFJPVVRFUl9GSUVMRF9DTElQX0xFTkdUSCAqIDIpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsYXN0UmVzcG9uc2UgPyB7IC4uLmNhbmRpZGF0ZSwgbGFzdFJlc3BvbnNlIH0gOiBjYW5kaWRhdGU7XG5cdH1cblxuXHRwcml2YXRlIF9zdGF0dXNUb1N0cmluZyhzdGF0dXM6IFNlc3Npb25TdGF0dXMpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzczogcmV0dXJuICd3b3JraW5nJztcblx0XHRcdGNhc2UgU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0OiByZXR1cm4gJ25lZWRzSW5wdXQnO1xuXHRcdFx0Y2FzZSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZDogcmV0dXJuICdpZGxlJztcblx0XHRcdGNhc2UgU2Vzc2lvblN0YXR1cy5FcnJvcjogcmV0dXJuICdmYWlsZWQnO1xuXHRcdFx0Y2FzZSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkOiByZXR1cm4gJ2RyYWZ0Jztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tYXJrZG93blRvVGV4dCh2YWx1ZTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0ZXh0ID0gdmFsdWU/LnZhbHVlLnRyaW0oKTtcblx0XHRyZXR1cm4gdGV4dCB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVbnN1cHBvcnRlZE9wdGlvbnMob3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpOiBJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRoZSBjaGF0IHdpZGdldCBzbmFwc2hvdHMgZXZlcnkgZGVmYXVsdC1lbmFibGVkIHRvb2wgYXMgYHRydWVgLiBTZXNzaW9uc1xuXHRcdC8vIHByb3ZpZGVycyBvd24gdGhhdCBkZWZhdWx0IHRvb2wgc2V0LCBzbyBvbmx5IGFuIGFjdHVhbCBkaXNhYmxlZC10b29sXG5cdFx0Ly8gb3ZlcnJpZGUgaXMgdW5zdXBwb3J0ZWQgYW5kIG11c3QgYmUgcmVqZWN0ZWQgcmF0aGVyIHRoYW4gZHJvcHBlZC5cblx0XHRpZiAob3B0aW9ucy51c2VyU2VsZWN0ZWRUb29scyAmJiBPYmplY3QudmFsdWVzKG9wdGlvbnMudXNlclNlbGVjdGVkVG9vbHMuZ2V0KCkpLnNvbWUoZW5hYmxlZCA9PiAhZW5hYmxlZCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl91bnN1cHBvcnRlZChsb2NhbGl6ZSgnb21uaVNlc3Npb25Sb3V0aW5nLnRvb2xzVW5zdXBwb3J0ZWQnLCBcIlRoZSBzZWxlY3RlZCB0b29sIGNvbmZpZ3VyYXRpb24gY2Fubm90IGJlIHNlbnQgdGhyb3VnaCBTZXNzaW9ucy5cIikpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5yZXNvbHZlZFZhcmlhYmxlcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdW5zdXBwb3J0ZWQobG9jYWxpemUoJ29tbmlTZXNzaW9uUm91dGluZy52YXJpYWJsZXNVbnN1cHBvcnRlZCcsIFwiUmVzb2x2ZWQgcmVxdWVzdCB2YXJpYWJsZXMgY2Fubm90IGJlIHNlbnQgdGhyb3VnaCBTZXNzaW9ucy5cIikpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5hZ2VudEhvc3RTZXNzaW9uQ29uZmlnICYmIE9iamVjdC5rZXlzKG9wdGlvbnMuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZykubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdW5zdXBwb3J0ZWQobG9jYWxpemUoJ29tbmlTZXNzaW9uUm91dGluZy5zZXNzaW9uQ29uZmlndXJhdGlvblVuc3VwcG9ydGVkJywgXCJUaGUgc2VsZWN0ZWQgQWdlbnQgSG9zdCBzZXNzaW9uIGNvbmZpZ3VyYXRpb24gY2Fubm90IGJlIHNlbnQgdGhyb3VnaCBTZXNzaW9ucy5cIikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9DcmVhdGVPcHRpb25zKG9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBwcm92aWRlcklkPzogc3RyaW5nKTogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlSWQgPSBvcHRpb25zLm1vZGVJbmZvPy5tb2RlSW5zdHJ1Y3Rpb25zPy51cmk/LnRvU3RyaW5nKClcblx0XHRcdD8/IG9wdGlvbnMubW9kZUluZm8/Lm1vZGVJbnN0cnVjdGlvbnM/Lm5hbWVcblx0XHRcdD8/IG9wdGlvbnMubW9kZUluZm8/LmtpbmQ7XG5cdFx0Y29uc3QgY3JlYXRlT3B0aW9uczogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zID0ge1xuXHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdG1vZGVsSWQ6IG9wdGlvbnMudXNlclNlbGVjdGVkTW9kZWxJZCxcblx0XHRcdG1vZGVJZCxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogb3B0aW9ucy5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsLFxuXHRcdH07XG5cdFx0cmV0dXJuIGNyZWF0ZU9wdGlvbnMucHJvdmlkZXJJZCB8fCBjcmVhdGVPcHRpb25zLm1vZGVsSWQgfHwgY3JlYXRlT3B0aW9ucy5tb2RlSWQgfHwgY3JlYXRlT3B0aW9ucy5wZXJtaXNzaW9uTGV2ZWwgPyBjcmVhdGVPcHRpb25zIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdW5zdXBwb3J0ZWQocmVhc29uOiBzdHJpbmcpOiBJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQge1xuXHRcdHJldHVybiB7IHN0YXR1czogJ3JlamVjdGVkJywgcmVhc29uQ29kZTogJ3Vuc3VwcG9ydGVkT3B0aW9ucycsIHJlYXNvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsbGVkKHJlc291cmNlPzogVVJJKTogSUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhdHVzOiAncmVqZWN0ZWQnLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRyZWFzb25Db2RlOiAnY2FuY2VsbGVkJyxcblx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ29tbmlTZXNzaW9uUm91dGluZy5jYW5jZWxsZWQnLCBcIlRoZSByZXF1ZXN0IHdhcyBjYW5jZWxsZWQuXCIpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b1JlamVjdGVkUmVzdWx0KGVycm9yOiB1bmtub3duLCByZXNvdXJjZT86IFVSSSk6IElDaGF0U2Vzc2lvblJvdXRpbmdEaXNwYXRjaFJlc3VsdCB7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FuY2VsbGVkKHJlc291cmNlKTtcblx0XHR9XG5cdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgV29ya3NwYWNlTm90VHJ1c3RlZEVycm9yKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGF0dXM6ICdyZWplY3RlZCcsXG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRyZWFzb25Db2RlOiAnd29ya3NwYWNlTm90VHJ1c3RlZCcsXG5cdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ29tbmlTZXNzaW9uUm91dGluZy53b3Jrc3BhY2VOb3RUcnVzdGVkJywgXCJUaGUgc2VsZWN0ZWQgd29ya3NwYWNlIG9yIGZvbGRlciBpcyBub3QgdHJ1c3RlZC5cIiksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBzdGF0dXM6ICdyZWplY3RlZCcsIHJlc291cmNlLCByZWFzb246IGdldEVycm9yTWVzc2FnZShlcnJvcikgfTtcblx0fVxufVxuXG5jbGFzcyBPbW5pU2Vzc2lvblJvdXRpbmdDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm9tbmlTZXNzaW9uUm91dGluZyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlclNlcnZpY2Ugcm91dGluZ1Byb3ZpZGVyU2VydmljZTogSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Ugc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2Ugc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlIHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlOiBJU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBhZGFwdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE9tbmlTZXNzaW9uUm91dGluZ0FkYXB0ZXIoXG5cdFx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdFx0c2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdFx0Y2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRcdHNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRcdHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRmaWxlRGlhbG9nU2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocm91dGluZ1Byb3ZpZGVyU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGFkYXB0ZXIpKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoT21uaVNlc3Npb25Sb3V0aW5nQ29udHJpYnV0aW9uLklELCBPbW5pU2Vzc2lvblJvdXRpbmdDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQiwyQkFBMkI7QUFDckQsU0FBUyxlQUFlO0FBRXhCLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQ0FBaUMsd0NBQXdDO0FBQ2xGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFFdkYsU0FBa0MsNEJBQTRCO0FBQzlELFNBQThHLG9DQUF5SCxnQ0FBZ0M7QUFDdlEsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBc0YsK0JBQStCLHFCQUFxQjtBQUNuSixTQUF3RCw0QkFBNEIsZ0NBQWdDO0FBQ3BILFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMENBQTBDO0FBTzVDLE1BQU0sa0NBQWtDLFdBQWtEO0FBQUEsRUFpQmhHLFlBQ2tCLDJCQUNBLGlCQUNBLHFCQUNBLDBCQUNBLHlCQUNBLHNCQUNBLG1CQUNqQixhQUNBLG9CQUNpQixZQUNBLHFCQUNoQjtBQUNELFVBQU07QUFaVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBO0FBQ0E7QUExQmxCLFNBQWlCLFdBQVcsb0JBQUksSUFBc0I7QUFDdEQsU0FBaUIseUJBQXlCLG9CQUFJLElBQWlCO0FB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
