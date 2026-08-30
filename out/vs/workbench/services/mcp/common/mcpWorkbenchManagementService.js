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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IMcpManagementService, IMcpGalleryService, IAllowedMcpServersService, RegistryType } from "../../../../platform/mcp/common/mcpManagement.js";
import { IInstantiationService, refineServiceDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { Emitter } from "../../../../base/common/event.js";
import { IMcpResourceScannerService } from "../../../../platform/mcp/common/mcpResourceScannerService.js";
import { isWorkspaceFolder, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from "../../configuration/common/configuration.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { McpManagementChannelClient } from "../../../../platform/mcp/common/mcpManagementIpc.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IRemoteUserDataProfilesService } from "../../userDataProfile/common/remoteUserDataProfiles.js";
import { AbstractMcpManagementService, AbstractMcpResourceManagementService } from "../../../../platform/mcp/common/mcpManagementService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ResourceMap } from "../../../../base/common/map.js";
const USER_CONFIG_ID = "usrlocal";
const REMOTE_USER_CONFIG_ID = "usrremote";
const WORKSPACE_CONFIG_ID = "workspace";
const WORKSPACE_FOLDER_CONFIG_ID_PREFIX = "ws";
var LocalMcpServerScope = /* @__PURE__ */ ((LocalMcpServerScope2) => {
  LocalMcpServerScope2["User"] = "user";
  LocalMcpServerScope2["RemoteUser"] = "remoteUser";
  LocalMcpServerScope2["Workspace"] = "workspace";
  return LocalMcpServerScope2;
})(LocalMcpServerScope || {});
const IWorkbenchMcpManagementService = refineServiceDecorator(IMcpManagementService);
let WorkbenchMcpManagementService = class extends AbstractMcpManagementService {
  constructor(mcpManagementService, allowedMcpServersService, logService, userDataProfileService, uriIdentityService, workspaceContextService, remoteAgentService, userDataProfilesService, remoteUserDataProfilesService, instantiationService) {
    super(allowedMcpServersService, logService);
    this.mcpManagementService = mcpManagementService;
    this.userDataProfileService = userDataProfileService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceContextService = workspaceContextService;
    this.userDataProfilesService = userDataProfilesService;
    this.remoteUserDataProfilesService = remoteUserDataProfilesService;
    this._onInstallMcpServer = this._register(new Emitter());
    this.onInstallMcpServer = this._onInstallMcpServer.event;
    this._onDidInstallMcpServers = this._register(new Emitter());
    this.onDidInstallMcpServers = this._onDidInstallMcpServers.event;
    this._onDidUpdateMcpServers = this._register(new Emitter());
    this.onDidUpdateMcpServers = this._onDidUpdateMcpServers.event;
    this._onUninstallMcpServer = this._register(new Emitter());
    this.onUninstallMcpServer = this._onUninstallMcpServer.event;
    this._onDidUninstallMcpServer = this._register(new Emitter());
    this.onDidUninstallMcpServer = this._onDidUninstallMcpServer.event;
    this._onInstallMcpServerInCurrentProfile = this._register(new Emitter());
    this.onInstallMcpServerInCurrentProfile = this._onInstallMcpServerInCurrentProfile.event;
    this._onDidInstallMcpServersInCurrentProfile = this._register(new Emitter());
    this.onDidInstallMcpServersInCurrentProfile = this._onDidInstallMcpServersInCurrentProfile.event;
    this._onDidUpdateMcpServersInCurrentProfile = this._register(new Emitter());
    this.onDidUpdateMcpServersInCurrentProfile = this._onDidUpdateMcpServersInCurrentProfile.event;
    this._onUninstallMcpServerInCurrentProfile = this._register(new Emitter());
    this.onUninstallMcpServerInCurrentProfile = this._onUninstallMcpServerInCurrentProfile.event;
    this._onDidUninstallMcpServerInCurrentProfile = this._register(new Emitter());
    this.onDidUninstallMcpServerInCurrentProfile = this._onDidUninstallMcpServerInCurrentProfile.event;
    this._onDidChangeProfile = this._register(new Emitter());
    this.onDidChangeProfile = this._onDidChangeProfile.event;
    this.workspaceMcpManagementService = this._register(instantiationService.createInstance(WorkspaceMcpManagementService));
    const remoteAgentConnection = remoteAgentService.getConnection();
    if (remoteAgentConnection) {
      this.remoteMcpManagementService = this._register(instantiationService.createInstance(McpManagementChannelClient, remoteAgentConnection.getChannel("mcpManagement")));
    }
    this._register(this.mcpManagementService.onInstallMcpServer((e) => {
      this._onInstallMcpServer.fire(e);
      if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* User */ });
      }
    }));
    this._register(this.mcpManagementService.onDidInstallMcpServers((e) => {
      const { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile } = this.createInstallMcpServerResultsFromEvent(e, "user" /* User */);
      this._onDidInstallMcpServers.fire(mcpServerInstallResult);
      if (mcpServerInstallResultInCurrentProfile.length) {
        this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
      }
    }));
    this._register(this.mcpManagementService.onDidUpdateMcpServers((e) => {
      const { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile } = this.createInstallMcpServerResultsFromEvent(e, "user" /* User */);
      this._onDidUpdateMcpServers.fire(mcpServerInstallResult);
      if (mcpServerInstallResultInCurrentProfile.length) {
        this._onDidUpdateMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
      }
    }));
    this._register(this.mcpManagementService.onUninstallMcpServer((e) => {
      this._onUninstallMcpServer.fire(e);
      if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* User */ });
      }
    }));
    this._register(this.mcpManagementService.onDidUninstallMcpServer((e) => {
      this._onDidUninstallMcpServer.fire(e);
      if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* User */ });
      }
    }));
    this._register(this.workspaceMcpManagementService.onInstallMcpServer(async (e) => {
      this._onInstallMcpServer.fire(e);
      this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* Workspace */ });
    }));
    this._register(this.workspaceMcpManagementService.onDidInstallMcpServers(async (e) => {
      const { mcpServerInstallResult } = this.createInstallMcpServerResultsFromEvent(e, "workspace" /* Workspace */);
      this._onDidInstallMcpServers.fire(mcpServerInstallResult);
      this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResult);
    }));
    this._register(this.workspaceMcpManagementService.onUninstallMcpServer(async (e) => {
      this._onUninstallMcpServer.fire(e);
      this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* Workspace */ });
    }));
    this._register(this.workspaceMcpManagementService.onDidUninstallMcpServer(async (e) => {
      this._onDidUninstallMcpServer.fire(e);
      this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* Workspace */ });
    }));
    this._register(this.workspaceMcpManagementService.onDidUpdateMcpServers((e) => {
      const { mcpServerInstallResult } = this.createInstallMcpServerResultsFromEvent(e, "workspace" /* Workspace */);
      this._onDidUpdateMcpServers.fire(mcpServerInstallResult);
      this._onDidUpdateMcpServersInCurrentProfile.fire(mcpServerInstallResult);
    }));
    if (this.remoteMcpManagementService) {
      this._register(this.remoteMcpManagementService.onInstallMcpServer(async (e) => {
        this._onInstallMcpServer.fire(e);
        const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
        if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
          this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* RemoteUser */ });
        }
      }));
      this._register(this.remoteMcpManagementService.onDidInstallMcpServers((e) => this.handleRemoteInstallMcpServerResultsFromEvent(e, this._onDidInstallMcpServers, this._onDidInstallMcpServersInCurrentProfile)));
      this._register(this.remoteMcpManagementService.onDidUpdateMcpServers((e) => this.handleRemoteInstallMcpServerResultsFromEvent(e, this._onDidInstallMcpServers, this._onDidInstallMcpServersInCurrentProfile)));
      this._register(this.remoteMcpManagementService.onUninstallMcpServer(async (e) => {
        this._onUninstallMcpServer.fire(e);
        const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
        if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
          this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* RemoteUser */ });
        }
      }));
      this._register(this.remoteMcpManagementService.onDidUninstallMcpServer(async (e) => {
        this._onDidUninstallMcpServer.fire(e);
        const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
        if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
          this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* RemoteUser */ });
        }
      }));
    }
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      if (!this.uriIdentityService.extUri.isEqual(e.previous.mcpResource, e.profile.mcpResource)) {
        this._onDidChangeProfile.fire();
      }
    }));
  }
  createInstallMcpServerResultsFromEvent(e, scope) {
    const mcpServerInstallResult = [];
    const mcpServerInstallResultInCurrentProfile = [];
    for (const result of e) {
      const workbenchResult = {
        ...result,
        local: result.local ? this.toWorkspaceMcpServer(result.local, scope) : void 0
      };
      mcpServerInstallResult.push(workbenchResult);
      if (this.uriIdentityService.extUri.isEqual(result.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        mcpServerInstallResultInCurrentProfile.push(workbenchResult);
      }
    }
    return { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile };
  }
  async handleRemoteInstallMcpServerResultsFromEvent(e, emitter, currentProfileEmitter) {
    const mcpServerInstallResult = [];
    const mcpServerInstallResultInCurrentProfile = [];
    const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
    for (const result of e) {
      const workbenchResult = {
        ...result,
        local: result.local ? this.toWorkspaceMcpServer(result.local, "remoteUser" /* RemoteUser */) : void 0
      };
      mcpServerInstallResult.push(workbenchResult);
      if (remoteMcpResource ? this.uriIdentityService.extUri.isEqual(result.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
        mcpServerInstallResultInCurrentProfile.push(workbenchResult);
      }
    }
    emitter.fire(mcpServerInstallResult);
    if (mcpServerInstallResultInCurrentProfile.length) {
      currentProfileEmitter.fire(mcpServerInstallResultInCurrentProfile);
    }
  }
  async getInstalled() {
    const installed = [];
    const [userServers, remoteServers, workspaceServers] = await Promise.all([
      this.mcpManagementService.getInstalled(this.userDataProfileService.currentProfile.mcpResource),
      this.remoteMcpManagementService?.getInstalled(await this.getRemoteMcpResource()) ?? Promise.resolve([]),
      this.workspaceMcpManagementService?.getInstalled() ?? Promise.resolve([])
    ]);
    for (const server of userServers) {
      installed.push(this.toWorkspaceMcpServer(server, "user" /* User */));
    }
    for (const server of remoteServers) {
      installed.push(this.toWorkspaceMcpServer(server, "remoteUser" /* RemoteUser */));
    }
    for (const server of workspaceServers) {
      installed.push(this.toWorkspaceMcpServer(server, "workspace" /* Workspace */));
    }
    return installed;
  }
  toWorkspaceMcpServer(server, scope) {
    return { ...server, id: `mcp.config.${this.getConfigId(server, scope)}.${server.name}`, scope };
  }
  getConfigId(server, scope) {
    if (scope === "user" /* User */) {
      return USER_CONFIG_ID;
    }
    if (scope === "remoteUser" /* RemoteUser */) {
      return REMOTE_USER_CONFIG_ID;
    }
    if (scope === "workspace" /* Workspace */) {
      const workspace = this.workspaceContextService.getWorkspace();
      if (workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, server.mcpResource)) {
        return WORKSPACE_CONFIG_ID;
      }
      const workspaceFolders = workspace.folders;
      for (let index = 0; index < workspaceFolders.length; index++) {
        const workspaceFolder = workspaceFolders[index];
        if (this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), server.mcpResource)) {
          return `${WORKSPACE_FOLDER_CONFIG_ID_PREFIX}${index}`;
        }
      }
    }
    return "unknown";
  }
  async install(server, options) {
    options = options ?? {};
    if (options.target === ConfigurationTarget.WORKSPACE || isWorkspaceFolder(options.target)) {
      const mcpResource = options.target === ConfigurationTarget.WORKSPACE ? this.workspaceContextService.getWorkspace().configuration : options.target.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
      if (!mcpResource) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = mcpResource;
      const result2 = await this.workspaceMcpManagementService.install(server, options);
      return this.toWorkspaceMcpServer(result2, "workspace" /* Workspace */);
    }
    if (options.target === ConfigurationTarget.USER_REMOTE) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = await this.getRemoteMcpResource(options.mcpResource);
      const result2 = await this.remoteMcpManagementService.install(server, options);
      return this.toWorkspaceMcpServer(result2, "remoteUser" /* RemoteUser */);
    }
    if (options.target && options.target !== ConfigurationTarget.USER && options.target !== ConfigurationTarget.USER_LOCAL) {
      throw new Error(`Illegal target: ${options.target}`);
    }
    options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
    const result = await this.mcpManagementService.install(server, options);
    return this.toWorkspaceMcpServer(result, "user" /* User */);
  }
  async installFromGallery(server, options) {
    options = options ?? {};
    if (options.target === ConfigurationTarget.WORKSPACE || isWorkspaceFolder(options.target)) {
      const mcpResource = options.target === ConfigurationTarget.WORKSPACE ? this.workspaceContextService.getWorkspace().configuration : options.target.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
      if (!mcpResource) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = mcpResource;
      const result2 = await this.workspaceMcpManagementService.installFromGallery(server, options);
      return this.toWorkspaceMcpServer(result2, "workspace" /* Workspace */);
    }
    if (options.target === ConfigurationTarget.USER_REMOTE) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = await this.getRemoteMcpResource(options.mcpResource);
      const result2 = await this.remoteMcpManagementService.installFromGallery(server, options);
      return this.toWorkspaceMcpServer(result2, "remoteUser" /* RemoteUser */);
    }
    if (options.target && options.target !== ConfigurationTarget.USER && options.target !== ConfigurationTarget.USER_LOCAL) {
      throw new Error(`Illegal target: ${options.target}`);
    }
    if (!options.mcpResource) {
      options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
    }
    const result = await this.mcpManagementService.installFromGallery(server, options);
    return this.toWorkspaceMcpServer(result, "user" /* User */);
  }
  async updateMetadata(local, server, profileLocation) {
    if (local.scope === "workspace" /* Workspace */) {
      const result2 = await this.workspaceMcpManagementService.updateMetadata(local, server, profileLocation);
      return this.toWorkspaceMcpServer(result2, "workspace" /* Workspace */);
    }
    if (local.scope === "remoteUser" /* RemoteUser */) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${local.scope}`);
      }
      const result2 = await this.remoteMcpManagementService.updateMetadata(local, server, profileLocation);
      return this.toWorkspaceMcpServer(result2, "remoteUser" /* RemoteUser */);
    }
    const result = await this.mcpManagementService.updateMetadata(local, server, profileLocation);
    return this.toWorkspaceMcpServer(result, "user" /* User */);
  }
  async uninstall(server) {
    if (server.scope === "workspace" /* Workspace */) {
      return this.workspaceMcpManagementService.uninstall(server);
    }
    if (server.scope === "remoteUser" /* RemoteUser */) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${server.scope}`);
      }
      return this.remoteMcpManagementService.uninstall(server);
    }
    return this.mcpManagementService.uninstall(server, { mcpResource: this.userDataProfileService.currentProfile.mcpResource });
  }
  async getRemoteMcpResource(mcpResource) {
    if (!mcpResource && this.userDataProfileService.currentProfile.isDefault) {
      return void 0;
    }
    mcpResource = mcpResource ?? this.userDataProfileService.currentProfile.mcpResource;
    let profile = this.userDataProfilesService.profiles.find((p) => this.uriIdentityService.extUri.isEqual(p.mcpResource, mcpResource));
    if (profile) {
      profile = await this.remoteUserDataProfilesService.getRemoteProfile(profile);
    } else {
      profile = (await this.remoteUserDataProfilesService.getRemoteProfiles()).find((p) => this.uriIdentityService.extUri.isEqual(p.mcpResource, mcpResource));
    }
    return profile?.mcpResource;
  }
};
WorkbenchMcpManagementService = __decorateClass([
  __decorateParam(1, IAllowedMcpServersService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IRemoteAgentService),
  __decorateParam(7, IUserDataProfilesService),
  __decorateParam(8, IRemoteUserDataProfilesService),
  __decorateParam(9, IInstantiationService)
], WorkbenchMcpManagementService);
let WorkspaceMcpResourceManagementService = class extends AbstractMcpResourceManagementService {
  constructor(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService) {
    super(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService);
  }
  async installFromGallery(server, options) {
    this.logService.trace("MCP Management Service: installGallery", server.name, server.galleryUrl);
    this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
    try {
      const packageType = options?.packageType ?? server.configuration.packages?.[0]?.registryType ?? RegistryType.REMOTE;
      const { mcpServerConfiguration, notices } = this.getMcpServerConfigurationFromManifest(server.configuration, packageType);
      if (notices.length > 0) {
        this.logService.warn(`MCP Management Service: Warnings while installing ${server.name}`, notices);
      }
      const installable = {
        name: server.name,
        config: {
          ...mcpServerConfiguration.config,
          gallery: server.galleryUrl ?? true,
          version: server.version
        },
        inputs: mcpServerConfiguration.inputs
      };
      this.ensureServerAllowed(installable);
      await this.mcpResourceScannerService.addMcpServers([installable], this.mcpResource, this.target);
      await this.updateLocal(server);
      const local = (await this.getInstalled()).find((s) => s.name === server.name);
      if (!local) {
        throw new Error(`Failed to install MCP server: ${server.name}`);
      }
      return local;
    } catch (e) {
      this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e, mcpResource: this.mcpResource }]);
      throw e;
    }
  }
  updateMetadata() {
    throw new Error("Not supported");
  }
  installFromUri() {
    throw new Error("Not supported");
  }
  async getLocalServerInfo(name, mcpServerConfig) {
    if (!mcpServerConfig.gallery) {
      return void 0;
    }
    const [mcpServer] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
    if (!mcpServer) {
      return void 0;
    }
    return {
      name: mcpServer.name,
      version: mcpServerConfig.version,
      displayName: mcpServer.displayName,
      description: mcpServer.description,
      galleryUrl: mcpServer.galleryUrl,
      manifest: mcpServer.configuration,
      publisher: mcpServer.publisher,
      publisherDisplayName: mcpServer.publisherDisplayName,
      repositoryUrl: mcpServer.repositoryUrl,
      icon: mcpServer.icon
    };
  }
  canInstall(server) {
    throw new Error("Not supported");
  }
};
WorkspaceMcpResourceManagementService = __decorateClass([
  __decorateParam(2, IMcpGalleryService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IMcpResourceScannerService),
  __decorateParam(7, IAllowedMcpServersService)
], WorkspaceMcpResourceManagementService);
let WorkspaceMcpManagementService = class extends AbstractMcpManagementService {
  constructor(allowedMcpServersService, uriIdentityService, logService, workspaceContextService, instantiationService) {
    super(allowedMcpServersService, logService);
    this.uriIdentityService = uriIdentityService;
    this.workspaceContextService = workspaceContextService;
    this.instantiationService = instantiationService;
    this._onInstallMcpServer = this._register(new Emitter());
    this.onInstallMcpServer = this._onInstallMcpServer.event;
    this._onDidInstallMcpServers = this._register(new Emitter());
    this.onDidInstallMcpServers = this._onDidInstallMcpServers.event;
    this._onDidUpdateMcpServers = this._register(new Emitter());
    this.onDidUpdateMcpServers = this._onDidUpdateMcpServers.event;
    this._onUninstallMcpServer = this._register(new Emitter());
    this.onUninstallMcpServer = this._onUninstallMcpServer.event;
    this._onDidUninstallMcpServer = this._register(new Emitter());
    this.onDidUninstallMcpServer = this._onDidUninstallMcpServer.event;
    this.allMcpServers = [];
    this.workspaceMcpManagementServices = new ResourceMap();
    this.initialize();
  }
  async initialize() {
    try {
      await this.onDidChangeWorkbenchState();
      await this.onDidChangeWorkspaceFolders({ added: this.workspaceContextService.getWorkspace().folders, removed: [], changed: [] });
      this._register(this.workspaceContextService.onDidChangeWorkspaceFolders((e) => this.onDidChangeWorkspaceFolders(e)));
      this._register(this.workspaceContextService.onDidChangeWorkbenchState((e) => this.onDidChangeWorkbenchState()));
    } catch (error) {
      this.logService.error("Failed to initialize workspace folders", error);
    }
  }
  async onDidChangeWorkbenchState() {
    if (this.workspaceConfiguration) {
      await this.removeWorkspaceService(this.workspaceConfiguration);
    }
    this.workspaceConfiguration = this.workspaceContextService.getWorkspace().configuration;
    if (this.workspaceConfiguration) {
      await this.addWorkspaceService(this.workspaceConfiguration, ConfigurationTarget.WORKSPACE);
    }
  }
  async onDidChangeWorkspaceFolders(e) {
    try {
      await Promise.allSettled(e.removed.map((folder) => this.removeWorkspaceService(folder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]))));
    } catch (error) {
      this.logService.error(error);
    }
    try {
      await Promise.allSettled(e.added.map((folder) => this.addWorkspaceService(folder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), ConfigurationTarget.WORKSPACE_FOLDER)));
    } catch (error) {
      this.logService.error(error);
    }
  }
  async addWorkspaceService(mcpResource, target) {
    if (this.workspaceMcpManagementServices.has(mcpResource)) {
      return;
    }
    const disposables = new DisposableStore();
    const service = disposables.add(this.instantiationService.createInstance(WorkspaceMcpResourceManagementService, mcpResource, target));
    try {
      const installedServers = await service.getInstalled();
      this.allMcpServers.push(...installedServers);
      if (installedServers.length > 0) {
        const installResults = installedServers.map((server) => ({
          name: server.name,
          local: server,
          mcpResource: server.mcpResource
        }));
        this._onDidInstallMcpServers.fire(installResults);
      }
    } catch (error) {
      this.logService.warn("Failed to get installed servers from", mcpResource.toString(), error);
    }
    disposables.add(service.onInstallMcpServer((e) => this._onInstallMcpServer.fire(e)));
    disposables.add(service.onDidInstallMcpServers((e) => {
      for (const { local } of e) {
        if (local) {
          this.allMcpServers.push(local);
        }
      }
      this._onDidInstallMcpServers.fire(e);
    }));
    disposables.add(service.onDidUpdateMcpServers((e) => {
      for (const { local, mcpResource: mcpResource2 } of e) {
        if (local) {
          const index = this.allMcpServers.findIndex((server) => this.uriIdentityService.extUri.isEqual(server.mcpResource, mcpResource2) && server.name === local.name);
          if (index !== -1) {
            this.allMcpServers.splice(index, 1, local);
          }
        }
      }
      this._onDidUpdateMcpServers.fire(e);
    }));
    disposables.add(service.onUninstallMcpServer((e) => this._onUninstallMcpServer.fire(e)));
    disposables.add(service.onDidUninstallMcpServer((e) => {
      const index = this.allMcpServers.findIndex((server) => this.uriIdentityService.extUri.isEqual(server.mcpResource, e.mcpResource) && server.name === e.name);
      if (index !== -1) {
        this.allMcpServers.splice(index, 1);
        this._onDidUninstallMcpServer.fire(e);
      }
    }));
    this.workspaceMcpManagementServices.set(mcpResource, { service, dispose: () => disposables.dispose() });
  }
  async removeWorkspaceService(mcpResource) {
    const serviceItem = this.workspaceMcpManagementServices.get(mcpResource);
    if (serviceItem) {
      try {
        const installedServers = await serviceItem.service.getInstalled();
        this.allMcpServers = this.allMcpServers.filter((server) => !installedServers.some((uninstalled) => this.uriIdentityService.extUri.isEqual(uninstalled.mcpResource, server.mcpResource)));
        for (const server of installedServers) {
          this._onDidUninstallMcpServer.fire({
            name: server.name,
            mcpResource: server.mcpResource
          });
        }
      } catch (error) {
        this.logService.warn("Failed to get installed servers from", mcpResource.toString(), error);
      }
      this.workspaceMcpManagementServices.delete(mcpResource);
      serviceItem.dispose();
    }
  }
  async getInstalled() {
    return this.allMcpServers;
  }
  async install(server, options) {
    if (!options?.mcpResource) {
      throw new Error("MCP resource is required");
    }
    const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(options?.mcpResource);
    if (!mcpManagementServiceItem) {
      throw new Error(`No MCP management service found for resource: ${options?.mcpResource.toString()}`);
    }
    return mcpManagementServiceItem.service.install(server, options);
  }
  async uninstall(server, options) {
    const mcpResource = server.mcpResource;
    const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(mcpResource);
    if (!mcpManagementServiceItem) {
      throw new Error(`No MCP management service found for resource: ${mcpResource.toString()}`);
    }
    return mcpManagementServiceItem.service.uninstall(server, options);
  }
  installFromGallery(gallery, options) {
    if (!options?.mcpResource) {
      throw new Error("MCP resource is required");
    }
    const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(options?.mcpResource);
    if (!mcpManagementServiceItem) {
      throw new Error(`No MCP management service found for resource: ${options?.mcpResource.toString()}`);
    }
    return mcpManagementServiceItem.service.installFromGallery(gallery, options);
  }
  updateMetadata() {
    throw new Error("Not supported");
  }
  dispose() {
    this.workspaceMcpManagementServices.forEach((service) => service.dispose());
    this.workspaceMcpManagementServices.clear();
    super.dispose();
  }
};
WorkspaceMcpManagementService = __decorateClass([
  __decorateParam(0, IAllowedMcpServersService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IInstantiationService)
], WorkspaceMcpManagementService);
export {
  IWorkbenchMcpManagementService,
  LocalMcpServerScope,
  REMOTE_USER_CONFIG_ID,
  USER_CONFIG_ID,
  WORKSPACE_CONFIG_ID,
  WORKSPACE_FOLDER_CONFIG_ID_PREFIX,
  WorkbenchMcpManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxtY3BcXGNvbW1vblxcbWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2NhbE1jcFNlcnZlciwgSU1jcE1hbmFnZW1lbnRTZXJ2aWNlLCBJR2FsbGVyeU1jcFNlcnZlciwgSW5zdGFsbE9wdGlvbnMsIEluc3RhbGxNY3BTZXJ2ZXJFdmVudCwgVW5pbnN0YWxsTWNwU2VydmVyRXZlbnQsIERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50LCBJbnN0YWxsTWNwU2VydmVyUmVzdWx0LCBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIsIElNY3BHYWxsZXJ5U2VydmljZSwgVW5pbnN0YWxsT3B0aW9ucywgSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgUmVnaXN0cnlUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmVmaW5lU2VydmljZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLCBNY3BSZXNvdXJjZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1dvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBNQ1BfQ09ORklHVVJBVElPTl9LRVksIFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IE1jcE1hbmFnZW1lbnRDaGFubmVsQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50SXBjLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElSZW1vdGVVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vcmVtb3RlVXNlckRhdGFQcm9maWxlcy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdE1jcE1hbmFnZW1lbnRTZXJ2aWNlLCBBYnN0cmFjdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UsIElMb2NhbE1jcFNlcnZlckluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBVU0VSX0NPTkZJR19JRCA9ICd1c3Jsb2NhbCc7XG5leHBvcnQgY29uc3QgUkVNT1RFX1VTRVJfQ09ORklHX0lEID0gJ3VzcnJlbW90ZSc7XG5leHBvcnQgY29uc3QgV09SS1NQQUNFX0NPTkZJR19JRCA9ICd3b3Jrc3BhY2UnO1xuZXhwb3J0IGNvbnN0IFdPUktTUEFDRV9GT0xERVJfQ09ORklHX0lEX1BSRUZJWCA9ICd3cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jTWNwU2VydmVySW5zdGFsbE9wdGlvbnMgZXh0ZW5kcyBJbnN0YWxsT3B0aW9ucyB7XG5cdHRhcmdldD86IENvbmZpZ3VyYXRpb25UYXJnZXQgfCBJV29ya3NwYWNlRm9sZGVyO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBMb2NhbE1jcFNlcnZlclNjb3BlIHtcblx0VXNlciA9ICd1c2VyJyxcblx0UmVtb3RlVXNlciA9ICdyZW1vdGVVc2VyJyxcblx0V29ya3NwYWNlID0gJ3dvcmtzcGFjZScsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyIGV4dGVuZHMgSUxvY2FsTWNwU2VydmVyIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5zdGFsbFdvcmtiZW5jaE1jcFNlcnZlckV2ZW50IGV4dGVuZHMgSW5zdGFsbE1jcFNlcnZlckV2ZW50IHtcblx0cmVhZG9ubHkgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHQgZXh0ZW5kcyBJbnN0YWxsTWNwU2VydmVyUmVzdWx0IHtcblx0cmVhZG9ubHkgbG9jYWw/OiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVW5pbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQgZXh0ZW5kcyBVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudCB7XG5cdHJlYWRvbmx5IHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpZFVuaW5zdGFsbFdvcmtiZW5jaE1jcFNlcnZlckV2ZW50IGV4dGVuZHMgRGlkVW5pbnN0YWxsTWNwU2VydmVyRXZlbnQge1xuXHRyZWFkb25seSBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZTtcbn1cblxuZXhwb3J0IGNvbnN0IElXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSA9IHJlZmluZVNlcnZpY2VEZWNvcmF0b3I8SU1jcE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2U+KElNY3BNYW5hZ2VtZW50U2VydmljZSk7XG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIElNY3BNYW5hZ2VtZW50U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlOiBFdmVudDxJbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZTogRXZlbnQ8cmVhZG9ubHkgSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXT47XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGU6IEV2ZW50PHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10+O1xuXHRyZWFkb25seSBvblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGU6IEV2ZW50PFVuaW5zdGFsbFdvcmtiZW5jaE1jcFNlcnZlckV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlOiBFdmVudDxEaWRVbmluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvZmlsZTogRXZlbnQ8dm9pZD47XG5cblx0Z2V0SW5zdGFsbGVkKCk6IFByb21pc2U8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyW10+O1xuXHRpbnN0YWxsKHNlcnZlcjogSUluc3RhbGxhYmxlTWNwU2VydmVyIHwgVVJJLCBvcHRpb25zPzogSVdvcmtiZW5jTWNwU2VydmVySW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcj47XG5cdGluc3RhbGxGcm9tR2FsbGVyeShzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcj47XG5cdHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxNY3BTZXJ2ZXIsIHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIsIHByb2ZpbGVMb2NhdGlvbj86IFVSSSk6IFByb21pc2U8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyPjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RNY3BNYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0cHJpdmF0ZSBfb25JbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5zdGFsbE1jcFNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25JbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25JbnN0YWxsTWNwU2VydmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzID0gdGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZU1jcFNlcnZlcnMgPSB0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25Vbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25JbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uSW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSB0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlID0gdGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVcGRhdGVNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZU1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlID0gdGhpcy5fb25EaWRVcGRhdGVNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVbmluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZSA9IHRoaXMuX29uVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZSA9IHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb2ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9maWxlID0gdGhpcy5fb25EaWRDaGFuZ2VQcm9maWxlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2U6IElNY3BNYW5hZ2VtZW50U2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSByZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZTogSU1jcE1hbmFnZW1lbnRTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWNwTWFuYWdlbWVudFNlcnZpY2U6IElNY3BNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVJlbW90ZVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlVXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElSZW1vdGVVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHRjb25zdCByZW1vdGVBZ2VudENvbm5lY3Rpb24gPSByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdGlmIChyZW1vdGVBZ2VudENvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BNYW5hZ2VtZW50Q2hhbm5lbENsaWVudCwgcmVtb3RlQWdlbnRDb25uZWN0aW9uLmdldENoYW5uZWw8SUNoYW5uZWw+KCdtY3BNYW5hZ2VtZW50JykpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uSW5zdGFsbE1jcFNlcnZlcihlID0+IHtcblx0XHRcdHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlci5maXJlKGUpO1xuXHRcdFx0aWYgKHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLm1jcFJlc291cmNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZmlyZSh7IC4uLmUsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzKGUgPT4ge1xuXHRcdFx0Y29uc3QgeyBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0LCBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0SW5DdXJyZW50UHJvZmlsZSB9ID0gdGhpcy5jcmVhdGVJbnN0YWxsTWNwU2VydmVyUmVzdWx0c0Zyb21FdmVudChlLCBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIpO1xuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKG1jcFNlcnZlckluc3RhbGxSZXN1bHQpO1xuXHRcdFx0aWYgKG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZS5maXJlKG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVXBkYXRlTWNwU2VydmVycyhlID0+IHtcblx0XHRcdGNvbnN0IHsgbWNwU2VydmVySW5zdGFsbFJlc3VsdCwgbWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGUgfSA9IHRoaXMuY3JlYXRlSW5zdGFsbE1jcFNlcnZlclJlc3VsdHNGcm9tRXZlbnQoZSwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKTtcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlTWNwU2VydmVycy5maXJlKG1jcFNlcnZlckluc3RhbGxSZXN1bHQpO1xuXHRcdFx0aWYgKG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlLmZpcmUobWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2Uub25Vbmluc3RhbGxNY3BTZXJ2ZXIoZSA9PiB7XG5cdFx0XHR0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5maXJlKGUpO1xuXHRcdFx0aWYgKHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLm1jcFJlc291cmNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX29uVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5maXJlKHsgLi4uZSwgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUuVXNlciB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsTWNwU2VydmVyKGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdGlmICh1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5tY3BSZXNvdXJjZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZmlyZSh7IC4uLmUsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZS5vbkluc3RhbGxNY3BTZXJ2ZXIoYXN5bmMgZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZmlyZSh7IC4uLmUsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnMoYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCB7IG1jcFNlcnZlckluc3RhbGxSZXN1bHQgfSA9IHRoaXMuY3JlYXRlSW5zdGFsbE1jcFNlcnZlclJlc3VsdHNGcm9tRXZlbnQoZSwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpO1xuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKG1jcFNlcnZlckluc3RhbGxSZXN1bHQpO1xuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUuZmlyZShtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uVW5pbnN0YWxsTWNwU2VydmVyKGFzeW5jIGUgPT4ge1xuXHRcdFx0dGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdHRoaXMuX29uVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5maXJlKHsgLi4uZSwgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIoYXN5bmMgZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlci5maXJlKGUpO1xuXHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlLmZpcmUoeyAuLi5lLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZFVwZGF0ZU1jcFNlcnZlcnMoZSA9PiB7XG5cdFx0XHRjb25zdCB7IG1jcFNlcnZlckluc3RhbGxSZXN1bHQgfSA9IHRoaXMuY3JlYXRlSW5zdGFsbE1jcFNlcnZlclJlc3VsdHNGcm9tRXZlbnQoZSwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpO1xuXHRcdFx0dGhpcy5fb25EaWRVcGRhdGVNY3BTZXJ2ZXJzLmZpcmUobWNwU2VydmVySW5zdGFsbFJlc3VsdCk7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlLmZpcmUobWNwU2VydmVySW5zdGFsbFJlc3VsdCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2Uub25JbnN0YWxsTWNwU2VydmVyKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdFx0Y29uc3QgcmVtb3RlTWNwUmVzb3VyY2UgPSBhd2FpdCB0aGlzLmdldFJlbW90ZU1jcFJlc291cmNlKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChyZW1vdGVNY3BSZXNvdXJjZSA/IHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLm1jcFJlc291cmNlLCByZW1vdGVNY3BSZXNvdXJjZSkgOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25JbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5maXJlKHsgLi4uZSwgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnMoZSA9PiB0aGlzLmhhbmRsZVJlbW90ZUluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRzRnJvbUV2ZW50KGUsIHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMsIHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZFVwZGF0ZU1jcFNlcnZlcnMoZSA9PiB0aGlzLmhhbmRsZVJlbW90ZUluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRzRnJvbUV2ZW50KGUsIHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMsIHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlKSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uVW5pbnN0YWxsTWNwU2VydmVyKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHR0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5maXJlKGUpO1xuXHRcdFx0XHRjb25zdCByZW1vdGVNY3BSZXNvdXJjZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlTWNwUmVzb3VyY2UodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlKTtcblx0XHRcdFx0aWYgKHJlbW90ZU1jcFJlc291cmNlID8gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUubWNwUmVzb3VyY2UsIHJlbW90ZU1jcFJlc291cmNlKSA6IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0XHR0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZmlyZSh7IC4uLmUsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbE1jcFNlcnZlcihhc3luYyBlID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdFx0Y29uc3QgcmVtb3RlTWNwUmVzb3VyY2UgPSBhd2FpdCB0aGlzLmdldFJlbW90ZU1jcFJlc291cmNlKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChyZW1vdGVNY3BSZXNvdXJjZSA/IHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLm1jcFJlc291cmNlLCByZW1vdGVNY3BSZXNvdXJjZSkgOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlLmZpcmUoeyAuLi5lLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLnByZXZpb3VzLm1jcFJlc291cmNlLCBlLnByb2ZpbGUubWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvZmlsZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVJbnN0YWxsTWNwU2VydmVyUmVzdWx0c0Zyb21FdmVudChlOiByZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10sIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlKTogeyBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0OiBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdOyBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0SW5DdXJyZW50UHJvZmlsZTogSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXSB9IHtcblx0XHRjb25zdCBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0OiBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdID0gW107XG5cdFx0Y29uc3QgbWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGU6IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiBlKSB7XG5cdFx0XHRjb25zdCB3b3JrYmVuY2hSZXN1bHQgPSB7XG5cdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0bG9jYWw6IHJlc3VsdC5sb2NhbCA/IHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIocmVzdWx0LmxvY2FsLCBzY29wZSkgOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0XHRtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0LnB1c2god29ya2JlbmNoUmVzdWx0KTtcblx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZXN1bHQubWNwUmVzb3VyY2UsIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0bWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGUucHVzaCh3b3JrYmVuY2hSZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IG1jcFNlcnZlckluc3RhbGxSZXN1bHQsIG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVJlbW90ZUluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRzRnJvbUV2ZW50KGU6IHJlYWRvbmx5IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXSwgZW1pdHRlcjogRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+LCBjdXJyZW50UHJvZmlsZUVtaXR0ZXI6IEVtaXR0ZXI8cmVhZG9ubHkgSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0OiBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdID0gW107XG5cdFx0Y29uc3QgbWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGU6IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10gPSBbXTtcblx0XHRjb25zdCByZW1vdGVNY3BSZXNvdXJjZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlTWNwUmVzb3VyY2UodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlKTtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiBlKSB7XG5cdFx0XHRjb25zdCB3b3JrYmVuY2hSZXN1bHQgPSB7XG5cdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0bG9jYWw6IHJlc3VsdC5sb2NhbCA/IHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIocmVzdWx0LmxvY2FsLCBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0bWNwU2VydmVySW5zdGFsbFJlc3VsdC5wdXNoKHdvcmtiZW5jaFJlc3VsdCk7XG5cdFx0XHRpZiAocmVtb3RlTWNwUmVzb3VyY2UgPyB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZXN1bHQubWNwUmVzb3VyY2UsIHJlbW90ZU1jcFJlc291cmNlKSA6IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0bWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGUucHVzaCh3b3JrYmVuY2hSZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVtaXR0ZXIuZmlyZShtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0KTtcblx0XHRpZiAobWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGUubGVuZ3RoKSB7XG5cdFx0XHRjdXJyZW50UHJvZmlsZUVtaXR0ZXIuZmlyZShtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0SW5DdXJyZW50UHJvZmlsZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0SW5zdGFsbGVkKCk6IFByb21pc2U8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyW10+IHtcblx0XHRjb25zdCBpbnN0YWxsZWQ6IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdID0gW107XG5cdFx0Y29uc3QgW3VzZXJTZXJ2ZXJzLCByZW1vdGVTZXJ2ZXJzLCB3b3Jrc3BhY2VTZXJ2ZXJzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSksXG5cdFx0XHR0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlPy5nZXRJbnN0YWxsZWQoYXdhaXQgdGhpcy5nZXRSZW1vdGVNY3BSZXNvdXJjZSgpKSA/PyBQcm9taXNlLnJlc29sdmU8SUxvY2FsTWNwU2VydmVyW10+KFtdKSxcblx0XHRcdHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2U/LmdldEluc3RhbGxlZCgpID8/IFByb21pc2UucmVzb2x2ZTxJTG9jYWxNY3BTZXJ2ZXJbXT4oW10pLFxuXHRcdF0pO1xuXG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgdXNlclNlcnZlcnMpIHtcblx0XHRcdGluc3RhbGxlZC5wdXNoKHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIoc2VydmVyLCBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgcmVtb3RlU2VydmVycykge1xuXHRcdFx0aW5zdGFsbGVkLnB1c2godGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihzZXJ2ZXIsIExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB3b3Jrc3BhY2VTZXJ2ZXJzKSB7XG5cdFx0XHRpbnN0YWxsZWQucHVzaCh0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHNlcnZlciwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5zdGFsbGVkO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1dvcmtzcGFjZU1jcFNlcnZlcihzZXJ2ZXI6IElMb2NhbE1jcFNlcnZlciwgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUpOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXIge1xuXHRcdHJldHVybiB7IC4uLnNlcnZlciwgaWQ6IGBtY3AuY29uZmlnLiR7dGhpcy5nZXRDb25maWdJZChzZXJ2ZXIsIHNjb3BlKX0uJHtzZXJ2ZXIubmFtZX1gLCBzY29wZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWdJZChzZXJ2ZXI6IElMb2NhbE1jcFNlcnZlciwgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUpOiBzdHJpbmcge1xuXHRcdGlmIChzY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKSB7XG5cdFx0XHRyZXR1cm4gVVNFUl9DT05GSUdfSUQ7XG5cdFx0fVxuXG5cdFx0aWYgKHNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpIHtcblx0XHRcdHJldHVybiBSRU1PVEVfVVNFUl9DT05GSUdfSUQ7XG5cdFx0fVxuXG5cdFx0aWYgKHNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiwgc2VydmVyLm1jcFJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gV09SS1NQQUNFX0NPTkZJR19JRDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHdvcmtzcGFjZS5mb2xkZXJzO1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHdvcmtzcGFjZUZvbGRlcnNbaW5kZXhdO1xuXHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHdvcmtzcGFjZUZvbGRlci51cmksIFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TW01DUF9DT05GSUdVUkFUSU9OX0tFWV0pLCBzZXJ2ZXIubWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGAke1dPUktTUEFDRV9GT0xERVJfQ09ORklHX0lEX1BSRUZJWH0ke2luZGV4fWA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuICd1bmtub3duJztcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwoc2VydmVyOiBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBJV29ya2JlbmNNY3BTZXJ2ZXJJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyPiB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgPz8ge307XG5cblx0XHRpZiAob3B0aW9ucy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIHx8IGlzV29ya3NwYWNlRm9sZGVyKG9wdGlvbnMudGFyZ2V0KSkge1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBvcHRpb25zLnRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgPyB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb24gOiBvcHRpb25zLnRhcmdldC50b1Jlc291cmNlKFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TW01DUF9DT05GSUdVUkFUSU9OX0tFWV0pO1xuXHRcdFx0aWYgKCFtY3BSZXNvdXJjZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYElsbGVnYWwgdGFyZ2V0OiAke29wdGlvbnMudGFyZ2V0fWApO1xuXHRcdFx0fVxuXHRcdFx0b3B0aW9ucy5tY3BSZXNvdXJjZSA9IG1jcFJlc291cmNlO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHNlcnZlciwgb3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihyZXN1bHQsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpIHtcblx0XHRcdGlmICghdGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYElsbGVnYWwgdGFyZ2V0OiAke29wdGlvbnMudGFyZ2V0fWApO1xuXHRcdFx0fVxuXHRcdFx0b3B0aW9ucy5tY3BSZXNvdXJjZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlTWNwUmVzb3VyY2Uob3B0aW9ucy5tY3BSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwoc2VydmVyLCBvcHRpb25zKTtcblx0XHRcdHJldHVybiB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy50YXJnZXQgJiYgb3B0aW9ucy50YXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiAmJiBvcHRpb25zLnRhcmdldCAhPT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYElsbGVnYWwgdGFyZ2V0OiAke29wdGlvbnMudGFyZ2V0fWApO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMubWNwUmVzb3VyY2UgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHNlcnZlciwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIocmVzdWx0LCBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEZyb21HYWxsZXJ5KHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBJV29ya2JlbmNNY3BTZXJ2ZXJJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyPiB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgPz8ge307XG5cblx0XHRpZiAob3B0aW9ucy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIHx8IGlzV29ya3NwYWNlRm9sZGVyKG9wdGlvbnMudGFyZ2V0KSkge1xuXHRcdFx0Y29uc3QgbWNwUmVzb3VyY2UgPSBvcHRpb25zLnRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgPyB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb24gOiBvcHRpb25zLnRhcmdldC50b1Jlc291cmNlKFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TW01DUF9DT05GSUdVUkFUSU9OX0tFWV0pO1xuXHRcdFx0aWYgKCFtY3BSZXNvdXJjZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYElsbGVnYWwgdGFyZ2V0OiAke29wdGlvbnMudGFyZ2V0fWApO1xuXHRcdFx0fVxuXHRcdFx0b3B0aW9ucy5tY3BSZXNvdXJjZSA9IG1jcFJlc291cmNlO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyLCBvcHRpb25zKTtcblx0XHRcdHJldHVybiB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSkge1xuXHRcdFx0aWYgKCF0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSWxsZWdhbCB0YXJnZXQ6ICR7b3B0aW9ucy50YXJnZXR9YCk7XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zLm1jcFJlc291cmNlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVNY3BSZXNvdXJjZShvcHRpb25zLm1jcFJlc291cmNlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KHNlcnZlciwgb3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihyZXN1bHQsIExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcik7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMudGFyZ2V0ICYmIG9wdGlvbnMudGFyZ2V0ICE9PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIgJiYgb3B0aW9ucy50YXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbGxlZ2FsIHRhcmdldDogJHtvcHRpb25zLnRhcmdldH1gKTtcblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnMubWNwUmVzb3VyY2UpIHtcblx0XHRcdG9wdGlvbnMubWNwUmVzb3VyY2UgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KHNlcnZlciwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIocmVzdWx0LCBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTWV0YWRhdGEobG9jYWw6IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlciwgc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdGlmIChsb2NhbC5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlTWV0YWRhdGEobG9jYWwsIHNlcnZlciwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdHJldHVybiB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpO1xuXHRcdH1cblxuXHRcdGlmIChsb2NhbC5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKSB7XG5cdFx0XHRpZiAoIXRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbGxlZ2FsIHRhcmdldDogJHtsb2NhbC5zY29wZX1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlTWV0YWRhdGEobG9jYWwsIHNlcnZlciwgcHJvZmlsZUxvY2F0aW9uKTtcblx0XHRcdHJldHVybiB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGxvY2FsLCBzZXJ2ZXIsIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0cmV0dXJuIHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIocmVzdWx0LCBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIpO1xuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsKHNlcnZlcjogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlcnZlci5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLnVuaW5zdGFsbChzZXJ2ZXIpO1xuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXIuc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikge1xuXHRcdFx0aWYgKCF0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSWxsZWdhbCB0YXJnZXQ6ICR7c2VydmVyLnNjb3BlfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsKHNlcnZlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsKHNlcnZlciwgeyBtY3BSZXNvdXJjZTogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZW1vdGVNY3BSZXNvdXJjZShtY3BSZXNvdXJjZT86IFVSSSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFtY3BSZXNvdXJjZSAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRtY3BSZXNvdXJjZSA9IG1jcFJlc291cmNlID8/IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRsZXQgcHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHAubWNwUmVzb3VyY2UsIG1jcFJlc291cmNlKSk7XG5cdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdHByb2ZpbGUgPSBhd2FpdCB0aGlzLnJlbW90ZVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmdldFJlbW90ZVByb2ZpbGUocHJvZmlsZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByb2ZpbGUgPSAoYXdhaXQgdGhpcy5yZW1vdGVVc2VyRGF0YVByb2ZpbGVzU2VydmljZS5nZXRSZW1vdGVQcm9maWxlcygpKS5maW5kKHAgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocC5tY3BSZXNvdXJjZSwgbWNwUmVzb3VyY2UpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb2ZpbGU/Lm1jcFJlc291cmNlO1xuXHR9XG59XG5cbmNsYXNzIFdvcmtzcGFjZU1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1jcFJlc291cmNlOiBVUkksXG5cdFx0dGFyZ2V0OiBNY3BSZXNvdXJjZVRhcmdldCxcblx0XHRASU1jcEdhbGxlcnlTZXJ2aWNlIG1jcEdhbGxlcnlTZXJ2aWNlOiBJTWNwR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlIG1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2U6IElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlIGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobWNwUmVzb3VyY2UsIHRhcmdldCwgbWNwR2FsbGVyeVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UsIG1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UsIGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBpbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01DUCBNYW5hZ2VtZW50IFNlcnZpY2U6IGluc3RhbGxHYWxsZXJ5Jywgc2VydmVyLm5hbWUsIHNlcnZlci5nYWxsZXJ5VXJsKTtcblxuXHRcdHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlci5maXJlKHsgbmFtZTogc2VydmVyLm5hbWUsIG1jcFJlc291cmNlOiB0aGlzLm1jcFJlc291cmNlIH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhY2thZ2VUeXBlID0gb3B0aW9ucz8ucGFja2FnZVR5cGUgPz8gc2VydmVyLmNvbmZpZ3VyYXRpb24ucGFja2FnZXM/LlswXT8ucmVnaXN0cnlUeXBlID8/IFJlZ2lzdHJ5VHlwZS5SRU1PVEU7XG5cblx0XHRcdGNvbnN0IHsgbWNwU2VydmVyQ29uZmlndXJhdGlvbiwgbm90aWNlcyB9ID0gdGhpcy5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KHNlcnZlci5jb25maWd1cmF0aW9uLCBwYWNrYWdlVHlwZSk7XG5cblx0XHRcdGlmIChub3RpY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYE1DUCBNYW5hZ2VtZW50IFNlcnZpY2U6IFdhcm5pbmdzIHdoaWxlIGluc3RhbGxpbmcgJHtzZXJ2ZXIubmFtZX1gLCBub3RpY2VzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5zdGFsbGFibGU6IElJbnN0YWxsYWJsZU1jcFNlcnZlciA9IHtcblx0XHRcdFx0bmFtZTogc2VydmVyLm5hbWUsXG5cdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdC4uLm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLFxuXHRcdFx0XHRcdGdhbGxlcnk6IHNlcnZlci5nYWxsZXJ5VXJsID8/IHRydWUsXG5cdFx0XHRcdFx0dmVyc2lvbjogc2VydmVyLnZlcnNpb25cblx0XHRcdFx0fSxcblx0XHRcdFx0aW5wdXRzOiBtY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0c1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5lbnN1cmVTZXJ2ZXJBbGxvd2VkKGluc3RhbGxhYmxlKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLmFkZE1jcFNlcnZlcnMoW2luc3RhbGxhYmxlXSwgdGhpcy5tY3BSZXNvdXJjZSwgdGhpcy50YXJnZXQpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxvY2FsKHNlcnZlcik7XG5cdFx0XHRjb25zdCBsb2NhbCA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxlZCgpKS5maW5kKHMgPT4gcy5uYW1lID09PSBzZXJ2ZXIubmFtZSk7XG5cdFx0XHRpZiAoIWxvY2FsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGluc3RhbGwgTUNQIHNlcnZlcjogJHtzZXJ2ZXIubmFtZX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLmZpcmUoW3sgbmFtZTogc2VydmVyLm5hbWUsIHNvdXJjZTogc2VydmVyLCBlcnJvcjogZSwgbWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UgfV0pO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVNZXRhZGF0YSgpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluc3RhbGxGcm9tVXJpKCk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZ2V0TG9jYWxTZXJ2ZXJJbmZvKG5hbWU6IHN0cmluZywgbWNwU2VydmVyQ29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbik6IFByb21pc2U8SUxvY2FsTWNwU2VydmVySW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghbWNwU2VydmVyQ29uZmlnLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW21jcFNlcnZlcl0gPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmdldE1jcFNlcnZlcnNGcm9tR2FsbGVyeShbeyBuYW1lIH1dKTtcblx0XHRpZiAoIW1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbWNwU2VydmVyLm5hbWUsXG5cdFx0XHR2ZXJzaW9uOiBtY3BTZXJ2ZXJDb25maWcudmVyc2lvbixcblx0XHRcdGRpc3BsYXlOYW1lOiBtY3BTZXJ2ZXIuZGlzcGxheU5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbWNwU2VydmVyLmRlc2NyaXB0aW9uLFxuXHRcdFx0Z2FsbGVyeVVybDogbWNwU2VydmVyLmdhbGxlcnlVcmwsXG5cdFx0XHRtYW5pZmVzdDogbWNwU2VydmVyLmNvbmZpZ3VyYXRpb24sXG5cdFx0XHRwdWJsaXNoZXI6IG1jcFNlcnZlci5wdWJsaXNoZXIsXG5cdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogbWNwU2VydmVyLnB1Ymxpc2hlckRpc3BsYXlOYW1lLFxuXHRcdFx0cmVwb3NpdG9yeVVybDogbWNwU2VydmVyLnJlcG9zaXRvcnlVcmwsXG5cdFx0XHRpY29uOiBtY3BTZXJ2ZXIuaWNvbixcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgY2FuSW5zdGFsbChzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyIHwgSUluc3RhbGxhYmxlTWNwU2VydmVyKTogdHJ1ZSB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cbn1cblxuY2xhc3MgV29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdE1jcE1hbmFnZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSU1jcE1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnN0YWxsTWNwU2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5zdGFsbE1jcFNlcnZlcnMgPSB0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlTWNwU2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlTWNwU2VydmVycyA9IHRoaXMuX29uRGlkVXBkYXRlTWNwU2VydmVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblVuaW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Vbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlci5ldmVudDtcblxuXHRwcml2YXRlIGFsbE1jcFNlcnZlcnM6IElMb2NhbE1jcFNlcnZlcltdID0gW107XG5cblx0cHJpdmF0ZSB3b3Jrc3BhY2VDb25maWd1cmF0aW9uPzogVVJJIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZXMgPSBuZXcgUmVzb3VyY2VNYXA8eyBzZXJ2aWNlOiBXb3Jrc3BhY2VNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIH0gJiBJRGlzcG9zYWJsZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKTtcblx0XHRcdGF3YWl0IHRoaXMub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKHsgYWRkZWQ6IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycywgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhlKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKGUgPT4gdGhpcy5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCkpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSB3b3Jrc3BhY2UgZm9sZGVycycsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbikge1xuXHRcdFx0YXdhaXQgdGhpcy5yZW1vdmVXb3Jrc3BhY2VTZXJ2aWNlKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbjtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFkZFdvcmtzcGFjZVNlcnZpY2UodGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZTogSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoZS5yZW1vdmVkLm1hcChmb2xkZXIgPT4gdGhpcy5yZW1vdmVXb3Jrc3BhY2VTZXJ2aWNlKGZvbGRlci50b1Jlc291cmNlKFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TW01DUF9DT05GSUdVUkFUSU9OX0tFWV0pKSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGUuYWRkZWQubWFwKGZvbGRlciA9PiB0aGlzLmFkZFdvcmtzcGFjZVNlcnZpY2UoZm9sZGVyLnRvUmVzb3VyY2UoV09SS1NQQUNFX1NUQU5EQUxPTkVfQ09ORklHVVJBVElPTlNbTUNQX0NPTkZJR1VSQVRJT05fS0VZXSksIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUikpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZFdvcmtzcGFjZVNlcnZpY2UobWNwUmVzb3VyY2U6IFVSSSwgdGFyZ2V0OiBNY3BSZXNvdXJjZVRhcmdldCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlcy5oYXMobWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZU1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UsIG1jcFJlc291cmNlLCB0YXJnZXQpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbnN0YWxsZWRTZXJ2ZXJzID0gYXdhaXQgc2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRcdHRoaXMuYWxsTWNwU2VydmVycy5wdXNoKC4uLmluc3RhbGxlZFNlcnZlcnMpO1xuXHRcdFx0aWYgKGluc3RhbGxlZFNlcnZlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsUmVzdWx0czogSW5zdGFsbE1jcFNlcnZlclJlc3VsdFtdID0gaW5zdGFsbGVkU2VydmVycy5tYXAoc2VydmVyID0+ICh7XG5cdFx0XHRcdFx0bmFtZTogc2VydmVyLm5hbWUsXG5cdFx0XHRcdFx0bG9jYWw6IHNlcnZlcixcblx0XHRcdFx0XHRtY3BSZXNvdXJjZTogc2VydmVyLm1jcFJlc291cmNlXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKGluc3RhbGxSZXN1bHRzKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0ZhaWxlZCB0byBnZXQgaW5zdGFsbGVkIHNlcnZlcnMgZnJvbScsIG1jcFJlc291cmNlLnRvU3RyaW5nKCksIGVycm9yKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkluc3RhbGxNY3BTZXJ2ZXIoZSA9PiB0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgbG9jYWwgfSBvZiBlKSB7XG5cdFx0XHRcdGlmIChsb2NhbCkge1xuXHRcdFx0XHRcdHRoaXMuYWxsTWNwU2VydmVycy5wdXNoKGxvY2FsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKGUpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFVwZGF0ZU1jcFNlcnZlcnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgbG9jYWwsIG1jcFJlc291cmNlIH0gb2YgZSkge1xuXHRcdFx0XHRpZiAobG9jYWwpIHtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuYWxsTWNwU2VydmVycy5maW5kSW5kZXgoc2VydmVyID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNlcnZlci5tY3BSZXNvdXJjZSwgbWNwUmVzb3VyY2UpICYmIHNlcnZlci5uYW1lID09PSBsb2NhbC5uYW1lKTtcblx0XHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFsbE1jcFNlcnZlcnMuc3BsaWNlKGluZGV4LCAxLCBsb2NhbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZmlyZShlKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25Vbmluc3RhbGxNY3BTZXJ2ZXIoZSA9PiB0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5maXJlKGUpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIoZSA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuYWxsTWNwU2VydmVycy5maW5kSW5kZXgoc2VydmVyID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNlcnZlci5tY3BSZXNvdXJjZSwgZS5tY3BSZXNvdXJjZSkgJiYgc2VydmVyLm5hbWUgPT09IGUubmFtZSk7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuYWxsTWNwU2VydmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlci5maXJlKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlcy5zZXQobWNwUmVzb3VyY2UsIHsgc2VydmljZSwgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW1vdmVXb3Jrc3BhY2VTZXJ2aWNlKG1jcFJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2aWNlSXRlbSA9IHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2VzLmdldChtY3BSZXNvdXJjZSk7XG5cdFx0aWYgKHNlcnZpY2VJdGVtKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsZWRTZXJ2ZXJzID0gYXdhaXQgc2VydmljZUl0ZW0uc2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRcdFx0dGhpcy5hbGxNY3BTZXJ2ZXJzID0gdGhpcy5hbGxNY3BTZXJ2ZXJzLmZpbHRlcihzZXJ2ZXIgPT4gIWluc3RhbGxlZFNlcnZlcnMuc29tZSh1bmluc3RhbGxlZCA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh1bmluc3RhbGxlZC5tY3BSZXNvdXJjZSwgc2VydmVyLm1jcFJlc291cmNlKSkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBpbnN0YWxsZWRTZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7XG5cdFx0XHRcdFx0XHRuYW1lOiBzZXJ2ZXIubmFtZSxcblx0XHRcdFx0XHRcdG1jcFJlc291cmNlOiBzZXJ2ZXIubWNwUmVzb3VyY2Vcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0ZhaWxlZCB0byBnZXQgaW5zdGFsbGVkIHNlcnZlcnMgZnJvbScsIG1jcFJlc291cmNlLnRvU3RyaW5nKCksIGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2VzLmRlbGV0ZShtY3BSZXNvdXJjZSk7XG5cdFx0XHRzZXJ2aWNlSXRlbS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0SW5zdGFsbGVkKCk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyW10+IHtcblx0XHRyZXR1cm4gdGhpcy5hbGxNY3BTZXJ2ZXJzO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRpZiAoIW9wdGlvbnM/Lm1jcFJlc291cmNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01DUCByZXNvdXJjZSBpcyByZXF1aXJlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1jcE1hbmFnZW1lbnRTZXJ2aWNlSXRlbSA9IHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2VzLmdldChvcHRpb25zPy5tY3BSZXNvdXJjZSk7XG5cdFx0aWYgKCFtY3BNYW5hZ2VtZW50U2VydmljZUl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gTUNQIG1hbmFnZW1lbnQgc2VydmljZSBmb3VuZCBmb3IgcmVzb3VyY2U6ICR7b3B0aW9ucz8ubWNwUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWNwTWFuYWdlbWVudFNlcnZpY2VJdGVtLnNlcnZpY2UuaW5zdGFsbChzZXJ2ZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsKHNlcnZlcjogSUxvY2FsTWNwU2VydmVyLCBvcHRpb25zPzogVW5pbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1jcFJlc291cmNlID0gc2VydmVyLm1jcFJlc291cmNlO1xuXG5cdFx0Y29uc3QgbWNwTWFuYWdlbWVudFNlcnZpY2VJdGVtID0gdGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZXMuZ2V0KG1jcFJlc291cmNlKTtcblx0XHRpZiAoIW1jcE1hbmFnZW1lbnRTZXJ2aWNlSXRlbSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBNQ1AgbWFuYWdlbWVudCBzZXJ2aWNlIGZvdW5kIGZvciByZXNvdXJjZTogJHttY3BSZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiBtY3BNYW5hZ2VtZW50U2VydmljZUl0ZW0uc2VydmljZS51bmluc3RhbGwoc2VydmVyLCBvcHRpb25zKTtcblx0fVxuXG5cdGluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5OiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRpZiAoIW9wdGlvbnM/Lm1jcFJlc291cmNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01DUCByZXNvdXJjZSBpcyByZXF1aXJlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1jcE1hbmFnZW1lbnRTZXJ2aWNlSXRlbSA9IHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2VzLmdldChvcHRpb25zPy5tY3BSZXNvdXJjZSk7XG5cdFx0aWYgKCFtY3BNYW5hZ2VtZW50U2VydmljZUl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gTUNQIG1hbmFnZW1lbnQgc2VydmljZSBmb3VuZCBmb3IgcmVzb3VyY2U6ICR7b3B0aW9ucz8ubWNwUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWNwTWFuYWdlbWVudFNlcnZpY2VJdGVtLnNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnksIG9wdGlvbnMpO1xuXHR9XG5cblx0dXBkYXRlTWV0YWRhdGEoKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZXMuZm9yRWFjaChzZXJ2aWNlID0+IHNlcnZpY2UuZGlzcG9zZSgpKTtcblx0XHR0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUFvQztBQUM3QyxTQUEwQix1QkFBcUwsb0JBQXNDLDJCQUEyQixvQkFBb0I7QUFDcFMsU0FBUyx1QkFBdUIsOEJBQThCO0FBQzlELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQ0FBcUQ7QUFDOUQsU0FBUyxtQkFBbUIsZ0NBQWdGO0FBQzVHLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCLDJDQUEyQztBQUMzRSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDhCQUE4Qiw0Q0FBaUU7QUFDeEcsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFJckIsTUFBTSxpQkFBaUI7QUFDdkIsTUFBTSx3QkFBd0I7QUFDOUIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxvQ0FBb0M7QUFNMUMsSUFBVyxzQkFBWCxrQkFBV0EseUJBQVg7QUFDTixFQUFBQSxxQkFBQSxVQUFPO0FBQ1AsRUFBQUEscUJBQUEsZ0JBQWE7QUFDYixFQUFBQSxxQkFBQSxlQUFZO0FBSEssU0FBQUE7QUFB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QixJQUFJLFdBQVc7QUFDcEYsUUFBSSxDQUFDLDBCQUEwQjtBQUM5QixZQUFNLElBQUksTUFBTSxpREFBaUQsWUFBWSxTQUFTLENBQUMsRUFBRTtBQUFBLElBQzFGO0FBRUEsV0FBTyx5QkFBeUIsUUFBUSxVQUFVLFFBQVEsT0FBTztBQUFBLEVBQ2xFO0FBQUEsRUFFQSxtQkFBbUIsU0FBNEIsU0FBb0Q7QUFDbEcsUUFBSSxDQUFDLFNBQVMsYUFBYTtBQUMxQixZQUFNLElBQUksTUFBTSwwQkFBMEI7QUFBQSxJQUMzQztBQUVBLFVBQU0sMkJBQTJCLEtBQUssK0JBQStCLElBQUksU0FBUyxXQUFXO0FBQzdGLFFBQUksQ0FBQywwQkFBMEI7QUFDOUIsWUFBTSxJQUFJLE1BQU0saURBQWlELFNBQVMsWUFBWSxTQUFTLENBQUMsRUFBRTtBQUFBLElBQ25HO0FBRUEsV0FBTyx5QkFBeUIsUUFBUSxtQkFBbUIsU0FBUyxPQUFPO0FBQUEsRUFDNUU7QUFBQSxFQUVBLGlCQUEyQztBQUMxQyxVQUFNLElBQUksTUFBTSxlQUFlO0FBQUEsRUFDaEM7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssK0JBQStCLFFBQVEsYUFBVyxRQUFRLFFBQVEsQ0FBQztBQUN4RSxTQUFLLCtCQUErQixNQUFNO0FBQzFDLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQS9MTSxnQ0FBTjtBQUFBLEVBdUJHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBM0JHOyIsCiAgIm5hbWVzIjogWyJMb2NhbE1jcFNlcnZlclNjb3BlIiwgInJlc3VsdCIsICJtY3BSZXNvdXJjZSJdCn0K
