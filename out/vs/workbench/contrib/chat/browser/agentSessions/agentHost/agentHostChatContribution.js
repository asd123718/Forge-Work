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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { CancellationError, isCancellationError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { mark } from "../../../../../../base/common/performance.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { affectsAgentHostProviderPreference, IAgentHostService, protectedResourcesRequireGitHubCopilotSignIn, shouldSurfaceLocalAgentHostProvider } from "../../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { LOCAL_AGENT_HOST_AUTHORITY } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { NotificationType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID } from "../../../../../../platform/agentHost/common/agentModelSource.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDefaultAccountService } from "../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { IAgentHostFileSystemService } from "../../../../../services/agentHost/common/agentHostFileSystemService.js";
import { IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { ChatSessionsExtensions, IChatSessionsService, isLocalAgentHostTarget } from "../../../common/chatSessionsService.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { languageModelSourcePresentationRegistry } from "../../../common/languageModelSourcePresentation.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { AgentCustomizationItemProvider } from "./agentCustomizationItemProvider.js";
import { AgentHostDownloadProgress } from "./agentHostDownloadProgress.js";
import { authenticateProtectedResources, AgentHostAuthenticationRecovery, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from "./agentHostAuth.js";
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from "./agentHostLanguageModelProvider.js";
import { AgentHostSessionHandler } from "./agentHostSessionHandler.js";
import { AgentHostPromptCacheNotification } from "./agentHostPromptCacheNotification.js";
import { IAgentHostActiveClientService } from "./agentHostActiveClientService.js";
import { IAgentHostProtectedResourcesService } from "./agentHostProtectedResourcesService.js";
import { AICustomizationManagementSection } from "../../../common/aiCustomizationWorkspaceService.js";
const LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX = "agent-host-";
languageModelSourcePresentationRegistry.register({
  ownerVendor: "agent-host-codex",
  sourceId: CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID,
  label: localize("agentHostModelSource.chatGPT.label", "ChatGPT"),
  icon: Codicon.openai,
  description: localize("agentHostModelSource.chatGPT.description", "Models provided by your ChatGPT subscription")
});
Registry.as(ChatSessionsExtensions.AsyncActivation).register({
  matchSessionType: (sessionType) => isLocalAgentHostTarget(sessionType),
  waitForActivation: waitForLocalAgentHostActivation
});
async function waitForLocalAgentHostActivation(accessor, sessionType) {
  const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
  const agentHostService = accessor.get(IAgentHostService);
  const configurationService = accessor.get(IConfigurationService);
  const environmentService = accessor.get(IWorkbenchEnvironmentService);
  if (!agentHostEnablementService.enabled.get()) {
    return false;
  }
  const provider = getLocalAgentHostProviderForSessionType(sessionType);
  if (!provider) {
    return false;
  }
  while (true) {
    const rootState = agentHostService.rootState.value;
    if (rootState instanceof Error) {
      return false;
    }
    if (rootState) {
      return rootState.agents.some((agent) => agent.provider === provider && shouldSurfaceLocalAgentHostProvider(agent.provider, configurationService, environmentService.isSessionsWindow));
    }
    const changed = await Promise.race([
      Event.toPromise(agentHostService.rootState.onDidChange).then(() => true),
      Event.toPromise(agentHostService.onAgentHostExit).then(() => false)
    ]);
    if (!changed) {
      return false;
    }
  }
}
function getLocalAgentHostProviderForSessionType(sessionType) {
  if (!isLocalAgentHostTarget(sessionType) || !sessionType.startsWith(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX)) {
    return void 0;
  }
  return sessionType.slice(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX.length) || void 0;
}
import { AgentHostSessionHandler as AgentHostSessionHandler2 } from "./agentHostSessionHandler.js";
let AgentHostContribution = class extends Disposable {
  constructor(_agentHostService, _chatSessionsService, _defaultAccountService, _authenticationService, _logService, _languageModelsService, _instantiationService, _agentHostFileSystemService, _configurationService, _customizationHarnessService, environmentService, _activeClientService, _protectedResourcesService, _agentHostEnablementService) {
    super();
    this._agentHostService = _agentHostService;
    this._chatSessionsService = _chatSessionsService;
    this._defaultAccountService = _defaultAccountService;
    this._authenticationService = _authenticationService;
    this._logService = _logService;
    this._languageModelsService = _languageModelsService;
    this._instantiationService = _instantiationService;
    this._agentHostFileSystemService = _agentHostFileSystemService;
    this._configurationService = _configurationService;
    this._customizationHarnessService = _customizationHarnessService;
    this._activeClientService = _activeClientService;
    this._protectedResourcesService = _protectedResourcesService;
    this._agentHostEnablementService = _agentHostEnablementService;
    this._agentRegistrations = this._register(new DisposableMap());
    /** Model providers keyed by agent provider, for pushing model updates. */
    this._modelProviders = /* @__PURE__ */ new Map();
    /** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
    this._authTokenCache = new AgentHostAuthTokenCache();
    this._authRecovery = new AgentHostAuthenticationRecovery();
    this._initialized = false;
    this._enablementStore = this._register(new MutableDisposable());
    this._authenticationGeneration = 0;
    this._didStartInitialAuthentication = false;
    this._isSessionsWindow = environmentService.isSessionsWindow;
    this._enableSmokeTestDriver = !!environmentService.enableSmokeTestDriver;
    this._register(autorun((reader) => {
      const enabled = this._agentHostEnablementService.enabled.read(reader);
      if (enabled) {
        const wasInitialized = this._initialized;
        this._initialize();
        this._enable();
        const current = this._agentHostService.rootState.value;
        if (wasInitialized && current && !(current instanceof Error)) {
          this._handleRootStateChange(current);
        }
      } else {
        this._authenticationGeneration++;
        this._authTokenCache.clear();
        this._authRecovery.clear();
        this._enablementStore.clear();
        this._agentHostService.setAuthenticationPending(false);
        this._agentRegistrations.clearAndDisposeAll();
        this._modelProviders.clear();
      }
    }));
  }
  _initialize() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._promptCacheNotification = this._register(this._instantiationService.createInstance(AgentHostPromptCacheNotification));
    this._register(this._agentHostFileSystemService.registerAuthority(LOCAL_AGENT_HOST_AUTHORITY, this._agentHostService));
    this._register(this._agentHostService.rootState.onDidChange((rootState) => {
      this._handleRootStateChange(rootState);
    }));
    const initialRootState = this._agentHostService.rootState.value;
    if (initialRootState && !(initialRootState instanceof Error)) {
      this._handleRootStateChange(initialRootState);
    }
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (!affectsAgentHostProviderPreference(e, this._isSessionsWindow)) {
        return;
      }
      const current = this._agentHostService.rootState.value;
      if (current && !(current instanceof Error)) {
        this._handleRootStateChange(current);
      }
    }));
  }
  _enable() {
    if (this._enablementStore.value) {
      return;
    }
    const store = new DisposableStore();
    store.add(this._agentHostService.onDidNotification((notification) => {
      if (notification.type !== NotificationType.AuthRequired) {
        return;
      }
      this._authenticateNotificationResource(notification.resource);
    }));
    if (!this._isSessionsWindow) {
      const downloadProgress = store.add(this._instantiationService.createInstance(AgentHostDownloadProgress));
      store.add(this._agentHostService.onDidNotification((n) => {
        if (n.type === NotificationType.Progress) {
          downloadProgress.handleProgress(n);
        }
      }));
    }
    this._enablementStore.value = store;
  }
  _shouldRegisterAgent(provider) {
    return shouldSurfaceLocalAgentHostProvider(provider, this._configurationService, this._isSessionsWindow);
  }
  _handleRootStateChange(rootState) {
    if (!this._agentHostEnablementService.enabled.get()) {
      return;
    }
    const allowed = rootState.agents.filter((a) => this._shouldRegisterAgent(a.provider));
    const incoming = new Set(allowed.map((a) => a.provider));
    for (const [provider] of this._agentRegistrations) {
      if (!incoming.has(provider)) {
        this._agentRegistrations.deleteAndDispose(provider);
        this._modelProviders.delete(provider);
      }
    }
    this._authenticateWithServer(allowed).catch(() => {
    });
    for (const agent of allowed) {
      if (!this._agentRegistrations.has(agent.provider)) {
        this._registerAgent(agent);
      } else {
        const modelProvider = this._modelProviders.get(agent.provider);
        modelProvider?.updateModels(agent.models);
      }
    }
  }
  _registerAgent(agent) {
    const store = new DisposableStore();
    this._agentRegistrations.set(agent.provider, store);
    const sessionType = `agent-host-${agent.provider}`;
    const agentId = sessionType;
    const vendor = sessionType;
    const ahService = this._agentHostService;
    store.add(this._chatSessionsService.registerChatSessionContribution({
      type: sessionType,
      name: agentId,
      displayName: agent.displayName,
      description: agent.description,
      customAgentTarget: this._isSessionsWindow ? void 0 : Target.GitHubCopilot,
      canDelegate: true,
      requiresCustomModels: true,
      supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
      // Derived live from the agent's currently-advertised protected resources
      // (via the protected-resources service): an agent that marks the GitHub
      // Copilot resource `required: false` (Claude in native mode, Codex on
      // OpenAI) is usable without signing in. Falls back to "required" until the
      // agent host resolves. The paired `onDidChangeRequiresCopilotSignIn` lets
      // the sessions service re-evaluate this when the set changes.
      requiresCopilotSignIn: () => {
        const resources = this._protectedResourcesService.getProtectedResources(agent.provider);
        return resources !== void 0 ? protectedResourcesRequireGitHubCopilotSignIn(resources) : true;
      },
      onDidChangeRequiresCopilotSignIn: Event.signal(Event.filter(this._protectedResourcesService.onDidChange, (provider) => provider === agent.provider, store)),
      agentHostProviderId: agent.provider,
      supportsDelegation: true,
      capabilities: {
        supportsCheckpoints: true,
        supportsPromptAttachments: true,
        supportsImageAttachments: true,
        get terminalCommandPrefix() {
          return ahService.initializeResult.get()?.terminalCommandPrefix;
        }
      }
    }));
    const agentRegistration = store.add(this._activeClientService.registerForAgent(sessionType));
    const syncProvider = agentRegistration.syncProvider;
    const ambientScope = store.add(agentRegistration.acquireScope([]));
    const itemProvider = store.add(this._instantiationService.createInstance(
      AgentCustomizationItemProvider,
      "local",
      void 0,
      (syncedUri) => agentRegistration.getOrigin(syncedUri)
    ));
    itemProvider.setDraftCustomAgents(ambientScope.customAgents);
    itemProvider.setDraftCustomizations(ambientScope.customizations);
    store.add(this._customizationHarnessService.registerExternalHarness({
      id: sessionType,
      label: localize("agentHostHarnessLabel.local", "{0} [Agent Host]", agent.displayName),
      icon: ThemeIcon.fromId(Codicon.server.id),
      // The Tools section is surfaced for the Copilot CLI agent host only.
      hiddenSections: agent.provider === "copilotcli" ? [AICustomizationManagementSection.Prompts] : [AICustomizationManagementSection.Tools, AICustomizationManagementSection.Prompts],
      hideGenerateButton: true,
      syncProvider,
      itemProvider
    }));
    const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
      provider: agent.provider,
      agentId,
      sessionType,
      fullName: agent.displayName,
      description: agent.description,
      connection: this._agentHostService,
      connectionAuthority: LOCAL_AGENT_HOST_AUTHORITY,
      resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(resources),
      promptCacheNotification: this._promptCacheNotification
    }));
    store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));
    const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: void 0, managementCommand: void 0, when: void 0 };
    this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
    store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
    const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor));
    this._modelProviders.set(agent.provider, modelProvider);
    store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
    store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
    modelProvider.updateModels(agent.models);
    store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => {
      const agents = this._getRootAgents();
      this._authenticateWithServer(agents).catch(() => {
      });
    }));
    store.add(this._authenticationService.onDidChangeSessions(() => {
      const agents = this._getRootAgents();
      this._authenticateWithServer(agents).catch(() => {
      });
    }));
  }
  _getRootAgents() {
    const rootState = this._agentHostService.rootState.value;
    const agents = rootState && !(rootState instanceof Error) ? rootState.agents : [];
    return agents.filter((a) => this._shouldRegisterAgent(a.provider));
  }
  /**
   * Authenticate using protectedResources from agent info in root state.
   * Resolves tokens via the standard VS Code authentication service.
   */
  async _authenticateWithServer(agents) {
    const generation = this._authenticationGeneration;
    if (!this._isAuthenticationCurrent(generation)) {
      return;
    }
    const isInitialAuthentication = agents.length > 0 && !this._didStartInitialAuthentication;
    if (isInitialAuthentication) {
      this._didStartInitialAuthentication = true;
      mark("code/agentHost/willAuthenticate");
    }
    this._agentHostService.setAuthenticationPending(true);
    try {
      const testToken = this._getScenarioAutomationToken();
      if (testToken !== void 0) {
        await this._seedTestToken(agents, testToken, generation);
        return;
      }
      await this._instantiationService.invokeFunction(authenticateProtectedResources, agents, {
        authTokenCache: this._authTokenCache,
        logPrefix: "[AgentHost]",
        isCurrent: () => this._isAuthenticationCurrent(generation),
        authenticate: (request) => this._authenticateIfCurrent(request, generation)
      });
    } catch (err) {
      if (!isCancellationError(err)) {
        this._logService.error("[AgentHost] Failed to authenticate with server", err);
      }
    } finally {
      if (this._isAuthenticationCurrent(generation)) {
        this._agentHostService.setAuthenticationPending(false);
      }
      if (isInitialAuthentication) {
        mark("code/agentHost/didAuthenticate");
      }
    }
  }
  _authenticateNotificationResource(protectedResource) {
    const generation = this._authenticationGeneration;
    if (!this._isAuthenticationCurrent(generation)) {
      return;
    }
    this._agentHostService.setAuthenticationPending(true);
    this._instantiationService.invokeFunction((accessor) => this._authRecovery.recover(accessor, protectedResource, {
      authTokenCache: this._authTokenCache,
      logPrefix: "[AgentHost]",
      isCurrent: () => this._isAuthenticationCurrent(generation),
      authenticate: (request) => this._authenticateIfCurrent(request, generation)
    })).catch((err) => {
      if (!isCancellationError(err)) {
        this._logService.error(`[AgentHost] Failed to authenticate notified resource ${protectedResource.resource}`, err);
      }
    }).finally(() => {
      if (this._isAuthenticationCurrent(generation)) {
        this._agentHostService.setAuthenticationPending(false);
      }
    });
  }
  /**
   * Interactively prompt the user to authenticate when the server requires it.
   * Uses protectedResources from root state, resolves the auth provider,
   * creates a session (which triggers the login UI), and pushes the token
   * to the server. Returns true if authentication succeeded.
   */
  async _resolveAuthenticationInteractively(protectedResources) {
    const generation = this._authenticationGeneration;
    if (!this._isAuthenticationCurrent(generation)) {
      return false;
    }
    const testToken = this._getScenarioAutomationToken();
    if (testToken !== void 0) {
      for (const resource of protectedResources) {
        await this._authTokenCache.authenticate(
          resource.resource,
          resource.scopes_supported,
          testToken,
          () => this._authenticateIfCurrent({ resource: resource.resource, token: testToken }, generation)
        );
      }
      return protectedResources.length > 0;
    }
    return this._instantiationService.invokeFunction(resolveAuthenticationInteractively, protectedResources, {
      authTokenCache: this._authTokenCache,
      logPrefix: "[AgentHost]",
      isCurrent: () => this._isAuthenticationCurrent(generation),
      authenticate: (request) => this._authenticateIfCurrent(request, generation)
    });
  }
  async _seedTestToken(agents, token, generation) {
    for (const agent of agents) {
      for (const resource of agent.protectedResources ?? []) {
        await this._authTokenCache.authenticate(
          resource.resource,
          resource.scopes_supported,
          token,
          () => this._authenticateIfCurrent({ resource: resource.resource, token }, generation)
        );
      }
    }
  }
  _getScenarioAutomationToken() {
    if (!this._enableSmokeTestDriver) {
      return void 0;
    }
    const token = this._configurationService.getValue("chat.agentHost.unsafeTestToken");
    return typeof token === "string" && token.length > 0 ? token : void 0;
  }
  _isAuthenticationCurrent(generation) {
    return generation === this._authenticationGeneration && this._agentHostEnablementService.enabled.get();
  }
  _authenticateIfCurrent(request, generation) {
    if (!this._isAuthenticationCurrent(generation)) {
      return Promise.reject(new CancellationError());
    }
    return this._agentHostService.authenticate(request);
  }
};
AgentHostContribution.ID = "workbench.contrib.agentHostContribution";
AgentHostContribution = __decorateClass([
  __decorateParam(0, IAgentHostService),
  __decorateParam(1, IChatSessionsService),
  __decorateParam(2, IDefaultAccountService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, ILanguageModelsService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IAgentHostFileSystemService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ICustomizationHarnessService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IAgentHostActiveClientService),
  __decorateParam(12, IAgentHostProtectedResourcesService),
  __decorateParam(13, IAgentHostEnablementService)
], AgentHostContribution);
export {
  AgentHostContribution,
  AgentHostSessionHandler2 as AgentHostSessionHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0Q2hhdENvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGFmZmVjdHNBZ2VudEhvc3RQcm92aWRlclByZWZlcmVuY2UsIElBZ2VudEhvc3RTZXJ2aWNlLCBwcm90ZWN0ZWRSZXNvdXJjZXNSZXF1aXJlR2l0SHViQ29waWxvdFNpZ25Jbiwgc2hvdWxkU3VyZmFjZUxvY2FsQWdlbnRIb3N0UHJvdmlkZXIsIHR5cGUgQWdlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTE9DQUxfQUdFTlRfSE9TVF9BVVRIT1JJVFkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyB0eXBlIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IHR5cGUgQWdlbnRJbmZvLCB0eXBlIFJvb3RTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IENIQVRHUFRfU1VCU0NSSVBUSU9OX01PREVMX1NPVVJDRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRNb2RlbFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25zRXh0ZW5zaW9ucywgSUFzeW5jQ2hhdFNlc3Npb25BY3RpdmF0aW9uUmVnaXN0cnksIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBpc0xvY2FsQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZU1vZGVsU291cmNlUHJlc2VudGF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbFNvdXJjZVByZXNlbnRhdGlvbi5qcyc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciB9IGZyb20gJy4vYWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdERvd25sb2FkUHJvZ3Jlc3MgfSBmcm9tICcuL2FnZW50SG9zdERvd25sb2FkUHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2VzLCBBZ2VudEhvc3RBdXRoZW50aWNhdGlvblJlY292ZXJ5LCBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSwgcmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseSB9IGZyb20gJy4vYWdlbnRIb3N0QXV0aC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RMYW5ndWFnZU1vZGVsUHJvdmlkZXIsIGFnZW50SG9zdFByb3ZpZGVyU3VwcG9ydHNBdXRvTW9kZWwgfSBmcm9tICcuL2FnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlciB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb24gfSBmcm9tICcuL2FnZW50SG9zdFByb21wdENhY2hlTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RQcm90ZWN0ZWRSZXNvdXJjZXNTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RQcm90ZWN0ZWRSZXNvdXJjZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuXG5jb25zdCBMT0NBTF9BR0VOVF9IT1NUX1NFU1NJT05fVFlQRV9QUkVGSVggPSAnYWdlbnQtaG9zdC0nO1xuXG5sYW5ndWFnZU1vZGVsU291cmNlUHJlc2VudGF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoe1xuXHRvd25lclZlbmRvcjogJ2FnZW50LWhvc3QtY29kZXgnLFxuXHRzb3VyY2VJZDogQ0hBVEdQVF9TVUJTQ1JJUFRJT05fTU9ERUxfU09VUkNFX0lELFxuXHRsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdE1vZGVsU291cmNlLmNoYXRHUFQubGFiZWwnLCBcIkNoYXRHUFRcIiksXG5cdGljb246IENvZGljb24ub3BlbmFpLFxuXHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdE1vZGVsU291cmNlLmNoYXRHUFQuZGVzY3JpcHRpb24nLCBcIk1vZGVscyBwcm92aWRlZCBieSB5b3VyIENoYXRHUFQgc3Vic2NyaXB0aW9uXCIpLFxufSk7XG5cblJlZ2lzdHJ5LmFzPElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5PihDaGF0U2Vzc2lvbnNFeHRlbnNpb25zLkFzeW5jQWN0aXZhdGlvbikucmVnaXN0ZXIoe1xuXHRtYXRjaFNlc3Npb25UeXBlOiBzZXNzaW9uVHlwZSA9PiBpc0xvY2FsQWdlbnRIb3N0VGFyZ2V0KHNlc3Npb25UeXBlKSxcblx0d2FpdEZvckFjdGl2YXRpb246IHdhaXRGb3JMb2NhbEFnZW50SG9zdEFjdGl2YXRpb24sXG59KTtcblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvY2FsQWdlbnRIb3N0QWN0aXZhdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvblR5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UpO1xuXHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRpZiAoIWFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBwcm92aWRlciA9IGdldExvY2FsQWdlbnRIb3N0UHJvdmlkZXJGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSk7XG5cdGlmICghcHJvdmlkZXIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdGNvbnN0IHJvb3RTdGF0ZSA9IGFnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGlmIChyb290U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocm9vdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gcm9vdFN0YXRlLmFnZW50cy5zb21lKGFnZW50ID0+IGFnZW50LnByb3ZpZGVyID09PSBwcm92aWRlciAmJiBzaG91bGRTdXJmYWNlTG9jYWxBZ2VudEhvc3RQcm92aWRlcihhZ2VudC5wcm92aWRlciwgY29uZmlndXJhdGlvblNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhbmdlZCA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRFdmVudC50b1Byb21pc2UoYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUub25EaWRDaGFuZ2UpLnRoZW4oKCkgPT4gdHJ1ZSksXG5cdFx0XHRFdmVudC50b1Byb21pc2UoYWdlbnRIb3N0U2VydmljZS5vbkFnZW50SG9zdEV4aXQpLnRoZW4oKCkgPT4gZmFsc2UpLFxuXHRcdF0pO1xuXHRcdGlmICghY2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBnZXRMb2NhbEFnZW50SG9zdFByb3ZpZGVyRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IEFnZW50UHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRpZiAoIWlzTG9jYWxBZ2VudEhvc3RUYXJnZXQoc2Vzc2lvblR5cGUpIHx8ICFzZXNzaW9uVHlwZS5zdGFydHNXaXRoKExPQ0FMX0FHRU5UX0hPU1RfU0VTU0lPTl9UWVBFX1BSRUZJWCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBzZXNzaW9uVHlwZS5zbGljZShMT0NBTF9BR0VOVF9IT1NUX1NFU1NJT05fVFlQRV9QUkVGSVgubGVuZ3RoKSB8fCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB7IEFnZW50SG9zdFNlc3Npb25IYW5kbGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5qcyc7XG5cbi8qKlxuICogRGlzY292ZXJzIGF2YWlsYWJsZSBhZ2VudHMgZnJvbSB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzIGFuZCBkeW5hbWljYWxseVxuICogcmVnaXN0ZXJzIGVhY2ggb25lIGFzIGEgY2hhdCBzZXNzaW9uIHR5cGUgd2l0aCBpdHMgb3duIHNlc3Npb24gaGFuZGxlcixcbiAqIGN1c3RvbWl6YXRpb24gaGFybmVzcywgYW5kIGxhbmd1YWdlIG1vZGVsIHByb3ZpZGVyLlxuICpcbiAqIEdhdGVkIG9uIEFnZW50IEhvc3QgcnVudGltZSBhdmFpbGFiaWxpdHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmFnZW50SG9zdENvbnRyaWJ1dGlvbic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRSZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8QWdlbnRQcm92aWRlciwgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0LyoqIE1vZGVsIHByb3ZpZGVycyBrZXllZCBieSBhZ2VudCBwcm92aWRlciwgZm9yIHB1c2hpbmcgbW9kZWwgdXBkYXRlcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxQcm92aWRlcnMgPSBuZXcgTWFwPEFnZW50UHJvdmlkZXIsIEFnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlcj4oKTtcblxuXHQvKiogRGVkdXBlcyByZWR1bmRhbnQgYGF1dGhlbnRpY2F0ZWAgUlBDcyB3aGVuIHRoZSByZXNvbHZlZCB0b2tlbiBoYXNuJ3QgY2hhbmdlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYXV0aFRva2VuQ2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXV0aFJlY292ZXJ5ID0gbmV3IEFnZW50SG9zdEF1dGhlbnRpY2F0aW9uUmVjb3ZlcnkoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1Nlc3Npb25zV2luZG93OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbmFibGVTbW9rZVRlc3REcml2ZXI6IGJvb2xlYW47XG5cdHByaXZhdGUgX2luaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuYWJsZW1lbnRTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIF9hdXRoZW50aWNhdGlvbkdlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIF9kaWRTdGFydEluaXRpYWxBdXRoZW50aWNhdGlvbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcm9tcHRDYWNoZU5vdGlmaWNhdGlvbjogQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2U6IElBZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2xpZW50U2VydmljZTogSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RQcm90ZWN0ZWRSZXNvdXJjZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb3RlY3RlZFJlc291cmNlc1NlcnZpY2U6IElBZ2VudEhvc3RQcm90ZWN0ZWRSZXNvdXJjZXNTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pc1Nlc3Npb25zV2luZG93ID0gZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3c7XG5cdFx0dGhpcy5fZW5hYmxlU21va2VUZXN0RHJpdmVyID0gISFlbnZpcm9ubWVudFNlcnZpY2UuZW5hYmxlU21va2VUZXN0RHJpdmVyO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3Qgd2FzSW5pdGlhbGl6ZWQgPSB0aGlzLl9pbml0aWFsaXplZDtcblx0XHRcdFx0dGhpcy5faW5pdGlhbGl6ZSgpO1xuXHRcdFx0XHR0aGlzLl9lbmFibGUoKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLnZhbHVlO1xuXHRcdFx0XHRpZiAod2FzSW5pdGlhbGl6ZWQgJiYgY3VycmVudCAmJiAhKGN1cnJlbnQgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVSb290U3RhdGVDaGFuZ2UoY3VycmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uR2VuZXJhdGlvbisrO1xuXHRcdFx0XHR0aGlzLl9hdXRoVG9rZW5DYWNoZS5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9hdXRoUmVjb3ZlcnkuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fZW5hYmxlbWVudFN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uuc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fYWdlbnRSZWdpc3RyYXRpb25zLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdFx0XHR0aGlzLl9tb2RlbFByb3ZpZGVycy5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRpYWxpemUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2luaXRpYWxpemVkID0gdHJ1ZTtcblx0XHR0aGlzLl9wcm9tcHRDYWNoZU5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFByb21wdENhY2hlTm90aWZpY2F0aW9uKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UucmVnaXN0ZXJBdXRob3JpdHkoTE9DQUxfQUdFTlRfSE9TVF9BVVRIT1JJVFksIHRoaXMuX2FnZW50SG9zdFNlcnZpY2UpKTtcblxuXHRcdC8vIFJlYWN0IHRvIHJvb3Qgc3RhdGUgY2hhbmdlcyAoYWdlbnQgZGlzY292ZXJ5IC8gcmVtb3ZhbClcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJvb3RTdGF0ZS5vbkRpZENoYW5nZShyb290U3RhdGUgPT4ge1xuXHRcdFx0dGhpcy5faGFuZGxlUm9vdFN0YXRlQ2hhbmdlKHJvb3RTdGF0ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUHJvY2VzcyBpbml0aWFsIHJvb3Qgc3RhdGUgaWYgYWxyZWFkeSBhdmFpbGFibGVcblx0XHRjb25zdCBpbml0aWFsUm9vdFN0YXRlID0gdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUudmFsdWU7XG5cdFx0aWYgKGluaXRpYWxSb290U3RhdGUgJiYgIShpbml0aWFsUm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVSb290U3RhdGVDaGFuZ2UoaW5pdGlhbFJvb3RTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKCFhZmZlY3RzQWdlbnRIb3N0UHJvdmlkZXJQcmVmZXJlbmNlKGUsIHRoaXMuX2lzU2Vzc2lvbnNXaW5kb3cpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJvb3RTdGF0ZS52YWx1ZTtcblx0XHRcdGlmIChjdXJyZW50ICYmICEoY3VycmVudCBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVSb290U3RhdGVDaGFuZ2UoY3VycmVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5hYmxlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lbmFibGVtZW50U3RvcmUudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uub25EaWROb3RpZmljYXRpb24obm90aWZpY2F0aW9uID0+IHtcblx0XHRcdGlmIChub3RpZmljYXRpb24udHlwZSAhPT0gTm90aWZpY2F0aW9uVHlwZS5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRlTm90aWZpY2F0aW9uUmVzb3VyY2Uobm90aWZpY2F0aW9uLnJlc291cmNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTdXJmYWNlIHRoZSBhZ2VudCBob3N0J3MgbGF6eSwgZmlyc3QtdXNlIFNESyBkb3dubG9hZCBhcyBhIHByb2dyZXNzXG5cdFx0Ly8gbm90aWZpY2F0aW9uLiBUaGUgQWdlbnRzIHdpbmRvdyByZW5kZXJzIHRoaXMgdmlhIGl0cyBvd24gc2Vzc2lvbnNcblx0XHQvLyBwcm92aWRlciAoYEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyYCksIHNvIG9ubHkgd2lyZSBpdCB1cCBoZXJlXG5cdFx0Ly8gZm9yIHJlZ3VsYXIgZWRpdG9yIHdpbmRvd3MgdG8gYXZvaWQgZHVwbGljYXRlIG5vdGlmaWNhdGlvbnMgKHRoaXNcblx0XHQvLyBjb250cmlidXRpb24gcnVucyBpbiBib3RoIHdpbmRvd3MpLiBUaGUgbWF0Y2hpbmcgYGNyZWF0ZVNlc3Npb25gXG5cdFx0Ly8gb3B0LWluIChgcHJvZ3Jlc3NUb2tlbmApIGxpdmVzIGluIHRoZSBlZGl0b3Itd2luZG93IHNlc3Npb24gaGFuZGxlcnMuXG5cdFx0aWYgKCF0aGlzLl9pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRjb25zdCBkb3dubG9hZFByb2dyZXNzID0gc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdERvd25sb2FkUHJvZ3Jlc3MpKTtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLm9uRGlkTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0XHRpZiAobi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlByb2dyZXNzKSB7XG5cdFx0XHRcdFx0ZG93bmxvYWRQcm9ncmVzcy5oYW5kbGVQcm9ncmVzcyhuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9lbmFibGVtZW50U3RvcmUudmFsdWUgPSBzdG9yZTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFJlZ2lzdGVyQWdlbnQocHJvdmlkZXI6IEFnZW50UHJvdmlkZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2hvdWxkU3VyZmFjZUxvY2FsQWdlbnRIb3N0UHJvdmlkZXIocHJvdmlkZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9pc1Nlc3Npb25zV2luZG93KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVJvb3RTdGF0ZUNoYW5nZShyb290U3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhbGxvd2VkID0gcm9vdFN0YXRlLmFnZW50cy5maWx0ZXIoYSA9PiB0aGlzLl9zaG91bGRSZWdpc3RlckFnZW50KGEucHJvdmlkZXIpKTtcblx0XHRjb25zdCBpbmNvbWluZyA9IG5ldyBTZXQoYWxsb3dlZC5tYXAoYSA9PiBhLnByb3ZpZGVyKSk7XG5cblx0XHQvLyBSZW1vdmUgYWdlbnRzIHRoYXQgYXJlIG5vIGxvbmdlciBwcmVzZW50IE9SIG5vIGxvbmdlciBhbGxvd2VkXG5cdFx0Zm9yIChjb25zdCBbcHJvdmlkZXJdIG9mIHRoaXMuX2FnZW50UmVnaXN0cmF0aW9ucykge1xuXHRcdFx0aWYgKCFpbmNvbWluZy5oYXMocHJvdmlkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX2FnZW50UmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKHByb3ZpZGVyKTtcblx0XHRcdFx0dGhpcy5fbW9kZWxQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBdXRoZW50aWNhdGUgdXNpbmcgcHJvdGVjdGVkUmVzb3VyY2VzIGZyb20gYWdlbnQgaW5mby4gT25seSBhdXRoIHRoZVxuXHRcdC8vIGFsbG93ZWQgYWdlbnRzIHNvIGEgc3VwcHJlc3NlZCBwcm92aWRlciAoZS5nLiBFSC1wcmVmZXJyZWQgQ2xhdWRlIGluXG5cdFx0Ly8gdGhpcyB3aW5kb3cpIGRvZXNuJ3QgdHJpZ2dlciB0b2tlbiByZXNvbHV0aW9uIHdvcmsgZm9yIGFuXG5cdFx0Ly8gaW1wbGVtZW50YXRpb24gd2UncmUgbm90IGdvaW5nIHRvIGJyaWRnZS5cblx0XHR0aGlzLl9hdXRoZW50aWNhdGVXaXRoU2VydmVyKGFsbG93ZWQpXG5cdFx0XHQuY2F0Y2goKCkgPT4geyAvKiBiZXN0LWVmZm9ydCAqLyB9KTtcblxuXHRcdC8vIFJlZ2lzdGVyIG5ldyBhZ2VudHMgYW5kIHB1c2ggbW9kZWwgdXBkYXRlcyB0byBleGlzdGluZyBvbmVzXG5cdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBhbGxvd2VkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2FnZW50UmVnaXN0cmF0aW9ucy5oYXMoYWdlbnQucHJvdmlkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyQWdlbnQoYWdlbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUHVzaCB1cGRhdGVkIG1vZGVscyB0byBleGlzdGluZyBtb2RlbCBwcm92aWRlclxuXHRcdFx0XHRjb25zdCBtb2RlbFByb3ZpZGVyID0gdGhpcy5fbW9kZWxQcm92aWRlcnMuZ2V0KGFnZW50LnByb3ZpZGVyKTtcblx0XHRcdFx0bW9kZWxQcm92aWRlcj8udXBkYXRlTW9kZWxzKGFnZW50Lm1vZGVscyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBZ2VudChhZ2VudDogQWdlbnRJbmZvKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fYWdlbnRSZWdpc3RyYXRpb25zLnNldChhZ2VudC5wcm92aWRlciwgc3RvcmUpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gYGFnZW50LWhvc3QtJHthZ2VudC5wcm92aWRlcn1gO1xuXHRcdGNvbnN0IGFnZW50SWQgPSBzZXNzaW9uVHlwZTtcblx0XHRjb25zdCB2ZW5kb3IgPSBzZXNzaW9uVHlwZTtcblx0XHRjb25zdCBhaFNlcnZpY2UgPSB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlO1xuXG5cdFx0Ly8gQ2hhdCBzZXNzaW9uIGNvbnRyaWJ1dGlvbi5cblx0XHQvLyBLZWVwIHRoZSBkZWxlZ2F0aW9uIHBpY2tlciBhdmFpbGFibGUgZm9yIGxvY2FsIGFnZW50IGhvc3Qgc2Vzc2lvbnMgaW5cblx0XHQvLyBib3RoIFZTIENvZGUgYW5kIHRoZSBBZ2VudHMgYXBwIHNvIHVzZXJzIGNhbiBoYW5kIG9mZiAoY29udGludWUpIHRoZWlyXG5cdFx0Ly8gY29udmVyc2F0aW9uIHRvIGFueSBvdGhlciBhZ2VudCBob3N0IHNlc3Npb24gb3IgcmVtb3RlIHRhcmdldC5cblx0XHRzdG9yZS5hZGQodGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHtcblx0XHRcdHR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdFx0bmFtZTogYWdlbnRJZCxcblx0XHRcdGRpc3BsYXlOYW1lOiBhZ2VudC5kaXNwbGF5TmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdGN1c3RvbUFnZW50VGFyZ2V0OiB0aGlzLl9pc1Nlc3Npb25zV2luZG93ID8gdW5kZWZpbmVkIDogVGFyZ2V0LkdpdEh1YkNvcGlsb3QsXG5cdFx0XHRjYW5EZWxlZ2F0ZTogdHJ1ZSxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiB0cnVlLFxuXHRcdFx0c3VwcG9ydHNBdXRvTW9kZWw6IGFnZW50SG9zdFByb3ZpZGVyU3VwcG9ydHNBdXRvTW9kZWwoYWdlbnQucHJvdmlkZXIpLFxuXHRcdFx0Ly8gRGVyaXZlZCBsaXZlIGZyb20gdGhlIGFnZW50J3MgY3VycmVudGx5LWFkdmVydGlzZWQgcHJvdGVjdGVkIHJlc291cmNlc1xuXHRcdFx0Ly8gKHZpYSB0aGUgcHJvdGVjdGVkLXJlc291cmNlcyBzZXJ2aWNlKTogYW4gYWdlbnQgdGhhdCBtYXJrcyB0aGUgR2l0SHViXG5cdFx0XHQvLyBDb3BpbG90IHJlc291cmNlIGByZXF1aXJlZDogZmFsc2VgIChDbGF1ZGUgaW4gbmF0aXZlIG1vZGUsIENvZGV4IG9uXG5cdFx0XHQvLyBPcGVuQUkpIGlzIHVzYWJsZSB3aXRob3V0IHNpZ25pbmcgaW4uIEZhbGxzIGJhY2sgdG8gXCJyZXF1aXJlZFwiIHVudGlsIHRoZVxuXHRcdFx0Ly8gYWdlbnQgaG9zdCByZXNvbHZlcy4gVGhlIHBhaXJlZCBgb25EaWRDaGFuZ2VSZXF1aXJlc0NvcGlsb3RTaWduSW5gIGxldHNcblx0XHRcdC8vIHRoZSBzZXNzaW9ucyBzZXJ2aWNlIHJlLWV2YWx1YXRlIHRoaXMgd2hlbiB0aGUgc2V0IGNoYW5nZXMuXG5cdFx0XHRyZXF1aXJlc0NvcGlsb3RTaWduSW46ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gdGhpcy5fcHJvdGVjdGVkUmVzb3VyY2VzU2VydmljZS5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoYWdlbnQucHJvdmlkZXIpO1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2VzICE9PSB1bmRlZmluZWQgPyBwcm90ZWN0ZWRSZXNvdXJjZXNSZXF1aXJlR2l0SHViQ29waWxvdFNpZ25JbihyZXNvdXJjZXMpIDogdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVJlcXVpcmVzQ29waWxvdFNpZ25JbjogRXZlbnQuc2lnbmFsKEV2ZW50LmZpbHRlcih0aGlzLl9wcm90ZWN0ZWRSZXNvdXJjZXNTZXJ2aWNlLm9uRGlkQ2hhbmdlLCBwcm92aWRlciA9PiBwcm92aWRlciA9PT0gYWdlbnQucHJvdmlkZXIsIHN0b3JlKSksXG5cdFx0XHRhZ2VudEhvc3RQcm92aWRlcklkOiBhZ2VudC5wcm92aWRlcixcblx0XHRcdHN1cHBvcnRzRGVsZWdhdGlvbjogdHJ1ZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRzdXBwb3J0c0NoZWNrcG9pbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c0ltYWdlQXR0YWNobWVudHM6IHRydWUsXG5cdFx0XHRcdGdldCB0ZXJtaW5hbENvbW1hbmRQcmVmaXgoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFoU2VydmljZS5pbml0aWFsaXplUmVzdWx0LmdldCgpPy50ZXJtaW5hbENvbW1hbmRQcmVmaXg7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWdlbnRSZWdpc3RyYXRpb24gPSBzdG9yZS5hZGQodGhpcy5fYWN0aXZlQ2xpZW50U2VydmljZS5yZWdpc3RlckZvckFnZW50KHNlc3Npb25UeXBlKSk7XG5cdFx0Y29uc3Qgc3luY1Byb3ZpZGVyID0gYWdlbnRSZWdpc3RyYXRpb24uc3luY1Byb3ZpZGVyO1xuXHRcdC8vIFRoZSBtYW5hZ2VtZW50IFVJIHJlbWFpbnMgYW1iaWVudCB3aGlsZSBpbmRpdmlkdWFsIHNlc3Npb25zIHVzZSB0aGVpciB3b3JraW5nLWRpcmVjdG9yeSBzY29wZXMuXG5cdFx0Y29uc3QgYW1iaWVudFNjb3BlID0gc3RvcmUuYWRkKGFnZW50UmVnaXN0cmF0aW9uLmFjcXVpcmVTY29wZShbXSkpO1xuXG5cdFx0Y29uc3QgaXRlbVByb3ZpZGVyID0gc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciwgJ2xvY2FsJywgdW5kZWZpbmVkLFxuXHRcdFx0c3luY2VkVXJpID0+IGFnZW50UmVnaXN0cmF0aW9uLmdldE9yaWdpbihzeW5jZWRVcmkpKSk7XG5cdFx0aXRlbVByb3ZpZGVyLnNldERyYWZ0Q3VzdG9tQWdlbnRzKGFtYmllbnRTY29wZS5jdXN0b21BZ2VudHMpO1xuXHRcdGl0ZW1Qcm92aWRlci5zZXREcmFmdEN1c3RvbWl6YXRpb25zKGFtYmllbnRTY29wZS5jdXN0b21pemF0aW9ucyk7XG5cdFx0Ly8gYFtBZ2VudCBIb3N0XWAgc3VmZml4IGRpc2FtYmlndWF0ZXMgZnJvbSB0aGUgZXh0ZW5zaW9uLWhvc3QgQ29waWxvdCBDTEkgaGFybmVzcywgd2hpY2ggdXNlcyB0aGUgc2FtZSBkaXNwbGF5TmFtZS5cblx0XHRzdG9yZS5hZGQodGhpcy5fY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLnJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKHtcblx0XHRcdGlkOiBzZXNzaW9uVHlwZSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0SGFybmVzc0xhYmVsLmxvY2FsJywgXCJ7MH0gW0FnZW50IEhvc3RdXCIsIGFnZW50LmRpc3BsYXlOYW1lKSxcblx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5zZXJ2ZXIuaWQpLFxuXHRcdFx0Ly8gVGhlIFRvb2xzIHNlY3Rpb24gaXMgc3VyZmFjZWQgZm9yIHRoZSBDb3BpbG90IENMSSBhZ2VudCBob3N0IG9ubHkuXG5cdFx0XHRoaWRkZW5TZWN0aW9uczogYWdlbnQucHJvdmlkZXIgPT09ICdjb3BpbG90Y2xpJyA/IFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzXSA6IFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scywgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0c10sXG5cdFx0XHRoaWRlR2VuZXJhdGVCdXR0b246IHRydWUsXG5cdFx0XHRzeW5jUHJvdmlkZXIsXG5cdFx0XHRpdGVtUHJvdmlkZXIsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBoYW5kbGVyXG5cdFx0Y29uc3Qgc2Vzc2lvbkhhbmRsZXIgPSBzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIHtcblx0XHRcdHByb3ZpZGVyOiBhZ2VudC5wcm92aWRlcixcblx0XHRcdGFnZW50SWQsXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHRcdGZ1bGxOYW1lOiBhZ2VudC5kaXNwbGF5TmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdGNvbm5lY3Rpb246IHRoaXMuX2FnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRjb25uZWN0aW9uQXV0aG9yaXR5OiBMT0NBTF9BR0VOVF9IT1NUX0FVVEhPUklUWSxcblx0XHRcdHJlc29sdmVBdXRoZW50aWNhdGlvbjogKHJlc291cmNlcykgPT4gdGhpcy5fcmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseShyZXNvdXJjZXMpLFxuXHRcdFx0cHJvbXB0Q2FjaGVOb3RpZmljYXRpb246IHRoaXMuX3Byb21wdENhY2hlTm90aWZpY2F0aW9uLFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKHNlc3Npb25UeXBlLCBzZXNzaW9uSGFuZGxlcikpO1xuXG5cdFx0Ly8gTGFuZ3VhZ2UgbW9kZWwgcHJvdmlkZXIuXG5cdFx0Ly8gT3JkZXIgbWF0dGVyczogYHVwZGF0ZU1vZGVsc2AgbXVzdCBiZSBjYWxsZWQgYWZ0ZXJcblx0XHQvLyBgcmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXJgIHNvIHRoZSBpbml0aWFsIGBvbkRpZENoYW5nZWAgaXMgb2JzZXJ2ZWQuXG5cdFx0Ly8gT25lIHZlbmRvciBkZXNjcmlwdG9yIGZvciB0aGlzIGhhcm5lc3MuIENsYXVkZSdzIGBhbnRocm9waWNgL2Bjb3BpbG90YFxuXHRcdC8vIG1vZGVsIGdyb3VwcyAocGVyLXNlc3Npb24gcHJvdmlkZXIgc2VsZWN0aW9uKSByZXNvbHZlIHRoZWlyIGRpc3BsYXkgbmFtZXNcblx0XHQvLyBmcm9tIHRoZSBDb3BpbG90IGV4dGVuc2lvbidzIHByZS1leGlzdGluZyB2ZW5kb3JzLCBzbyByZWdpc3RlcmluZyB0aGVtXG5cdFx0Ly8gaGVyZSB3b3VsZCBhZGQgbm90aGluZyBhbmQgcmlzayBjbG9iYmVyaW5nIHRob3NlIHNoYXJlZCB2ZW5kb3JzIG9uIGRpc3Bvc2UuXG5cdFx0Y29uc3QgdmVuZG9yRGVzY3JpcHRvciA9IHsgdmVuZG9yLCBkaXNwbGF5TmFtZTogYWdlbnQuZGlzcGxheU5hbWUsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH07XG5cdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFt2ZW5kb3JEZXNjcmlwdG9yXSwgW10pO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFtdLCBbdmVuZG9yRGVzY3JpcHRvcl0pKSk7XG5cdFx0Y29uc3QgbW9kZWxQcm92aWRlciA9IHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKHNlc3Npb25UeXBlLCB2ZW5kb3IpKTtcblx0XHR0aGlzLl9tb2RlbFByb3ZpZGVycy5zZXQoYWdlbnQucHJvdmlkZXIsIG1vZGVsUHJvdmlkZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fbW9kZWxQcm92aWRlcnMuZGVsZXRlKGFnZW50LnByb3ZpZGVyKSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yLCBtb2RlbFByb3ZpZGVyKSk7XG5cdFx0bW9kZWxQcm92aWRlci51cGRhdGVNb2RlbHMoYWdlbnQubW9kZWxzKTtcblxuXHRcdC8vIFJlLWF1dGhlbnRpY2F0ZSB3aGVuIGNyZWRlbnRpYWxzIGNoYW5nZVxuXHRcdHN0b3JlLmFkZCh0aGlzLl9kZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCgoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudHMgPSB0aGlzLl9nZXRSb290QWdlbnRzKCk7XG5cdFx0XHR0aGlzLl9hdXRoZW50aWNhdGVXaXRoU2VydmVyKGFnZW50cykuY2F0Y2goKCkgPT4geyAvKiBiZXN0LWVmZm9ydCAqLyB9KTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50cyA9IHRoaXMuX2dldFJvb3RBZ2VudHMoKTtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0ZVdpdGhTZXJ2ZXIoYWdlbnRzKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJvb3RBZ2VudHMoKTogcmVhZG9ubHkgQWdlbnRJbmZvW10ge1xuXHRcdGNvbnN0IHJvb3RTdGF0ZSA9IHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGNvbnN0IGFnZW50cyA9IChyb290U3RhdGUgJiYgIShyb290U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikpID8gcm9vdFN0YXRlLmFnZW50cyA6IFtdO1xuXHRcdHJldHVybiBhZ2VudHMuZmlsdGVyKGEgPT4gdGhpcy5fc2hvdWxkUmVnaXN0ZXJBZ2VudChhLnByb3ZpZGVyKSk7XG5cdH1cblxuXHQvKipcblx0ICogQXV0aGVudGljYXRlIHVzaW5nIHByb3RlY3RlZFJlc291cmNlcyBmcm9tIGFnZW50IGluZm8gaW4gcm9vdCBzdGF0ZS5cblx0ICogUmVzb2x2ZXMgdG9rZW5zIHZpYSB0aGUgc3RhbmRhcmQgVlMgQ29kZSBhdXRoZW50aWNhdGlvbiBzZXJ2aWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXV0aGVudGljYXRlV2l0aFNlcnZlcihhZ2VudHM6IHJlYWRvbmx5IEFnZW50SW5mb1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uR2VuZXJhdGlvbjtcblx0XHRpZiAoIXRoaXMuX2lzQXV0aGVudGljYXRpb25DdXJyZW50KGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlzSW5pdGlhbEF1dGhlbnRpY2F0aW9uID0gYWdlbnRzLmxlbmd0aCA+IDAgJiYgIXRoaXMuX2RpZFN0YXJ0SW5pdGlhbEF1dGhlbnRpY2F0aW9uO1xuXHRcdGlmIChpc0luaXRpYWxBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0dGhpcy5fZGlkU3RhcnRJbml0aWFsQXV0aGVudGljYXRpb24gPSB0cnVlO1xuXHRcdFx0bWFyaygnY29kZS9hZ2VudEhvc3Qvd2lsbEF1dGhlbnRpY2F0ZScpO1xuXHRcdH1cblx0XHR0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyh0cnVlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGVzdFRva2VuID0gdGhpcy5fZ2V0U2NlbmFyaW9BdXRvbWF0aW9uVG9rZW4oKTtcblx0XHRcdGlmICh0ZXN0VG9rZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZWVkVGVzdFRva2VuKGFnZW50cywgdGVzdFRva2VuLCBnZW5lcmF0aW9uKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2VzLCBhZ2VudHMsIHtcblx0XHRcdFx0YXV0aFRva2VuQ2FjaGU6IHRoaXMuX2F1dGhUb2tlbkNhY2hlLFxuXHRcdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRcdGlzQ3VycmVudDogKCkgPT4gdGhpcy5faXNBdXRoZW50aWNhdGlvbkN1cnJlbnQoZ2VuZXJhdGlvbiksXG5cdFx0XHRcdGF1dGhlbnRpY2F0ZTogcmVxdWVzdCA9PiB0aGlzLl9hdXRoZW50aWNhdGVJZkN1cnJlbnQocmVxdWVzdCwgZ2VuZXJhdGlvbiksXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudEhvc3RdIEZhaWxlZCB0byBhdXRoZW50aWNhdGUgd2l0aCBzZXJ2ZXInLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5faXNBdXRoZW50aWNhdGlvbkN1cnJlbnQoZ2VuZXJhdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZS5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzSW5pdGlhbEF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHRcdG1hcmsoJ2NvZGUvYWdlbnRIb3N0L2RpZEF1dGhlbnRpY2F0ZScpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2F1dGhlbnRpY2F0ZU5vdGlmaWNhdGlvblJlc291cmNlKHByb3RlY3RlZFJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uR2VuZXJhdGlvbjtcblx0XHRpZiAoIXRoaXMuX2lzQXV0aGVudGljYXRpb25DdXJyZW50KGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uuc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHRoaXMuX2F1dGhSZWNvdmVyeS5yZWNvdmVyKGFjY2Vzc29yLCBwcm90ZWN0ZWRSZXNvdXJjZSwge1xuXHRcdFx0YXV0aFRva2VuQ2FjaGU6IHRoaXMuX2F1dGhUb2tlbkNhY2hlLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0aXNDdXJyZW50OiAoKSA9PiB0aGlzLl9pc0F1dGhlbnRpY2F0aW9uQ3VycmVudChnZW5lcmF0aW9uKSxcblx0XHRcdGF1dGhlbnRpY2F0ZTogcmVxdWVzdCA9PiB0aGlzLl9hdXRoZW50aWNhdGVJZkN1cnJlbnQocmVxdWVzdCwgZ2VuZXJhdGlvbiksXG5cdFx0fSkpXG5cdFx0XHQuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gYXV0aGVudGljYXRlIG5vdGlmaWVkIHJlc291cmNlICR7cHJvdGVjdGVkUmVzb3VyY2UucmVzb3VyY2V9YCwgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHRcdC5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2lzQXV0aGVudGljYXRpb25DdXJyZW50KGdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZS5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnRlcmFjdGl2ZWx5IHByb21wdCB0aGUgdXNlciB0byBhdXRoZW50aWNhdGUgd2hlbiB0aGUgc2VydmVyIHJlcXVpcmVzIGl0LlxuXHQgKiBVc2VzIHByb3RlY3RlZFJlc291cmNlcyBmcm9tIHJvb3Qgc3RhdGUsIHJlc29sdmVzIHRoZSBhdXRoIHByb3ZpZGVyLFxuXHQgKiBjcmVhdGVzIGEgc2Vzc2lvbiAod2hpY2ggdHJpZ2dlcnMgdGhlIGxvZ2luIFVJKSwgYW5kIHB1c2hlcyB0aGUgdG9rZW5cblx0ICogdG8gdGhlIHNlcnZlci4gUmV0dXJucyB0cnVlIGlmIGF1dGhlbnRpY2F0aW9uIHN1Y2NlZWRlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHkocHJvdGVjdGVkUmVzb3VyY2VzOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fYXV0aGVudGljYXRpb25HZW5lcmF0aW9uO1xuXHRcdGlmICghdGhpcy5faXNBdXRoZW50aWNhdGlvbkN1cnJlbnQoZ2VuZXJhdGlvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGVzdFRva2VuID0gdGhpcy5fZ2V0U2NlbmFyaW9BdXRvbWF0aW9uVG9rZW4oKTtcblx0XHRpZiAodGVzdFRva2VuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcHJvdGVjdGVkUmVzb3VyY2VzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2F1dGhUb2tlbkNhY2hlLmF1dGhlbnRpY2F0ZShcblx0XHRcdFx0XHRyZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdFx0XHRyZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkLFxuXHRcdFx0XHRcdHRlc3RUb2tlbixcblx0XHRcdFx0XHQoKSA9PiB0aGlzLl9hdXRoZW50aWNhdGVJZkN1cnJlbnQoeyByZXNvdXJjZTogcmVzb3VyY2UucmVzb3VyY2UsIHRva2VuOiB0ZXN0VG9rZW4gfSwgZ2VuZXJhdGlvbiksXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJvdGVjdGVkUmVzb3VyY2VzLmxlbmd0aCA+IDA7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5LCBwcm90ZWN0ZWRSZXNvdXJjZXMsIHtcblx0XHRcdGF1dGhUb2tlbkNhY2hlOiB0aGlzLl9hdXRoVG9rZW5DYWNoZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGlzQ3VycmVudDogKCkgPT4gdGhpcy5faXNBdXRoZW50aWNhdGlvbkN1cnJlbnQoZ2VuZXJhdGlvbiksXG5cdFx0XHRhdXRoZW50aWNhdGU6IHJlcXVlc3QgPT4gdGhpcy5fYXV0aGVudGljYXRlSWZDdXJyZW50KHJlcXVlc3QsIGdlbmVyYXRpb24pLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VlZFRlc3RUb2tlbihhZ2VudHM6IHJlYWRvbmx5IEFnZW50SW5mb1tdLCB0b2tlbjogc3RyaW5nLCBnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIGFnZW50cykge1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBhZ2VudC5wcm90ZWN0ZWRSZXNvdXJjZXMgPz8gW10pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYXV0aFRva2VuQ2FjaGUuYXV0aGVudGljYXRlKFxuXHRcdFx0XHRcdHJlc291cmNlLnJlc291cmNlLFxuXHRcdFx0XHRcdHJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQsXG5cdFx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5fYXV0aGVudGljYXRlSWZDdXJyZW50KHsgcmVzb3VyY2U6IHJlc291cmNlLnJlc291cmNlLCB0b2tlbiB9LCBnZW5lcmF0aW9uKSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTY2VuYXJpb0F1dG9tYXRpb25Ub2tlbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIFNtb2tlLXRlc3QgZXNjYXBlIGhhdGNoLlxuXHRcdGlmICghdGhpcy5fZW5hYmxlU21va2VUZXN0RHJpdmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdjaGF0LmFnZW50SG9zdC51bnNhZmVUZXN0VG9rZW4nKTtcblx0XHRyZXR1cm4gdHlwZW9mIHRva2VuID09PSAnc3RyaW5nJyAmJiB0b2tlbi5sZW5ndGggPiAwID8gdG9rZW4gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0F1dGhlbnRpY2F0aW9uQ3VycmVudChnZW5lcmF0aW9uOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZ2VuZXJhdGlvbiA9PT0gdGhpcy5fYXV0aGVudGljYXRpb25HZW5lcmF0aW9uICYmIHRoaXMuX2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9hdXRoZW50aWNhdGVJZkN1cnJlbnQocmVxdWVzdDogeyByZXNvdXJjZTogc3RyaW5nOyBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgdG9rZW46IHN0cmluZyB9LCBnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRpZiAoIXRoaXMuX2lzQXV0aGVudGljYXRpb25DdXJyZW50KGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWdlbnRIb3N0U2VydmljZS5hdXRoZW50aWNhdGUocmVxdWVzdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDNUYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9DQUFvQyxtQkFBbUIsOENBQThDLDJDQUErRDtBQUM3SyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLDRDQUE0QztBQUNyRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHdCQUE2RCxzQkFBc0IsOEJBQThCO0FBQzFILFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsY0FBYztBQUN2QixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdDQUFnQyxpQ0FBaUMseUJBQXlCLDBDQUEwQztBQUM3SSxTQUFTLGdDQUFnQywwQ0FBMEM7QUFDbkYsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyx3Q0FBd0M7QUFFakQsTUFBTSx1Q0FBdUM7QUFFN0Msd0NBQXdDLFNBQVM7QUFBQSxFQUNoRCxhQUFhO0FBQUEsRUFDYixVQUFVO0FBQUEsRUFDVixPQUFPLFNBQVMsc0NBQXNDLFNBQVM7QUFBQSxFQUMvRCxNQUFNLFFBQVE7QUFBQSxFQUNkLGFBQWEsU0FBUyw0Q0FBNEMsOENBQThDO0FBQ2pILENBQUM7QUFFRCxTQUFTLEdBQXdDLHVCQUF1QixlQUFlLEVBQUUsU0FBUztBQUFBLEVBQ2pHLGtCQUFrQixpQkFBZSx1QkFBdUIsV0FBVztBQUFBLEVBQ25FLG1CQUFtQjtBQUNwQixDQUFDO0FBRUQsZUFBZSxnQ0FBZ0MsVUFBNEIsYUFBdUM7QUFDakgsUUFBTSw2QkFBNkIsU0FBUyxJQUFJLDJCQUEyQjtBQUMzRSxRQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBQ3ZELFFBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFDL0QsUUFBTSxxQkFBcUIsU0FBUyxJQUFJLDRCQUE0QjtBQUNwRSxNQUFJLENBQUMsMkJBQTJCLFFBQVEsSUFBSSxHQUFHO0FBQzlDLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxXQUFXLHdDQUF3QyxXQUFXO0FBQ3BFLE1BQUksQ0FBQyxVQUFVO0FBQ2QsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPLE1BQU07QUFDWixVQUFNLFlBQVksaUJBQWlCLFVBQVU7QUFDN0MsUUFBSSxxQkFBcUIsT0FBTztBQUMvQixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksV0FBVztBQUNkLGFBQU8sVUFBVSxPQUFPLEtBQUssV0FBUyxNQUFNLGFBQWEsWUFBWSxvQ0FBb0MsTUFBTSxVQUFVLHNCQUFzQixtQkFBbUIsZ0JBQWdCLENBQUM7QUFBQSxJQUNwTDtBQUVBLFVBQU0sVUFBVSxNQUFNLFFBQVEsS0FBSztBQUFBLE1BQ2xDLE1BQU0sVUFBVSxpQkFBaUIsVUFBVSxXQUFXLEVBQUUsS0FBSyxNQUFNLElBQUk7QUFBQSxNQUN2RSxNQUFNLFVBQVUsaUJBQWlCLGVBQWUsRUFBRSxLQUFLLE1BQU0sS0FBSztBQUFBLElBQ25FLENBQUM7QUFDRCxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyx3Q0FBd0MsYUFBZ0Q7QUFDaEcsTUFBSSxDQUFDLHVCQUF1QixXQUFXLEtBQUssQ0FBQyxZQUFZLFdBQVcsb0NBQW9DLEdBQUc7QUFDMUcsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLFlBQVksTUFBTSxxQ0FBcUMsTUFBTSxLQUFLO0FBQzFFO0FBRUEsU0FBUywyQkFBQUEsZ0NBQStCO0FBU2pDLElBQU0sd0JBQU4sY0FBb0MsV0FBNkM7QUFBQSxFQW9CdkYsWUFDcUMsbUJBQ0csc0JBQ0Usd0JBQ0Esd0JBQ1gsYUFDVyx3QkFDRCx1QkFDTSw2QkFDTix1QkFDTyw4QkFDakIsb0JBQ2tCLHNCQUNNLDRCQUNSLDZCQUM3QztBQUNELFVBQU07QUFmOEI7QUFDRztBQUNFO0FBQ0E7QUFDWDtBQUNXO0FBQ0Q7QUFDTTtBQUNOO0FBQ087QUFFQztBQUNNO0FBQ1I7QUE5Qi9DLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxjQUE4QyxDQUFDO0FBRXpHO0FBQUEsU0FBaUIsa0JBQWtCLG9CQUFJLElBQW1EO0FBRzFGO0FBQUEsU0FBaUIsa0JBQWtCLElBQUksd0JBQXdCO0FBQy9ELFNBQWlCLGdCQUFnQixJQUFJLGdDQUFnQztBQUlyRSxTQUFRLGVBQWU7QUFDdkIsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLGtCQUFtQyxDQUFDO0FBQzNGLFNBQVEsNEJBQTRCO0FBQ3BDLFNBQVEsaUNBQWlDO0FBb0J4QyxTQUFLLG9CQUFvQixtQkFBbUI7QUFDNUMsU0FBSyx5QkFBeUIsQ0FBQyxDQUFDLG1CQUFtQjtBQUVuRCxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sVUFBVSxLQUFLLDRCQUE0QixRQUFRLEtBQUssTUFBTTtBQUNwRSxVQUFJLFNBQVM7QUFDWixjQUFNLGlCQUFpQixLQUFLO0FBQzVCLGFBQUssWUFBWTtBQUNqQixhQUFLLFFBQVE7QUFDYixjQUFNLFVBQVUsS0FBSyxrQkFBa0IsVUFBVTtBQUNqRCxZQUFJLGtCQUFrQixXQUFXLEVBQUUsbUJBQW1CLFFBQVE7QUFDN0QsZUFBSyx1QkFBdUIsT0FBTztBQUFBLFFBQ3BDO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSztBQUNMLGFBQUssZ0JBQWdCLE1BQU07QUFDM0IsYUFBSyxjQUFjLE1BQU07QUFDekIsYUFBSyxpQkFBaUIsTUFBTTtBQUM1QixhQUFLLGtCQUFrQix5QkFBeUIsS0FBSztBQUNyRCxhQUFLLG9CQUFvQixtQkFBbUI7QUFDNUMsYUFBSyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxjQUFvQjtBQUMzQixRQUFJLEtBQUssY0FBYztBQUN0QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGVBQWU7QUFDcEIsU0FBSywyQkFBMkIsS0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUsZ0NBQWdDLENBQUM7QUFDMUgsU0FBSyxVQUFVLEtBQUssNEJBQTRCLGtCQUFrQiw0QkFBNEIsS0FBSyxpQkFBaUIsQ0FBQztBQUdySCxTQUFLLFVBQVUsS0FBSyxrQkFBa0IsVUFBVSxZQUFZLGVBQWE7QUFDeEUsV0FBSyx1QkFBdUIsU0FBUztBQUFBLElBQ3RDLENBQUMsQ0FBQztBQUdGLFVBQU0sbUJBQW1CLEtBQUssa0JBQWtCLFVBQVU7QUFDMUQsUUFBSSxvQkFBb0IsRUFBRSw0QkFBNEIsUUFBUTtBQUM3RCxXQUFLLHVCQUF1QixnQkFBZ0I7QUFBQSxJQUM3QztBQUVBLFNBQUssVUFBVSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUN2RSxVQUFJLENBQUMsbUNBQW1DLEdBQUcsS0FBSyxpQkFBaUIsR0FBRztBQUNuRTtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFVBQVUsS0FBSyxrQkFBa0IsVUFBVTtBQUNqRCxVQUFJLFdBQVcsRUFBRSxtQkFBbUIsUUFBUTtBQUMzQyxhQUFLLHVCQUF1QixPQUFPO0FBQUEsTUFDcEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLFVBQWdCO0FBQ3ZCLFFBQUksS0FBSyxpQkFBaUIsT0FBTztBQUNoQztBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxJQUFJLEtBQUssa0JBQWtCLGtCQUFrQixrQkFBZ0I7QUFDbEUsVUFBSSxhQUFhLFNBQVMsaUJBQWlCLGNBQWM7QUFDeEQ7QUFBQSxNQUNEO0FBQ0EsV0FBSyxrQ0FBa0MsYUFBYSxRQUFRO0FBQUEsSUFDN0QsQ0FBQyxDQUFDO0FBUUYsUUFBSSxDQUFDLEtBQUssbUJBQW1CO0FBQzVCLFlBQU0sbUJBQW1CLE1BQU0sSUFBSSxLQUFLLHNCQUFzQixlQUFlLHlCQUF5QixDQUFDO0FBQ3ZHLFlBQU0sSUFBSSxLQUFLLGtCQUFrQixrQkFBa0IsT0FBSztBQUN2RCxZQUFJLEVBQUUsU0FBUyxpQkFBaUIsVUFBVTtBQUN6QywyQkFBaUIsZUFBZSxDQUFDO0FBQUEsUUFDbEM7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxTQUFLLGlCQUFpQixRQUFRO0FBQUEsRUFDL0I7QUFBQSxFQUVRLHFCQUFxQixVQUFrQztBQUM5RCxXQUFPLG9DQUFvQyxVQUFVLEtBQUssdUJBQXVCLEtBQUssaUJBQWlCO0FBQUEsRUFDeEc7QUFBQSxFQUVRLHVCQUF1QixXQUE0QjtBQUMxRCxRQUFJLENBQUMsS0FBSyw0QkFBNEIsUUFBUSxJQUFJLEdBQUc7QUFDcEQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVLFVBQVUsT0FBTyxPQUFPLE9BQUssS0FBSyxxQkFBcUIsRUFBRSxRQUFRLENBQUM7QUFDbEYsVUFBTSxXQUFXLElBQUksSUFBSSxRQUFRLElBQUksT0FBSyxFQUFFLFFBQVEsQ0FBQztBQUdyRCxlQUFXLENBQUMsUUFBUSxLQUFLLEtBQUsscUJBQXFCO0FBQ2xELFVBQUksQ0FBQyxTQUFTLElBQUksUUFBUSxHQUFHO0FBQzVCLGFBQUssb0JBQW9CLGlCQUFpQixRQUFRO0FBQ2xELGFBQUssZ0JBQWdCLE9BQU8sUUFBUTtBQUFBLE1BQ3JDO0FBQUEsSUFDRDtBQU1BLFNBQUssd0JBQXdCLE9BQU8sRUFDbEMsTUFBTSxNQUFNO0FBQUEsSUFBb0IsQ0FBQztBQUduQyxlQUFXLFNBQVMsU0FBUztBQUM1QixVQUFJLENBQUMsS0FBSyxvQkFBb0IsSUFBSSxNQUFNLFFBQVEsR0FBRztBQUNsRCxhQUFLLGVBQWUsS0FBSztBQUFBLE1BQzFCLE9BQU87QUFFTixjQUFNLGdCQUFnQixLQUFLLGdCQUFnQixJQUFJLE1BQU0sUUFBUTtBQUM3RCx1QkFBZSxhQUFhLE1BQU0sTUFBTTtBQUFBLE1BQ3pDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsT0FBd0I7QUFDOUMsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFNBQUssb0JBQW9CLElBQUksTUFBTSxVQUFVLEtBQUs7QUFDbEQsVUFBTSxjQUFjLGNBQWMsTUFBTSxRQUFRO0FBQ2hELFVBQU0sVUFBVTtBQUNoQixVQUFNLFNBQVM7QUFDZixVQUFNLFlBQVksS0FBSztBQU12QixVQUFNLElBQUksS0FBSyxxQkFBcUIsZ0NBQWdDO0FBQUEsTUFDbkUsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sYUFBYSxNQUFNO0FBQUEsTUFDbkIsYUFBYSxNQUFNO0FBQUEsTUFDbkIsbUJBQW1CLEtBQUssb0JBQW9CLFNBQVksT0FBTztBQUFBLE1BQy9ELGFBQWE7QUFBQSxNQUNiLHNCQUFzQjtBQUFBLE1BQ3RCLG1CQUFtQixtQ0FBbUMsTUFBTSxRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFPcEUsdUJBQXVCLE1BQU07QUFDNUIsY0FBTSxZQUFZLEtBQUssMkJBQTJCLHNCQUFzQixNQUFNLFFBQVE7QUFDdEYsZUFBTyxjQUFjLFNBQVksNkNBQTZDLFNBQVMsSUFBSTtBQUFBLE1BQzVGO0FBQUEsTUFDQSxrQ0FBa0MsTUFBTSxPQUFPLE1BQU0sT0FBTyxLQUFLLDJCQUEyQixhQUFhLGNBQVksYUFBYSxNQUFNLFVBQVUsS0FBSyxDQUFDO0FBQUEsTUFDeEoscUJBQXFCLE1BQU07QUFBQSxNQUMzQixvQkFBb0I7QUFBQSxNQUNwQixjQUFjO0FBQUEsUUFDYixxQkFBcUI7QUFBQSxRQUNyQiwyQkFBMkI7QUFBQSxRQUMzQiwwQkFBMEI7QUFBQSxRQUMxQixJQUFJLHdCQUF3QjtBQUMzQixpQkFBTyxVQUFVLGlCQUFpQixJQUFJLEdBQUc7QUFBQSxRQUMxQztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sb0JBQW9CLE1BQU0sSUFBSSxLQUFLLHFCQUFxQixpQkFBaUIsV0FBVyxDQUFDO0FBQzNGLFVBQU0sZUFBZSxrQkFBa0I7QUFFdkMsVUFBTSxlQUFlLE1BQU0sSUFBSSxrQkFBa0IsYUFBYSxDQUFDLENBQUMsQ0FBQztBQUVqRSxVQUFNLGVBQWUsTUFBTSxJQUFJLEtBQUssc0JBQXNCO0FBQUEsTUFBZTtBQUFBLE1BQWdDO0FBQUEsTUFBUztBQUFBLE1BQ2pILGVBQWEsa0JBQWtCLFVBQVUsU0FBUztBQUFBLElBQUMsQ0FBQztBQUNyRCxpQkFBYSxxQkFBcUIsYUFBYSxZQUFZO0FBQzNELGlCQUFhLHVCQUF1QixhQUFhLGNBQWM7QUFFL0QsVUFBTSxJQUFJLEtBQUssNkJBQTZCLHdCQUF3QjtBQUFBLE1BQ25FLElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUywrQkFBK0Isb0JBQW9CLE1BQU0sV0FBVztBQUFBLE1BQ3BGLE1BQU0sVUFBVSxPQUFPLFFBQVEsT0FBTyxFQUFFO0FBQUE7QUFBQSxNQUV4QyxnQkFBZ0IsTUFBTSxhQUFhLGVBQWUsQ0FBQyxpQ0FBaUMsT0FBTyxJQUFJLENBQUMsaUNBQWlDLE9BQU8saUNBQWlDLE9BQU87QUFBQSxNQUNoTCxvQkFBb0I7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFVBQU0saUJBQWlCLE1BQU0sSUFBSSxLQUFLLHNCQUFzQixlQUFlLHlCQUF5QjtBQUFBLE1BQ25HLFVBQVUsTUFBTTtBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsVUFBVSxNQUFNO0FBQUEsTUFDaEIsYUFBYSxNQUFNO0FBQUEsTUFDbkIsWUFBWSxLQUFLO0FBQUEsTUFDakIscUJBQXFCO0FBQUEsTUFDckIsdUJBQXVCLENBQUMsY0FBYyxLQUFLLG9DQUFvQyxTQUFTO0FBQUEsTUFDeEYseUJBQXlCLEtBQUs7QUFBQSxJQUMvQixDQUFDLENBQUM7QUFDRixVQUFNLElBQUksS0FBSyxxQkFBcUIsbUNBQW1DLGFBQWEsY0FBYyxDQUFDO0FBU25HLFVBQU0sbUJBQW1CLEVBQUUsUUFBUSxhQUFhLE1BQU0sYUFBYSxlQUFlLFFBQVcsbUJBQW1CLFFBQVcsTUFBTSxPQUFVO0FBQzNJLFNBQUssdUJBQXVCLDBDQUEwQyxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQztBQUM1RixVQUFNLElBQUksYUFBYSxNQUFNLEtBQUssdUJBQXVCLDBDQUEwQyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFDM0gsVUFBTSxnQkFBZ0IsTUFBTSxJQUFJLElBQUksK0JBQStCLGFBQWEsTUFBTSxDQUFDO0FBQ3ZGLFNBQUssZ0JBQWdCLElBQUksTUFBTSxVQUFVLGFBQWE7QUFDdEQsVUFBTSxJQUFJLGFBQWEsTUFBTSxLQUFLLGdCQUFnQixPQUFPLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFDekUsVUFBTSxJQUFJLEtBQUssdUJBQXVCLDhCQUE4QixRQUFRLGFBQWEsQ0FBQztBQUMxRixrQkFBYyxhQUFhLE1BQU0sTUFBTTtBQUd2QyxVQUFNLElBQUksS0FBSyx1QkFBdUIsMEJBQTBCLE1BQU07QUFDckUsWUFBTSxTQUFTLEtBQUssZUFBZTtBQUNuQyxXQUFLLHdCQUF3QixNQUFNLEVBQUUsTUFBTSxNQUFNO0FBQUEsTUFBb0IsQ0FBQztBQUFBLElBQ3ZFLENBQUMsQ0FBQztBQUNGLFVBQU0sSUFBSSxLQUFLLHVCQUF1QixvQkFBb0IsTUFBTTtBQUMvRCxZQUFNLFNBQVMsS0FBSyxlQUFlO0FBQ25DLFdBQUssd0JBQXdCLE1BQU0sRUFBRSxNQUFNLE1BQU07QUFBQSxNQUFvQixDQUFDO0FBQUEsSUFDdkUsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsaUJBQXVDO0FBQzlDLFVBQU0sWUFBWSxLQUFLLGtCQUFrQixVQUFVO0FBQ25ELFVBQU0sU0FBVSxhQUFhLEVBQUUscUJBQXFCLFNBQVUsVUFBVSxTQUFTLENBQUM7QUFDbEYsV0FBTyxPQUFPLE9BQU8sT0FBSyxLQUFLLHFCQUFxQixFQUFFLFFBQVEsQ0FBQztBQUFBLEVBQ2hFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsd0JBQXdCLFFBQTZDO0FBQ2xGLFVBQU0sYUFBYSxLQUFLO0FBQ3hCLFFBQUksQ0FBQyxLQUFLLHlCQUF5QixVQUFVLEdBQUc7QUFDL0M7QUFBQSxJQUNEO0FBQ0EsVUFBTSwwQkFBMEIsT0FBTyxTQUFTLEtBQUssQ0FBQyxLQUFLO0FBQzNELFFBQUkseUJBQXlCO0FBQzVCLFdBQUssaUNBQWlDO0FBQ3RDLFdBQUssaUNBQWlDO0FBQUEsSUFDdkM7QUFDQSxTQUFLLGtCQUFrQix5QkFBeUIsSUFBSTtBQUNwRCxRQUFJO0FBQ0gsWUFBTSxZQUFZLEtBQUssNEJBQTRCO0FBQ25ELFVBQUksY0FBYyxRQUFXO0FBQzVCLGNBQU0sS0FBSyxlQUFlLFFBQVEsV0FBVyxVQUFVO0FBQ3ZEO0FBQUEsTUFDRDtBQUNBLFlBQU0sS0FBSyxzQkFBc0IsZUFBZSxnQ0FBZ0MsUUFBUTtBQUFBLFFBQ3ZGLGdCQUFnQixLQUFLO0FBQUEsUUFDckIsV0FBVztBQUFBLFFBQ1gsV0FBVyxNQUFNLEtBQUsseUJBQXlCLFVBQVU7QUFBQSxRQUN6RCxjQUFjLGFBQVcsS0FBSyx1QkFBdUIsU0FBUyxVQUFVO0FBQUEsTUFDekUsQ0FBQztBQUFBLElBQ0YsU0FBUyxLQUFLO0FBQ2IsVUFBSSxDQUFDLG9CQUFvQixHQUFHLEdBQUc7QUFDOUIsYUFBSyxZQUFZLE1BQU0sa0RBQWtELEdBQUc7QUFBQSxNQUM3RTtBQUFBLElBQ0QsVUFBRTtBQUNELFVBQUksS0FBSyx5QkFBeUIsVUFBVSxHQUFHO0FBQzlDLGFBQUssa0JBQWtCLHlCQUF5QixLQUFLO0FBQUEsTUFDdEQ7QUFDQSxVQUFJLHlCQUF5QjtBQUM1QixhQUFLLGdDQUFnQztBQUFBLE1BQ3RDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtDQUFrQyxtQkFBb0Q7QUFDN0YsVUFBTSxhQUFhLEtBQUs7QUFDeEIsUUFBSSxDQUFDLEtBQUsseUJBQXlCLFVBQVUsR0FBRztBQUMvQztBQUFBLElBQ0Q7QUFDQSxTQUFLLGtCQUFrQix5QkFBeUIsSUFBSTtBQUNwRCxTQUFLLHNCQUFzQixlQUFlLGNBQVksS0FBSyxjQUFjLFFBQVEsVUFBVSxtQkFBbUI7QUFBQSxNQUM3RyxnQkFBZ0IsS0FBSztBQUFBLE1BQ3JCLFdBQVc7QUFBQSxNQUNYLFdBQVcsTUFBTSxLQUFLLHlCQUF5QixVQUFVO0FBQUEsTUFDekQsY0FBYyxhQUFXLEtBQUssdUJBQXVCLFNBQVMsVUFBVTtBQUFBLElBQ3pFLENBQUMsQ0FBQyxFQUNBLE1BQU0sU0FBTztBQUNiLFVBQUksQ0FBQyxvQkFBb0IsR0FBRyxHQUFHO0FBQzlCLGFBQUssWUFBWSxNQUFNLHdEQUF3RCxrQkFBa0IsUUFBUSxJQUFJLEdBQUc7QUFBQSxNQUNqSDtBQUFBLElBQ0QsQ0FBQyxFQUNBLFFBQVEsTUFBTTtBQUNkLFVBQUksS0FBSyx5QkFBeUIsVUFBVSxHQUFHO0FBQzlDLGFBQUssa0JBQWtCLHlCQUF5QixLQUFLO0FBQUEsTUFDdEQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxNQUFjLG9DQUFvQyxvQkFBbUU7QUFDcEgsVUFBTSxhQUFhLEtBQUs7QUFDeEIsUUFBSSxDQUFDLEtBQUsseUJBQXlCLFVBQVUsR0FBRztBQUMvQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sWUFBWSxLQUFLLDRCQUE0QjtBQUNuRCxRQUFJLGNBQWMsUUFBVztBQUM1QixpQkFBVyxZQUFZLG9CQUFvQjtBQUMxQyxjQUFNLEtBQUssZ0JBQWdCO0FBQUEsVUFDMUIsU0FBUztBQUFBLFVBQ1QsU0FBUztBQUFBLFVBQ1Q7QUFBQSxVQUNBLE1BQU0sS0FBSyx1QkFBdUIsRUFBRSxVQUFVLFNBQVMsVUFBVSxPQUFPLFVBQVUsR0FBRyxVQUFVO0FBQUEsUUFDaEc7QUFBQSxNQUNEO0FBQ0EsYUFBTyxtQkFBbUIsU0FBUztBQUFBLElBQ3BDO0FBQ0EsV0FBTyxLQUFLLHNCQUFzQixlQUFlLG9DQUFvQyxvQkFBb0I7QUFBQSxNQUN4RyxnQkFBZ0IsS0FBSztBQUFBLE1BQ3JCLFdBQVc7QUFBQSxNQUNYLFdBQVcsTUFBTSxLQUFLLHlCQUF5QixVQUFVO0FBQUEsTUFDekQsY0FBYyxhQUFXLEtBQUssdUJBQXVCLFNBQVMsVUFBVTtBQUFBLElBQ3pFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGVBQWUsUUFBOEIsT0FBZSxZQUFtQztBQUM1RyxlQUFXLFNBQVMsUUFBUTtBQUMzQixpQkFBVyxZQUFZLE1BQU0sc0JBQXNCLENBQUMsR0FBRztBQUN0RCxjQUFNLEtBQUssZ0JBQWdCO0FBQUEsVUFDMUIsU0FBUztBQUFBLFVBQ1QsU0FBUztBQUFBLFVBQ1Q7QUFBQSxVQUNBLE1BQU0sS0FBSyx1QkFBdUIsRUFBRSxVQUFVLFNBQVMsVUFBVSxNQUFNLEdBQUcsVUFBVTtBQUFBLFFBQ3JGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSw4QkFBa0Q7QUFFekQsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUssc0JBQXNCLFNBQVMsZ0NBQWdDO0FBQ2xGLFdBQU8sT0FBTyxVQUFVLFlBQVksTUFBTSxTQUFTLElBQUksUUFBUTtBQUFBLEVBQ2hFO0FBQUEsRUFFUSx5QkFBeUIsWUFBNkI7QUFDN0QsV0FBTyxlQUFlLEtBQUssNkJBQTZCLEtBQUssNEJBQTRCLFFBQVEsSUFBSTtBQUFBLEVBQ3RHO0FBQUEsRUFFUSx1QkFBdUIsU0FBMEUsWUFBc0M7QUFDOUksUUFBSSxDQUFDLEtBQUsseUJBQXlCLFVBQVUsR0FBRztBQUMvQyxhQUFPLFFBQVEsT0FBTyxJQUFJLGtCQUFrQixDQUFDO0FBQUEsSUFDOUM7QUFDQSxXQUFPLEtBQUssa0JBQWtCLGFBQWEsT0FBTztBQUFBLEVBQ25EO0FBQ0Q7QUEvWWEsc0JBRUksS0FBSztBQUZULHdCQUFOO0FBQUEsRUFxQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQ1U7IiwKICAibmFtZXMiOiBbIkFnZW50SG9zdFNlc3Npb25IYW5kbGVyIl0KfQo=
