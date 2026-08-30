import { DeferredPromise } from "../../../base/common/async.js";
import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { Server as ChildProcessServer } from "../../../base/parts/ipc/node/ipc.cp.js";
import { Server as UtilityProcessServer } from "../../../base/parts/ipc/node/ipc.mp.js";
import { isUtilityProcess } from "../../../base/parts/sandbox/node/electronTypes.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { joinPath } from "../../../base/common/resources.js";
import { isWindows } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as os from "os";
import * as inspector from "inspector";
import { AgentHostByokModelsEnabledEnvVar, AgentHostIpcChannels, CODEX_AGENT_PROVIDER_ID, IAgentService, isAgentEnabled } from "../common/agentService.js";
import { AgentModelRefreshScheduler, MODEL_REFRESH_INTERVAL_MS } from "./agentModelRefreshScheduler.js";
import { AgentService } from "./agentService.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { IAgentHostPromptCache } from "./agentHostPromptCache.js";
import { IAgentHostSessionTitleSignal } from "./agentHostSessionTitleSignal.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { IAgentHostStorageService } from "./agentHostStorageService.js";
import { IAgentHostCustomizationEnablementService } from "./agentHostCustomizationEnablementService.js";
import { IAgentHostManagedSettingsService } from "./agentHostManagedSettingsService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { IAgentHostCompletions } from "./agentHostCompletions.js";
import { IAgentHostTerminalManager } from "./agentHostTerminalManager.js";
import { IAgentHostWorktreeIsolation, WorktreeIsolation } from "./shared/worktreeIsolation.js";
import { CopilotApiService, ICopilotApiService } from "./shared/copilotApiService.js";
import { ClaudeAgentSdkService, IClaudeAgentSdkService } from "./claude/claudeAgentSdkService.js";
import { ClaudeProxyService, IClaudeProxyService } from "./claude/claudeProxyService.js";
import { CodexAgent, CodexSdkPackage, resolveCodexDevSdkRoot } from "./codex/codexAgent.js";
import { createCodexProviderConfiguration } from "./codex/codexProviderConfiguration.js";
import { CodexProxyService, ICodexProxyService } from "./codex/codexProxyService.js";
import { ForgeOrchestrationService } from "./orchestration/orchestrator.js";
import { ForgeVendorAccountHost } from "./orchestration/forgeVendorAccountHost.js";
import { ByokLmProxyService, IByokLmProxyService } from "./copilot/byokLmProxyService.js";
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from "./byokLmBridgeRegistry.js";
import { INetworkDiagnosticsService, NetworkDiagnosticsService } from "./networkDiagnosticsService.js";
import { AgentSdkDownloader, IAgentSdkDownloader } from "./agentSdkDownloader.js";
import { IAgentHostOTelService } from "../common/otel/agentHostOTelService.js";
import { AgentHostOTelService } from "./otel/agentHostOTelService.js";
import { ProtocolServerHandler } from "./protocolServerHandler.js";
import { AgentHostClientConnectionTelemetryTracker } from "./agentHostClientConnectionTelemetry.js";
import { WebSocketProtocolServer } from "./webSocketTransport.js";
import { MessagePortProtocolServer } from "./messagePortProtocolServer.js";
import { cleanupLocalAgentHostEndpointMetadataSync, cleanupLocalAgentHostEndpointSocketSync, createLocalAgentHostEndpointMetadata, prepareLocalAgentHostEndpointMetadataDirectory, prepareLocalAgentHostEndpointSocketDirectory, publishLocalAgentHostEndpointMetadata } from "./localAgentHostMetadata.js";
import { AgentHostManagementService } from "./agentHostManagementService.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { NativeEnvironmentService } from "../../environment/node/environmentService.js";
import { parseArgs, OPTIONS } from "../../environment/node/argv.js";
import { getLogLevel, ILogService, isDevConsoleLogForwardingEnabled, registerDevConsoleLogForwarder } from "../../log/common/log.js";
import { LogService } from "../../log/common/logService.js";
import { LoggerService } from "../../log/node/loggerService.js";
import { LoggerChannel } from "../../log/common/logIpc.js";
import { OtlpEmitterLogger, OtlpLogEmitter } from "../common/otlp/otlpLogEmitter.js";
import { DefaultURITransformer } from "../../../base/common/uriIpc.js";
import product from "../../product/common/product.js";
import { IProductService } from "../../product/common/productService.js";
import { localize } from "../../../nls.js";
import { FileService } from "../../files/common/fileService.js";
import { IFileService } from "../../files/common/files.js";
import { DiskFileSystemProvider } from "../../files/node/diskFileSystemProvider.js";
import { Schemas } from "../../../base/common/network.js";
import { InstantiationService } from "../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../instantiation/common/serviceCollection.js";
import { registerAgentHostNetworkServices } from "./agentHostBootstrap.js";
import { BANG_COMMAND_PREFIX } from "./agentHostBangCommand.js";
import { SessionDataService } from "./sessionDataService.js";
import { ISessionDataService } from "../common/sessionDataService.js";
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from "../../sandbox/common/terminalSandboxMxcRuntime.js";
import { ISandboxHelperService } from "../../sandbox/common/sandboxHelperService.js";
import { SandboxHelperService } from "../../sandbox/node/sandboxHelper.js";
import { IDiffComputeService } from "../common/diffComputeService.js";
import { IAgentEditAttributionService } from "../common/fileEditAttribution.js";
import { NodeWorkerDiffComputeService } from "./diffComputeService.js";
import { AgentEditAttributionService } from "./shared/agentEditAttributionService.js";
import { IEditSurvivalReporterFactory, EditSurvivalReporterFactory } from "./shared/editSurvivalReporter.js";
import { EditArcReporterService, IEditArcReporterService } from "./shared/editArcReporter.js";
import { AgentHostClientFileSystemProvider } from "../common/agentHostClientFileSystemProvider.js";
import { AGENT_CLIENT_SCHEME } from "../common/agentClientUri.js";
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, createAgentHostClientByokLmConnection } from "../common/agentHostClientByokLmChannel.js";
import { AGENT_HOST_CLIENT_PROXY_CHANNEL, createAgentHostClientProxyConnection } from "../common/agentHostClientProxyChannel.js";
import { IAgentPluginManager } from "../common/agentPluginManager.js";
import { AgentPluginManager } from "./agentPluginManager.js";
import { AgentHostGitService } from "./agentHostGitService.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from "./agentHostFileMonitorService.js";
import { registerPendingEditContentProvider } from "./copilot/pendingEditContentStore.js";
import { join } from "../../../base/common/path.js";
import { createAgentHostTelemetryService } from "./agentHostTelemetryService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import ErrorTelemetry from "../../telemetry/node/errorTelemetry.js";
import { AgentHostLaunchKindEnvVar, readAgentHostLaunchKind } from "../common/agentHostTelemetry.js";
void startAgentHost().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function startAgentHost() {
  let server;
  if (isUtilityProcess(process)) {
    server = new UtilityProcessServer();
  } else {
    server = new ChildProcessServer(AgentHostIpcChannels.AgentHost);
  }
  const disposables = new DisposableStore();
  const protocolIngressDisposables = disposables.add(new DisposableStore());
  const protocolHandlers = [];
  const errorTelemetry = disposables.add(new MutableDisposable());
  const productService = { _serviceBrand: void 0, ...product };
  const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
  const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
  server.registerChannel(AgentHostIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
  const logger = loggerService.createLogger("agenthost", { name: localize("agentHost", "Agent Host") });
  const otlpLogEmitter = disposables.add(new OtlpLogEmitter());
  const otlpLogger = disposables.add(new OtlpEmitterLogger(otlpLogEmitter));
  const logService = new LogService(logger, [otlpLogger]);
  if (!environmentService.isBuilt && isDevConsoleLogForwardingEnabled) {
    disposables.add(registerDevConsoleLogForwarder(logService));
  }
  logService.info("Agent Host process started successfully");
  const fileService = disposables.add(new FileService(logService));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
  disposables.add(registerPendingEditContentProvider(fileService));
  const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);
  const rootConfigResource = joinPath(environmentService.appSettingsHome, "globalStorage", "agent-host-config.json");
  const storageResource = joinPath(environmentService.appSettingsHome, "globalStorage", "agent-host-storage.json");
  let agentService;
  let instantiationService;
  let sdkDownloadProgress;
  let byokLmBridgeRegistry;
  let proxyResolver;
  const byokLmEnabled = isAgentEnabled(process.env[AgentHostByokModelsEnabledEnvVar], true);
  const hostLaunchKind = readAgentHostLaunchKind(process.env[AgentHostLaunchKindEnvVar]);
  const connectionTelemetryTracker = disposables.add(new AgentHostClientConnectionTelemetryTracker());
  try {
    const diServices = new ServiceCollection();
    diServices.set(INativeEnvironmentService, environmentService);
    diServices.set(ILogService, logService);
    diServices.set(IFileService, fileService);
    diServices.set(ISessionDataService, sessionDataService);
    diServices.set(IProductService, productService);
    const networkServices = await registerAgentHostNetworkServices(diServices, fileService, environmentService, logService, disposables);
    proxyResolver = networkServices.proxyResolver;
    const fetchFn = proxyResolver.fetch.bind(proxyResolver);
    const telemetryService = await createAgentHostTelemetryService({ environmentService, productService, fileService, loggerService, logService, disposables, fetchFn, requestService: networkServices.requestService });
    errorTelemetry.value = new ErrorTelemetry(telemetryService);
    diServices.set(ITelemetryService, telemetryService);
    instantiationService = new InstantiationService(diServices);
    const fileMonitorService = disposables.add(instantiationService.createInstance(AgentHostFileMonitorService));
    diServices.set(IAgentHostFileMonitorService, fileMonitorService);
    diServices.set(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
    diServices.set(ISandboxHelperService, new SandboxHelperService());
    const gitService = instantiationService.createInstance(AgentHostGitService);
    diServices.set(IAgentHostGitService, gitService);
    const agentSdkDownloader = disposables.add(instantiationService.createInstance(AgentSdkDownloader));
    diServices.set(IAgentSdkDownloader, agentSdkDownloader);
    sdkDownloadProgress = agentSdkDownloader.onDidDownloadProgress;
    const claudeAgentSdkService = instantiationService.createInstance(ClaudeAgentSdkService);
    diServices.set(IClaudeAgentSdkService, claudeAgentSdkService);
    byokLmBridgeRegistry = new ByokLmBridgeRegistry();
    diServices.set(IByokLmBridgeRegistry, byokLmBridgeRegistry);
    const byokLmProxyService = disposables.add(instantiationService.createInstance(ByokLmProxyService));
    diServices.set(IByokLmProxyService, byokLmProxyService);
    const agentHostOTelService = disposables.add(instantiationService.createInstance(AgentHostOTelService, fetchFn));
    diServices.set(IAgentHostOTelService, agentHostOTelService);
    agentService = new AgentService(logService, fileService, sessionDataService, productService, gitService, rootConfigResource, telemetryService, fileMonitorService, void 0, fetchFn, [createCodexProviderConfiguration(environmentService.userHome)], hostLaunchKind, storageResource, void 0, Date.now, environmentService.logsHome);
    const networkDiagnosticsService = instantiationService.createInstance(NetworkDiagnosticsService);
    diServices.set(INetworkDiagnosticsService, networkDiagnosticsService);
    agentService.setNetworkDiagnosticsService(networkDiagnosticsService);
    diServices.set(IAgentService, agentService);
    diServices.set(IAgentHostStateManager, agentService.stateManager);
    diServices.set(IAgentHostPromptCache, agentService.promptCache);
    diServices.set(IAgentHostSessionTitleSignal, agentService.sessionTitleSignal);
    const pluginManager = new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService);
    diServices.set(IAgentPluginManager, pluginManager);
    const diffComputeService = disposables.add(new NodeWorkerDiffComputeService(logService));
    diServices.set(IDiffComputeService, diffComputeService);
    const editAttributionService = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    diServices.set(IAgentEditAttributionService, editAttributionService);
    agentService.setEditAttributionService(editAttributionService);
    diServices.set(IEditSurvivalReporterFactory, instantiationService.createInstance(EditSurvivalReporterFactory));
    diServices.set(IAgentHostTerminalManager, agentService.terminalManager);
    diServices.set(IAgentConfigurationService, agentService.configurationService);
    diServices.set(IAgentHostStorageService, agentService.storageService);
    diServices.set(IAgentHostCustomizationEnablementService, agentService.customizationEnablementService);
    diServices.set(IAgentHostManagedSettingsService, agentService.managedSettingsService);
    const editArcReporterService = disposables.add(instantiationService.createInstance(EditArcReporterService, void 0));
    diServices.set(IEditArcReporterService, editArcReporterService);
    diServices.set(IAgentHostGitHubEndpointService, agentService.gitHubEndpointService);
    diServices.set(IAgentHostCompletions, agentService.completionsService);
    diServices.set(IAgentHostCheckpointService, agentService.checkpointService);
    const copilotApiService = instantiationService.createInstance(CopilotApiService, fetchFn);
    diServices.set(ICopilotApiService, copilotApiService);
    const worktreeIsolation = disposables.add(instantiationService.createInstance(WorktreeIsolation, void 0));
    diServices.set(IAgentHostWorktreeIsolation, worktreeIsolation);
    agentService.setWorktreeIsolation(worktreeIsolation);
    const claudeProxyService = disposables.add(instantiationService.createInstance(ClaudeProxyService));
    diServices.set(IClaudeProxyService, claudeProxyService);
    const codexProxyService = disposables.add(instantiationService.createInstance(CodexProxyService));
    diServices.set(ICodexProxyService, codexProxyService);
    const codexSdkAvailable = !environmentService.isBuilt || agentSdkDownloader.isAvailable(CodexSdkPackage) || await resolveCodexDevSdkRoot() !== void 0;
    if (codexSdkAvailable) {
      agentService.registerProvider(instantiationService.createInstance(CodexAgent));
    } else {
      logService.error("Codex is the required Forge agent provider, but its SDK could not be resolved.");
    }
    const orchestration = disposables.add(instantiationService.createInstance(ForgeOrchestrationService));
    orchestration.bindCodex(() => agentService.agents.get().find((agent) => agent.id === CODEX_AGENT_PROVIDER_ID));
    disposables.add(instantiationService.createInstance(ForgeVendorAccountHost));
  } catch (err) {
    logService.error("Failed to create AgentService", err);
    throw err;
  }
  disposables.add(instantiationService.createInstance(AgentModelRefreshScheduler, agentService.agents, agentService.onDidStartTurn, MODEL_REFRESH_INTERVAL_MS));
  if (sdkDownloadProgress) {
    disposables.add(sdkDownloadProgress((p) => agentService.emitDownloadProgress(
      p.packageId,
      p.displayName,
      p.receivedBytes,
      p.totalBytes,
      p.phase === "completed" || p.phase === "failed",
      p.explicitlyRequested
    )));
  }
  if (!(server instanceof UtilityProcessServer)) {
    const agentChannel = ProxyChannel.fromService(agentService, disposables);
    server.registerChannel(AgentHostIpcChannels.AgentHost, agentChannel);
  }
  const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
  disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));
  if (server instanceof UtilityProcessServer) {
    const localDataPlaneDisposables = protocolIngressDisposables.add(new DisposableStore());
    const messagePortProtocolServer = localDataPlaneDisposables.add(new MessagePortProtocolServer());
    const localProtocolHandlerConfig = {
      hostLaunchKind,
      connectionTelemetryTracker,
      defaultDirectory: URI.file(os.homedir()).toString(),
      completionTriggerCharacters: agentService.completionTriggerCharacters,
      terminalCommandPrefix: BANG_COMMAND_PREFIX,
      otlpLogEmitter,
      allowExtensionMethods: false
    };
    try {
      const messagePortProtocolHandler = localDataPlaneDisposables.add(instantiationService.createInstance(
        ProtocolServerHandler,
        agentService,
        agentService.stateManager,
        messagePortProtocolServer,
        localProtocolHandlerConfig,
        clientFileSystemProvider
      ));
      protocolHandlers.push(messagePortProtocolHandler);
      const authorityRegistrations = /* @__PURE__ */ new Map();
      const registerConnection = (connection) => {
        if (authorityRegistrations.has(connection)) {
          return;
        }
        const clientId = connection.ctx;
        if (typeof clientId !== "string" || !clientId) {
          return;
        }
        const connectionStore = new DisposableStore();
        const getChannel = (channelName) => server.getChannel(channelName, (c) => c.ctx === clientId);
        const proxyConnection = createAgentHostClientProxyConnection(getChannel(AGENT_HOST_CLIENT_PROXY_CHANNEL));
        connectionStore.add(proxyResolver.register(clientId, proxyConnection));
        if (byokLmEnabled && byokLmBridgeRegistry) {
          const byokLmConnection = createAgentHostClientByokLmConnection(getChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL));
          connectionStore.add(byokLmBridgeRegistry.register(clientId, byokLmConnection));
        }
        authorityRegistrations.set(connection, connectionStore);
      };
      localDataPlaneDisposables.add(server.onDidAddConnection(registerConnection));
      localDataPlaneDisposables.add(server.onDidRemoveConnection((connection) => {
        if (typeof connection.ctx === "string") {
          messagePortProtocolServer.closeClient(connection.ctx);
        }
        const reg = authorityRegistrations.get(connection);
        if (reg) {
          reg.dispose();
          authorityRegistrations.delete(connection);
        }
      }));
      localDataPlaneDisposables.add(toDisposable(() => {
        for (const registration of authorityRegistrations.values()) {
          registration.dispose();
        }
        authorityRegistrations.clear();
      }));
      for (const connection of server.connections) {
        registerConnection(connection);
      }
      server.registerChannel(AgentHostIpcChannels.Protocol, messagePortProtocolServer);
      const localEndpoint = await startLocalAgentHostEndpoint(
        environmentService.userDataPath,
        logService,
        instantiationService,
        environmentService.logsHome
      );
      if (localEndpoint) {
        const endpointMetadata = localEndpoint.metadata;
        localDataPlaneDisposables.add(localEndpoint.server);
        const localEndpointProtocolHandler = localDataPlaneDisposables.add(instantiationService.createInstance(
          ProtocolServerHandler,
          agentService,
          agentService.stateManager,
          localEndpoint.server,
          localProtocolHandlerConfig,
          clientFileSystemProvider
        ));
        protocolHandlers.push(localEndpointProtocolHandler);
        try {
          await publishLocalAgentHostEndpointMetadata(environmentService.userDataPath, endpointMetadata, logService);
          localDataPlaneDisposables.add(toDisposable(() => {
            cleanupLocalAgentHostEndpoint(environmentService.userDataPath, endpointMetadata, logService);
          }));
        } catch (error) {
          logService.error("[AgentHost] Failed to publish local protocol endpoint; continuing with MessagePort only", error);
          localEndpoint.server.dispose();
          cleanupLocalAgentHostEndpoint(environmentService.userDataPath, endpointMetadata, logService);
        }
      }
    } catch (error) {
      localDataPlaneDisposables.dispose();
      throw error;
    }
  }
  const connectionCountEmitter = disposables.add(new Emitter());
  let dynamicSocketInfo;
  const configuredWebSocketServer = new DeferredPromise();
  const connectionTrackerService = {
    onDidChangeConnectionCount: connectionCountEmitter.event,
    waitForConfiguredWebSocketServer: () => configuredWebSocketServer.p,
    async startWebSocketServer() {
      if (protocolIngressDisposables.isDisposed) {
        throw new Error("Agent Host is shutting down.");
      }
      if (dynamicSocketInfo) {
        return dynamicSocketInfo;
      }
      const socketPath = isWindows ? `\\\\.\\pipe\\vscode-agent-host-${generateUuid().replace(/-/g, "")}` : join(os.tmpdir(), `vscode-agent-host-${generateUuid().replace(/-/g, "")}.sock`);
      const wsServer = await WebSocketProtocolServer.create(
        { socketPath },
        logService,
        { instantiationService, logsHome: environmentService.logsHome }
      );
      if (protocolIngressDisposables.isDisposed) {
        wsServer.dispose();
        throw new Error("Agent Host is shutting down.");
      }
      protocolIngressDisposables.add(wsServer);
      const protocolHandler = protocolIngressDisposables.add(instantiationService.createInstance(
        ProtocolServerHandler,
        agentService,
        agentService.stateManager,
        wsServer,
        {
          hostLaunchKind,
          connectionTelemetryTracker,
          defaultDirectory: URI.file(os.homedir()).toString(),
          completionTriggerCharacters: agentService.completionTriggerCharacters,
          terminalCommandPrefix: BANG_COMMAND_PREFIX,
          otlpLogEmitter
        },
        clientFileSystemProvider
      ));
      protocolHandlers.push(protocolHandler);
      protocolIngressDisposables.add(protocolHandler.onDidChangeConnectionCount((count) => connectionCountEmitter.fire(count)));
      logService.info(`[AgentHost] Dynamic WebSocket server listening on ${socketPath}`);
      dynamicSocketInfo = { socketPath };
      return dynamicSocketInfo;
    },
    async getInspectInfo(tryEnable) {
      let url = inspector.url();
      if (!url && tryEnable) {
        try {
          inspector.open(0, "127.0.0.1", false);
        } catch (err) {
          logService.error("[AgentHost] Failed to open inspector", err);
          return void 0;
        }
        url = inspector.url();
      }
      if (!url) {
        return void 0;
      }
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "ws:") {
          logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
          return void 0;
        }
        const port = Number(parsedUrl.port);
        const auth = parsedUrl.pathname.replace(/^\/+/, "");
        if (!Number.isInteger(port) || !auth) {
          logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
          return void 0;
        }
        const host = parsedUrl.hostname === "0.0.0.0" ? "127.0.0.1" : parsedUrl.hostname === "::" ? "::1" : parsedUrl.hostname;
        const devtoolsHost = host.includes(":") ? `[${host}]` : host;
        return {
          host,
          port,
          devtoolsUrl: `devtools://devtools/bundled/js_app.html?v8only=true&ws=${devtoolsHost}:${parsedUrl.port}/${auth}`
        };
      } catch {
        logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
        return void 0;
      }
    }
  };
  server.registerChannel(AgentHostIpcChannels.Management, ProxyChannel.fromService(instantiationService.createInstance(
    AgentHostManagementService,
    agentService,
    connectionTrackerService,
    async () => {
      protocolIngressDisposables.dispose();
      await Promise.all(protocolHandlers.map((handler) => handler.whenIdle()));
    }
  ), disposables));
  if (!(server instanceof UtilityProcessServer)) {
    server.registerChannel(AgentHostIpcChannels.ConnectionTracker, ProxyChannel.fromService(connectionTrackerService, disposables));
  }
  const configuredWebSocketServerStart = startWebSocketServer(
    agentService,
    clientFileSystemProvider,
    instantiationService,
    environmentService.logsHome,
    logService,
    otlpLogEmitter,
    protocolIngressDisposables,
    hostLaunchKind,
    connectionTelemetryTracker,
    (count) => connectionCountEmitter.fire(count),
    (handler) => protocolHandlers.push(handler)
  );
  configuredWebSocketServer.settleWith(configuredWebSocketServerStart);
  void configuredWebSocketServerStart.catch((err) => {
    logService.error("Failed to start WebSocket server", err);
  });
  process.once("exit", () => {
    agentService.dispose();
    logService.dispose();
    disposables.dispose();
  });
}
async function startLocalAgentHostEndpoint(userDataPath, logService, instantiationService, logsHome) {
  let metadata;
  let server;
  try {
    const endpointMetadata = createLocalAgentHostEndpointMetadata(userDataPath);
    metadata = endpointMetadata;
    await prepareLocalAgentHostEndpointMetadataDirectory(userDataPath);
    if (!isWindows) {
      await prepareLocalAgentHostEndpointSocketDirectory(userDataPath);
    }
    server = await WebSocketProtocolServer.create(
      {
        socketPath: endpointMetadata.endpoint.path,
        connectionTokenValidate: (token) => token === endpointMetadata.connectionToken
      },
      logService,
      { instantiationService, logsHome }
    );
    await server.whenListening;
    return { metadata: endpointMetadata, server };
  } catch (error) {
    try {
      server?.dispose();
    } catch (disposeError) {
      logService.error("[AgentHost] Failed to dispose local protocol endpoint", disposeError);
    }
    if (metadata) {
      cleanupLocalAgentHostEndpoint(userDataPath, metadata, logService);
    }
    logService.error("[AgentHost] Failed to start local protocol endpoint; continuing with MessagePort only", error);
    return void 0;
  }
}
function cleanupLocalAgentHostEndpoint(userDataPath, metadata, logService) {
  try {
    cleanupLocalAgentHostEndpointMetadataSync(userDataPath, metadata, logService);
  } catch (error) {
    logService.error("[AgentHost] Failed to clean up local protocol metadata", error);
  }
  try {
    cleanupLocalAgentHostEndpointSocketSync(metadata.endpoint.path);
  } catch (error) {
    logService.error("[AgentHost] Failed to clean up local protocol socket", error);
  }
}
async function startWebSocketServer(agentService, clientFileSystemProvider, instantiationService, logsHome, logService, otlpLogEmitter, disposables, hostLaunchKind, connectionTelemetryTracker, onConnectionCountChanged, onProtocolHandlerCreated) {
  const port = process.env["VSCODE_AGENT_HOST_PORT"];
  const socketPath = process.env["VSCODE_AGENT_HOST_SOCKET_PATH"];
  if (!port && !socketPath) {
    return;
  }
  const connectionToken = process.env["VSCODE_AGENT_HOST_CONNECTION_TOKEN"];
  const host = process.env["VSCODE_AGENT_HOST_HOST"] || "localhost";
  const wsServer = await WebSocketProtocolServer.create(
    socketPath ? {
      socketPath,
      connectionTokenValidate: connectionToken ? (token) => token === connectionToken : void 0
    } : {
      port: parseInt(port, 10),
      host,
      connectionTokenValidate: connectionToken ? (token) => token === connectionToken : void 0
    },
    logService,
    { instantiationService, logsHome }
  );
  if (disposables.isDisposed) {
    wsServer.dispose();
    return;
  }
  disposables.add(wsServer);
  const protocolHandler = disposables.add(instantiationService.createInstance(
    ProtocolServerHandler,
    agentService,
    agentService.stateManager,
    wsServer,
    {
      hostLaunchKind,
      connectionTelemetryTracker,
      defaultDirectory: URI.file(os.homedir()).toString(),
      completionTriggerCharacters: agentService.completionTriggerCharacters,
      terminalCommandPrefix: BANG_COMMAND_PREFIX,
      otlpLogEmitter
    },
    clientFileSystemProvider
  ));
  onProtocolHandlerCreated(protocolHandler);
  disposables.add(protocolHandler.onDidChangeConnectionCount(onConnectionCountChanged));
  await wsServer.whenListening;
  const listenTarget = socketPath ?? `${host}:${wsServer.boundPort ?? port}`;
  logService.info(`[AgentHost] WebSocket server listening on ${listenTarget}`);
  console.log(`Agent host server listening on ${listenTarget}`);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RNYWluLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBTZXJ2ZXIgYXMgQ2hpbGRQcm9jZXNzU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMuY3AuanMnO1xuaW1wb3J0IHsgU2VydmVyIGFzIFV0aWxpdHlQcm9jZXNzU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMubXAuanMnO1xuaW1wb3J0IHsgaXNVdGlsaXR5UHJvY2VzcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvc2FuZGJveC9ub2RlL2VsZWN0cm9uVHlwZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgdHlwZSBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgaW5zcGVjdG9yIGZyb20gJ2luc3BlY3Rvcic7XG5pbXBvcnQgeyBBZ2VudEhvc3RCeW9rTW9kZWxzRW5hYmxlZEVudlZhciwgQWdlbnRIb3N0SXBjQ2hhbm5lbHMsIENPREVYX0FHRU5UX1BST1ZJREVSX0lELCBJQWdlbnRIb3N0SW5zcGVjdEluZm8sIElBZ2VudEhvc3RTb2NrZXRJbmZvLCBJQWdlbnRTZXJ2aWNlLCBJQ29ubmVjdGlvblRyYWNrZXJTZXJ2aWNlLCBpc0FnZW50RW5hYmxlZCB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRNb2RlbFJlZnJlc2hTY2hlZHVsZXIsIE1PREVMX1JFRlJFU0hfSU5URVJWQUxfTVMgfSBmcm9tICcuL2FnZW50TW9kZWxSZWZyZXNoU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IEFnZW50U2VydmljZSB9IGZyb20gJy4vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0UHJvbXB0Q2FjaGUgfSBmcm9tICcuL2FnZW50SG9zdFByb21wdENhY2hlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENvbXBsZXRpb25zIH0gZnJvbSAnLi9hZ2VudEhvc3RDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFdvcmt0cmVlSXNvbGF0aW9uLCBXb3JrdHJlZUlzb2xhdGlvbiB9IGZyb20gJy4vc2hhcmVkL3dvcmt0cmVlSXNvbGF0aW9uLmpzJztcbmltcG9ydCB7IENvcGlsb3RBcGlTZXJ2aWNlLCBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVBZ2VudFNka1NlcnZpY2UsIElDbGF1ZGVBZ2VudFNka1NlcnZpY2UgfSBmcm9tICcuL2NsYXVkZS9jbGF1ZGVBZ2VudFNka1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUHJveHlTZXJ2aWNlLCBJQ2xhdWRlUHJveHlTZXJ2aWNlIH0gZnJvbSAnLi9jbGF1ZGUvY2xhdWRlUHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGV4QWdlbnQsIENvZGV4U2RrUGFja2FnZSwgcmVzb2x2ZUNvZGV4RGV2U2RrUm9vdCB9IGZyb20gJy4vY29kZXgvY29kZXhBZ2VudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb2RleFByb3ZpZGVyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vY29kZXgvY29kZXhQcm92aWRlckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kZXhQcm94eVNlcnZpY2UsIElDb2RleFByb3h5U2VydmljZSB9IGZyb20gJy4vY29kZXgvY29kZXhQcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRm9yZ2VPcmNoZXN0cmF0aW9uU2VydmljZSB9IGZyb20gJy4vb3JjaGVzdHJhdGlvbi9vcmNoZXN0cmF0b3IuanMnO1xuaW1wb3J0IHsgRm9yZ2VWZW5kb3JBY2NvdW50SG9zdCB9IGZyb20gJy4vb3JjaGVzdHJhdGlvbi9mb3JnZVZlbmRvckFjY291bnRIb3N0LmpzJztcbmltcG9ydCB7IEJ5b2tMbVByb3h5U2VydmljZSwgSUJ5b2tMbVByb3h5U2VydmljZSB9IGZyb20gJy4vY29waWxvdC9ieW9rTG1Qcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnlva0xtQnJpZGdlUmVnaXN0cnksIElCeW9rTG1CcmlkZ2VSZWdpc3RyeSB9IGZyb20gJy4vYnlva0xtQnJpZGdlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFByb3h5UmVzb2x2ZXIgfSBmcm9tICcuL2FnZW50SG9zdFByb3h5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSU5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UsIE5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UgfSBmcm9tICcuL25ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZGtEb3dubG9hZGVyLCBJQWdlbnRTZGtEb3dubG9hZGVyLCB0eXBlIElBZ2VudFNka0Rvd25sb2FkUHJvZ3Jlc3MgfSBmcm9tICcuL2FnZW50U2RrRG93bmxvYWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm90b2NvbFNlcnZlckhhbmRsZXIgfSBmcm9tICcuL3Byb3RvY29sU2VydmVySGFuZGxlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlciB9IGZyb20gJy4vYWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvblRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBXZWJTb2NrZXRQcm90b2NvbFNlcnZlciB9IGZyb20gJy4vd2ViU29ja2V0VHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IE1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIgfSBmcm9tICcuL21lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgY2xlYW51cExvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YVN5bmMsIGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50U29ja2V0U3luYywgY3JlYXRlTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhLCBwcmVwYXJlTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhRGlyZWN0b3J5LCBwcmVwYXJlTG9jYWxBZ2VudEhvc3RFbmRwb2ludFNvY2tldERpcmVjdG9yeSwgcHVibGlzaExvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSwgdHlwZSBJTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhIH0gZnJvbSAnLi9sb2NhbEFnZW50SG9zdE1ldGFkYXRhLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RNYW5hZ2VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IE5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L25vZGUvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlQXJncywgT1BUSU9OUyB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L25vZGUvYXJndi5qcyc7XG5pbXBvcnQgeyBnZXRMb2dMZXZlbCwgSUxvZ1NlcnZpY2UsIGlzRGV2Q29uc29sZUxvZ0ZvcndhcmRpbmdFbmFibGVkLCByZWdpc3RlckRldkNvbnNvbGVMb2dGb3J3YXJkZXIgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvbm9kZS9sb2dnZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvZ2dlckNoYW5uZWwgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZ0lwYy5qcyc7XG5pbXBvcnQgeyBPdGxwRW1pdHRlckxvZ2dlciwgT3RscExvZ0VtaXR0ZXIgfSBmcm9tICcuLi9jb21tb24vb3RscC9vdGxwTG9nRW1pdHRlci5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0VVJJVHJhbnNmb3JtZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmlJcGMuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uL2ZpbGVzL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFnZW50SG9zdE5ldHdvcmtTZXJ2aWNlcyB9IGZyb20gJy4vYWdlbnRIb3N0Qm9vdHN0cmFwLmpzJztcbmltcG9ydCB7IEJBTkdfQ09NTUFORF9QUkVGSVggfSBmcm9tICcuL2FnZW50SG9zdEJhbmdDb21tYW5kLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXaW5kb3dzTXhjVGVybWluYWxTYW5kYm94UnVudGltZSwgV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUgfSBmcm9tICcuLi8uLi9zYW5kYm94L2NvbW1vbi90ZXJtaW5hbFNhbmRib3hNeGNSdW50aW1lLmpzJztcbmltcG9ydCB7IElTYW5kYm94SGVscGVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NhbmRib3gvY29tbW9uL3NhbmRib3hIZWxwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNhbmRib3hIZWxwZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2FuZGJveC9ub2RlL3NhbmRib3hIZWxwZXIuanMnO1xuaW1wb3J0IHsgSURpZmZDb21wdXRlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9maWxlRWRpdEF0dHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IE5vZGVXb3JrZXJEaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UgfSBmcm9tICcuL3NoYXJlZC9hZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSwgRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5IH0gZnJvbSAnLi9zaGFyZWQvZWRpdFN1cnZpdmFsUmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgRWRpdEFyY1JlcG9ydGVyU2VydmljZSwgSUVkaXRBcmNSZXBvcnRlclNlcnZpY2UgfSBmcm9tICcuL3NoYXJlZC9lZGl0QXJjUmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBR0VOVF9DTElFTlRfU0NIRU1FIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50Q2xpZW50VXJpLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfQ0xJRU5UX0JZT0tfTE1fQ0hBTk5FTCwgY3JlYXRlQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ29ubmVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRCeW9rTG1DaGFubmVsLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfQ0xJRU5UX1BST1hZX0NIQU5ORUwsIGNyZWF0ZUFnZW50SG9zdENsaWVudFByb3h5Q29ubmVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRQcm94eUNoYW5uZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luTWFuYWdlciB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFBsdWdpbk1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5NYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudFBsdWdpbk1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UsIElBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclBlbmRpbmdFZGl0Q29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi9jb3BpbG90L3BlbmRpbmdFZGl0Q29udGVudFN0b3JlLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgRXJyb3JUZWxlbWV0cnkgZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L25vZGUvZXJyb3JUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TGF1bmNoS2luZEVudlZhciwgcmVhZEFnZW50SG9zdExhdW5jaEtpbmQsIHR5cGUgQWdlbnRIb3N0TGF1bmNoS2luZCB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuXG4vLyBFbnRyeSBwb2ludCBmb3IgdGhlIGFnZW50IGhvc3QgdXRpbGl0eSBwcm9jZXNzLlxuLy8gU2V0cyB1cCBJUEMsIGxvZ2dpbmcsIGFuZCByZWdpc3RlcnMgYWdlbnQgcHJvdmlkZXJzIChDb3BpbG90KS5cbi8vIFdoZW4gVlNDT0RFX0FHRU5UX0hPU1RfUE9SVCBvciBWU0NPREVfQUdFTlRfSE9TVF9TT0NLRVRfUEFUSCBlbnYgdmFyc1xuLy8gYXJlIHNldCwgYWxzbyBzdGFydHMgYSBXZWJTb2NrZXQgc2VydmVyIGZvciBleHRlcm5hbCBjbGllbnRzLlxuXG52b2lkIHN0YXJ0QWdlbnRIb3N0KCkuY2F0Y2goZXJyID0+IHtcblx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRwcm9jZXNzLmV4aXQoMSk7XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gc3RhcnRBZ2VudEhvc3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdC8vIFNldHVwIFJQQyAtIHN1cHBvcnRzIGJvdGggRWxlY3Ryb24gdXRpbGl0eSBwcm9jZXNzIGFuZCBOb2RlIGNoaWxkIHByb2Nlc3Ncblx0bGV0IHNlcnZlcjogQ2hpbGRQcm9jZXNzU2VydmVyPHN0cmluZz4gfCBVdGlsaXR5UHJvY2Vzc1NlcnZlcjtcblx0aWYgKGlzVXRpbGl0eVByb2Nlc3MocHJvY2VzcykpIHtcblx0XHRzZXJ2ZXIgPSBuZXcgVXRpbGl0eVByb2Nlc3NTZXJ2ZXIoKTtcblx0fSBlbHNlIHtcblx0XHRzZXJ2ZXIgPSBuZXcgQ2hpbGRQcm9jZXNzU2VydmVyKEFnZW50SG9zdElwY0NoYW5uZWxzLkFnZW50SG9zdCk7XG5cdH1cblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgcHJvdG9jb2xJbmdyZXNzRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0Y29uc3QgcHJvdG9jb2xIYW5kbGVyczogUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyW10gPSBbXTtcblx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPEVycm9yVGVsZW1ldHJ5PigpKTtcblxuXHQvLyBTZXJ2aWNlc1xuXHRjb25zdCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIC4uLnByb2R1Y3QgfTtcblx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IE5hdGl2ZUVudmlyb25tZW50U2VydmljZShwYXJzZUFyZ3MocHJvY2Vzcy5hcmd2LCBPUFRJT05TKSwgcHJvZHVjdFNlcnZpY2UpO1xuXHRjb25zdCBsb2dnZXJTZXJ2aWNlID0gbmV3IExvZ2dlclNlcnZpY2UoZ2V0TG9nTGV2ZWwoZW52aXJvbm1lbnRTZXJ2aWNlKSwgZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lKTtcblx0Ly8gTm9uLXByb3RvY29sIG1hbmFnZW1lbnQgYW5kIGxvZ2dpbmcgSVBDIHJlbWFpbiBzZXBhcmF0ZSBmcm9tIHRoZSBBSFAgZGF0YSBwbGFuZS5cblx0c2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChBZ2VudEhvc3RJcGNDaGFubmVscy5Mb2dnZXIsIG5ldyBMb2dnZXJDaGFubmVsKGxvZ2dlclNlcnZpY2UsICgpID0+IERlZmF1bHRVUklUcmFuc2Zvcm1lcikpO1xuXHRjb25zdCBsb2dnZXIgPSBsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcignYWdlbnRob3N0JywgeyBuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0JywgXCJBZ2VudCBIb3N0XCIpIH0pO1xuXHQvLyBPVExQIGxvZyBmYW4tb3V0OiBhbnkgY29uc3VtZXIgdGhhdCBzdWJzY3JpYmVzIHRvIHRoZSBob3N0J3Ncblx0Ly8gYGFocC1vdGxwOi8vbG9ncy97bGV2ZWx9YCBjaGFubmVsIHdpbGwgcmVjZWl2ZSBldmVyeSBsb2cgcmVjb3JkIHRoaXNcblx0Ly8gYElMb2dTZXJ2aWNlYCBwcm9kdWNlcywgaW4gYWRkaXRpb24gdG8gdGhlIHJlZ3VsYXIgZmlsZSBsb2dnZXIuIFRoZVxuXHQvLyBlbWl0dGVyIGlzIGNyZWF0ZWQgaGVyZSBzbyBpdCBjYW4gYmUgc2hhcmVkIGJ5IGV2ZXJ5IHByb3RvY29sXG5cdC8vIGhhbmRsZXIgaW5zdGFudGlhdGVkIGJlbG93LlxuXHRjb25zdCBvdGxwTG9nRW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT3RscExvZ0VtaXR0ZXIoKSk7XG5cdGNvbnN0IG90bHBMb2dnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBFbWl0dGVyTG9nZ2VyKG90bHBMb2dFbWl0dGVyKSk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTG9nU2VydmljZShsb2dnZXIsIFtvdGxwTG9nZ2VyXSk7XG5cdGlmICghZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgJiYgaXNEZXZDb25zb2xlTG9nRm9yd2FyZGluZ0VuYWJsZWQpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJEZXZDb25zb2xlTG9nRm9yd2FyZGVyKGxvZ1NlcnZpY2UpKTtcblx0fVxuXHRsb2dTZXJ2aWNlLmluZm8oJ0FnZW50IEhvc3QgcHJvY2VzcyBzdGFydGVkIHN1Y2Nlc3NmdWxseScpO1xuXG5cdC8vIEZpbGUgc2VydmljZVxuXHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGRpc3Bvc2FibGVzLmFkZChuZXcgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlcihsb2dTZXJ2aWNlKSkpKTtcblx0Ly8gSW4tbWVtb3J5IGZpbGVzeXN0ZW0gYmFja2luZyB0cmFuc2llbnQgZmlsZS1lZGl0IHByZXZpZXdzIHNob3duIGR1cmluZ1xuXHQvLyB0b29sLWNhbGwgY29uZmlybWF0aW9ucy5cblx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyUGVuZGluZ0VkaXRDb250ZW50UHJvdmlkZXIoZmlsZVNlcnZpY2UpKTtcblxuXHQvLyBTZXNzaW9uIGRhdGEgc2VydmljZVxuXHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBuZXcgU2Vzc2lvbkRhdGFTZXJ2aWNlKFVSSS5maWxlKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgpLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cdGNvbnN0IHJvb3RDb25maWdSZXNvdXJjZSA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5hcHBTZXR0aW5nc0hvbWUsICdnbG9iYWxTdG9yYWdlJywgJ2FnZW50LWhvc3QtY29uZmlnLmpzb24nKTtcblx0Y29uc3Qgc3RvcmFnZVJlc291cmNlID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmFwcFNldHRpbmdzSG9tZSwgJ2dsb2JhbFN0b3JhZ2UnLCAnYWdlbnQtaG9zdC1zdG9yYWdlLmpzb24nKTtcblxuXHQvLyBDcmVhdGUgdGhlIHJlYWwgc2VydmljZSBpbXBsZW1lbnRhdGlvbiB0aGF0IGxpdmVzIGluIHRoaXMgcHJvY2Vzc1xuXHRsZXQgYWdlbnRTZXJ2aWNlOiBBZ2VudFNlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHQvLyBIb2lzdGVkIG91dCBvZiB0aGUgYHRyeWAgYmVsb3cgc28gdGhlIHByb3RvY29sIGhhbmRsZXJzIChjb25zdHJ1Y3RlZFxuXHQvLyBhZnRlciB0aGUgYmxvY2spIGNhbiBmb3J3YXJkIGFnZW50LVNESyBkb3dubG9hZCBwcm9ncmVzcyB0byBjbGllbnRzLlxuXHRsZXQgc2RrRG93bmxvYWRQcm9ncmVzczogRXZlbnQ8SUFnZW50U2RrRG93bmxvYWRQcm9ncmVzcz4gfCB1bmRlZmluZWQ7XG5cdGxldCBieW9rTG1CcmlkZ2VSZWdpc3RyeTogQnlva0xtQnJpZGdlUmVnaXN0cnk7XG5cdGxldCBwcm94eVJlc29sdmVyOiBJQWdlbnRIb3N0UHJveHlSZXNvbHZlciB8IHVuZGVmaW5lZDtcblx0Ly8gR2F0ZSBCWU9LICp1c2UqIGJlaGluZCB0aGUgb3B0LWluIGBjaGF0LmFnZW50SG9zdC5ieW9rTW9kZWxzLmVuYWJsZWRgXG5cdC8vIHNldHRpbmcsIGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciBhcyBhbiBlbnYgdmFyLiBUaGUgcHJveHkgYW5kIGJyaWRnZVxuXHQvLyByZWdpc3RyeSBhcmUgYWx3YXlzIGNvbnN0cnVjdGVkIGJlbG93IChzbyB0aGUgc2Vzc2lvbiBsYXVuY2hlciBjYW4gaW5qZWN0XG5cdC8vIHRoZW0pLCBidXQgd2hlbiBvZmYgdGhleSBzdGF5IGluZXJ0OiB0aGUgcGVyLWNvbm5lY3Rpb24gYnJpZGdlIGFuZCB0aGVcblx0Ly8gcmVuZGVyZXIncyBCWU9LIHNlcnZlciBjaGFubmVsIGFyZSBub3Qgd2lyZWQsIHNvIHRoZSByZWdpc3RyeSBzdGF5cyBlbXB0eVxuXHQvLyBhbmQgdGhlIHByb3h5IG5ldmVyIGJpbmRzLlxuXHRjb25zdCBieW9rTG1FbmFibGVkID0gaXNBZ2VudEVuYWJsZWQocHJvY2Vzcy5lbnZbQWdlbnRIb3N0Qnlva01vZGVsc0VuYWJsZWRFbnZWYXJdLCB0cnVlKTtcblx0Y29uc3QgaG9zdExhdW5jaEtpbmQgPSByZWFkQWdlbnRIb3N0TGF1bmNoS2luZChwcm9jZXNzLmVudltBZ2VudEhvc3RMYXVuY2hLaW5kRW52VmFyXSk7XG5cdGNvbnN0IGNvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlcigpKTtcblx0dHJ5IHtcblx0XHQvLyBCdWlsZCB0aGUgcHJvY2VzcyBESSBjb250YWluZXIgYW5kIG5ldHdvcmsgc3RhY2sgYmVmb3JlIHRlbGVtZXRyeSBzbyBldmVyeVxuXHRcdC8vIG91dGJvdW5kIGZldGNoLCBpbmNsdWRpbmcgcmVzdHJpY3RlZCB0ZWxlbWV0cnksIHVzZXMgdGhlIHNhbWUgcHJveHkgcmVzb2x2ZXIuXG5cdFx0Y29uc3QgZGlTZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGRpU2VydmljZXMuc2V0KElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUxvZ1NlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElTZXNzaW9uRGF0YVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSVByb2R1Y3RTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSk7XG5cdFx0Y29uc3QgbmV0d29ya1NlcnZpY2VzID0gYXdhaXQgcmVnaXN0ZXJBZ2VudEhvc3ROZXR3b3JrU2VydmljZXMoZGlTZXJ2aWNlcywgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdHByb3h5UmVzb2x2ZXIgPSBuZXR3b3JrU2VydmljZXMucHJveHlSZXNvbHZlcjtcblx0XHRjb25zdCBmZXRjaEZuID0gcHJveHlSZXNvbHZlci5mZXRjaC5iaW5kKHByb3h5UmVzb2x2ZXIpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhd2FpdCBjcmVhdGVBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlKHsgZW52aXJvbm1lbnRTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgZmlsZVNlcnZpY2UsIGxvZ2dlclNlcnZpY2UsIGxvZ1NlcnZpY2UsIGRpc3Bvc2FibGVzLCBmZXRjaEZuLCByZXF1ZXN0U2VydmljZTogbmV0d29ya1NlcnZpY2VzLnJlcXVlc3RTZXJ2aWNlIH0pO1xuXHRcdGVycm9yVGVsZW1ldHJ5LnZhbHVlID0gbmV3IEVycm9yVGVsZW1ldHJ5KHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElUZWxlbWV0cnlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShkaVNlcnZpY2VzKTtcblx0XHRjb25zdCBmaWxlTW9uaXRvclNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlKSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSwgZmlsZU1vbml0b3JTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lKSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSVNhbmRib3hIZWxwZXJTZXJ2aWNlLCBuZXcgU2FuZGJveEhlbHBlclNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdEdpdFNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEhvc3RHaXRTZXJ2aWNlLCBnaXRTZXJ2aWNlKTtcblx0XHQvLyBSZWdpc3RlciB0aGUgYWdlbnQgU0RLIGRvd25sb2FkZXIgQkVGT1JFIGFueSBzZXJ2aWNlIHRoYXQgaW5qZWN0cyBpdFxuXHRcdC8vIChDbGF1ZGVBZ2VudFNka1NlcnZpY2UgYW5kIENvZGV4QWdlbnQgYmVsb3cpLiBUaGUgZG93bmxvYWRlciByZXNvbHZlc1xuXHRcdC8vIGRldi1vdmVycmlkZSBlbnYgdmFyIFx1MjE5MiBvbi1kaXNrIGNhY2hlIFx1MjE5MiBwcm9kdWN0LmFnZW50U2RrcyBkb3dubG9hZC5cblx0XHRjb25zdCBhZ2VudFNka0Rvd25sb2FkZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZGtEb3dubG9hZGVyKSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50U2RrRG93bmxvYWRlciwgYWdlbnRTZGtEb3dubG9hZGVyKTtcblx0XHRzZGtEb3dubG9hZFByb2dyZXNzID0gYWdlbnRTZGtEb3dubG9hZGVyLm9uRGlkRG93bmxvYWRQcm9ncmVzcztcblx0XHRjb25zdCBjbGF1ZGVBZ2VudFNka1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVBZ2VudFNka1NlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElDbGF1ZGVBZ2VudFNka1NlcnZpY2UsIGNsYXVkZUFnZW50U2RrU2VydmljZSk7XG5cdFx0Ly8gQllPSyBsYW5ndWFnZS1tb2RlbCBwcm94eSArIGJyaWRnZSByZWdpc3RyeS4gQWx3YXlzIHJlZ2lzdGVyZWQgc28gdGhlXG5cdFx0Ly8gc2Vzc2lvbiBsYXVuY2hlciBjYW4gaW5qZWN0IHRoZW0sIGJ1dCBCWU9LICp1c2UqIGlzIGdhdGVkOiB0aGVcblx0XHQvLyBwZXItY29ubmVjdGlvbiBicmlkZ2UgYmVsb3cgKGFuZCB0aGUgcmVuZGVyZXIncyBzZXJ2ZXIgY2hhbm5lbCkgYXJlIG9ubHlcblx0XHQvLyB3aXJlZCB3aGVuIGBjaGF0LmFnZW50SG9zdC5ieW9rTW9kZWxzLmVuYWJsZWRgIGlzIG9uLCBzbyB0aGUgcmVnaXN0cnlcblx0XHQvLyBzdGF5cyBlbXB0eSBhbmQgdGhlIHByb3h5IG5ldmVyIGJpbmRzIHdoZW4gdGhlIGZlYXR1cmUgaXMgb2ZmLlxuXHRcdGJ5b2tMbUJyaWRnZVJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5LCBieW9rTG1CcmlkZ2VSZWdpc3RyeSk7XG5cdFx0Y29uc3QgYnlva0xtUHJveHlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJ5b2tMbVByb3h5U2VydmljZSkpO1xuXHRcdGRpU2VydmljZXMuc2V0KElCeW9rTG1Qcm94eVNlcnZpY2UsIGJ5b2tMbVByb3h5U2VydmljZSk7XG5cdFx0Y29uc3QgYWdlbnRIb3N0T1RlbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0T1RlbFNlcnZpY2UsIGZldGNoRm4pKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRIb3N0T1RlbFNlcnZpY2UsIGFnZW50SG9zdE9UZWxTZXJ2aWNlKTtcblx0XHRhZ2VudFNlcnZpY2UgPSBuZXcgQWdlbnRTZXJ2aWNlKGxvZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBnaXRTZXJ2aWNlLCByb290Q29uZmlnUmVzb3VyY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGZpbGVNb25pdG9yU2VydmljZSwgdW5kZWZpbmVkLCBmZXRjaEZuLCBbY3JlYXRlQ29kZXhQcm92aWRlckNvbmZpZ3VyYXRpb24oZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lKV0sIGhvc3RMYXVuY2hLaW5kLCBzdG9yYWdlUmVzb3VyY2UsIHVuZGVmaW5lZCwgRGF0ZS5ub3csIGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSk7XG5cdFx0Y29uc3QgbmV0d29ya0RpYWdub3N0aWNzU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElOZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlLCBuZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlKTtcblx0XHRhZ2VudFNlcnZpY2Uuc2V0TmV0d29ya0RpYWdub3N0aWNzU2VydmljZShuZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRTZXJ2aWNlLCBhZ2VudFNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIGFnZW50U2VydmljZS5zdGF0ZU1hbmFnZXIpO1xuXHRcdC8vIE5hcnJvdyBob3N0IHNlYW1zIHByb3ZpZGVycyBjb25zdW1lIGluc3RlYWQgb2YgdGhlIHdob2xlIHN0YXRlIG1hbmFnZXIuXG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFByb21wdENhY2hlLCBhZ2VudFNlcnZpY2UucHJvbXB0Q2FjaGUpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwsIGFnZW50U2VydmljZS5zZXNzaW9uVGl0bGVTaWduYWwpO1xuXHRcdGNvbnN0IHBsdWdpbk1hbmFnZXIgPSBuZXcgQWdlbnRQbHVnaW5NYW5hZ2VyKFVSSS5maWxlKGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgpLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50UGx1Z2luTWFuYWdlciwgcGx1Z2luTWFuYWdlcik7XG5cdFx0Y29uc3QgZGlmZkNvbXB1dGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb2RlV29ya2VyRGlmZkNvbXB1dGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRkaVNlcnZpY2VzLnNldChJRGlmZkNvbXB1dGVTZXJ2aWNlLCBkaWZmQ29tcHV0ZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRBdHRyaWJ1dGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGVkaXRBdHRyaWJ1dGlvblNlcnZpY2UpO1xuXHRcdGFnZW50U2VydmljZS5zZXRFZGl0QXR0cmlidXRpb25TZXJ2aWNlKGVkaXRBdHRyaWJ1dGlvblNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSkpO1xuXG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgYWdlbnRTZXJ2aWNlLnRlcm1pbmFsTWFuYWdlcik7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGFnZW50U2VydmljZS5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlLCBhZ2VudFNlcnZpY2Uuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIGFnZW50U2VydmljZS5jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBhZ2VudFNlcnZpY2UubWFuYWdlZFNldHRpbmdzU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdEFyY1JlcG9ydGVyU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlLCB1bmRlZmluZWQpKTtcblx0XHRkaVNlcnZpY2VzLnNldChJRWRpdEFyY1JlcG9ydGVyU2VydmljZSwgZWRpdEFyY1JlcG9ydGVyU2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSwgYWdlbnRTZXJ2aWNlLmdpdEh1YkVuZHBvaW50U2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdENvbXBsZXRpb25zLCBhZ2VudFNlcnZpY2UuY29tcGxldGlvbnNTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIGFnZW50U2VydmljZS5jaGVja3BvaW50U2VydmljZSk7XG5cblx0XHQvLyBDb3BpbG90QXBpU2VydmljZSBhbmQgdGhlIHByb3hpZXMgdGhhdCBjb25zdW1lIGl0IGFyZSBjcmVhdGVkIEFGVEVSIHRoZVxuXHRcdC8vIEdpdEh1YiBlbmRwb2ludCBzZXJ2aWNlIGlzIHJlLWV4cG9ydGVkIChhYm92ZSkgc28gQ0FQSSBlbmRwb2ludCBkaXNjb3Zlcnlcblx0XHQvLyBjYW4gdGFyZ2V0IGEgR2l0SHViIEVudGVycHJpc2UgaG9zdC4gTWF0Y2hlcyBhZ2VudEhvc3RTZXJ2ZXJNYWluIG9yZGVyaW5nLlxuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29waWxvdEFwaVNlcnZpY2UsIGZldGNoRm4pO1xuXHRcdGRpU2VydmljZXMuc2V0KElDb3BpbG90QXBpU2VydmljZSwgY29waWxvdEFwaVNlcnZpY2UpO1xuXHRcdC8vIEhvc3Qtb3duZWQgd29ya3RyZWUgaXNvbGF0aW9uIGNvbnRyb2xsZXI6IGEgc2luZ2xlIGluc3RhbmNlIGRyaXZlcyBmb2xkZXJcblx0XHQvLyAvIHdvcmt0cmVlIGlzb2xhdGlvbiBmb3IgZXZlcnkgYWdlbnQsIHNvIHByb3ZpZGVycyBzdGF5IHVuYXdhcmUgb2YgaXQuIEl0XG5cdFx0Ly8gb3ducyBpdHMgYnJhbmNoLW5hbWUgZ2VuZXJhdG9yLCBjcmVhdGVkIGZyb20gSUNvcGlsb3RBcGlTZXJ2aWNlLlxuXHRcdGNvbnN0IHdvcmt0cmVlSXNvbGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmt0cmVlSXNvbGF0aW9uLCB1bmRlZmluZWQpKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRIb3N0V29ya3RyZWVJc29sYXRpb24sIHdvcmt0cmVlSXNvbGF0aW9uKTtcblx0XHRhZ2VudFNlcnZpY2Uuc2V0V29ya3RyZWVJc29sYXRpb24od29ya3RyZWVJc29sYXRpb24pO1xuXHRcdGNvbnN0IGNsYXVkZVByb3h5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVQcm94eVNlcnZpY2UpKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQ2xhdWRlUHJveHlTZXJ2aWNlLCBjbGF1ZGVQcm94eVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvZGV4UHJveHlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGV4UHJveHlTZXJ2aWNlKSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUNvZGV4UHJveHlTZXJ2aWNlLCBjb2RleFByb3h5U2VydmljZSk7XG5cdFx0Ly8gRm9yZ2UgZXhwb3NlcyBvbmUgYWdlbnQgcHJvdmlkZXI6IENvZGV4LiBCdWlsdCBpbnN0YWxsZXJzIGJ1bmRsZSB0aGVcblx0XHQvLyBDb2RleCBucG0gcGFja2FnZSBkaXJlY3RseSwgc28gdHJlYXQgdGhhdCBwYWNrYWdlIGFzIGFuIGF2YWlsYWJsZSBTREtcblx0XHQvLyBpbiBhZGRpdGlvbiB0byB0aGUgcHJvZHVjdC1kb3dubG9hZCBhbmQgZXhwbGljaXQgb3ZlcnJpZGUgcGF0aHMuXG5cdFx0Y29uc3QgY29kZXhTZGtBdmFpbGFibGUgPSAhZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHRcblx0XHRcdHx8IGFnZW50U2RrRG93bmxvYWRlci5pc0F2YWlsYWJsZShDb2RleFNka1BhY2thZ2UpXG5cdFx0XHR8fCAoYXdhaXQgcmVzb2x2ZUNvZGV4RGV2U2RrUm9vdCgpKSAhPT0gdW5kZWZpbmVkO1xuXHRcdGlmIChjb2RleFNka0F2YWlsYWJsZSkge1xuXHRcdFx0YWdlbnRTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZXhBZ2VudCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdDb2RleCBpcyB0aGUgcmVxdWlyZWQgRm9yZ2UgYWdlbnQgcHJvdmlkZXIsIGJ1dCBpdHMgU0RLIGNvdWxkIG5vdCBiZSByZXNvbHZlZC4nKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3JjaGVzdHJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb3JnZU9yY2hlc3RyYXRpb25TZXJ2aWNlKSk7XG5cdFx0b3JjaGVzdHJhdGlvbi5iaW5kQ29kZXgoKCkgPT4gYWdlbnRTZXJ2aWNlLmFnZW50cy5nZXQoKS5maW5kKGFnZW50ID0+IGFnZW50LmlkID09PSBDT0RFWF9BR0VOVF9QUk9WSURFUl9JRCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb3JnZVZlbmRvckFjY291bnRIb3N0KSk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgQWdlbnRTZXJ2aWNlJywgZXJyKTtcblx0XHR0aHJvdyBlcnI7XG5cdH1cblxuXHQvLyBLZWVwIGV2ZXJ5IHByb3ZpZGVyJ3MgbW9kZWwgY2F0YWxvZyBmcmVzaC4gUHJvdmlkZXItb3duZWQgcmVmcmVzaFxuXHQvLyB0cmlnZ2VycyAoYXV0aGVudGljYXRpb24sIHRyYW5zcG9ydCBmbGlwcywgY2xpZW50IHJlc3RhcnRzKSBhcmUgYWxsXG5cdC8vIGVkZ2UtYmFzZWQsIHNvIHRoaXMgcGVyaW9kaWMgdGljayBpcyB0aGUgb25seSB0aGluZyB0aGF0IG5vdGljZXMgYSBtb2RlbFxuXHQvLyBhZGRlZCBzZXJ2aWNlLXNpZGUgd2hpbGUgdGhlIGhvc3Qgc3RheXMgdXAuIE93bmVkIGhlcmUsIGF0IHByb2Nlc3Ncblx0Ly8gbGlmZXRpbWUsIHJhdGhlciB0aGFuIGluc2lkZSBgQWdlbnRIb3N0U2VydmljZWA6IGEgc2VydmljZSB0aGF0IGFybXMgYVxuXHQvLyByZWN1cnJpbmcgdGltZXIgaW4gaXRzIGNvbnN0cnVjdG9yIGlzIG9uZSB0aGF0IG5vIGZha2VkLXRpbWVyIHVuaXQgdGVzdFxuXHQvLyBjYW4gZXZlciBkcmFpbi5cblx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50TW9kZWxSZWZyZXNoU2NoZWR1bGVyLCBhZ2VudFNlcnZpY2UuYWdlbnRzLCBhZ2VudFNlcnZpY2Uub25EaWRTdGFydFR1cm4sIE1PREVMX1JFRlJFU0hfSU5URVJWQUxfTVMpKTtcblxuXHQvLyBTdXJmYWNlIGFnZW50LVNESyBkb3dubG9hZCBwcm9ncmVzcyB0byBjbGllbnRzIGFzIGdlbmVyaWMgYHByb2dyZXNzYFxuXHQvLyBub3RpZmljYXRpb25zLiBUaGUgZG93bmxvYWRlciBmaXJlcyBwcm9jZXNzLWdsb2JhbCBmcmFtZXMga2V5ZWQgYnkgcGFja2FnZVxuXHQvLyBpZDsgdGhlIGFnZW50IHNlcnZpY2Ugc3VyZmFjZXMgZnJhbWVzIHJlcXVlc3RlZCBieSBhIHdhaXRpbmcgc2Vzc2lvbiBvclxuXHQvLyBhbm90aGVyIHVzZXItaW5pdGlhdGVkIGZsb3csIHJvdXRlZCB0aHJvdWdoIHRoZSBzdGF0ZSBtYW5hZ2VyIHNvIGJvdGggdGhlXG5cdC8vIGxvY2FsIChJUEMpIGFuZCBhbnkgZXh0ZXJuYWwgKFdlYlNvY2tldCkgcmVuZGVyZXIgcmVjZWl2ZSB0aGVtIHZpYSB0aGUgc2FtZVxuXHQvLyBwYXRoIGFzIHNlc3Npb24gdXBkYXRlcy5cblx0aWYgKHNka0Rvd25sb2FkUHJvZ3Jlc3MpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2RrRG93bmxvYWRQcm9ncmVzcyhwID0+IGFnZW50U2VydmljZS5lbWl0RG93bmxvYWRQcm9ncmVzcyhcblx0XHRcdHAucGFja2FnZUlkLFxuXHRcdFx0cC5kaXNwbGF5TmFtZSxcblx0XHRcdHAucmVjZWl2ZWRCeXRlcyxcblx0XHRcdHAudG90YWxCeXRlcyxcblx0XHRcdHAucGhhc2UgPT09ICdjb21wbGV0ZWQnIHx8IHAucGhhc2UgPT09ICdmYWlsZWQnLFxuXHRcdFx0cC5leHBsaWNpdGx5UmVxdWVzdGVkLFxuXHRcdCkpKTtcblx0fVxuXG5cdC8vIFJldGFpbiB0aGUgaW1wZXJhdGl2ZSBicmlkZ2Ugb25seSBmb3IgdGhlIGNoaWxkLXByb2Nlc3Mgc2VydmVyIGNvbnN1bWVycy5cblx0Ly8gVGhlIHV0aWxpdHktcHJvY2VzcyBNZXNzYWdlUG9ydCBleHBvc2VzIFByb3RvY29sIGFuZCBNYW5hZ2VtZW50IGluc3RlYWQuXG5cdGlmICghKHNlcnZlciBpbnN0YW5jZW9mIFV0aWxpdHlQcm9jZXNzU2VydmVyKSkge1xuXHRcdGNvbnN0IGFnZW50Q2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhZ2VudFNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRzZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKEFnZW50SG9zdElwY0NoYW5uZWxzLkFnZW50SG9zdCwgYWdlbnRDaGFubmVsKTtcblx0fVxuXG5cdC8vIFNpbmdsZSBzaGFyZWQgYHZzY29kZS1hZ2VudC1jbGllbnRgIGZpbGVzeXN0ZW0gcHJvdmlkZXIuIFBlci1jbGllbnRcblx0Ly8gYXV0aG9yaXRpZXMgYXJlIGFkZGVkIGJ5IHByb3RvY29sIGhhbmRsZXJzIG9yIHRoZSBub24tcHJvdG9jb2wgcmV2ZXJzZVxuXHQvLyBicmlkZ2VzIGJlbG93LlxuXHRjb25zdCBjbGllbnRGaWxlU3lzdGVtUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoQUdFTlRfQ0xJRU5UX1NDSEVNRSwgY2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cblx0aWYgKHNlcnZlciBpbnN0YW5jZW9mIFV0aWxpdHlQcm9jZXNzU2VydmVyKSB7XG5cdFx0Y29uc3QgbG9jYWxEYXRhUGxhbmVEaXNwb3NhYmxlcyA9IHByb3RvY29sSW5ncmVzc0Rpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IG1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIgPSBsb2NhbERhdGFQbGFuZURpc3Bvc2FibGVzLmFkZChuZXcgTWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlcjxzdHJpbmc+KCkpO1xuXHRcdC8vIFNoYXJlZCBjb25maWcgZm9yIHRoZSBsb2NhbCBkYXRhLXBsYW5lIHByb3RvY29sIGhhbmRsZXJzIChyZW5kZXJlclxuXHRcdC8vIE1lc3NhZ2VQb3J0ICsgdGhlIGV4dGVybmFsIGVuZHBvaW50LCB3aGljaCBlYWNoIGdldCB0aGVpciBvd24gaGFuZGxlcikuXG5cdFx0Y29uc3QgbG9jYWxQcm90b2NvbEhhbmRsZXJDb25maWcgPSB7XG5cdFx0XHRob3N0TGF1bmNoS2luZCxcblx0XHRcdGNvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyLFxuXHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogVVJJLmZpbGUob3MuaG9tZWRpcigpKS50b1N0cmluZygpLFxuXHRcdFx0Y29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzOiBhZ2VudFNlcnZpY2UuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0dGVybWluYWxDb21tYW5kUHJlZml4OiBCQU5HX0NPTU1BTkRfUFJFRklYLFxuXHRcdFx0b3RscExvZ0VtaXR0ZXIsXG5cdFx0XHRhbGxvd0V4dGVuc2lvbk1ldGhvZHM6IGZhbHNlLFxuXHRcdH07XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEhhbmRsZXIgZm9yIHRoZSByZW5kZXJlcidzIE1lc3NhZ2VQb3J0IGRhdGEgcGxhbmUuXG5cdFx0XHRjb25zdCBtZXNzYWdlUG9ydFByb3RvY29sSGFuZGxlciA9IGxvY2FsRGF0YVBsYW5lRGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRQcm90b2NvbFNlcnZlckhhbmRsZXIsXG5cdFx0XHRcdGFnZW50U2VydmljZSxcblx0XHRcdFx0YWdlbnRTZXJ2aWNlLnN0YXRlTWFuYWdlcixcblx0XHRcdFx0bWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlcixcblx0XHRcdFx0bG9jYWxQcm90b2NvbEhhbmRsZXJDb25maWcsXG5cdFx0XHRcdGNsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcixcblx0XHRcdCkpO1xuXHRcdFx0cHJvdG9jb2xIYW5kbGVycy5wdXNoKG1lc3NhZ2VQb3J0UHJvdG9jb2xIYW5kbGVyKTtcblx0XHRcdC8vIE5vbi1wcm90b2NvbCByZXZlcnNlIGJyaWRnZXMgcmVtYWluIG9uIHRoZWlyIGV4aXN0aW5nIElQQyBjaGFubmVscy5cblx0XHRcdC8vIFRoZSByZW5kZXJlcidzIE1lc3NhZ2VQb3J0Q2xpZW50IGN0eCBpcyBpdHMgY2xpZW50SWQuXG5cdFx0XHRjb25zdCBhdXRob3JpdHlSZWdpc3RyYXRpb25zID0gbmV3IE1hcDx1bmtub3duLCBJRGlzcG9zYWJsZT4oKTtcblx0XHRcdGNvbnN0IHJlZ2lzdGVyQ29ubmVjdGlvbiA9IChjb25uZWN0aW9uOiAodHlwZW9mIHNlcnZlci5jb25uZWN0aW9ucylbbnVtYmVyXSkgPT4ge1xuXHRcdFx0XHRpZiAoYXV0aG9yaXR5UmVnaXN0cmF0aW9ucy5oYXMoY29ubmVjdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY2xpZW50SWQgPSBjb25uZWN0aW9uLmN0eDtcblx0XHRcdFx0aWYgKHR5cGVvZiBjbGllbnRJZCAhPT0gJ3N0cmluZycgfHwgIWNsaWVudElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb25TdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3QgZ2V0Q2hhbm5lbCA9IChjaGFubmVsTmFtZTogc3RyaW5nKSA9PiBzZXJ2ZXIuZ2V0Q2hhbm5lbChjaGFubmVsTmFtZSwgYyA9PiBjLmN0eCA9PT0gY2xpZW50SWQpO1xuXHRcdFx0XHRjb25zdCBwcm94eUNvbm5lY3Rpb24gPSBjcmVhdGVBZ2VudEhvc3RDbGllbnRQcm94eUNvbm5lY3Rpb24oZ2V0Q2hhbm5lbChBR0VOVF9IT1NUX0NMSUVOVF9QUk9YWV9DSEFOTkVMKSk7XG5cdFx0XHRcdGNvbm5lY3Rpb25TdG9yZS5hZGQocHJveHlSZXNvbHZlci5yZWdpc3RlcihjbGllbnRJZCwgcHJveHlDb25uZWN0aW9uKSk7XG5cdFx0XHRcdC8vIEJZT0sgYnJpZGdlIGlzIGdhdGVkOiBvbmx5IHdpcmUgaXQgd2hlbiB0aGUgZmVhdHVyZSBpcyBlbmFibGVkLCBzb1xuXHRcdFx0XHQvLyB0aGUgcmVnaXN0cnkgc3RheXMgZW1wdHkgKGFuZCB0aGUgbGF1bmNoZXIgc3ludGhlc2l6ZXMgbm8gQllPS1xuXHRcdFx0XHQvLyBwcm92aWRlcnMvbW9kZWxzKSB3aGVuIGBjaGF0LmFnZW50SG9zdC5ieW9rTW9kZWxzLmVuYWJsZWRgIGlzIG9mZi5cblx0XHRcdFx0aWYgKGJ5b2tMbUVuYWJsZWQgJiYgYnlva0xtQnJpZGdlUmVnaXN0cnkpIHtcblx0XHRcdFx0XHRjb25zdCBieW9rTG1Db25uZWN0aW9uID0gY3JlYXRlQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ29ubmVjdGlvbihnZXRDaGFubmVsKEFHRU5UX0hPU1RfQ0xJRU5UX0JZT0tfTE1fQ0hBTk5FTCkpO1xuXHRcdFx0XHRcdGNvbm5lY3Rpb25TdG9yZS5hZGQoYnlva0xtQnJpZGdlUmVnaXN0cnkucmVnaXN0ZXIoY2xpZW50SWQsIGJ5b2tMbUNvbm5lY3Rpb24pKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhdXRob3JpdHlSZWdpc3RyYXRpb25zLnNldChjb25uZWN0aW9uLCBjb25uZWN0aW9uU3RvcmUpO1xuXHRcdFx0fTtcblx0XHRcdGxvY2FsRGF0YVBsYW5lRGlzcG9zYWJsZXMuYWRkKHNlcnZlci5vbkRpZEFkZENvbm5lY3Rpb24ocmVnaXN0ZXJDb25uZWN0aW9uKSk7XG5cdFx0XHRsb2NhbERhdGFQbGFuZURpc3Bvc2FibGVzLmFkZChzZXJ2ZXIub25EaWRSZW1vdmVDb25uZWN0aW9uKGNvbm5lY3Rpb24gPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIGNvbm5lY3Rpb24uY3R4ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdG1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIuY2xvc2VDbGllbnQoY29ubmVjdGlvbi5jdHgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlZyA9IGF1dGhvcml0eVJlZ2lzdHJhdGlvbnMuZ2V0KGNvbm5lY3Rpb24pO1xuXHRcdFx0XHRpZiAocmVnKSB7XG5cdFx0XHRcdFx0cmVnLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRhdXRob3JpdHlSZWdpc3RyYXRpb25zLmRlbGV0ZShjb25uZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0bG9jYWxEYXRhUGxhbmVEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCByZWdpc3RyYXRpb24gb2YgYXV0aG9yaXR5UmVnaXN0cmF0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXV0aG9yaXR5UmVnaXN0cmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0fSkpO1xuXHRcdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uIG9mIHNlcnZlci5jb25uZWN0aW9ucykge1xuXHRcdFx0XHRyZWdpc3RlckNvbm5lY3Rpb24oY29ubmVjdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlZ2lzdGVyIHRoZSByZW5kZXJlcidzIHByb3RvY29sIGNoYW5uZWwgQkVGT1JFIHN0YXJ0aW5nIHRoZSBleHRlcm5hbFxuXHRcdFx0Ly8gZW5kcG9pbnQ6IHRoZSByZW5kZXJlciBjb25uZWN0cyBvdmVyIHRoaXMgY2hhbm5lbCwgYW5kIHRoZSBJUENcblx0XHRcdC8vIENoYW5uZWxTZXJ2ZXIgZHJvcHMgY2FsbHMgdG8gYSBub3QteWV0LXJlZ2lzdGVyZWQgY2hhbm5lbCBhZnRlciBpdHNcblx0XHRcdC8vIHVua25vd24tY2hhbm5lbCB0aW1lb3V0ICh+MXMpLCBzbyB0aGUgZW5kcG9pbnQncyBzb2NrZXQgc3RhcnR1cCBtdXN0XG5cdFx0XHQvLyBub3Qgc2l0IG9uIHRoaXMgcGF0aC5cblx0XHRcdHNlcnZlci5yZWdpc3RlckNoYW5uZWwoQWdlbnRIb3N0SXBjQ2hhbm5lbHMuUHJvdG9jb2wsIG1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIpO1xuXG5cdFx0XHQvLyBUaGUgZXh0ZXJuYWwgbG9jYWwgZW5kcG9pbnQgKG91dC1vZi1wcm9jZXNzIGxvY2FsIGNsaWVudHMgc3VjaCBhcyB0aGVcblx0XHRcdC8vIENMSSkgaXMgbm90IG9uIHRoZSByZW5kZXJlcidzIHBhdGg7IHN0YXJ0IGl0IGFmdGVyIHJlZ2lzdHJhdGlvbiBhbmRcblx0XHRcdC8vIGdpdmUgaXQgaXRzIG93biBoYW5kbGVyLlxuXHRcdFx0Y29uc3QgbG9jYWxFbmRwb2ludCA9IGF3YWl0IHN0YXJ0TG9jYWxBZ2VudEhvc3RFbmRwb2ludChcblx0XHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCxcblx0XHRcdFx0bG9nU2VydmljZSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSxcblx0XHRcdCk7XG5cdFx0XHRpZiAobG9jYWxFbmRwb2ludCkge1xuXHRcdFx0XHRjb25zdCBlbmRwb2ludE1ldGFkYXRhID0gbG9jYWxFbmRwb2ludC5tZXRhZGF0YTtcblx0XHRcdFx0Ly8gV2lyZSB0aGUgZW5kcG9pbnQncyBoYW5kbGVyIChzdWJzY3JpYmluZyB0byBpdHMgY29ubmVjdGlvbnMpIEJFRk9SRVxuXHRcdFx0XHQvLyBwdWJsaXNoaW5nIHRoZSBtZXRhZGF0YSB0aGF0IGFkdmVydGlzZXMgaXQsIHNvIGEgY2xpZW50IGNhbid0IGNvbm5lY3Rcblx0XHRcdFx0Ly8gaW4gdGhlIGdhcCBhbmQgYmUgbWlzc2VkLlxuXHRcdFx0XHRsb2NhbERhdGFQbGFuZURpc3Bvc2FibGVzLmFkZChsb2NhbEVuZHBvaW50LnNlcnZlcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRW5kcG9pbnRQcm90b2NvbEhhbmRsZXIgPSBsb2NhbERhdGFQbGFuZURpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRQcm90b2NvbFNlcnZlckhhbmRsZXIsXG5cdFx0XHRcdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHRcdGFnZW50U2VydmljZS5zdGF0ZU1hbmFnZXIsXG5cdFx0XHRcdFx0bG9jYWxFbmRwb2ludC5zZXJ2ZXIsXG5cdFx0XHRcdFx0bG9jYWxQcm90b2NvbEhhbmRsZXJDb25maWcsXG5cdFx0XHRcdFx0Y2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyLFxuXHRcdFx0XHQpKTtcblx0XHRcdFx0cHJvdG9jb2xIYW5kbGVycy5wdXNoKGxvY2FsRW5kcG9pbnRQcm90b2NvbEhhbmRsZXIpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHB1Ymxpc2hMb2NhbEFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGEoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgZW5kcG9pbnRNZXRhZGF0YSwgbG9nU2VydmljZSk7XG5cdFx0XHRcdFx0bG9jYWxEYXRhUGxhbmVEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRcdGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50KGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgsIGVuZHBvaW50TWV0YWRhdGEsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gcHVibGlzaCBsb2NhbCBwcm90b2NvbCBlbmRwb2ludDsgY29udGludWluZyB3aXRoIE1lc3NhZ2VQb3J0IG9ubHknLCBlcnJvcik7XG5cdFx0XHRcdFx0bG9jYWxFbmRwb2ludC5zZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50KGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgsIGVuZHBvaW50TWV0YWRhdGEsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvY2FsRGF0YVBsYW5lRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRXhwb3NlIGR5bmFtaWMgYnJpZGdlIGNsaWVudCBjb3VudCB0byB0aGUgcGFyZW50IHByb2Nlc3MgdmlhIGEgbm9uLXByb3RvY29sXG5cdC8vIG1hbmFnZW1lbnQgSVBDIGNoYW5uZWwuXG5cdGNvbnN0IGNvbm5lY3Rpb25Db3VudEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0bGV0IGR5bmFtaWNTb2NrZXRJbmZvOiBJQWdlbnRIb3N0U29ja2V0SW5mbyB8IHVuZGVmaW5lZDtcblx0Y29uc3QgY29uZmlndXJlZFdlYlNvY2tldFNlcnZlciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0Y29uc3QgY29ubmVjdGlvblRyYWNrZXJTZXJ2aWNlOiBJQ29ubmVjdGlvblRyYWNrZXJTZXJ2aWNlID0ge1xuXHRcdG9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50OiBjb25uZWN0aW9uQ291bnRFbWl0dGVyLmV2ZW50LFxuXHRcdHdhaXRGb3JDb25maWd1cmVkV2ViU29ja2V0U2VydmVyOiAoKSA9PiBjb25maWd1cmVkV2ViU29ja2V0U2VydmVyLnAsXG5cdFx0YXN5bmMgc3RhcnRXZWJTb2NrZXRTZXJ2ZXIoKTogUHJvbWlzZTxJQWdlbnRIb3N0U29ja2V0SW5mbz4ge1xuXHRcdFx0aWYgKHByb3RvY29sSW5ncmVzc0Rpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IGlzIHNodXR0aW5nIGRvd24uJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZHluYW1pY1NvY2tldEluZm8pIHtcblx0XHRcdFx0cmV0dXJuIGR5bmFtaWNTb2NrZXRJbmZvO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzb2NrZXRQYXRoID0gaXNXaW5kb3dzXG5cdFx0XHRcdD8gYFxcXFxcXFxcLlxcXFxwaXBlXFxcXHZzY29kZS1hZ2VudC1ob3N0LSR7Z2VuZXJhdGVVdWlkKCkucmVwbGFjZSgvLS9nLCAnJyl9YFxuXHRcdFx0XHQ6IGpvaW4ob3MudG1wZGlyKCksIGB2c2NvZGUtYWdlbnQtaG9zdC0ke2dlbmVyYXRlVXVpZCgpLnJlcGxhY2UoLy0vZywgJycpfS5zb2NrYCk7XG5cblx0XHRcdGNvbnN0IHdzU2VydmVyID0gYXdhaXQgV2ViU29ja2V0UHJvdG9jb2xTZXJ2ZXIuY3JlYXRlKFxuXHRcdFx0XHR7IHNvY2tldFBhdGggfSxcblx0XHRcdFx0bG9nU2VydmljZSxcblx0XHRcdFx0eyBpbnN0YW50aWF0aW9uU2VydmljZSwgbG9nc0hvbWU6IGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSB9LFxuXHRcdFx0KTtcblx0XHRcdGlmIChwcm90b2NvbEluZ3Jlc3NEaXNwb3NhYmxlcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHdzU2VydmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IGlzIHNodXR0aW5nIGRvd24uJyk7XG5cdFx0XHR9XG5cdFx0XHRwcm90b2NvbEluZ3Jlc3NEaXNwb3NhYmxlcy5hZGQod3NTZXJ2ZXIpO1xuXG5cdFx0XHRjb25zdCBwcm90b2NvbEhhbmRsZXIgPSBwcm90b2NvbEluZ3Jlc3NEaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFByb3RvY29sU2VydmVySGFuZGxlcixcblx0XHRcdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHRhZ2VudFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHR3c1NlcnZlcixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGhvc3RMYXVuY2hLaW5kLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyLFxuXHRcdFx0XHRcdGRlZmF1bHREaXJlY3Rvcnk6IFVSSS5maWxlKG9zLmhvbWVkaXIoKSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRjb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnM6IGFnZW50U2VydmljZS5jb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMsXG5cdFx0XHRcdFx0dGVybWluYWxDb21tYW5kUHJlZml4OiBCQU5HX0NPTU1BTkRfUFJFRklYLFxuXHRcdFx0XHRcdG90bHBMb2dFbWl0dGVyLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjbGllbnRGaWxlU3lzdGVtUHJvdmlkZXIsXG5cdFx0XHQpKTtcblx0XHRcdHByb3RvY29sSGFuZGxlcnMucHVzaChwcm90b2NvbEhhbmRsZXIpO1xuXHRcdFx0cHJvdG9jb2xJbmdyZXNzRGlzcG9zYWJsZXMuYWRkKHByb3RvY29sSGFuZGxlci5vbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudChjb3VudCA9PiBjb25uZWN0aW9uQ291bnRFbWl0dGVyLmZpcmUoY291bnQpKSk7XG5cblx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gRHluYW1pYyBXZWJTb2NrZXQgc2VydmVyIGxpc3RlbmluZyBvbiAke3NvY2tldFBhdGh9YCk7XG5cdFx0XHRkeW5hbWljU29ja2V0SW5mbyA9IHsgc29ja2V0UGF0aCB9O1xuXHRcdFx0cmV0dXJuIGR5bmFtaWNTb2NrZXRJbmZvO1xuXHRcdH0sXG5cdFx0YXN5bmMgZ2V0SW5zcGVjdEluZm8odHJ5RW5hYmxlOiBib29sZWFuKTogUHJvbWlzZTxJQWdlbnRIb3N0SW5zcGVjdEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRcdGxldCB1cmwgPSBpbnNwZWN0b3IudXJsKCk7XG5cdFx0XHRpZiAoIXVybCAmJiB0cnlFbmFibGUpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpbnNwZWN0b3Iub3BlbigwLCAnMTI3LjAuMC4xJywgZmFsc2UpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gb3BlbiBpbnNwZWN0b3InLCBlcnIpO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dXJsID0gaW5zcGVjdG9yLnVybCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF1cmwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIEluc3BlY3RvciBVUkwgbG9va3MgbGlrZTogd3M6Ly9ob3N0OnBvcnQvdXVpZCAoaG9zdCBtYXkgYmUgSVB2NiBpbiBicmFja2V0cylcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwodXJsKTtcblx0XHRcdFx0aWYgKHBhcnNlZFVybC5wcm90b2NvbCAhPT0gJ3dzOicpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIFVuZXhwZWN0ZWQgaW5zcGVjdG9yIFVSTDogJHt1cmx9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBvcnQgPSBOdW1iZXIocGFyc2VkVXJsLnBvcnQpO1xuXHRcdFx0XHRjb25zdCBhdXRoID0gcGFyc2VkVXJsLnBhdGhuYW1lLnJlcGxhY2UoL15cXC8rLywgJycpO1xuXHRcdFx0XHRpZiAoIU51bWJlci5pc0ludGVnZXIocG9ydCkgfHwgIWF1dGgpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIFVuZXhwZWN0ZWQgaW5zcGVjdG9yIFVSTDogJHt1cmx9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGhvc3QgPSBwYXJzZWRVcmwuaG9zdG5hbWUgPT09ICcwLjAuMC4wJ1xuXHRcdFx0XHRcdD8gJzEyNy4wLjAuMSdcblx0XHRcdFx0XHQ6IHBhcnNlZFVybC5ob3N0bmFtZSA9PT0gJzo6J1xuXHRcdFx0XHRcdFx0PyAnOjoxJ1xuXHRcdFx0XHRcdFx0OiBwYXJzZWRVcmwuaG9zdG5hbWU7XG5cdFx0XHRcdGNvbnN0IGRldnRvb2xzSG9zdCA9IGhvc3QuaW5jbHVkZXMoJzonKSA/IGBbJHtob3N0fV1gIDogaG9zdDtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGhvc3QsXG5cdFx0XHRcdFx0cG9ydCxcblx0XHRcdFx0XHRkZXZ0b29sc1VybDogYGRldnRvb2xzOi8vZGV2dG9vbHMvYnVuZGxlZC9qc19hcHAuaHRtbD92OG9ubHk9dHJ1ZSZ3cz0ke2RldnRvb2xzSG9zdH06JHtwYXJzZWRVcmwucG9ydH0vJHthdXRofWAsXG5cdFx0XHRcdH07XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBVbmV4cGVjdGVkIGluc3BlY3RvciBVUkw6ICR7dXJsfWApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH07XG5cdHNlcnZlci5yZWdpc3RlckNoYW5uZWwoQWdlbnRIb3N0SXBjQ2hhbm5lbHMuTWFuYWdlbWVudCwgUHJveHlDaGFubmVsLmZyb21TZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdEFnZW50SG9zdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdGFnZW50U2VydmljZSxcblx0XHRjb25uZWN0aW9uVHJhY2tlclNlcnZpY2UsXG5cdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJvdG9jb2xJbmdyZXNzRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvdG9jb2xIYW5kbGVycy5tYXAoaGFuZGxlciA9PiBoYW5kbGVyLndoZW5JZGxlKCkpKTtcblx0XHR9LFxuXHQpLCBkaXNwb3NhYmxlcykpO1xuXHRpZiAoIShzZXJ2ZXIgaW5zdGFuY2VvZiBVdGlsaXR5UHJvY2Vzc1NlcnZlcikpIHtcblx0XHRzZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKEFnZW50SG9zdElwY0NoYW5uZWxzLkNvbm5lY3Rpb25UcmFja2VyLCBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoY29ubmVjdGlvblRyYWNrZXJTZXJ2aWNlLCBkaXNwb3NhYmxlcykpO1xuXHR9XG5cblx0Ly8gVGhlIGNvbmZpZ3VyZWQgYnJpZGdlIGxpc3RlbmVyIHJlbWFpbnMgc2VwYXJhdGU6IHR1bm5lbCBmb3J3YXJkaW5nIHBpcGVzXG5cdC8vIHJhdyBXZWJTb2NrZXQgc3RyZWFtcyBhbmQgY2Fubm90IGNhcnJ5IHRoZSBsb2NhbCBlbmRwb2ludCdzIGJlYXJlciB0b2tlbi5cblx0Y29uc3QgY29uZmlndXJlZFdlYlNvY2tldFNlcnZlclN0YXJ0ID0gc3RhcnRXZWJTb2NrZXRTZXJ2ZXIoXG5cdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdGNsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcixcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRlbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsXG5cdFx0bG9nU2VydmljZSxcblx0XHRvdGxwTG9nRW1pdHRlcixcblx0XHRwcm90b2NvbEluZ3Jlc3NEaXNwb3NhYmxlcyxcblx0XHRob3N0TGF1bmNoS2luZCxcblx0XHRjb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlcixcblx0XHRjb3VudCA9PiBjb25uZWN0aW9uQ291bnRFbWl0dGVyLmZpcmUoY291bnQpLFxuXHRcdGhhbmRsZXIgPT4gcHJvdG9jb2xIYW5kbGVycy5wdXNoKGhhbmRsZXIpLFxuXHQpO1xuXHRjb25maWd1cmVkV2ViU29ja2V0U2VydmVyLnNldHRsZVdpdGgoY29uZmlndXJlZFdlYlNvY2tldFNlcnZlclN0YXJ0KTtcblx0dm9pZCBjb25maWd1cmVkV2ViU29ja2V0U2VydmVyU3RhcnQuY2F0Y2goZXJyID0+IHtcblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gc3RhcnQgV2ViU29ja2V0IHNlcnZlcicsIGVycik7XG5cdH0pO1xuXG5cdHByb2Nlc3Mub25jZSgnZXhpdCcsICgpID0+IHtcblx0XHRhZ2VudFNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdGxvZ1NlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG59XG5cbmludGVyZmFjZSBJTG9jYWxBZ2VudEhvc3RFbmRwb2ludCB7XG5cdHJlYWRvbmx5IG1ldGFkYXRhOiBJTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhO1xuXHRyZWFkb25seSBzZXJ2ZXI6IFdlYlNvY2tldFByb3RvY29sU2VydmVyO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzdGFydExvY2FsQWdlbnRIb3N0RW5kcG9pbnQoXG5cdHVzZXJEYXRhUGF0aDogc3RyaW5nLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0bG9nc0hvbWU6IFVSSSxcbik6IFByb21pc2U8SUxvY2FsQWdlbnRIb3N0RW5kcG9pbnQgfCB1bmRlZmluZWQ+IHtcblx0bGV0IG1ldGFkYXRhOiBJTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRsZXQgc2VydmVyOiBXZWJTb2NrZXRQcm90b2NvbFNlcnZlciB8IHVuZGVmaW5lZDtcblx0dHJ5IHtcblx0XHRjb25zdCBlbmRwb2ludE1ldGFkYXRhID0gY3JlYXRlTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhKHVzZXJEYXRhUGF0aCk7XG5cdFx0bWV0YWRhdGEgPSBlbmRwb2ludE1ldGFkYXRhO1xuXHRcdGF3YWl0IHByZXBhcmVMb2NhbEFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGFEaXJlY3RvcnkodXNlckRhdGFQYXRoKTtcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0YXdhaXQgcHJlcGFyZUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRTb2NrZXREaXJlY3RvcnkodXNlckRhdGFQYXRoKTtcblx0XHR9XG5cdFx0c2VydmVyID0gYXdhaXQgV2ViU29ja2V0UHJvdG9jb2xTZXJ2ZXIuY3JlYXRlKFxuXHRcdFx0e1xuXHRcdFx0XHRzb2NrZXRQYXRoOiBlbmRwb2ludE1ldGFkYXRhLmVuZHBvaW50LnBhdGgsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlblZhbGlkYXRlOiB0b2tlbiA9PiB0b2tlbiA9PT0gZW5kcG9pbnRNZXRhZGF0YS5jb25uZWN0aW9uVG9rZW4sXG5cdFx0XHR9LFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGxvZ3NIb21lIH0sXG5cdFx0KTtcblx0XHRhd2FpdCBzZXJ2ZXIud2hlbkxpc3RlbmluZztcblx0XHRyZXR1cm4geyBtZXRhZGF0YTogZW5kcG9pbnRNZXRhZGF0YSwgc2VydmVyIH07XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHNlcnZlcj8uZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2ggKGRpc3Bvc2VFcnJvcikge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignW0FnZW50SG9zdF0gRmFpbGVkIHRvIGRpc3Bvc2UgbG9jYWwgcHJvdG9jb2wgZW5kcG9pbnQnLCBkaXNwb3NlRXJyb3IpO1xuXHRcdH1cblx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50KHVzZXJEYXRhUGF0aCwgbWV0YWRhdGEsIGxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gc3RhcnQgbG9jYWwgcHJvdG9jb2wgZW5kcG9pbnQ7IGNvbnRpbnVpbmcgd2l0aCBNZXNzYWdlUG9ydCBvbmx5JywgZXJyb3IpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY2xlYW51cExvY2FsQWdlbnRIb3N0RW5kcG9pbnQoXG5cdHVzZXJEYXRhUGF0aDogc3RyaW5nLFxuXHRtZXRhZGF0YTogSUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG4pOiB2b2lkIHtcblx0dHJ5IHtcblx0XHRjbGVhbnVwTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhU3luYyh1c2VyRGF0YVBhdGgsIG1ldGFkYXRhLCBsb2dTZXJ2aWNlKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gY2xlYW4gdXAgbG9jYWwgcHJvdG9jb2wgbWV0YWRhdGEnLCBlcnJvcik7XG5cdH1cblx0dHJ5IHtcblx0XHRjbGVhbnVwTG9jYWxBZ2VudEhvc3RFbmRwb2ludFNvY2tldFN5bmMobWV0YWRhdGEuZW5kcG9pbnQucGF0aCk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0bG9nU2VydmljZS5lcnJvcignW0FnZW50SG9zdF0gRmFpbGVkIHRvIGNsZWFuIHVwIGxvY2FsIHByb3RvY29sIHNvY2tldCcsIGVycm9yKTtcblx0fVxufVxuXG4vKipcbiAqIFdoZW4gdGhlIHBhcmVudCBwcm9jZXNzIHBhc3NlcyBXZWJTb2NrZXQgY29uZmlndXJhdGlvbiB2aWEgZW52aXJvbm1lbnRcbiAqIHZhcmlhYmxlcywgc3RhcnQgYSBwcm90b2NvbCBzZXJ2ZXIgdGhhdCBleHRlcm5hbCBjbGllbnRzIGNhbiBjb25uZWN0IHRvLlxuICogVGhpcyByZXVzZXMgdGhlIHNhbWUge0BsaW5rIEFnZW50U2VydmljZX0gYW5kIHtAbGluayBBZ2VudEhvc3RTdGF0ZU1hbmFnZXJ9XG4gKiB0aGF0IHRoZSBJUEMgY2hhbm5lbCB1c2VzLCBzbyBib3RoIElQQyBhbmQgV2ViU29ja2V0IGNsaWVudHMgc2hhcmUgc3RhdGUuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0V2ViU29ja2V0U2VydmVyKFxuXHRhZ2VudFNlcnZpY2U6IEFnZW50U2VydmljZSxcblx0Y2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyOiBBZ2VudEhvc3RDbGllbnRGaWxlU3lzdGVtUHJvdmlkZXIsXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdGxvZ3NIb21lOiBVUkksXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRvdGxwTG9nRW1pdHRlcjogT3RscExvZ0VtaXR0ZXIsXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLFxuXHRjb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlcjogQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvblRlbGVtZXRyeVRyYWNrZXIsXG5cdG9uQ29ubmVjdGlvbkNvdW50Q2hhbmdlZDogKGNvdW50OiBudW1iZXIpID0+IHZvaWQsXG5cdG9uUHJvdG9jb2xIYW5kbGVyQ3JlYXRlZDogKGhhbmRsZXI6IFByb3RvY29sU2VydmVySGFuZGxlcikgPT4gdm9pZCxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBwb3J0ID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9BR0VOVF9IT1NUX1BPUlQnXTtcblx0Y29uc3Qgc29ja2V0UGF0aCA9IHByb2Nlc3MuZW52WydWU0NPREVfQUdFTlRfSE9TVF9TT0NLRVRfUEFUSCddO1xuXG5cdGlmICghcG9ydCAmJiAhc29ja2V0UGF0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGNvbm5lY3Rpb25Ub2tlbiA9IHByb2Nlc3MuZW52WydWU0NPREVfQUdFTlRfSE9TVF9DT05ORUNUSU9OX1RPS0VOJ107XG5cdGNvbnN0IGhvc3QgPSBwcm9jZXNzLmVudlsnVlNDT0RFX0FHRU5UX0hPU1RfSE9TVCddIHx8ICdsb2NhbGhvc3QnO1xuXG5cdGNvbnN0IHdzU2VydmVyID0gYXdhaXQgV2ViU29ja2V0UHJvdG9jb2xTZXJ2ZXIuY3JlYXRlKFxuXHRcdHNvY2tldFBhdGhcblx0XHRcdD8ge1xuXHRcdFx0XHRzb2NrZXRQYXRoLFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW5WYWxpZGF0ZTogY29ubmVjdGlvblRva2VuXG5cdFx0XHRcdFx0PyAodG9rZW4pID0+IHRva2VuID09PSBjb25uZWN0aW9uVG9rZW5cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH1cblx0XHRcdDoge1xuXHRcdFx0XHRwb3J0OiBwYXJzZUludChwb3J0ISwgMTApLFxuXHRcdFx0XHRob3N0LFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW5WYWxpZGF0ZTogY29ubmVjdGlvblRva2VuXG5cdFx0XHRcdFx0PyAodG9rZW4pID0+IHRva2VuID09PSBjb25uZWN0aW9uVG9rZW5cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0bG9nU2VydmljZSxcblx0XHR7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2dzSG9tZSB9LFxuXHQpO1xuXHRpZiAoZGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdHdzU2VydmVyLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm47XG5cdH1cblx0ZGlzcG9zYWJsZXMuYWRkKHdzU2VydmVyKTtcblxuXHRjb25zdCBwcm90b2NvbEhhbmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0UHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLFxuXHRcdGFnZW50U2VydmljZSxcblx0XHRhZ2VudFNlcnZpY2Uuc3RhdGVNYW5hZ2VyLFxuXHRcdHdzU2VydmVyLFxuXHRcdHtcblx0XHRcdGhvc3RMYXVuY2hLaW5kLFxuXHRcdFx0Y29ubmVjdGlvblRlbGVtZXRyeVRyYWNrZXIsXG5cdFx0XHRkZWZhdWx0RGlyZWN0b3J5OiBVUkkuZmlsZShvcy5ob21lZGlyKCkpLnRvU3RyaW5nKCksXG5cdFx0XHRjb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnM6IGFnZW50U2VydmljZS5jb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMsXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRQcmVmaXg6IEJBTkdfQ09NTUFORF9QUkVGSVgsXG5cdFx0XHRvdGxwTG9nRW1pdHRlcixcblx0XHR9LFxuXHRcdGNsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcixcblx0KSk7XG5cdG9uUHJvdG9jb2xIYW5kbGVyQ3JlYXRlZChwcm90b2NvbEhhbmRsZXIpO1xuXHRkaXNwb3NhYmxlcy5hZGQocHJvdG9jb2xIYW5kbGVyLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50KG9uQ29ubmVjdGlvbkNvdW50Q2hhbmdlZCkpO1xuXG5cdC8vIFdhaXQgZm9yIHRoZSBsaXN0ZW5lciB0byBhY3R1YWxseSBiaW5kIGJlZm9yZSByZXBvcnRpbmcgcmVhZGluZXNzLlxuXHQvLyBXaGVuIHRoZSBjYWxsZXIgcmVxdWVzdGVkIGBwb3J0OiAwYCAobGV0IHRoZSBPUyBwaWNrKSwgdGhlIGJvdW5kXG5cdC8vIHBvcnQgaXMgb25seSBrbm93biBhZnRlciB0aGlzIHBvaW50IFx1MjAxNCBlbWl0dGluZyB0aGUgcmVxdWVzdGVkIHBvcnRcblx0Ly8gd291bGQgcHJpbnQgYGxvY2FsaG9zdDowYCBhbmQgYnJlYWsgdGhlIENMSSdzIHJlYWRpbmVzcyBwYXJzZXIuXG5cdGF3YWl0IHdzU2VydmVyLndoZW5MaXN0ZW5pbmc7XG5cdGNvbnN0IGxpc3RlblRhcmdldCA9IHNvY2tldFBhdGggPz8gYCR7aG9zdH06JHt3c1NlcnZlci5ib3VuZFBvcnQgPz8gcG9ydH1gO1xuXHRsb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RdIFdlYlNvY2tldCBzZXJ2ZXIgbGlzdGVuaW5nIG9uICR7bGlzdGVuVGFyZ2V0fWApO1xuXHQvLyBEbyBub3QgY2hhbmdlIHRoaXMgbGluZS4gVGhlIENMSSBsb29rcyBmb3IgdGhpcyBpbiB0aGUgb3V0cHV0LlxuXHRjb25zb2xlLmxvZyhgQWdlbnQgaG9zdCBzZXJ2ZXIgbGlzdGVuaW5nIG9uICR7bGlzdGVuVGFyZ2V0fWApO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFB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
