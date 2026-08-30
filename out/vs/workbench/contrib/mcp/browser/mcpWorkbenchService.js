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
import { Emitter, Event } from "../../../../base/common/event.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IMcpGalleryService, mcpAccessConfig, McpAccessValue, IAllowedMcpServersService, McpGalleryResolveStatus } from "../../../../platform/mcp/common/mcpManagement.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { McpServerType } from "../../../../platform/mcp/common/mcpPlatformTypes.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { StorageScope } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from "../../../services/configuration/common/configuration.js";
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IWorkbenchMcpManagementService, LocalMcpServerScope, REMOTE_USER_CONFIG_ID, USER_CONFIG_ID, WORKSPACE_CONFIG_ID, WORKSPACE_FOLDER_CONFIG_ID_PREFIX } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { mcpConfigurationSection } from "../common/mcpConfiguration.js";
import { HasInstalledMcpServersContext, IMcpService, IMcpWorkbenchService, McpCollectionSortOrder, McpServerEnablementState, McpServerInstallState, McpServersGalleryStatusContext } from "../common/mcpTypes.js";
import { ContributionEnablementState } from "../../chat/common/enablement.js";
import { McpServerEditorInput } from "./mcpServerEditorInput.js";
import { IMcpGalleryManifestService } from "../../../../platform/mcp/common/mcpGalleryManifest.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { autorun, runOnChange } from "../../../../base/common/observable.js";
import Severity from "../../../../base/common/severity.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
let McpWorkbenchServer = class {
  constructor(installStateProvider, runtimeStateProvider, local, gallery, installable, mcpGalleryService, fileService) {
    this.installStateProvider = installStateProvider;
    this.runtimeStateProvider = runtimeStateProvider;
    this.local = local;
    this.gallery = gallery;
    this.installable = installable;
    this.mcpGalleryService = mcpGalleryService;
    this.fileService = fileService;
    this.local = local;
  }
  get id() {
    return this.local?.id ?? this.gallery?.name ?? this.installable?.name ?? this.name;
  }
  get name() {
    return this.gallery?.name ?? this.local?.name ?? this.installable?.name ?? "";
  }
  get label() {
    return this.gallery?.displayName ?? this.local?.displayName ?? this.local?.name ?? this.installable?.name ?? "";
  }
  get icon() {
    return this.gallery?.icon ?? this.local?.icon;
  }
  get installState() {
    return this.installStateProvider(this);
  }
  get codicon() {
    return this.gallery?.codicon ?? this.local?.codicon;
  }
  get publisherDisplayName() {
    return this.gallery?.publisherDisplayName ?? this.local?.publisherDisplayName ?? this.gallery?.publisher ?? this.local?.publisher;
  }
  get publisherUrl() {
    return this.gallery?.publisherDomain?.link;
  }
  get description() {
    return this.gallery?.description ?? this.local?.description ?? "";
  }
  get starsCount() {
    return this.gallery?.starsCount ?? 0;
  }
  get license() {
    return this.gallery?.license;
  }
  get repository() {
    return this.gallery?.repositoryUrl;
  }
  get config() {
    return this.local?.config ?? this.installable?.config;
  }
  get runtimeStatus() {
    return this.runtimeStateProvider(this);
  }
  get readmeUrl() {
    return this.local?.readmeUrl ?? (this.gallery?.readmeUrl ? URI.parse(this.gallery.readmeUrl) : void 0);
  }
  async getReadme(token) {
    if (this.local?.readmeUrl) {
      const content = await this.fileService.readFile(this.local.readmeUrl);
      return content.value.toString();
    }
    if (this.gallery?.readme) {
      return this.gallery.readme;
    }
    if (this.gallery?.readmeUrl) {
      return this.mcpGalleryService.getReadme(this.gallery, token);
    }
    return Promise.reject(new Error("not available"));
  }
  async getManifest(token) {
    if (this.local?.manifest) {
      return this.local.manifest;
    }
    if (this.gallery) {
      return this.gallery.configuration;
    }
    throw new Error("No manifest available");
  }
};
McpWorkbenchServer = __decorateClass([
  __decorateParam(5, IMcpGalleryService),
  __decorateParam(6, IFileService)
], McpWorkbenchServer);
let McpWorkbenchService = class extends Disposable {
  constructor(mcpGalleryManifestService, mcpGalleryService, mcpManagementService, editorService, userDataProfilesService, uriIdentityService, workspaceService, environmentService, labelService, productService, remoteAgentService, configurationService, instantiationService, telemetryService, logService, extensionsWorkbenchService, allowedMcpServersService, mcpService, urlService) {
    super();
    this.mcpGalleryService = mcpGalleryService;
    this.mcpManagementService = mcpManagementService;
    this.editorService = editorService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceService = workspaceService;
    this.environmentService = environmentService;
    this.labelService = labelService;
    this.productService = productService;
    this.remoteAgentService = remoteAgentService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.allowedMcpServersService = allowedMcpServersService;
    this.mcpService = mcpService;
    this.installing = [];
    this.uninstalling = [];
    this._local = [];
    this.registrySyncGeneration = 0;
    this.registryGeneration = 0;
    this.localQueryGeneration = 0;
    this.profileChangeGeneration = 0;
    // Source identity is intentionally trusted only in-process; IPC copies are re-verified.
    this.gallerySourceGenerations = /* @__PURE__ */ new WeakMap();
    this.registrySyncDelayer = this._register(new ThrottledDelayer(0));
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this._onReset = this._register(new Emitter());
    this.onReset = this._onReset.event;
    this._register(this.mcpManagementService.onDidInstallMcpServersInCurrentProfile((e) => this.onDidInstallMcpServers(e)));
    this._register(this.mcpManagementService.onDidUpdateMcpServersInCurrentProfile((e) => this.onDidUpdateMcpServers(e)));
    this._register(this.mcpManagementService.onDidUninstallMcpServerInCurrentProfile((e) => this.onDidUninstallMcpServer(e)));
    this._register(this.mcpManagementService.onDidChangeProfile((e) => this.onDidChangeProfile()));
    this.queryLocal().then(() => {
      if (this._store.isDisposed) {
        return;
      }
      this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => {
        this.invalidateRegistryVerification();
        this.scheduleRegistrySync();
      }));
      this.scheduleRegistrySync();
    });
    urlService.registerHandler(this);
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(mcpAccessConfig)) {
        this._onChange.fire(void 0);
      }
    }));
    this._register(this.allowedMcpServersService.onDidChangeAllowedMcpServers(() => {
      this._local = this.sort(this._local);
      this._onChange.fire(void 0);
    }));
    this._register(runOnChange(mcpService.servers, () => {
      this._local = this.sort(this._local);
      this._onChange.fire(void 0);
    }));
    this._register(autorun((reader) => {
      for (const server of mcpService.servers.read(reader)) {
        server.enablement.read(reader);
      }
      this._onChange.fire(void 0);
    }));
  }
  get local() {
    return [...this._local];
  }
  async onDidChangeProfile() {
    const profileChangeGeneration = ++this.profileChangeGeneration;
    const generation = ++this.localQueryGeneration;
    this.invalidateRegistryVerification();
    await this.queryLocalForGeneration(generation);
    if (profileChangeGeneration !== this.profileChangeGeneration) {
      return;
    }
    this._onReset.fire();
    this.scheduleRegistrySync();
  }
  invalidateRegistryVerification() {
    this.registryGeneration++;
    this.registrySyncGeneration++;
    for (const server of this._local) {
      server.gallery = void 0;
    }
    this._onChange.fire(void 0);
  }
  areSameMcpServers(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.name === b.name && a.scope === b.scope;
  }
  onDidUninstallMcpServer(e) {
    if (e.error) {
      return;
    }
    const uninstalled = this._local.find((server) => this.areSameMcpServers(server.local, e));
    if (uninstalled) {
      this._local = this._local.filter((server) => server !== uninstalled);
      this._onChange.fire(uninstalled);
    }
  }
  onDidInstallMcpServers(e) {
    let needsRegistrySync = false;
    for (const { local, name, source } of e) {
      let server = this.installing.find((server2) => server2.local && local ? this.areSameMcpServers(server2.local, local) : server2.name === name);
      this.installing = server ? this.installing.filter((e2) => e2 !== server) : this.installing;
      if (local) {
        const trustedGallery = this.getTrustedGallerySource(source) ?? this.getTrustedGallerySource(server?.gallery);
        if (server) {
          server.local = local;
        } else {
          server = this.instantiationService.createInstance(McpWorkbenchServer, (e2) => this.getInstallState(e2), (e2) => this.getRuntimeStatus(e2), local, void 0, void 0);
        }
        server.gallery = trustedGallery?.name === local.name ? trustedGallery : void 0;
        needsRegistrySync = true;
        this._local = this._local.filter((server2) => !this.areSameMcpServers(server2.local, local));
        this.addServer(server);
      }
      this._onChange.fire(server);
    }
    if (needsRegistrySync) {
      this.scheduleRegistrySync();
    }
  }
  onDidUpdateMcpServers(e) {
    let needsRegistrySync = false;
    for (const result of e) {
      if (!result.local) {
        continue;
      }
      const serverIndex = this._local.findIndex((server2) => this.areSameMcpServers(server2.local, result.local));
      let server;
      if (serverIndex !== -1) {
        this._local[serverIndex].local = result.local;
        server = this._local[serverIndex];
      } else {
        server = this.instantiationService.createInstance(McpWorkbenchServer, (e2) => this.getInstallState(e2), (e2) => this.getRuntimeStatus(e2), result.local, void 0, void 0);
        this.addServer(server);
      }
      const trustedGallery = this.getTrustedGallerySource(result.source) ?? this.getTrustedGallerySource(server.gallery);
      server.gallery = trustedGallery?.name === result.local.name ? trustedGallery : void 0;
      needsRegistrySync = true;
      this._onChange.fire(server);
    }
    if (needsRegistrySync) {
      this.scheduleRegistrySync();
    }
  }
  fromGallery(gallery, registryGeneration) {
    this.rememberGallerySource(gallery, registryGeneration);
    for (const local of this._local) {
      if (local.name === gallery.name) {
        return local;
      }
    }
    return void 0;
  }
  scheduleRegistrySync() {
    const generation = ++this.registrySyncGeneration;
    void this.registrySyncDelayer.trigger(() => this.syncInstalledMcpServers(generation)).catch((error) => this.logService.error(error));
  }
  async syncInstalledMcpServers(generation) {
    if (!this.mcpGalleryService.isEnabled()) {
      return;
    }
    const servers = this.local.flatMap((server) => server.local ? [{ server, local: server.local }] : []);
    const infosByName = /* @__PURE__ */ new Map();
    for (const { local } of servers) {
      const existing = infosByName.get(local.name);
      if (!existing || !existing.id && local.galleryId) {
        infosByName.set(local.name, { name: local.name, id: local.galleryId });
      }
    }
    const infos = [...infosByName.values()];
    if (!infos.length) {
      return;
    }
    const resolved = await this.mcpGalleryService.resolveMcpServersFromGallery(infos);
    if (generation !== this.registrySyncGeneration) {
      return;
    }
    this.syncInstalledMcpServersWithGallery(resolved, servers, generation);
  }
  syncInstalledMcpServersWithGallery(resolved, servers, generation) {
    for (const { server: mcpServer, local } of servers) {
      if (generation !== this.registrySyncGeneration || !this._local.includes(mcpServer) || mcpServer.local !== local) {
        continue;
      }
      const result = resolved.get(local.name);
      if (!result || result.status === McpGalleryResolveStatus.Failed) {
        continue;
      }
      if (result.status === McpGalleryResolveStatus.NotFound) {
        if (mcpServer.gallery) {
          mcpServer.gallery = void 0;
          this._onChange.fire(mcpServer);
        }
        continue;
      }
      const gallery = result.server;
      const changed = mcpServer.gallery !== gallery;
      this.rememberGallerySource(gallery);
      mcpServer.gallery = gallery;
      if (changed) {
        this._onChange.fire(mcpServer);
      }
    }
  }
  async queryGallery(options, token) {
    if (!this.mcpGalleryService.isEnabled()) {
      return {
        firstPage: { items: [], hasMore: false },
        getNextPage: async () => ({ items: [], hasMore: false })
      };
    }
    const registryGeneration = this.registryGeneration;
    const pager = await this.mcpGalleryService.query(options, token);
    const mapPage = (page) => ({
      items: page.items.map((gallery) => this.fromGallery(gallery, registryGeneration) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, gallery, void 0)),
      hasMore: page.hasMore
    });
    return {
      firstPage: mapPage(pager.firstPage),
      getNextPage: async (ct) => {
        const nextPage = await pager.getNextPage(ct);
        return mapPage(nextPage);
      }
    };
  }
  async queryLocal() {
    await this.queryLocalForGeneration(++this.localQueryGeneration);
    return [...this.local];
  }
  async queryLocalForGeneration(generation) {
    const installed = await this.mcpManagementService.getInstalled();
    if (generation !== this.localQueryGeneration) {
      return false;
    }
    this._local = this.sort(installed.map((i) => {
      const existing = this._local.find((local2) => local2.id === i.id);
      const local = existing ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, void 0, void 0);
      local.local = i;
      return local;
    }));
    this._onChange.fire(void 0);
    return true;
  }
  rememberGallerySource(gallery, registryGeneration = this.registryGeneration) {
    if (registryGeneration === this.registryGeneration) {
      this.gallerySourceGenerations.set(gallery, registryGeneration);
    }
  }
  getTrustedGallerySource(gallery) {
    return gallery && this.gallerySourceGenerations.get(gallery) === this.registryGeneration ? gallery : void 0;
  }
  addServer(server) {
    this._local.push(server);
    this._local = this.sort(this._local);
  }
  sort(local) {
    return local.sort((a, b) => {
      if (a.name === b.name) {
        const aEnabled = !a.runtimeStatus || a.runtimeStatus.state === McpServerEnablementState.Enabled;
        const bEnabled = !b.runtimeStatus || b.runtimeStatus.state === McpServerEnablementState.Enabled;
        if (aEnabled !== bEnabled) {
          return aEnabled ? -1 : 1;
        }
        return a.id.localeCompare(b.id);
      }
      return a.name.localeCompare(b.name);
    });
  }
  getEnabledLocalMcpServers() {
    const result = /* @__PURE__ */ new Map();
    const userRemote = [];
    const workspace = [];
    for (const server of this.local) {
      const enablementStatus = this.getEnablementStatus(server);
      if (enablementStatus && enablementStatus.state !== McpServerEnablementState.Enabled) {
        continue;
      }
      if (server.local?.scope === LocalMcpServerScope.User) {
        result.set(server.name, server.local);
      } else if (server.local?.scope === LocalMcpServerScope.RemoteUser) {
        userRemote.push(server.local);
      } else if (server.local?.scope === LocalMcpServerScope.Workspace) {
        workspace.push(server.local);
      }
    }
    for (const server of userRemote) {
      const existing = result.get(server.name);
      if (existing) {
        this.logService.warn(localize("overwriting", "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
      }
      result.set(server.name, server);
    }
    for (const server of workspace) {
      const existing = result.get(server.name);
      if (existing) {
        this.logService.warn(localize("overwriting", "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
      }
      result.set(server.name, server);
    }
    return [...result.values()];
  }
  canInstall(mcpServer) {
    if (!(mcpServer instanceof McpWorkbenchServer)) {
      return new MarkdownString().appendText(localize("not an extension", "The provided object is not an mcp server."));
    }
    if (mcpServer.gallery) {
      const result = this.mcpManagementService.canInstall(mcpServer.gallery);
      if (result === true) {
        return true;
      }
      return result;
    }
    if (mcpServer.installable) {
      const result = this.mcpManagementService.canInstall(mcpServer.installable);
      if (result === true) {
        return true;
      }
      return result;
    }
    return new MarkdownString().appendText(localize("cannot be installed", "Cannot install the '{0}' MCP Server because it is not available in this setup.", mcpServer.label));
  }
  async install(server, installOptions) {
    if (!(server instanceof McpWorkbenchServer)) {
      throw new Error("Invalid server instance");
    }
    if (server.installable) {
      const installable = server.installable;
      return this.doInstall(server, () => this.mcpManagementService.install(installable, installOptions));
    }
    if (server.gallery) {
      const gallery = server.gallery;
      return this.doInstall(server, () => this.mcpManagementService.installFromGallery(gallery, installOptions));
    }
    throw new Error("No installable server found");
  }
  async uninstall(server) {
    if (!server.local) {
      throw new Error("Local server is missing");
    }
    await this.mcpManagementService.uninstall(server.local);
  }
  async doInstall(server, installTask) {
    const source = server.gallery ? "gallery" : "local";
    const serverName = server.name;
    const hasInputs = !!(server.installable?.inputs && server.installable.inputs.length > 0);
    this.installing.push(server);
    this._onChange.fire(server);
    try {
      await installTask();
      const result = await this.waitAndGetInstalledMcpServer(server);
      this.telemetryService.publicLog2("mcp/serverInstall", {
        serverName,
        source,
        scope: result.local?.scope ?? "unknown",
        success: true,
        hasInputs
      });
      return result;
    } catch (error) {
      this.telemetryService.publicLog2("mcp/serverInstall", {
        serverName,
        source,
        scope: "unknown",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        hasInputs
      });
      throw error;
    } finally {
      if (this.installing.includes(server)) {
        this.installing.splice(this.installing.indexOf(server), 1);
        this._onChange.fire(server);
      }
    }
  }
  async waitAndGetInstalledMcpServer(server) {
    let installed = this.local.find((local) => local.name === server.name);
    if (!installed) {
      await Event.toPromise(Event.filter(this.onChange, (e) => !!e && this.local.some((local) => local.name === server.name)));
    }
    installed = this.local.find((local) => local.name === server.name);
    if (!installed) {
      throw new Error("Extension should have been installed");
    }
    return installed;
  }
  getMcpConfigPath(arg) {
    if (arg instanceof URI) {
      const mcpResource = arg;
      for (const profile of this.userDataProfilesService.profiles) {
        if (this.uriIdentityService.extUri.isEqual(profile.mcpResource, mcpResource)) {
          return this.getUserMcpConfigPath(mcpResource);
        }
      }
      return this.remoteAgentService.getEnvironment().then((remoteEnvironment) => {
        if (remoteEnvironment && this.uriIdentityService.extUri.isEqual(remoteEnvironment.mcpResource, mcpResource)) {
          return this.getRemoteMcpConfigPath(mcpResource);
        }
        return this.getWorkspaceMcpConfigPath(mcpResource);
      });
    }
    if (arg.scope === LocalMcpServerScope.User) {
      return this.getUserMcpConfigPath(arg.mcpResource);
    }
    if (arg.scope === LocalMcpServerScope.Workspace) {
      return this.getWorkspaceMcpConfigPath(arg.mcpResource);
    }
    if (arg.scope === LocalMcpServerScope.RemoteUser) {
      return this.getRemoteMcpConfigPath(arg.mcpResource);
    }
    return void 0;
  }
  getUserMcpConfigPath(mcpResource) {
    return {
      id: USER_CONFIG_ID,
      key: "userLocalValue",
      target: ConfigurationTarget.USER_LOCAL,
      label: localize("mcp.configuration.userLocalValue", "Global in {0}", this.productService.nameShort),
      scope: StorageScope.PROFILE,
      order: McpCollectionSortOrder.User,
      uri: mcpResource,
      section: []
    };
  }
  getRemoteMcpConfigPath(mcpResource) {
    return {
      id: REMOTE_USER_CONFIG_ID,
      key: "userRemoteValue",
      target: ConfigurationTarget.USER_REMOTE,
      label: this.environmentService.remoteAuthority ? this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority) : "Remote",
      scope: StorageScope.PROFILE,
      order: McpCollectionSortOrder.User + McpCollectionSortOrder.RemoteBoost,
      remoteAuthority: this.environmentService.remoteAuthority,
      uri: mcpResource,
      section: []
    };
  }
  getWorkspaceMcpConfigPath(mcpResource) {
    const workspace = this.workspaceService.getWorkspace();
    if (workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, mcpResource)) {
      return {
        id: WORKSPACE_CONFIG_ID,
        key: "workspaceValue",
        target: ConfigurationTarget.WORKSPACE,
        label: basename(mcpResource),
        scope: StorageScope.WORKSPACE,
        order: McpCollectionSortOrder.Workspace,
        remoteAuthority: this.environmentService.remoteAuthority,
        uri: mcpResource,
        section: ["settings", mcpConfigurationSection]
      };
    }
    const workspaceFolders = workspace.folders;
    for (let index = 0; index < workspaceFolders.length; index++) {
      const workspaceFolder = workspaceFolders[index];
      if (this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), mcpResource)) {
        return {
          id: `${WORKSPACE_FOLDER_CONFIG_ID_PREFIX}${index}`,
          key: "workspaceFolderValue",
          target: ConfigurationTarget.WORKSPACE_FOLDER,
          label: `${workspaceFolder.name}/.vscode/mcp.json`,
          scope: StorageScope.WORKSPACE,
          remoteAuthority: this.environmentService.remoteAuthority,
          order: McpCollectionSortOrder.WorkspaceFolder,
          uri: mcpResource,
          workspaceFolder
        };
      }
    }
    return void 0;
  }
  async handleURL(uri) {
    if (uri.path === "mcp/install") {
      return this.handleMcpInstallUri(uri);
    }
    if (uri.path.startsWith("mcp/by-name/")) {
      const mcpServerName = uri.path.substring("mcp/by-name/".length);
      if (mcpServerName) {
        return this.handleMcpServerByName(mcpServerName);
      }
    }
    if (uri.path.startsWith("mcp/")) {
      const mcpServerUrl = uri.path.substring(4);
      if (mcpServerUrl) {
        return this.handleMcpServerUrl(`${Schemas.https}://${mcpServerUrl}`);
      }
    }
    return false;
  }
  async handleMcpInstallUri(uri) {
    let parsed;
    try {
      parsed = JSON.parse(decodeURIComponent(uri.query));
    } catch (e) {
      return false;
    }
    try {
      const { name, inputs, ...config } = parsed;
      if (config.gallery && this.mcpGalleryService.isEnabled()) {
        try {
          const registryGeneration = this.registryGeneration;
          const [galleryServer] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
          if (galleryServer) {
            this.rememberGallerySource(galleryServer, registryGeneration);
            const local = this.local.find((e) => e.name === galleryServer.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, galleryServer, void 0);
            this.open(local);
            return true;
          }
          this.logService.info(`MCP server '${name}' not found in gallery, installing as local`);
        } catch (e) {
          this.logService.info(`Gallery verification failed for MCP server '${name}', installing as local`);
        }
      }
      if (config.type === void 0) {
        config.type = parsed.command ? McpServerType.LOCAL : McpServerType.REMOTE;
      }
      this.open(this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, void 0, { name, config, inputs }));
    } catch (e) {
    }
    return true;
  }
  async handleMcpServerUrl(url) {
    try {
      const gallery = await this.mcpGalleryService.getMcpServer(url);
      if (!gallery) {
        this.logService.info(`MCP server '${url}' not found`);
        return true;
      }
      const local = this.local.find((e) => e.name === gallery.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, gallery, void 0);
      this.open(local);
    } catch (e) {
      this.logService.error(e);
    }
    return true;
  }
  async handleMcpServerByName(name) {
    try {
      const registryGeneration = this.registryGeneration;
      const [gallery] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
      if (!gallery) {
        this.logService.info(`MCP server '${name}' not found`);
        return true;
      }
      this.rememberGallerySource(gallery, registryGeneration);
      const local = this.local.find((e) => e.name === gallery.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, gallery, void 0);
      this.open(local);
    } catch (e) {
      this.logService.error(e);
    }
    return true;
  }
  async openSearch(searchValue, preserveFocus) {
    await this.extensionsWorkbenchService.openSearch(`@mcp ${searchValue}`, preserveFocus);
  }
  async open(extension, options) {
    const useModal = this.configurationService.getValue("extensions.allowOpenInModalEditor");
    await this.editorService.openEditor(this.instantiationService.createInstance(McpServerEditorInput, extension), options, useModal ? MODAL_GROUP : ACTIVE_GROUP);
  }
  getInstallState(extension) {
    if (this.installing.some((i) => i.name === extension.name)) {
      return McpServerInstallState.Installing;
    }
    if (this.uninstalling.some((e) => e.name === extension.name)) {
      return McpServerInstallState.Uninstalling;
    }
    const local = this.local.find((e) => e === extension);
    return local ? McpServerInstallState.Installed : McpServerInstallState.Uninstalled;
  }
  getRuntimeStatus(mcpServer) {
    const enablementStatus = this.getEnablementStatus(mcpServer);
    if (enablementStatus) {
      return enablementStatus;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === mcpServer.id);
    if (!server) {
      return { state: McpServerEnablementState.Disabled };
    }
    const enablement = server.enablement.get();
    if (enablement === ContributionEnablementState.DisabledProfile) {
      return {
        state: McpServerEnablementState.DisabledProfile,
        message: {
          severity: Severity.Info,
          text: new MarkdownString(localize("disabled globally", "This MCP server is disabled."))
        }
      };
    }
    if (enablement === ContributionEnablementState.DisabledWorkspace) {
      return {
        state: McpServerEnablementState.DisabledWorkspace,
        message: {
          severity: Severity.Info,
          text: new MarkdownString(localize("disabled in workspace", "This MCP server is disabled for this workspace."))
        }
      };
    }
    return void 0;
  }
  getEnablementStatus(mcpServer) {
    if (!mcpServer.local) {
      return void 0;
    }
    const settingsCommandLink = createCommandUri("workbench.action.openSettings", { query: `@id:${mcpAccessConfig}` }).toString();
    const accessValue = this.configurationService.getValue(mcpAccessConfig);
    if (accessValue === McpAccessValue.None) {
      return {
        state: McpServerEnablementState.DisabledByAccess,
        message: {
          severity: Severity.Warning,
          text: new MarkdownString(localize("disabled - all not allowed", "This MCP Server is disabled because MCP servers are configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
        }
      };
    }
    if (accessValue === McpAccessValue.Registry) {
      if (!mcpServer.gallery) {
        return {
          state: McpServerEnablementState.DisabledByAccess,
          message: {
            severity: Severity.Warning,
            text: new MarkdownString(localize("disabled - some not allowed", "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
          }
        };
      }
      const remoteUrl = mcpServer.local.config.type === McpServerType.REMOTE && mcpServer.local.config.url;
      if (remoteUrl && !mcpServer.gallery.configuration.remotes?.some((remote) => remote.url === remoteUrl)) {
        return {
          state: McpServerEnablementState.DisabledByAccess,
          message: {
            severity: Severity.Warning,
            text: new MarkdownString(localize("disabled - some not allowed", "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
          }
        };
      }
    }
    return void 0;
  }
};
McpWorkbenchService = __decorateClass([
  __decorateParam(0, IMcpGalleryManifestService),
  __decorateParam(1, IMcpGalleryService),
  __decorateParam(2, IWorkbenchMcpManagementService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IRemoteAgentService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, ILogService),
  __decorateParam(15, IExtensionsWorkbenchService),
  __decorateParam(16, IAllowedMcpServersService),
  __decorateParam(17, IMcpService),
  __decorateParam(18, IURLService)
], McpWorkbenchService);
let MCPContextsInitialisation = class extends Disposable {
  constructor(mcpWorkbenchService, mcpGalleryManifestService, contextKeyService) {
    super();
    const mcpServersGalleryStatus = McpServersGalleryStatusContext.bindTo(contextKeyService);
    mcpServersGalleryStatus.set(mcpGalleryManifestService.mcpGalleryManifestStatus);
    this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifestStatus((status) => mcpServersGalleryStatus.set(status)));
    const hasInstalledMcpServersContextKey = HasInstalledMcpServersContext.bindTo(contextKeyService);
    mcpWorkbenchService.queryLocal().finally(() => {
      hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0);
      this._register(mcpWorkbenchService.onChange(() => hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0)));
    });
  }
};
MCPContextsInitialisation.ID = "workbench.mcp.contexts.initialisation";
MCPContextsInitialisation = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService),
  __decorateParam(1, IMcpGalleryManifestService),
  __decorateParam(2, IContextKeyService)
], MCPContextsInitialisation);
export {
  MCPContextsInitialisation,
  McpWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwV29ya2JlbmNoU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29tbWFuZFVyaSwgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUdhbGxlcnlNY3BTZXJ2ZXIsIElNY3BHYWxsZXJ5U2VydmljZSwgSVF1ZXJ5T3B0aW9ucywgSUluc3RhbGxhYmxlTWNwU2VydmVyLCBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUsIElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsIElNY3BHYWxsZXJ5U2VydmVyUmVzb2x2ZVJlc3VsdCwgTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiwgSU1jcFNlcnZlclZhcmlhYmxlLCBJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uLCBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVVJMU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBNQ1BfQ09ORklHVVJBVElPTl9LRVksIFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBNT0RBTF9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaWRVbmluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudCwgSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyLCBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0LCBJV29ya2JlbmNNY3BTZXJ2ZXJJbnN0YWxsT3B0aW9ucywgTG9jYWxNY3BTZXJ2ZXJTY29wZSwgUkVNT1RFX1VTRVJfQ09ORklHX0lELCBVU0VSX0NPTkZJR19JRCwgV09SS1NQQUNFX0NPTkZJR19JRCwgV09SS1NQQUNFX0ZPTERFUl9DT05GSUdfSURfUFJFRklYIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbWNwL2NvbW1vbi9tY3BXb3JrYmVuY2hNYW5hZ2VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWNwQ29uZmlndXJhdGlvblNlY3Rpb24gfSBmcm9tICcuLi9jb21tb24vbWNwQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJJbnN0YWxsRGF0YSwgTWNwU2VydmVySW5zdGFsbENsYXNzaWZpY2F0aW9uIH0gZnJvbSAnLi4vY29tbW9uL21jcFNlcnZlci5qcyc7XG5pbXBvcnQgeyBIYXNJbnN0YWxsZWRNY3BTZXJ2ZXJzQ29udGV4dCwgSU1jcENvbmZpZ1BhdGgsIElNY3BTZXJ2aWNlLCBJTWNwV29ya2JlbmNoU2VydmljZSwgSVdvcmtiZW5jaE1jcFNlcnZlciwgTWNwQ29sbGVjdGlvblNvcnRPcmRlciwgTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLCBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUsIE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0dXMsIE1jcFNlcnZlcnNHYWxsZXJ5U3RhdHVzQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IE1jcFNlcnZlckVkaXRvcklucHV0IH0gZnJvbSAnLi9tY3BTZXJ2ZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IElJdGVyYXRpdmVQYWdlciwgSUl0ZXJhdGl2ZVBhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmludGVyZmFjZSBJTWNwU2VydmVyU3RhdGVQcm92aWRlcjxUPiB7XG5cdChtY3BXb3JrYmVuY2hTZXJ2ZXI6IE1jcFdvcmtiZW5jaFNlcnZlcik6IFQ7XG59XG5cbmNsYXNzIE1jcFdvcmtiZW5jaFNlcnZlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hNY3BTZXJ2ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgaW5zdGFsbFN0YXRlUHJvdmlkZXI6IElNY3BTZXJ2ZXJTdGF0ZVByb3ZpZGVyPE1jcFNlcnZlckluc3RhbGxTdGF0ZT4sXG5cdFx0cHJpdmF0ZSBydW50aW1lU3RhdGVQcm92aWRlcjogSU1jcFNlcnZlclN0YXRlUHJvdmlkZXI8TWNwU2VydmVyRW5hYmxlbWVudFN0YXR1cyB8IHVuZGVmaW5lZD4sXG5cdFx0cHVibGljIGxvY2FsOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXIgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIGdhbGxlcnk6IElHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBpbnN0YWxsYWJsZTogSUluc3RhbGxhYmxlTWNwU2VydmVyIHwgdW5kZWZpbmVkLFxuXHRcdEBJTWNwR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BHYWxsZXJ5U2VydmljZTogSU1jcEdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmxvY2FsID0gbG9jYWw7XG5cdH1cblxuXHRnZXQgaWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NhbD8uaWQgPz8gdGhpcy5nYWxsZXJ5Py5uYW1lID8/IHRoaXMuaW5zdGFsbGFibGU/Lm5hbWUgPz8gdGhpcy5uYW1lO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5uYW1lID8/IHRoaXMubG9jYWw/Lm5hbWUgPz8gdGhpcy5pbnN0YWxsYWJsZT8ubmFtZSA/PyAnJztcblx0fVxuXG5cdGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LmRpc3BsYXlOYW1lID8/IHRoaXMubG9jYWw/LmRpc3BsYXlOYW1lID8/IHRoaXMubG9jYWw/Lm5hbWUgPz8gdGhpcy5pbnN0YWxsYWJsZT8ubmFtZSA/PyAnJztcblx0fVxuXG5cdGdldCBpY29uKCk6IHtcblx0XHRyZWFkb25seSBkYXJrOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbGlnaHQ6IHN0cmluZztcblx0fSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8uaWNvbiA/PyB0aGlzLmxvY2FsPy5pY29uO1xuXHR9XG5cblx0Z2V0IGluc3RhbGxTdGF0ZSgpOiBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbGxTdGF0ZVByb3ZpZGVyKHRoaXMpO1xuXHR9XG5cblx0Z2V0IGNvZGljb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5jb2RpY29uID8/IHRoaXMubG9jYWw/LmNvZGljb247XG5cdH1cblxuXHRnZXQgcHVibGlzaGVyRGlzcGxheU5hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5wdWJsaXNoZXJEaXNwbGF5TmFtZSA/PyB0aGlzLmxvY2FsPy5wdWJsaXNoZXJEaXNwbGF5TmFtZSA/PyB0aGlzLmdhbGxlcnk/LnB1Ymxpc2hlciA/PyB0aGlzLmxvY2FsPy5wdWJsaXNoZXI7XG5cdH1cblxuXHRnZXQgcHVibGlzaGVyVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ucHVibGlzaGVyRG9tYWluPy5saW5rO1xuXHR9XG5cblx0Z2V0IGRlc2NyaXB0aW9uKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8uZGVzY3JpcHRpb24gPz8gdGhpcy5sb2NhbD8uZGVzY3JpcHRpb24gPz8gJyc7XG5cdH1cblxuXHRnZXQgc3RhcnNDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LnN0YXJzQ291bnQgPz8gMDtcblx0fVxuXG5cdGdldCBsaWNlbnNlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ubGljZW5zZTtcblx0fVxuXG5cdGdldCByZXBvc2l0b3J5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ucmVwb3NpdG9yeVVybDtcblx0fVxuXG5cdGdldCBjb25maWcoKTogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmxvY2FsPy5jb25maWcgPz8gdGhpcy5pbnN0YWxsYWJsZT8uY29uZmlnO1xuXHR9XG5cblx0Z2V0IHJ1bnRpbWVTdGF0dXMoKTogTWNwU2VydmVyRW5hYmxlbWVudFN0YXR1cyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucnVudGltZVN0YXRlUHJvdmlkZXIodGhpcyk7XG5cdH1cblxuXHRnZXQgcmVhZG1lVXJsKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWw/LnJlYWRtZVVybCA/PyAodGhpcy5nYWxsZXJ5Py5yZWFkbWVVcmwgPyBVUkkucGFyc2UodGhpcy5nYWxsZXJ5LnJlYWRtZVVybCkgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVhZG1lKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMubG9jYWw/LnJlYWRtZVVybCkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5sb2NhbC5yZWFkbWVVcmwpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nYWxsZXJ5Py5yZWFkbWUpIHtcblx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnkucmVhZG1lO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdhbGxlcnk/LnJlYWRtZVVybCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubWNwR2FsbGVyeVNlcnZpY2UuZ2V0UmVhZG1lKHRoaXMuZ2FsbGVyeSwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vdCBhdmFpbGFibGUnKSk7XG5cdH1cblxuXHRhc3luYyBnZXRNYW5pZmVzdCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbj4ge1xuXHRcdGlmICh0aGlzLmxvY2FsPy5tYW5pZmVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubG9jYWwubWFuaWZlc3Q7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeS5jb25maWd1cmF0aW9uO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignTm8gbWFuaWZlc3QgYXZhaWxhYmxlJyk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgTWNwV29ya2JlbmNoU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwV29ya2JlbmNoU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaW5zdGFsbGluZzogTWNwV29ya2JlbmNoU2VydmVyW10gPSBbXTtcblx0cHJpdmF0ZSB1bmluc3RhbGxpbmc6IE1jcFdvcmtiZW5jaFNlcnZlcltdID0gW107XG5cblx0cHJpdmF0ZSBfbG9jYWw6IE1jcFdvcmtiZW5jaFNlcnZlcltdID0gW107XG5cdHByaXZhdGUgcmVnaXN0cnlTeW5jR2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgcmVnaXN0cnlHZW5lcmF0aW9uID0gMDtcblx0cHJpdmF0ZSBsb2NhbFF1ZXJ5R2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgcHJvZmlsZUNoYW5nZUdlbmVyYXRpb24gPSAwO1xuXHQvLyBTb3VyY2UgaWRlbnRpdHkgaXMgaW50ZW50aW9uYWxseSB0cnVzdGVkIG9ubHkgaW4tcHJvY2VzczsgSVBDIGNvcGllcyBhcmUgcmUtdmVyaWZpZWQuXG5cdHByaXZhdGUgcmVhZG9ubHkgZ2FsbGVyeVNvdXJjZUdlbmVyYXRpb25zID0gbmV3IFdlYWtNYXA8SUdhbGxlcnlNY3BTZXJ2ZXIsIG51bWJlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSByZWdpc3RyeVN5bmNEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oMCkpO1xuXHRnZXQgbG9jYWwoKTogcmVhZG9ubHkgTWNwV29ya2JlbmNoU2VydmVyW10geyByZXR1cm4gWy4uLnRoaXMuX2xvY2FsXTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtiZW5jaE1jcFNlcnZlciB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uQ2hhbmdlID0gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXNldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblJlc2V0ID0gdGhpcy5fb25SZXNldC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgbWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdFx0QElNY3BHYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcEdhbGxlcnlTZXJ2aWNlOiBJTWNwR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASVVSTFNlcnZpY2UgdXJsU2VydmljZTogSVVSTFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZShlID0+IHRoaXMub25EaWRJbnN0YWxsTWNwU2VydmVycyhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVcGRhdGVNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZShlID0+IHRoaXMub25EaWRVcGRhdGVNY3BTZXJ2ZXJzKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUoZSA9PiB0aGlzLm9uRGlkVW5pbnN0YWxsTWNwU2VydmVyKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGUoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlUHJvZmlsZSgpKSk7XG5cdFx0dGhpcy5xdWVyeUxvY2FsKCkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihtY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5pbnZhbGlkYXRlUmVnaXN0cnlWZXJpZmljYXRpb24oKTtcblx0XHRcdFx0dGhpcy5zY2hlZHVsZVJlZ2lzdHJ5U3luYygpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZVJlZ2lzdHJ5U3luYygpO1xuXHRcdH0pO1xuXHRcdHVybFNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHRoaXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obWNwQWNjZXNzQ29uZmlnKSkge1xuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWxsb3dlZE1jcFNlcnZlcnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9jYWwgPSB0aGlzLnNvcnQodGhpcy5fbG9jYWwpO1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZShtY3BTZXJ2aWNlLnNlcnZlcnMsICgpID0+IHtcblx0XHRcdHRoaXMuX2xvY2FsID0gdGhpcy5zb3J0KHRoaXMuX2xvY2FsKTtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWFjdCB0byBlbmFibGVtZW50IGNoYW5nZXMgb24gaW5kaXZpZHVhbCBzZXJ2ZXJzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgbWNwU2VydmljZS5zZXJ2ZXJzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRzZXJ2ZXIuZW5hYmxlbWVudC5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZENoYW5nZVByb2ZpbGUoKSB7XG5cdFx0Y29uc3QgcHJvZmlsZUNoYW5nZUdlbmVyYXRpb24gPSArK3RoaXMucHJvZmlsZUNoYW5nZUdlbmVyYXRpb247XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrdGhpcy5sb2NhbFF1ZXJ5R2VuZXJhdGlvbjtcblx0XHR0aGlzLmludmFsaWRhdGVSZWdpc3RyeVZlcmlmaWNhdGlvbigpO1xuXHRcdGF3YWl0IHRoaXMucXVlcnlMb2NhbEZvckdlbmVyYXRpb24oZ2VuZXJhdGlvbik7XG5cdFx0aWYgKHByb2ZpbGVDaGFuZ2VHZW5lcmF0aW9uICE9PSB0aGlzLnByb2ZpbGVDaGFuZ2VHZW5lcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29uUmVzZXQuZmlyZSgpO1xuXHRcdHRoaXMuc2NoZWR1bGVSZWdpc3RyeVN5bmMoKTtcblx0fVxuXG5cdHByaXZhdGUgaW52YWxpZGF0ZVJlZ2lzdHJ5VmVyaWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMucmVnaXN0cnlHZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5yZWdpc3RyeVN5bmNHZW5lcmF0aW9uKys7XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgdGhpcy5fbG9jYWwpIHtcblx0XHRcdHNlcnZlci5nYWxsZXJ5ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGFyZVNhbWVNY3BTZXJ2ZXJzKGE6IHsgbmFtZTogc3RyaW5nOyBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZSB9IHwgdW5kZWZpbmVkLCBiOiB7IG5hbWU6IHN0cmluZzsgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUgfSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBhLm5hbWUgPT09IGIubmFtZSAmJiBhLnNjb3BlID09PSBiLnNjb3BlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlcihlOiBEaWRVbmluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudCkge1xuXHRcdGlmIChlLmVycm9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVuaW5zdGFsbGVkID0gdGhpcy5fbG9jYWwuZmluZChzZXJ2ZXIgPT4gdGhpcy5hcmVTYW1lTWNwU2VydmVycyhzZXJ2ZXIubG9jYWwsIGUpKTtcblx0XHRpZiAodW5pbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuX2xvY2FsID0gdGhpcy5fbG9jYWwuZmlsdGVyKHNlcnZlciA9PiBzZXJ2ZXIgIT09IHVuaW5zdGFsbGVkKTtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5pbnN0YWxsZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRJbnN0YWxsTWNwU2VydmVycyhlOiByZWFkb25seSBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdKSB7XG5cdFx0bGV0IG5lZWRzUmVnaXN0cnlTeW5jID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCB7IGxvY2FsLCBuYW1lLCBzb3VyY2UgfSBvZiBlKSB7XG5cdFx0XHRsZXQgc2VydmVyID0gdGhpcy5pbnN0YWxsaW5nLmZpbmQoc2VydmVyID0+IHNlcnZlci5sb2NhbCAmJiBsb2NhbCA/IHRoaXMuYXJlU2FtZU1jcFNlcnZlcnMoc2VydmVyLmxvY2FsLCBsb2NhbCkgOiBzZXJ2ZXIubmFtZSA9PT0gbmFtZSk7XG5cdFx0XHR0aGlzLmluc3RhbGxpbmcgPSBzZXJ2ZXIgPyB0aGlzLmluc3RhbGxpbmcuZmlsdGVyKGUgPT4gZSAhPT0gc2VydmVyKSA6IHRoaXMuaW5zdGFsbGluZztcblx0XHRcdGlmIChsb2NhbCkge1xuXHRcdFx0XHRjb25zdCB0cnVzdGVkR2FsbGVyeSA9IHRoaXMuZ2V0VHJ1c3RlZEdhbGxlcnlTb3VyY2Uoc291cmNlKSA/PyB0aGlzLmdldFRydXN0ZWRHYWxsZXJ5U291cmNlKHNlcnZlcj8uZ2FsbGVyeSk7XG5cdFx0XHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdFx0XHRzZXJ2ZXIubG9jYWwgPSBsb2NhbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXJ2ZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFdvcmtiZW5jaFNlcnZlciwgZSA9PiB0aGlzLmdldEluc3RhbGxTdGF0ZShlKSwgZSA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0dXMoZSksIGxvY2FsLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VydmVyLmdhbGxlcnkgPSB0cnVzdGVkR2FsbGVyeT8ubmFtZSA9PT0gbG9jYWwubmFtZSA/IHRydXN0ZWRHYWxsZXJ5IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRuZWVkc1JlZ2lzdHJ5U3luYyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xvY2FsID0gdGhpcy5fbG9jYWwuZmlsdGVyKHNlcnZlciA9PiAhdGhpcy5hcmVTYW1lTWNwU2VydmVycyhzZXJ2ZXIubG9jYWwsIGxvY2FsKSk7XG5cdFx0XHRcdHRoaXMuYWRkU2VydmVyKHNlcnZlcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHNlcnZlcik7XG5cdFx0fVxuXHRcdGlmIChuZWVkc1JlZ2lzdHJ5U3luYykge1xuXHRcdFx0dGhpcy5zY2hlZHVsZVJlZ2lzdHJ5U3luYygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRVcGRhdGVNY3BTZXJ2ZXJzKGU6IHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10pIHtcblx0XHRsZXQgbmVlZHNSZWdpc3RyeVN5bmMgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiBlKSB7XG5cdFx0XHRpZiAoIXJlc3VsdC5sb2NhbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlcnZlckluZGV4ID0gdGhpcy5fbG9jYWwuZmluZEluZGV4KHNlcnZlciA9PiB0aGlzLmFyZVNhbWVNY3BTZXJ2ZXJzKHNlcnZlci5sb2NhbCwgcmVzdWx0LmxvY2FsKSk7XG5cdFx0XHRsZXQgc2VydmVyOiBNY3BXb3JrYmVuY2hTZXJ2ZXI7XG5cdFx0XHRpZiAoc2VydmVySW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuX2xvY2FsW3NlcnZlckluZGV4XS5sb2NhbCA9IHJlc3VsdC5sb2NhbDtcblx0XHRcdFx0c2VydmVyID0gdGhpcy5fbG9jYWxbc2VydmVySW5kZXhdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VydmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCByZXN1bHQubG9jYWwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5hZGRTZXJ2ZXIoc2VydmVyKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRydXN0ZWRHYWxsZXJ5ID0gdGhpcy5nZXRUcnVzdGVkR2FsbGVyeVNvdXJjZShyZXN1bHQuc291cmNlKSA/PyB0aGlzLmdldFRydXN0ZWRHYWxsZXJ5U291cmNlKHNlcnZlci5nYWxsZXJ5KTtcblx0XHRcdHNlcnZlci5nYWxsZXJ5ID0gdHJ1c3RlZEdhbGxlcnk/Lm5hbWUgPT09IHJlc3VsdC5sb2NhbC5uYW1lID8gdHJ1c3RlZEdhbGxlcnkgOiB1bmRlZmluZWQ7XG5cdFx0XHRuZWVkc1JlZ2lzdHJ5U3luYyA9IHRydWU7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHNlcnZlcik7XG5cdFx0fVxuXHRcdGlmIChuZWVkc1JlZ2lzdHJ5U3luYykge1xuXHRcdFx0dGhpcy5zY2hlZHVsZVJlZ2lzdHJ5U3luYygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZnJvbUdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIsIHJlZ2lzdHJ5R2VuZXJhdGlvbjogbnVtYmVyKTogSVdvcmtiZW5jaE1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5yZW1lbWJlckdhbGxlcnlTb3VyY2UoZ2FsbGVyeSwgcmVnaXN0cnlHZW5lcmF0aW9uKTtcblx0XHRmb3IgKGNvbnN0IGxvY2FsIG9mIHRoaXMuX2xvY2FsKSB7XG5cdFx0XHRpZiAobG9jYWwubmFtZSA9PT0gZ2FsbGVyeS5uYW1lKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVSZWdpc3RyeVN5bmMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrdGhpcy5yZWdpc3RyeVN5bmNHZW5lcmF0aW9uO1xuXHRcdHZvaWQgdGhpcy5yZWdpc3RyeVN5bmNEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5zeW5jSW5zdGFsbGVkTWNwU2VydmVycyhnZW5lcmF0aW9uKSlcblx0XHRcdC5jYXRjaChlcnJvciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3luY0luc3RhbGxlZE1jcFNlcnZlcnMoZ2VuZXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMubG9jYWwuZmxhdE1hcChzZXJ2ZXIgPT4gc2VydmVyLmxvY2FsID8gW3sgc2VydmVyLCBsb2NhbDogc2VydmVyLmxvY2FsIH1dIDogW10pO1xuXHRcdGNvbnN0IGluZm9zQnlOYW1lID0gbmV3IE1hcDxzdHJpbmcsIHsgbmFtZTogc3RyaW5nOyBpZD86IHN0cmluZyB9PigpO1xuXHRcdGZvciAoY29uc3QgeyBsb2NhbCB9IG9mIHNlcnZlcnMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gaW5mb3NCeU5hbWUuZ2V0KGxvY2FsLm5hbWUpO1xuXHRcdFx0aWYgKCFleGlzdGluZyB8fCAoIWV4aXN0aW5nLmlkICYmIGxvY2FsLmdhbGxlcnlJZCkpIHtcblx0XHRcdFx0aW5mb3NCeU5hbWUuc2V0KGxvY2FsLm5hbWUsIHsgbmFtZTogbG9jYWwubmFtZSwgaWQ6IGxvY2FsLmdhbGxlcnlJZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgaW5mb3MgPSBbLi4uaW5mb3NCeU5hbWUudmFsdWVzKCldO1xuXG5cdFx0aWYgKCFpbmZvcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMubWNwR2FsbGVyeVNlcnZpY2UucmVzb2x2ZU1jcFNlcnZlcnNGcm9tR2FsbGVyeShpbmZvcyk7XG5cdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMucmVnaXN0cnlTeW5jR2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnN5bmNJbnN0YWxsZWRNY3BTZXJ2ZXJzV2l0aEdhbGxlcnkocmVzb2x2ZWQsIHNlcnZlcnMsIGdlbmVyYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBzeW5jSW5zdGFsbGVkTWNwU2VydmVyc1dpdGhHYWxsZXJ5KFxuXHRcdHJlc29sdmVkOiBNYXA8c3RyaW5nLCBJTWNwR2FsbGVyeVNlcnZlclJlc29sdmVSZXN1bHQ+LFxuXHRcdHNlcnZlcnM6IHJlYWRvbmx5IHsgc2VydmVyOiBNY3BXb3JrYmVuY2hTZXJ2ZXI7IGxvY2FsOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXIgfVtdLFxuXHRcdGdlbmVyYXRpb246IG51bWJlcixcblx0KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB7IHNlcnZlcjogbWNwU2VydmVyLCBsb2NhbCB9IG9mIHNlcnZlcnMpIHtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLnJlZ2lzdHJ5U3luY0dlbmVyYXRpb24gfHwgIXRoaXMuX2xvY2FsLmluY2x1ZGVzKG1jcFNlcnZlcikgfHwgbWNwU2VydmVyLmxvY2FsICE9PSBsb2NhbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZWQuZ2V0KGxvY2FsLm5hbWUpO1xuXG5cdFx0XHQvLyBVbmRldGVybWluZWQgKGUuZy4gcmVnaXN0cnkgdW5yZWFjaGFibGUpOiBrZWVwIHRoZSBjdXJyZW50IHN0YXRlIHNvIGFcblx0XHRcdC8vIHRyYW5zaWVudCBmYWlsdXJlIG5ldmVyIGRpc2FibGVzIGEgcHJldmlvdXNseSB2ZXJpZmllZCBzZXJ2ZXIuXG5cdFx0XHRpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3RhdHVzID09PSBNY3BHYWxsZXJ5UmVzb2x2ZVN0YXR1cy5GYWlsZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSBNY3BHYWxsZXJ5UmVzb2x2ZVN0YXR1cy5Ob3RGb3VuZCkge1xuXHRcdFx0XHRpZiAobWNwU2VydmVyLmdhbGxlcnkpIHtcblx0XHRcdFx0XHRtY3BTZXJ2ZXIuZ2FsbGVyeSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKG1jcFNlcnZlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdhbGxlcnkgPSByZXN1bHQuc2VydmVyO1xuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IG1jcFNlcnZlci5nYWxsZXJ5ICE9PSBnYWxsZXJ5O1xuXHRcdFx0dGhpcy5yZW1lbWJlckdhbGxlcnlTb3VyY2UoZ2FsbGVyeSk7XG5cdFx0XHRtY3BTZXJ2ZXIuZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKG1jcFNlcnZlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcXVlcnlHYWxsZXJ5KG9wdGlvbnM/OiBJUXVlcnlPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJSXRlcmF0aXZlUGFnZXI8SVdvcmtiZW5jaE1jcFNlcnZlcj4+IHtcblx0XHRpZiAoIXRoaXMubWNwR2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZpcnN0UGFnZTogeyBpdGVtczogW10sIGhhc01vcmU6IGZhbHNlIH0sXG5cdFx0XHRcdGdldE5leHRQYWdlOiBhc3luYyAoKSA9PiAoeyBpdGVtczogW10sIGhhc01vcmU6IGZhbHNlIH0pXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCByZWdpc3RyeUdlbmVyYXRpb24gPSB0aGlzLnJlZ2lzdHJ5R2VuZXJhdGlvbjtcblx0XHRjb25zdCBwYWdlciA9IGF3YWl0IHRoaXMubWNwR2FsbGVyeVNlcnZpY2UucXVlcnkob3B0aW9ucywgdG9rZW4pO1xuXHRcdGNvbnN0IG1hcFBhZ2UgPSAocGFnZTogSUl0ZXJhdGl2ZVBhZ2U8SUdhbGxlcnlNY3BTZXJ2ZXI+KTogSUl0ZXJhdGl2ZVBhZ2U8SVdvcmtiZW5jaE1jcFNlcnZlcj4gPT4gKHtcblx0XHRcdGl0ZW1zOiBwYWdlLml0ZW1zLm1hcChnYWxsZXJ5ID0+IHRoaXMuZnJvbUdhbGxlcnkoZ2FsbGVyeSwgcmVnaXN0cnlHZW5lcmF0aW9uKSA/PyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFdvcmtiZW5jaFNlcnZlciwgZSA9PiB0aGlzLmdldEluc3RhbGxTdGF0ZShlKSwgZSA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0dXMoZSksIHVuZGVmaW5lZCwgZ2FsbGVyeSwgdW5kZWZpbmVkKSksXG5cdFx0XHRoYXNNb3JlOiBwYWdlLmhhc01vcmVcblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRmaXJzdFBhZ2U6IG1hcFBhZ2UocGFnZXIuZmlyc3RQYWdlKSxcblx0XHRcdGdldE5leHRQYWdlOiBhc3luYyAoY3QpID0+IHtcblx0XHRcdFx0Y29uc3QgbmV4dFBhZ2UgPSBhd2FpdCBwYWdlci5nZXROZXh0UGFnZShjdCk7XG5cdFx0XHRcdHJldHVybiBtYXBQYWdlKG5leHRQYWdlKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcXVlcnlMb2NhbCgpOiBQcm9taXNlPElXb3JrYmVuY2hNY3BTZXJ2ZXJbXT4ge1xuXHRcdGF3YWl0IHRoaXMucXVlcnlMb2NhbEZvckdlbmVyYXRpb24oKyt0aGlzLmxvY2FsUXVlcnlHZW5lcmF0aW9uKTtcblx0XHRyZXR1cm4gWy4uLnRoaXMubG9jYWxdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeUxvY2FsRm9yR2VuZXJhdGlvbihnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLmxvY2FsUXVlcnlHZW5lcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2xvY2FsID0gdGhpcy5zb3J0KGluc3RhbGxlZC5tYXAoaSA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2xvY2FsLmZpbmQobG9jYWwgPT4gbG9jYWwuaWQgPT09IGkuaWQpO1xuXHRcdFx0Y29uc3QgbG9jYWwgPSBleGlzdGluZyA/PyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFdvcmtiZW5jaFNlcnZlciwgZSA9PiB0aGlzLmdldEluc3RhbGxTdGF0ZShlKSwgZSA9PiB0aGlzLmdldFJ1bnRpbWVTdGF0dXMoZSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0bG9jYWwubG9jYWwgPSBpO1xuXHRcdFx0cmV0dXJuIGxvY2FsO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHJlbWVtYmVyR2FsbGVyeVNvdXJjZShnYWxsZXJ5OiBJR2FsbGVyeU1jcFNlcnZlciwgcmVnaXN0cnlHZW5lcmF0aW9uID0gdGhpcy5yZWdpc3RyeUdlbmVyYXRpb24pOiB2b2lkIHtcblx0XHRpZiAocmVnaXN0cnlHZW5lcmF0aW9uID09PSB0aGlzLnJlZ2lzdHJ5R2VuZXJhdGlvbikge1xuXHRcdFx0dGhpcy5nYWxsZXJ5U291cmNlR2VuZXJhdGlvbnMuc2V0KGdhbGxlcnksIHJlZ2lzdHJ5R2VuZXJhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcnVzdGVkR2FsbGVyeVNvdXJjZShnYWxsZXJ5OiBJR2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZCk6IElHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZ2FsbGVyeSAmJiB0aGlzLmdhbGxlcnlTb3VyY2VHZW5lcmF0aW9ucy5nZXQoZ2FsbGVyeSkgPT09IHRoaXMucmVnaXN0cnlHZW5lcmF0aW9uID8gZ2FsbGVyeSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYWRkU2VydmVyKHNlcnZlcjogTWNwV29ya2JlbmNoU2VydmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9jYWwucHVzaChzZXJ2ZXIpO1xuXHRcdHRoaXMuX2xvY2FsID0gdGhpcy5zb3J0KHRoaXMuX2xvY2FsKTtcblx0fVxuXG5cdHByaXZhdGUgc29ydChsb2NhbDogTWNwV29ya2JlbmNoU2VydmVyW10pOiBNY3BXb3JrYmVuY2hTZXJ2ZXJbXSB7XG5cdFx0cmV0dXJuIGxvY2FsLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLm5hbWUgPT09IGIubmFtZSkge1xuXHRcdFx0XHRjb25zdCBhRW5hYmxlZCA9ICFhLnJ1bnRpbWVTdGF0dXMgfHwgYS5ydW50aW1lU3RhdHVzLnN0YXRlID09PSBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdGUuRW5hYmxlZDtcblx0XHRcdFx0Y29uc3QgYkVuYWJsZWQgPSAhYi5ydW50aW1lU3RhdHVzIHx8IGIucnVudGltZVN0YXR1cy5zdGF0ZSA9PT0gTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLkVuYWJsZWQ7XG5cdFx0XHRcdGlmIChhRW5hYmxlZCAhPT0gYkVuYWJsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gYUVuYWJsZWQgPyAtMSA6IDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXJbXSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcj4oKTtcblx0XHRjb25zdCB1c2VyUmVtb3RlOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZTogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMubG9jYWwpIHtcblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0dXMgPSB0aGlzLmdldEVuYWJsZW1lbnRTdGF0dXMoc2VydmVyKTtcblx0XHRcdGlmIChlbmFibGVtZW50U3RhdHVzICYmIGVuYWJsZW1lbnRTdGF0dXMuc3RhdGUgIT09IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VydmVyLmxvY2FsPy5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5zZXQoc2VydmVyLm5hbWUsIHNlcnZlci5sb2NhbCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNlcnZlci5sb2NhbD8uc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikge1xuXHRcdFx0XHR1c2VyUmVtb3RlLnB1c2goc2VydmVyLmxvY2FsKTtcblx0XHRcdH0gZWxzZSBpZiAoc2VydmVyLmxvY2FsPy5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0d29ya3NwYWNlLnB1c2goc2VydmVyLmxvY2FsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB1c2VyUmVtb3RlKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHJlc3VsdC5nZXQoc2VydmVyLm5hbWUpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGxvY2FsaXplKCdvdmVyd3JpdGluZycsIFwiT3ZlcndyaXRpbmcgbWNwIHNlcnZlciAnezB9JyBmcm9tIHsxfSB3aXRoIHsyfS5cIiwgc2VydmVyLm5hbWUsIHNlcnZlci5tY3BSZXNvdXJjZS5wYXRoLCBleGlzdGluZy5tY3BSZXNvdXJjZS5wYXRoKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQuc2V0KHNlcnZlci5uYW1lLCBzZXJ2ZXIpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHdvcmtzcGFjZSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KHNlcnZlci5uYW1lKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2Fybihsb2NhbGl6ZSgnb3ZlcndyaXRpbmcnLCBcIk92ZXJ3cml0aW5nIG1jcCBzZXJ2ZXIgJ3swfScgZnJvbSB7MX0gd2l0aCB7Mn0uXCIsIHNlcnZlci5uYW1lLCBzZXJ2ZXIubWNwUmVzb3VyY2UucGF0aCwgZXhpc3RpbmcubWNwUmVzb3VyY2UucGF0aCkpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnNldChzZXJ2ZXIubmFtZSwgc2VydmVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gWy4uLnJlc3VsdC52YWx1ZXMoKV07XG5cdH1cblxuXHRjYW5JbnN0YWxsKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlcik6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdGlmICghKG1jcFNlcnZlciBpbnN0YW5jZW9mIE1jcFdvcmtiZW5jaFNlcnZlcikpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGxvY2FsaXplKCdub3QgYW4gZXh0ZW5zaW9uJywgXCJUaGUgcHJvdmlkZWQgb2JqZWN0IGlzIG5vdCBhbiBtY3Agc2VydmVyLlwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1jcFNlcnZlci5nYWxsZXJ5KSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLmNhbkluc3RhbGwobWNwU2VydmVyLmdhbGxlcnkpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRpZiAobWNwU2VydmVyLmluc3RhbGxhYmxlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLmNhbkluc3RhbGwobWNwU2VydmVyLmluc3RhbGxhYmxlKTtcblx0XHRcdGlmIChyZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChsb2NhbGl6ZSgnY2Fubm90IGJlIGluc3RhbGxlZCcsIFwiQ2Fubm90IGluc3RhbGwgdGhlICd7MH0nIE1DUCBTZXJ2ZXIgYmVjYXVzZSBpdCBpcyBub3QgYXZhaWxhYmxlIGluIHRoaXMgc2V0dXAuXCIsIG1jcFNlcnZlci5sYWJlbCkpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChzZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIGluc3RhbGxPcHRpb25zPzogSVdvcmtiZW5jTWNwU2VydmVySW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElXb3JrYmVuY2hNY3BTZXJ2ZXI+IHtcblx0XHRpZiAoIShzZXJ2ZXIgaW5zdGFuY2VvZiBNY3BXb3JrYmVuY2hTZXJ2ZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc2VydmVyIGluc3RhbmNlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHNlcnZlci5pbnN0YWxsYWJsZSkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGFibGUgPSBzZXJ2ZXIuaW5zdGFsbGFibGU7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0luc3RhbGwoc2VydmVyLCAoKSA9PiB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwoaW5zdGFsbGFibGUsIGluc3RhbGxPcHRpb25zKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNlcnZlci5nYWxsZXJ5KSB7XG5cdFx0XHRjb25zdCBnYWxsZXJ5ID0gc2VydmVyLmdhbGxlcnk7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0luc3RhbGwoc2VydmVyLCAoKSA9PiB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5LCBpbnN0YWxsT3B0aW9ucykpO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignTm8gaW5zdGFsbGFibGUgc2VydmVyIGZvdW5kJyk7XG5cdH1cblxuXHRhc3luYyB1bmluc3RhbGwoc2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFzZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTG9jYWwgc2VydmVyIGlzIG1pc3NpbmcnKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGwoc2VydmVyLmxvY2FsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9JbnN0YWxsKHNlcnZlcjogTWNwV29ya2JlbmNoU2VydmVyLCBpbnN0YWxsVGFzazogKCkgPT4gUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+KTogUHJvbWlzZTxJV29ya2JlbmNoTWNwU2VydmVyPiB7XG5cdFx0Y29uc3Qgc291cmNlID0gc2VydmVyLmdhbGxlcnkgPyAnZ2FsbGVyeScgOiAnbG9jYWwnO1xuXHRcdGNvbnN0IHNlcnZlck5hbWUgPSBzZXJ2ZXIubmFtZTtcblx0XHQvLyBDaGVjayBmb3IgaW5wdXRzIGluIGluc3RhbGxhYmxlIGNvbmZpZyBvciBpZiBpdCBjb21lcyBmcm9tIGhhbmRsZVVSTCB3aXRoIGlucHV0c1xuXHRcdGNvbnN0IGhhc0lucHV0cyA9ICEhKHNlcnZlci5pbnN0YWxsYWJsZT8uaW5wdXRzICYmIHNlcnZlci5pbnN0YWxsYWJsZS5pbnB1dHMubGVuZ3RoID4gMCk7XG5cblx0XHR0aGlzLmluc3RhbGxpbmcucHVzaChzZXJ2ZXIpO1xuXHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoc2VydmVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBpbnN0YWxsVGFzaygpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy53YWl0QW5kR2V0SW5zdGFsbGVkTWNwU2VydmVyKHNlcnZlcik7XG5cblx0XHRcdC8vIFRyYWNrIHN1Y2Nlc3NmdWwgaW5zdGFsbGF0aW9uXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxNY3BTZXJ2ZXJJbnN0YWxsRGF0YSwgTWNwU2VydmVySW5zdGFsbENsYXNzaWZpY2F0aW9uPignbWNwL3NlcnZlckluc3RhbGwnLCB7XG5cdFx0XHRcdHNlcnZlck5hbWUsXG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0c2NvcGU6IHJlc3VsdC5sb2NhbD8uc2NvcGUgPz8gJ3Vua25vd24nLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRoYXNJbnB1dHNcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBUcmFjayBmYWlsZWQgaW5zdGFsbGF0aW9uXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxNY3BTZXJ2ZXJJbnN0YWxsRGF0YSwgTWNwU2VydmVySW5zdGFsbENsYXNzaWZpY2F0aW9uPignbWNwL3NlcnZlckluc3RhbGwnLCB7XG5cdFx0XHRcdHNlcnZlck5hbWUsXG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0c2NvcGU6ICd1bmtub3duJyxcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG5cdFx0XHRcdGhhc0lucHV0c1xuXHRcdFx0fSk7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5pbnN0YWxsaW5nLmluY2x1ZGVzKHNlcnZlcikpIHtcblx0XHRcdFx0dGhpcy5pbnN0YWxsaW5nLnNwbGljZSh0aGlzLmluc3RhbGxpbmcuaW5kZXhPZihzZXJ2ZXIpLCAxKTtcblx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShzZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2FpdEFuZEdldEluc3RhbGxlZE1jcFNlcnZlcihzZXJ2ZXI6IE1jcFdvcmtiZW5jaFNlcnZlcik6IFByb21pc2U8SVdvcmtiZW5jaE1jcFNlcnZlcj4ge1xuXHRcdGxldCBpbnN0YWxsZWQgPSB0aGlzLmxvY2FsLmZpbmQobG9jYWwgPT4gbG9jYWwubmFtZSA9PT0gc2VydmVyLm5hbWUpO1xuXHRcdGlmICghaW5zdGFsbGVkKSB7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHRoaXMub25DaGFuZ2UsIGUgPT4gISFlICYmIHRoaXMubG9jYWwuc29tZShsb2NhbCA9PiBsb2NhbC5uYW1lID09PSBzZXJ2ZXIubmFtZSkpKTtcblx0XHR9XG5cdFx0aW5zdGFsbGVkID0gdGhpcy5sb2NhbC5maW5kKGxvY2FsID0+IGxvY2FsLm5hbWUgPT09IHNlcnZlci5uYW1lKTtcblx0XHRpZiAoIWluc3RhbGxlZCkge1xuXHRcdFx0Ly8gVGhpcyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHRlbnNpb24gc2hvdWxkIGhhdmUgYmVlbiBpbnN0YWxsZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3RhbGxlZDtcblx0fVxuXG5cdGdldE1jcENvbmZpZ1BhdGgobG9jYWxNY3BTZXJ2ZXI6IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcik6IElNY3BDb25maWdQYXRoIHwgdW5kZWZpbmVkO1xuXHRnZXRNY3BDb25maWdQYXRoKG1jcFJlc291cmNlOiBVUkkpOiBQcm9taXNlPElNY3BDb25maWdQYXRoIHwgdW5kZWZpbmVkPjtcblx0Z2V0TWNwQ29uZmlnUGF0aChhcmc6IFVSSSB8IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcik6IFByb21pc2U8SU1jcENvbmZpZ1BhdGggfCB1bmRlZmluZWQ+IHwgSU1jcENvbmZpZ1BhdGggfCB1bmRlZmluZWQge1xuXHRcdGlmIChhcmcgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gYXJnO1xuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHByb2ZpbGUubWNwUmVzb3VyY2UsIG1jcFJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldFVzZXJNY3BDb25maWdQYXRoKG1jcFJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKHJlbW90ZUVudmlyb25tZW50ID0+IHtcblx0XHRcdFx0aWYgKHJlbW90ZUVudmlyb25tZW50ICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHJlbW90ZUVudmlyb25tZW50Lm1jcFJlc291cmNlLCBtY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRSZW1vdGVNY3BDb25maWdQYXRoKG1jcFJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRXb3Jrc3BhY2VNY3BDb25maWdQYXRoKG1jcFJlc291cmNlKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChhcmcuc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuVXNlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0VXNlck1jcENvbmZpZ1BhdGgoYXJnLm1jcFJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAoYXJnLnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0V29ya3NwYWNlTWNwQ29uZmlnUGF0aChhcmcubWNwUmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGlmIChhcmcuc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0UmVtb3RlTWNwQ29uZmlnUGF0aChhcmcubWNwUmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFVzZXJNY3BDb25maWdQYXRoKG1jcFJlc291cmNlOiBVUkkpOiBJTWNwQ29uZmlnUGF0aCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBVU0VSX0NPTkZJR19JRCxcblx0XHRcdGtleTogJ3VzZXJMb2NhbFZhbHVlJyxcblx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuY29uZmlndXJhdGlvbi51c2VyTG9jYWxWYWx1ZScsICdHbG9iYWwgaW4gezB9JywgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0b3JkZXI6IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuVXNlcixcblx0XHRcdHVyaTogbWNwUmVzb3VyY2UsXG5cdFx0XHRzZWN0aW9uOiBbXSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZW1vdGVNY3BDb25maWdQYXRoKG1jcFJlc291cmNlOiBVUkkpOiBJTWNwQ29uZmlnUGF0aCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBSRU1PVEVfVVNFUl9DT05GSUdfSUQsXG5cdFx0XHRrZXk6ICd1c2VyUmVtb3RlVmFsdWUnLFxuXHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFLFxuXHRcdFx0bGFiZWw6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChTY2hlbWFzLnZzY29kZVJlbW90ZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSA6ICdSZW1vdGUnLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0b3JkZXI6IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuVXNlciArIE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuUmVtb3RlQm9vc3QsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdHVyaTogbWNwUmVzb3VyY2UsXG5cdFx0XHRzZWN0aW9uOiBbXSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VNY3BDb25maWdQYXRoKG1jcFJlc291cmNlOiBVUkkpOiBJTWNwQ29uZmlnUGF0aCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGlmICh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiwgbWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogV09SS1NQQUNFX0NPTkZJR19JRCxcblx0XHRcdFx0a2V5OiAnd29ya3NwYWNlVmFsdWUnLFxuXHRcdFx0XHR0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFLFxuXHRcdFx0XHRsYWJlbDogYmFzZW5hbWUobWNwUmVzb3VyY2UpLFxuXHRcdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRSxcblx0XHRcdFx0b3JkZXI6IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuV29ya3NwYWNlLFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0dXJpOiBtY3BSZXNvdXJjZSxcblx0XHRcdFx0c2VjdGlvbjogWydzZXR0aW5ncycsIG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uXSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHdvcmtzcGFjZS5mb2xkZXJzO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB3b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gd29ya3NwYWNlRm9sZGVyc1tpbmRleF07XG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHdvcmtzcGFjZUZvbGRlci51cmksIFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TW01DUF9DT05GSUdVUkFUSU9OX0tFWV0pLCBtY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogYCR7V09SS1NQQUNFX0ZPTERFUl9DT05GSUdfSURfUFJFRklYfSR7aW5kZXh9YCxcblx0XHRcdFx0XHRrZXk6ICd3b3Jrc3BhY2VGb2xkZXJWYWx1ZScsXG5cdFx0XHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIsXG5cdFx0XHRcdFx0bGFiZWw6IGAke3dvcmtzcGFjZUZvbGRlci5uYW1lfS8udnNjb2RlL21jcC5qc29uYCxcblx0XHRcdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRvcmRlcjogTWNwQ29sbGVjdGlvblNvcnRPcmRlci5Xb3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHRcdFx0dXJpOiBtY3BSZXNvdXJjZSxcblx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh1cmkucGF0aCA9PT0gJ21jcC9pbnN0YWxsJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuaGFuZGxlTWNwSW5zdGFsbFVyaSh1cmkpO1xuXHRcdH1cblx0XHRpZiAodXJpLnBhdGguc3RhcnRzV2l0aCgnbWNwL2J5LW5hbWUvJykpIHtcblx0XHRcdGNvbnN0IG1jcFNlcnZlck5hbWUgPSB1cmkucGF0aC5zdWJzdHJpbmcoJ21jcC9ieS1uYW1lLycubGVuZ3RoKTtcblx0XHRcdGlmIChtY3BTZXJ2ZXJOYW1lKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmhhbmRsZU1jcFNlcnZlckJ5TmFtZShtY3BTZXJ2ZXJOYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHVyaS5wYXRoLnN0YXJ0c1dpdGgoJ21jcC8nKSkge1xuXHRcdFx0Y29uc3QgbWNwU2VydmVyVXJsID0gdXJpLnBhdGguc3Vic3RyaW5nKDQpO1xuXHRcdFx0aWYgKG1jcFNlcnZlclVybCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVNY3BTZXJ2ZXJVcmwoYCR7U2NoZW1hcy5odHRwc306Ly8ke21jcFNlcnZlclVybH1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVNY3BJbnN0YWxsVXJpKHVyaTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IHBhcnNlZDogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gJiB7IG5hbWU6IHN0cmluZzsgaW5wdXRzPzogSU1jcFNlcnZlclZhcmlhYmxlW10gfTtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQodXJpLnF1ZXJ5KSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IG5hbWUsIGlucHV0cywgLi4uY29uZmlnIH0gPSBwYXJzZWQ7XG5cblx0XHRcdC8vIFdoZW4gYSBnYWxsZXJ5IGZpZWxkIGlzIHByZXNlbnQgYW5kIHRoZSBnYWxsZXJ5IHNlcnZpY2UgaXMgYXZhaWxhYmxlLFxuXHRcdFx0Ly8gdmVyaWZ5IHRoZSBzZXJ2ZXIgZXhpc3RzIGluIHRoZSBhY3RpdmUgZ2FsbGVyeSBieSBuYW1lLiBJZiB2ZXJpZmllZCxcblx0XHRcdC8vIHJvdXRlIHRocm91Z2ggdGhlIGdhbGxlcnktb25seSBwYXRoIChtYXRjaGluZyBoYW5kbGVNY3BTZXJ2ZXJCeU5hbWUpLlxuXHRcdFx0aWYgKGNvbmZpZy5nYWxsZXJ5ICYmIHRoaXMubWNwR2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZWdpc3RyeUdlbmVyYXRpb24gPSB0aGlzLnJlZ2lzdHJ5R2VuZXJhdGlvbjtcblx0XHRcdFx0XHQvLyBWZXJpZnkgYnkgbmFtZSBhZ2FpbnN0IHRoZSBhY3RpdmUgZ2FsbGVyeSAobm90IGJ5IFVSTCwgd2hpY2ggd291bGRcblx0XHRcdFx0XHQvLyBtYWtlIG91dGJvdW5kIHJlcXVlc3RzIHRvIHVudHJ1c3RlZCBVUkxzIGZyb20gdGhlIHByb3RvY29sIHBheWxvYWQpLlxuXHRcdFx0XHRcdGNvbnN0IFtnYWxsZXJ5U2VydmVyXSA9IGF3YWl0IHRoaXMubWNwR2FsbGVyeVNlcnZpY2UuZ2V0TWNwU2VydmVyc0Zyb21HYWxsZXJ5KFt7IG5hbWUgfV0pO1xuXHRcdFx0XHRcdGlmIChnYWxsZXJ5U2VydmVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlbWVtYmVyR2FsbGVyeVNvdXJjZShnYWxsZXJ5U2VydmVyLCByZWdpc3RyeUdlbmVyYXRpb24pO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmxvY2FsLmZpbmQoZSA9PiBlLm5hbWUgPT09IGdhbGxlcnlTZXJ2ZXIubmFtZSkgPz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCB1bmRlZmluZWQsIGdhbGxlcnlTZXJ2ZXIsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW4obG9jYWwpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBNQ1Agc2VydmVyICcke25hbWV9JyBub3QgZm91bmQgaW4gZ2FsbGVyeSwgaW5zdGFsbGluZyBhcyBsb2NhbGApO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEdhbGxlcnkgdmVyaWZpY2F0aW9uIGZhaWxlZCBmb3IgTUNQIHNlcnZlciAnJHtuYW1lfScsIGluc3RhbGxpbmcgYXMgbG9jYWxgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29uZmlnLnR5cGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQoPE11dGFibGU8SU1jcFNlcnZlckNvbmZpZ3VyYXRpb24+PmNvbmZpZykudHlwZSA9ICg8SU1jcFN0ZGlvU2VydmVyQ29uZmlndXJhdGlvbj5wYXJzZWQpLmNvbW1hbmQgPyBNY3BTZXJ2ZXJUeXBlLkxPQ0FMIDogTWNwU2VydmVyVHlwZS5SRU1PVEU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm9wZW4odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBuYW1lLCBjb25maWcsIGlucHV0cyB9KSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gaWdub3JlXG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVNY3BTZXJ2ZXJVcmwodXJsOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeSA9IGF3YWl0IHRoaXMubWNwR2FsbGVyeVNlcnZpY2UuZ2V0TWNwU2VydmVyKHVybCk7XG5cdFx0XHRpZiAoIWdhbGxlcnkpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYE1DUCBzZXJ2ZXIgJyR7dXJsfScgbm90IGZvdW5kYCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmxvY2FsLmZpbmQoZSA9PiBlLm5hbWUgPT09IGdhbGxlcnkubmFtZSkgPz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCB1bmRlZmluZWQsIGdhbGxlcnksIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLm9wZW4obG9jYWwpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlTWNwU2VydmVyQnlOYW1lKG5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWdpc3RyeUdlbmVyYXRpb24gPSB0aGlzLnJlZ2lzdHJ5R2VuZXJhdGlvbjtcblx0XHRcdGNvbnN0IFtnYWxsZXJ5XSA9IGF3YWl0IHRoaXMubWNwR2FsbGVyeVNlcnZpY2UuZ2V0TWNwU2VydmVyc0Zyb21HYWxsZXJ5KFt7IG5hbWUgfV0pO1xuXHRcdFx0aWYgKCFnYWxsZXJ5KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBNQ1Agc2VydmVyICcke25hbWV9JyBub3QgZm91bmRgKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlbWVtYmVyR2FsbGVyeVNvdXJjZShnYWxsZXJ5LCByZWdpc3RyeUdlbmVyYXRpb24pO1xuXHRcdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmxvY2FsLmZpbmQoZSA9PiBlLm5hbWUgPT09IGdhbGxlcnkubmFtZSkgPz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCB1bmRlZmluZWQsIGdhbGxlcnksIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLm9wZW4obG9jYWwpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIG9wZW5TZWFyY2goc2VhcmNoVmFsdWU6IHN0cmluZywgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEBtY3AgJHtzZWFyY2hWYWx1ZX1gLCBwcmVzZXJ2ZUZvY3VzKTtcblx0fVxuXG5cdGFzeW5jIG9wZW4oZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyLCBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1c2VNb2RhbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2V4dGVuc2lvbnMuYWxsb3dPcGVuSW5Nb2RhbEVkaXRvcicpO1xuXHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2VydmVyRWRpdG9ySW5wdXQsIGV4dGVuc2lvbiksIG9wdGlvbnMsIHVzZU1vZGFsID8gTU9EQUxfR1JPVVAgOiBBQ1RJVkVfR1JPVVApO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJbnN0YWxsU3RhdGUoZXh0ZW5zaW9uOiBNY3BXb3JrYmVuY2hTZXJ2ZXIpOiBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUge1xuXHRcdGlmICh0aGlzLmluc3RhbGxpbmcuc29tZShpID0+IGkubmFtZSA9PT0gZXh0ZW5zaW9uLm5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxpbmc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnVuaW5zdGFsbGluZy5zb21lKGUgPT4gZS5uYW1lID09PSBleHRlbnNpb24ubmFtZSkpIHtcblx0XHRcdHJldHVybiBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuVW5pbnN0YWxsaW5nO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhbCA9IHRoaXMubG9jYWwuZmluZChlID0+IGUgPT09IGV4dGVuc2lvbik7XG5cdFx0cmV0dXJuIGxvY2FsID8gTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxlZCA6IE1jcFNlcnZlckluc3RhbGxTdGF0ZS5Vbmluc3RhbGxlZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UnVudGltZVN0YXR1cyhtY3BTZXJ2ZXI6IE1jcFdvcmtiZW5jaFNlcnZlcik6IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0dXMgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0dXMgPSB0aGlzLmdldEVuYWJsZW1lbnRTdGF0dXMobWNwU2VydmVyKTtcblxuXHRcdGlmIChlbmFibGVtZW50U3RhdHVzKSB7XG5cdFx0XHRyZXR1cm4gZW5hYmxlbWVudFN0YXR1cztcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBtY3BTZXJ2ZXIuaWQpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm4geyBzdGF0ZTogTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5hYmxlbWVudCA9IHNlcnZlci5lbmFibGVtZW50LmdldCgpO1xuXHRcdGlmIChlbmFibGVtZW50ID09PSBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGF0ZTogTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSxcblx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdHRleHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGlzYWJsZWQgZ2xvYmFsbHknLCBcIlRoaXMgTUNQIHNlcnZlciBpcyBkaXNhYmxlZC5cIikpXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChlbmFibGVtZW50ID09PSBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN0YXRlOiBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHR0ZXh0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Rpc2FibGVkIGluIHdvcmtzcGFjZScsIFwiVGhpcyBNQ1Agc2VydmVyIGlzIGRpc2FibGVkIGZvciB0aGlzIHdvcmtzcGFjZS5cIikpXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RW5hYmxlbWVudFN0YXR1cyhtY3BTZXJ2ZXI6IE1jcFdvcmtiZW5jaFNlcnZlcik6IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0dXMgfCB1bmRlZmluZWQge1xuXHRcdGlmICghbWNwU2VydmVyLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldHRpbmdzQ29tbWFuZExpbmsgPSBjcmVhdGVDb21tYW5kVXJpKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsIHsgcXVlcnk6IGBAaWQ6JHttY3BBY2Nlc3NDb25maWd9YCB9KS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFjY2Vzc1ZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShtY3BBY2Nlc3NDb25maWcpO1xuXG5cdFx0aWYgKGFjY2Vzc1ZhbHVlID09PSBNY3BBY2Nlc3NWYWx1ZS5Ob25lKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGF0ZTogTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlBY2Nlc3MsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHR0ZXh0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Rpc2FibGVkIC0gYWxsIG5vdCBhbGxvd2VkJywgXCJUaGlzIE1DUCBTZXJ2ZXIgaXMgZGlzYWJsZWQgYmVjYXVzZSBNQ1Agc2VydmVycyBhcmUgY29uZmlndXJlZCB0byBiZSBkaXNhYmxlZCBpbiB0aGUgRWRpdG9yLiBQbGVhc2UgY2hlY2sgeW91ciBbc2V0dGluZ3NdKHswfSkuXCIsIHNldHRpbmdzQ29tbWFuZExpbmspKVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0fVxuXG5cdFx0aWYgKGFjY2Vzc1ZhbHVlID09PSBNY3BBY2Nlc3NWYWx1ZS5SZWdpc3RyeSkge1xuXHRcdFx0aWYgKCFtY3BTZXJ2ZXIuZ2FsbGVyeSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXRlOiBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUFjY2Vzcyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdHRleHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGlzYWJsZWQgLSBzb21lIG5vdCBhbGxvd2VkJywgXCJUaGlzIE1DUCBTZXJ2ZXIgaXMgZGlzYWJsZWQgYmVjYXVzZSBpdCBpcyBjb25maWd1cmVkIHRvIGJlIGRpc2FibGVkIGluIHRoZSBFZGl0b3IuIFBsZWFzZSBjaGVjayB5b3VyIFtzZXR0aW5nc10oezB9KS5cIiwgc2V0dGluZ3NDb21tYW5kTGluaykpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWdpc3RyeSBtZW1iZXJzaGlwIGlzIG5hbWUtYmFzZWQgZm9yIGxvY2FsIGNvbmZpZ3VyYXRpb25zOyByZW1vdGUgVVJMcyBtdXN0IG1hdGNoIGV4YWN0bHkuXG5cdFx0XHRjb25zdCByZW1vdGVVcmwgPSBtY3BTZXJ2ZXIubG9jYWwuY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuUkVNT1RFICYmIG1jcFNlcnZlci5sb2NhbC5jb25maWcudXJsO1xuXHRcdFx0aWYgKHJlbW90ZVVybCAmJiAhbWNwU2VydmVyLmdhbGxlcnkuY29uZmlndXJhdGlvbi5yZW1vdGVzPy5zb21lKHJlbW90ZSA9PiByZW1vdGUudXJsID09PSByZW1vdGVVcmwpKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3RhdGU6IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5QWNjZXNzLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0dGV4dDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkaXNhYmxlZCAtIHNvbWUgbm90IGFsbG93ZWQnLCBcIlRoaXMgTUNQIFNlcnZlciBpcyBkaXNhYmxlZCBiZWNhdXNlIGl0IGlzIGNvbmZpZ3VyZWQgdG8gYmUgZGlzYWJsZWQgaW4gdGhlIEVkaXRvci4gUGxlYXNlIGNoZWNrIHlvdXIgW3NldHRpbmdzXSh7MH0pLlwiLCBzZXR0aW5nc0NvbW1hbmRMaW5rKSlcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBNQ1BDb250ZXh0c0luaXRpYWxpc2F0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyBJRCA9ICd3b3JrYmVuY2gubWNwLmNvbnRleHRzLmluaXRpYWxpc2F0aW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFdvcmtiZW5jaFNlcnZpY2UgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIG1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG1jcFNlcnZlcnNHYWxsZXJ5U3RhdHVzID0gTWNwU2VydmVyc0dhbGxlcnlTdGF0dXNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bWNwU2VydmVyc0dhbGxlcnlTdGF0dXMuc2V0KG1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UubWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzKHN0YXR1cyA9PiBtY3BTZXJ2ZXJzR2FsbGVyeVN0YXR1cy5zZXQoc3RhdHVzKSkpO1xuXG5cdFx0Y29uc3QgaGFzSW5zdGFsbGVkTWNwU2VydmVyc0NvbnRleHRLZXkgPSBIYXNJbnN0YWxsZWRNY3BTZXJ2ZXJzQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdG1jcFdvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCgpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aGFzSW5zdGFsbGVkTWNwU2VydmVyc0NvbnRleHRLZXkuc2V0KG1jcFdvcmtiZW5jaFNlcnZpY2UubG9jYWwubGVuZ3RoID4gMCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihtY3BXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKCgpID0+IGhhc0luc3RhbGxlZE1jcFNlcnZlcnNDb250ZXh0S2V5LnNldChtY3BXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmxlbmd0aCA+IDApKSk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBbUMsc0JBQXNCO0FBQ2xFLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQTRCLG9CQUEwRixpQkFBaUIsZ0JBQWdCLDJCQUEyRCwrQkFBK0I7QUFDalAsU0FBUyx5QkFBeUI7QUFDbEMsU0FBb0YscUJBQXFCO0FBQ3pHLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsdUJBQXVCLDJDQUEyQztBQUMzRSxTQUFTLGNBQWMsZ0JBQWdCLG1CQUFtQjtBQUMxRCxTQUFTLG9DQUFvQztBQUM3QyxTQUF3RSxnQ0FBb0cscUJBQXFCLHVCQUF1QixnQkFBZ0IscUJBQXFCLHlDQUF5QztBQUN0UyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLCtCQUErQyxhQUFhLHNCQUEyQyx3QkFBd0IsMEJBQTBCLHVCQUFrRCxzQ0FBc0M7QUFDMVAsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyw0QkFBNEI7QUFD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O0FBQUEsWUFDbkIsTUFBTSxJQUFJLGVBQWUsU0FBUywrQkFBK0IseUhBQXlILG1CQUFtQixDQUFDO0FBQUEsVUFDL007QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUdBLFlBQU0sWUFBWSxVQUFVLE1BQU0sT0FBTyxTQUFTLGNBQWMsVUFBVSxVQUFVLE1BQU0sT0FBTztBQUNqRyxVQUFJLGFBQWEsQ0FBQyxVQUFVLFFBQVEsY0FBYyxTQUFTLEtBQUssWUFBVSxPQUFPLFFBQVEsU0FBUyxHQUFHO0FBQ3BHLGVBQU87QUFBQSxVQUNOLE9BQU8seUJBQXlCO0FBQUEsVUFDaEMsU0FBUztBQUFBLFlBQ1IsVUFBVSxTQUFTO0FBQUEsWUFDbkIsTUFBTSxJQUFJLGVBQWUsU0FBUywrQkFBK0IseUhBQXlILG1CQUFtQixDQUFDO0FBQUEsVUFDL007QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUVEO0FBN3ZCYSxzQkFBTjtBQUFBLEVBd0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0ExQ1U7QUErdkJOLElBQU0sNEJBQU4sY0FBd0MsV0FBNkM7QUFBQSxFQUkzRixZQUN1QixxQkFDTSwyQkFDUixtQkFDbkI7QUFDRCxVQUFNO0FBRU4sVUFBTSwwQkFBMEIsK0JBQStCLE9BQU8saUJBQWlCO0FBQ3ZGLDRCQUF3QixJQUFJLDBCQUEwQix3QkFBd0I7QUFDOUUsU0FBSyxVQUFVLDBCQUEwQixvQ0FBb0MsWUFBVSx3QkFBd0IsSUFBSSxNQUFNLENBQUMsQ0FBQztBQUUzSCxVQUFNLG1DQUFtQyw4QkFBOEIsT0FBTyxpQkFBaUI7QUFDL0Ysd0JBQW9CLFdBQVcsRUFBRSxRQUFRLE1BQU07QUFDOUMsdUNBQWlDLElBQUksb0JBQW9CLE1BQU0sU0FBUyxDQUFDO0FBQ3pFLFdBQUssVUFBVSxvQkFBb0IsU0FBUyxNQUFNLGlDQUFpQyxJQUFJLG9CQUFvQixNQUFNLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUM5SCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBckJhLDBCQUVMLEtBQUs7QUFGQSw0QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbInNlcnZlciIsICJlIiwgImxvY2FsIl0KfQo=
