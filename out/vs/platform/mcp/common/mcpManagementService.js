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
import { RunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { equals } from "../../../base/common/objects.js";
import { isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ConfigurationTarget } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IMcpGalleryService, RegistryType, IAllowedMcpServersService } from "./mcpManagement.js";
import { McpServerVariableType, McpServerType } from "./mcpPlatformTypes.js";
import { IMcpResourceScannerService } from "./mcpResourceScannerService.js";
let AbstractCommonMcpManagementService = class extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
  }
  getMcpServerConfigurationFromManifest(manifest, packageType) {
    if (packageType === RegistryType.REMOTE && manifest.remotes?.length) {
      const url = manifest.remotes[0].url;
      const headers = manifest.remotes[0].headers ?? [];
      const { inputs: inputs2, variables } = this.processKeyValueInputs(url.startsWith("https://api.githubcopilot.com/mcp") ? headers.filter((h) => h.name.toLowerCase() !== "authorization") : headers);
      return {
        mcpServerConfiguration: {
          config: {
            type: McpServerType.REMOTE,
            url: manifest.remotes[0].url,
            headers: Object.keys(inputs2).length ? inputs2 : void 0
          },
          inputs: variables.length ? variables : void 0
        },
        notices: []
      };
    }
    const serverPackage = manifest.packages?.find((p) => p.registryType === packageType) ?? manifest.packages?.[0];
    if (!serverPackage) {
      throw new Error(`No server package found`);
    }
    const args = [];
    const inputs = [];
    const env = {};
    const notices = [];
    if (serverPackage.registryType === RegistryType.DOCKER) {
      args.push("run");
      args.push("-i");
      args.push("--rm");
    }
    if (serverPackage.runtimeArguments?.length) {
      const result = this.processArguments(serverPackage.runtimeArguments ?? []);
      args.push(...result.args);
      inputs.push(...result.variables);
      notices.push(...result.notices);
    }
    if (serverPackage.environmentVariables?.length) {
      const { inputs: envInputs, variables: envVariables, notices: envNotices } = this.processKeyValueInputs(serverPackage.environmentVariables ?? []);
      inputs.push(...envVariables);
      notices.push(...envNotices);
      for (const [name, value] of Object.entries(envInputs)) {
        env[name] = value;
        if (serverPackage.registryType === RegistryType.DOCKER) {
          args.push("-e");
          args.push(name);
        }
      }
    }
    switch (serverPackage.registryType) {
      case RegistryType.NODE:
        if (serverPackage.registryBaseUrl) {
          args.push("--registry", serverPackage.registryBaseUrl);
        }
        args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
        break;
      case RegistryType.PYTHON:
        if (serverPackage.registryBaseUrl) {
          args.push("--index-url", serverPackage.registryBaseUrl);
        }
        args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
        break;
      case RegistryType.DOCKER: {
        const dockerIdentifier = serverPackage.registryBaseUrl ? `${serverPackage.registryBaseUrl}/${serverPackage.identifier}` : serverPackage.identifier;
        args.push(serverPackage.version ? `${dockerIdentifier}:${serverPackage.version}` : dockerIdentifier);
        break;
      }
      case RegistryType.NUGET:
        args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
        args.push("--yes");
        if (serverPackage.registryBaseUrl) {
          args.push("--source", serverPackage.registryBaseUrl);
        }
        if (serverPackage.packageArguments?.length) {
          args.push("--");
        }
        break;
    }
    if (serverPackage.packageArguments?.length) {
      const result = this.processArguments(serverPackage.packageArguments);
      args.push(...result.args);
      inputs.push(...result.variables);
      notices.push(...result.notices);
    }
    return {
      notices,
      mcpServerConfiguration: {
        config: {
          type: McpServerType.LOCAL,
          command: this.getCommandName(serverPackage.registryType),
          args: args.length ? args : void 0,
          env: Object.keys(env).length ? env : void 0
        },
        inputs: inputs.length ? inputs : void 0
      }
    };
  }
  getCommandName(packageType) {
    switch (packageType) {
      case RegistryType.NODE:
        return "npx";
      case RegistryType.DOCKER:
        return "docker";
      case RegistryType.PYTHON:
        return "uvx";
      case RegistryType.NUGET:
        return "dnx";
    }
    return packageType;
  }
  getVariables(variableInputs) {
    const variables = [];
    for (const [key, value] of Object.entries(variableInputs)) {
      variables.push({
        id: key,
        type: value.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
        description: value.description ?? "",
        password: !!value.isSecret,
        default: value.default,
        options: value.choices
      });
    }
    return variables;
  }
  processKeyValueInputs(keyValueInputs) {
    const notices = [];
    const inputs = {};
    const variables = [];
    for (const input of keyValueInputs) {
      const inputVariables = input.variables ? this.getVariables(input.variables) : [];
      let value = input.value || "";
      if (inputVariables.length) {
        for (const variable of inputVariables) {
          value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
        }
        variables.push(...inputVariables);
      } else if (!value && (input.description || input.choices || input.default !== void 0)) {
        variables.push({
          id: input.name,
          type: input.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
          description: input.description ?? "",
          password: !!input.isSecret,
          default: input.default,
          options: input.choices
        });
        value = `\${input:${input.name}}`;
      }
      inputs[input.name] = value;
    }
    return { inputs, variables, notices };
  }
  processArguments(argumentsList) {
    const args = [];
    const variables = [];
    const notices = [];
    for (const arg of argumentsList) {
      const argVariables = arg.variables ? this.getVariables(arg.variables) : [];
      if (arg.type === "positional") {
        let value = arg.value;
        if (value) {
          for (const variable of argVariables) {
            value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
          }
          args.push(value);
          if (argVariables.length) {
            variables.push(...argVariables);
          }
        } else if (arg.valueHint && (arg.description || arg.default !== void 0)) {
          variables.push({
            id: arg.valueHint,
            type: McpServerVariableType.PROMPT,
            description: arg.description ?? "",
            password: false,
            default: arg.default
          });
          args.push(`\${input:${arg.valueHint}}`);
        } else {
          args.push(arg.valueHint ?? "");
        }
      } else if (arg.type === "named") {
        if (!arg.name) {
          notices.push(`Named argument is missing a name. ${JSON.stringify(arg)}`);
          continue;
        }
        args.push(arg.name);
        if (arg.value) {
          let value = arg.value;
          for (const variable of argVariables) {
            value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
          }
          args.push(value);
          if (argVariables.length) {
            variables.push(...argVariables);
          }
        } else if (arg.description || arg.default !== void 0) {
          const variableId = arg.name.replace(/^--?/, "");
          variables.push({
            id: variableId,
            type: McpServerVariableType.PROMPT,
            description: arg.description ?? "",
            password: false,
            default: arg.default
          });
          args.push(`\${input:${variableId}}`);
        }
      }
    }
    return { args, variables, notices };
  }
};
AbstractCommonMcpManagementService = __decorateClass([
  __decorateParam(0, ILogService)
], AbstractCommonMcpManagementService);
let AbstractMcpResourceManagementService = class extends AbstractCommonMcpManagementService {
  constructor(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService) {
    super(logService);
    this.mcpResource = mcpResource;
    this.target = target;
    this.mcpGalleryService = mcpGalleryService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.mcpResourceScannerService = mcpResourceScannerService;
    this.allowedMcpServersService = allowedMcpServersService;
    this.local = /* @__PURE__ */ new Map();
    this._onInstallMcpServer = this._register(new Emitter());
    this.onInstallMcpServer = this._onInstallMcpServer.event;
    this._onDidInstallMcpServers = this._register(new Emitter());
    this._onDidUpdateMcpServers = this._register(new Emitter());
    this._onUninstallMcpServer = this._register(new Emitter());
    this._onDidUninstallMcpServer = this._register(new Emitter());
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.updateLocal(), 50));
  }
  get onDidInstallMcpServers() {
    return this._onDidInstallMcpServers.event;
  }
  get onDidUpdateMcpServers() {
    return this._onDidUpdateMcpServers.event;
  }
  get onUninstallMcpServer() {
    return this._onUninstallMcpServer.event;
  }
  get onDidUninstallMcpServer() {
    return this._onDidUninstallMcpServer.event;
  }
  /**
   * Enforces the enterprise allow/deny policy at the point of persistence. Called by every
   * install path (installable and each gallery override) against the fully resolved server
   * configuration, so a caller that goes straight to the management API cannot bypass the
   * `canInstall` UI check, and a gallery entry cannot slip through if its resolved command/URL
   * differs from the pre-resolution metadata.
   */
  ensureServerAllowed(server) {
    const result = this.allowedMcpServersService.isAllowed(server);
    if (result !== true) {
      throw new Error(result.value);
    }
  }
  initialize() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        try {
          this.local = await this.populateLocalServers();
        } finally {
          this.startWatching();
        }
      })();
    }
    return this.initializePromise;
  }
  async populateLocalServers() {
    this.logService.trace("AbstractMcpResourceManagementService#populateLocalServers", this.mcpResource.toString());
    const local = /* @__PURE__ */ new Map();
    try {
      const scannedMcpServers = await this.mcpResourceScannerService.scanMcpServers(this.mcpResource, this.target);
      if (scannedMcpServers.servers) {
        await Promise.allSettled(Object.entries(scannedMcpServers.servers).map(async ([name, scannedServer]) => {
          const server = await this.scanLocalServer(name, scannedServer, scannedMcpServers.sandbox);
          local.set(name, server);
        }));
      }
    } catch (error) {
      this.logService.debug("Could not read user MCP servers:", error);
      throw error;
    }
    return local;
  }
  startWatching() {
    this._register(this.fileService.watch(this.mcpResource));
    this._register(this.fileService.onDidFilesChange((e) => {
      if (e.affects(this.mcpResource)) {
        this.reloadConfigurationScheduler.schedule();
      }
    }));
  }
  async updateLocal(source) {
    try {
      const current = await this.populateLocalServers();
      const added = [];
      const updated = [];
      const removed = [...this.local.keys()].filter((name) => !current.has(name));
      for (const server of removed) {
        this.local.delete(server);
      }
      for (const [name, server] of current) {
        const previous = this.local.get(name);
        if (previous) {
          if (!equals(previous, server)) {
            updated.push(server);
            this.local.set(name, server);
          }
        } else {
          added.push(server);
          this.local.set(name, server);
        }
      }
      for (const server of removed) {
        this.local.delete(server);
        this._onDidUninstallMcpServer.fire({ name: server, mcpResource: this.mcpResource });
      }
      if (updated.length) {
        this._onDidUpdateMcpServers.fire(updated.map((server) => ({ name: server.name, local: server, source: source?.name === server.name ? source : void 0, mcpResource: this.mcpResource })));
      }
      if (added.length) {
        this._onDidInstallMcpServers.fire(added.map((server) => ({ name: server.name, local: server, source: source?.name === server.name ? source : void 0, mcpResource: this.mcpResource })));
      }
    } catch (error) {
      this.logService.error("Failed to load installed MCP servers:", error);
    }
  }
  async getInstalled() {
    await this.initialize();
    return Array.from(this.local.values());
  }
  async scanLocalServer(name, config, rootSandbox) {
    let mcpServerInfo = await this.getLocalServerInfo(name, config);
    if (!mcpServerInfo) {
      mcpServerInfo = { name, version: config.version, galleryUrl: isString(config.gallery) ? config.gallery : void 0 };
    }
    return {
      name,
      config,
      rootSandbox,
      mcpResource: this.mcpResource,
      version: mcpServerInfo.version,
      location: mcpServerInfo.location,
      displayName: mcpServerInfo.displayName,
      description: mcpServerInfo.description,
      publisher: mcpServerInfo.publisher,
      publisherDisplayName: mcpServerInfo.publisherDisplayName,
      galleryUrl: mcpServerInfo.galleryUrl,
      galleryId: mcpServerInfo.galleryId,
      repositoryUrl: mcpServerInfo.repositoryUrl,
      readmeUrl: mcpServerInfo.readmeUrl,
      icon: mcpServerInfo.icon,
      codicon: mcpServerInfo.codicon,
      manifest: mcpServerInfo.manifest,
      source: config.gallery ? "gallery" : "local"
    };
  }
  async install(server, options) {
    this.logService.trace("MCP Management Service: install", server.name);
    this.ensureServerAllowed(server);
    this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
    try {
      await this.mcpResourceScannerService.addMcpServers([server], this.mcpResource, this.target);
      await this.updateLocal();
      const local = this.local.get(server.name);
      if (!local) {
        throw new Error(`Failed to install MCP server: ${server.name}`);
      }
      return local;
    } catch (e) {
      this._onDidInstallMcpServers.fire([{ name: server.name, error: e, mcpResource: this.mcpResource }]);
      throw e;
    }
  }
  async uninstall(server, options) {
    this.logService.trace("MCP Management Service: uninstall", server.name);
    this._onUninstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
    try {
      const currentServers = await this.mcpResourceScannerService.scanMcpServers(this.mcpResource, this.target);
      if (!currentServers.servers) {
        return;
      }
      await this.mcpResourceScannerService.removeMcpServers([server.name], this.mcpResource, this.target);
      if (server.location) {
        await this.fileService.del(URI.revive(server.location), { recursive: true });
      }
      await this.updateLocal();
    } catch (e) {
      this._onDidUninstallMcpServer.fire({ name: server.name, error: e, mcpResource: this.mcpResource });
      throw e;
    }
  }
};
AbstractMcpResourceManagementService = __decorateClass([
  __decorateParam(2, IMcpGalleryService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IMcpResourceScannerService),
  __decorateParam(7, IAllowedMcpServersService)
], AbstractMcpResourceManagementService);
let McpUserResourceManagementService = class extends AbstractMcpResourceManagementService {
  constructor(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService, environmentService) {
    super(mcpResource, ConfigurationTarget.USER, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService);
    this.mcpLocation = uriIdentityService.extUri.joinPath(environmentService.userRoamingDataHome, "mcp");
  }
  async installFromGallery(server, options) {
    throw new Error("Not supported");
  }
  async updateMetadata(local, gallery) {
    await this.updateMetadataFromGallery(gallery);
    await this.updateLocal(gallery);
    const updatedLocal = (await this.getInstalled()).find((s) => s.name === local.name);
    if (!updatedLocal) {
      throw new Error(`Failed to find MCP server: ${local.name}`);
    }
    return updatedLocal;
  }
  async updateMetadataFromGallery(gallery) {
    const manifest = gallery.configuration;
    const location = this.getLocation(gallery.name, gallery.version);
    const manifestPath = this.uriIdentityService.extUri.joinPath(location, "manifest.json");
    const local = {
      galleryUrl: gallery.galleryUrl,
      galleryId: gallery.id,
      name: gallery.name,
      displayName: gallery.displayName,
      description: gallery.description,
      version: gallery.version,
      publisher: gallery.publisher,
      publisherDisplayName: gallery.publisherDisplayName,
      repositoryUrl: gallery.repositoryUrl,
      licenseUrl: gallery.license,
      icon: gallery.icon,
      codicon: gallery.codicon,
      manifest
    };
    await this.fileService.writeFile(manifestPath, VSBuffer.fromString(JSON.stringify(local)));
    if (gallery.readmeUrl || gallery.readme) {
      const readme = gallery.readme ? gallery.readme : await this.mcpGalleryService.getReadme(gallery, CancellationToken.None);
      await this.fileService.writeFile(this.uriIdentityService.extUri.joinPath(location, "README.md"), VSBuffer.fromString(readme));
    }
    return manifest;
  }
  async getLocalServerInfo(name, mcpServerConfig) {
    let storedMcpServerInfo;
    let location;
    let readmeUrl;
    if (mcpServerConfig.gallery) {
      location = this.getLocation(name, mcpServerConfig.version);
      const manifestLocation = this.uriIdentityService.extUri.joinPath(location, "manifest.json");
      try {
        const content = await this.fileService.readFile(manifestLocation);
        storedMcpServerInfo = JSON.parse(content.value.toString());
        if (storedMcpServerInfo.galleryUrl?.includes("/v0/")) {
          storedMcpServerInfo.galleryUrl = storedMcpServerInfo.galleryUrl.substring(0, storedMcpServerInfo.galleryUrl.indexOf("/v0/"));
          await this.fileService.writeFile(manifestLocation, VSBuffer.fromString(JSON.stringify(storedMcpServerInfo)));
        }
        storedMcpServerInfo.location = location;
        readmeUrl = this.uriIdentityService.extUri.joinPath(location, "README.md");
        if (!await this.fileService.exists(readmeUrl)) {
          readmeUrl = void 0;
        }
        storedMcpServerInfo.readmeUrl = readmeUrl;
      } catch (e) {
        if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND) {
          this.logService.trace("MCP Management Service: manifest not found", manifestLocation.toString());
        } else {
          this.logService.error("MCP Management Service: failed to read manifest", location.toString(), e);
        }
      }
    }
    return storedMcpServerInfo;
  }
  getLocation(name, version) {
    name = name.replace("/", ".");
    return this.uriIdentityService.extUri.joinPath(this.mcpLocation, version ? `${name}-${version}` : name);
  }
  installFromUri(uri, options) {
    throw new Error("Method not supported.");
  }
  canInstall() {
    throw new Error("Not supported");
  }
};
McpUserResourceManagementService = __decorateClass([
  __decorateParam(1, IMcpGalleryService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IMcpResourceScannerService),
  __decorateParam(6, IAllowedMcpServersService),
  __decorateParam(7, IEnvironmentService)
], McpUserResourceManagementService);
let AbstractMcpManagementService = class extends AbstractCommonMcpManagementService {
  constructor(allowedMcpServersService, logService) {
    super(logService);
    this.allowedMcpServersService = allowedMcpServersService;
  }
  canInstall(server) {
    const allowedToInstall = this.allowedMcpServersService.isAllowed(server);
    if (allowedToInstall !== true) {
      return new MarkdownString(localize("not allowed to install", "This mcp server cannot be installed because {0}", allowedToInstall.value));
    }
    return true;
  }
};
AbstractMcpManagementService = __decorateClass([
  __decorateParam(0, IAllowedMcpServersService),
  __decorateParam(1, ILogService)
], AbstractMcpManagementService);
let McpManagementService = class extends AbstractMcpManagementService {
  constructor(allowedMcpServersService, logService, userDataProfilesService, instantiationService) {
    super(allowedMcpServersService, logService);
    this.userDataProfilesService = userDataProfilesService;
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
    this.mcpResourceManagementServices = new ResourceMap();
  }
  getMcpResourceManagementService(mcpResource) {
    let mcpResourceManagementService = this.mcpResourceManagementServices.get(mcpResource);
    if (!mcpResourceManagementService) {
      const disposables = new DisposableStore();
      const service = disposables.add(this.createMcpResourceManagementService(mcpResource));
      disposables.add(service.onInstallMcpServer((e) => this._onInstallMcpServer.fire(e)));
      disposables.add(service.onDidInstallMcpServers((e) => this._onDidInstallMcpServers.fire(e)));
      disposables.add(service.onDidUpdateMcpServers((e) => this._onDidUpdateMcpServers.fire(e)));
      disposables.add(service.onUninstallMcpServer((e) => this._onUninstallMcpServer.fire(e)));
      disposables.add(service.onDidUninstallMcpServer((e) => this._onDidUninstallMcpServer.fire(e)));
      this.mcpResourceManagementServices.set(mcpResource, mcpResourceManagementService = { service, dispose: () => disposables.dispose() });
    }
    return mcpResourceManagementService.service;
  }
  async getInstalled(mcpResource) {
    const mcpResourceUri = mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).getInstalled();
  }
  async install(server, options) {
    const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).install(server, options);
  }
  async uninstall(server, options) {
    const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).uninstall(server, options);
  }
  async installFromGallery(server, options) {
    const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).installFromGallery(server, options);
  }
  async updateMetadata(local, gallery, mcpResource) {
    return this.getMcpResourceManagementService(mcpResource || this.userDataProfilesService.defaultProfile.mcpResource).updateMetadata(local, gallery);
  }
  dispose() {
    this.mcpResourceManagementServices.forEach((service) => service.dispose());
    this.mcpResourceManagementServices.clear();
    super.dispose();
  }
  createMcpResourceManagementService(mcpResource) {
    return this.instantiationService.createInstance(McpUserResourceManagementService, mcpResource);
  }
};
McpManagementService = __decorateClass([
  __decorateParam(0, IAllowedMcpServersService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IInstantiationService)
], McpManagementService);
export {
  AbstractCommonMcpManagementService,
  AbstractMcpManagementService,
  AbstractMcpResourceManagementService,
  McpManagementService,
  McpUserResourceManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFxjb21tb25cXG1jcE1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50LCBJR2FsbGVyeU1jcFNlcnZlciwgSUxvY2FsTWNwU2VydmVyLCBJTWNwR2FsbGVyeVNlcnZpY2UsIElNY3BNYW5hZ2VtZW50U2VydmljZSwgSU1jcFNlcnZlcklucHV0LCBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIEluc3RhbGxNY3BTZXJ2ZXJFdmVudCwgSW5zdGFsbE1jcFNlcnZlclJlc3VsdCwgUmVnaXN0cnlUeXBlLCBVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudCwgSW5zdGFsbE9wdGlvbnMsIFVuaW5zdGFsbE9wdGlvbnMsIElJbnN0YWxsYWJsZU1jcFNlcnZlciwgSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgSU1jcFNlcnZlckFyZ3VtZW50LCBJTWNwU2VydmVyS2V5VmFsdWVJbnB1dCwgTWNwU2VydmVyQ29uZmlndXJhdGlvblBhcnNlUmVzdWx0IH0gZnJvbSAnLi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiwgSU1jcFNlcnZlclZhcmlhYmxlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUsIElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uLCBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLCBNY3BSZXNvdXJjZVRhcmdldCB9IGZyb20gJy4vbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvY2FsTWNwU2VydmVySW5mbyB7XG5cdG5hbWU6IHN0cmluZztcblx0dmVyc2lvbj86IHN0cmluZztcblx0ZGlzcGxheU5hbWU/OiBzdHJpbmc7XG5cdGdhbGxlcnlJZD86IHN0cmluZztcblx0Z2FsbGVyeVVybD86IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlcG9zaXRvcnlVcmw/OiBzdHJpbmc7XG5cdHB1Ymxpc2hlcj86IHN0cmluZztcblx0cHVibGlzaGVyRGlzcGxheU5hbWU/OiBzdHJpbmc7XG5cdGljb24/OiB7XG5cdFx0ZGFyazogc3RyaW5nO1xuXHRcdGxpZ2h0OiBzdHJpbmc7XG5cdH07XG5cdGNvZGljb24/OiBzdHJpbmc7XG5cdG1hbmlmZXN0PzogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uO1xuXHRyZWFkbWVVcmw/OiBVUkk7XG5cdGxvY2F0aW9uPzogVVJJO1xuXHRsaWNlbnNlVXJsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDb21tb25NY3BNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRhYnN0cmFjdCBvbkluc3RhbGxNY3BTZXJ2ZXI6IEV2ZW50PEluc3RhbGxNY3BTZXJ2ZXJFdmVudD47XG5cdGFic3RyYWN0IG9uRGlkSW5zdGFsbE1jcFNlcnZlcnM6IEV2ZW50PHJlYWRvbmx5IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT47XG5cdGFic3RyYWN0IG9uRGlkVXBkYXRlTWNwU2VydmVyczogRXZlbnQ8cmVhZG9ubHkgSW5zdGFsbE1jcFNlcnZlclJlc3VsdFtdPjtcblx0YWJzdHJhY3Qgb25Vbmluc3RhbGxNY3BTZXJ2ZXI6IEV2ZW50PFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50Pjtcblx0YWJzdHJhY3Qgb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXI6IEV2ZW50PERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50PjtcblxuXHRhYnN0cmFjdCBnZXRJbnN0YWxsZWQobWNwUmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcltdPjtcblx0YWJzdHJhY3QgaW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+O1xuXHRhYnN0cmFjdCBpbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+O1xuXHRhYnN0cmFjdCB1cGRhdGVNZXRhZGF0YShsb2NhbDogSUxvY2FsTWNwU2VydmVyLCBzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBwcm9maWxlTG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj47XG5cdGFic3RyYWN0IHVuaW5zdGFsbChzZXJ2ZXI6IElMb2NhbE1jcFNlcnZlciwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBjYW5JbnN0YWxsKHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIgfCBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIpOiB0cnVlIHwgSU1hcmtkb3duU3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiwgcGFja2FnZVR5cGU6IFJlZ2lzdHJ5VHlwZSk6IE1jcFNlcnZlckNvbmZpZ3VyYXRpb25QYXJzZVJlc3VsdCB7XG5cblx0XHQvLyByZW1vdGVcblx0XHRpZiAocGFja2FnZVR5cGUgPT09IFJlZ2lzdHJ5VHlwZS5SRU1PVEUgJiYgbWFuaWZlc3QucmVtb3Rlcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB1cmwgPSBtYW5pZmVzdC5yZW1vdGVzWzBdLnVybDtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBtYW5pZmVzdC5yZW1vdGVzWzBdLmhlYWRlcnMgPz8gW107XG5cdFx0XHRjb25zdCB7IGlucHV0cywgdmFyaWFibGVzIH0gPSB0aGlzLnByb2Nlc3NLZXlWYWx1ZUlucHV0cyh1cmwuc3RhcnRzV2l0aCgnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwJykgPyBoZWFkZXJzLmZpbHRlcihoID0+IGgubmFtZS50b0xvd2VyQ2FzZSgpICE9PSAnYXV0aG9yaXphdGlvbicpIDogaGVhZGVycyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtY3BTZXJ2ZXJDb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSxcblx0XHRcdFx0XHRcdHVybDogbWFuaWZlc3QucmVtb3Rlc1swXS51cmwsXG5cdFx0XHRcdFx0XHRoZWFkZXJzOiBPYmplY3Qua2V5cyhpbnB1dHMpLmxlbmd0aCA/IGlucHV0cyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGlucHV0czogdmFyaWFibGVzLmxlbmd0aCA/IHZhcmlhYmxlcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0bm90aWNlczogW10sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIGxvY2FsXG5cdFx0Y29uc3Qgc2VydmVyUGFja2FnZSA9IG1hbmlmZXN0LnBhY2thZ2VzPy5maW5kKHAgPT4gcC5yZWdpc3RyeVR5cGUgPT09IHBhY2thZ2VUeXBlKSA/PyBtYW5pZmVzdC5wYWNrYWdlcz8uWzBdO1xuXHRcdGlmICghc2VydmVyUGFja2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBzZXJ2ZXIgcGFja2FnZSBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaW5wdXRzOiBJTWNwU2VydmVyVmFyaWFibGVbXSA9IFtdO1xuXHRcdGNvbnN0IGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGNvbnN0IG5vdGljZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAoc2VydmVyUGFja2FnZS5yZWdpc3RyeVR5cGUgPT09IFJlZ2lzdHJ5VHlwZS5ET0NLRVIpIHtcblx0XHRcdGFyZ3MucHVzaCgncnVuJyk7XG5cdFx0XHRhcmdzLnB1c2goJy1pJyk7XG5cdFx0XHRhcmdzLnB1c2goJy0tcm0nKTtcblx0XHR9XG5cblx0XHRpZiAoc2VydmVyUGFja2FnZS5ydW50aW1lQXJndW1lbnRzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMucHJvY2Vzc0FyZ3VtZW50cyhzZXJ2ZXJQYWNrYWdlLnJ1bnRpbWVBcmd1bWVudHMgPz8gW10pO1xuXHRcdFx0YXJncy5wdXNoKC4uLnJlc3VsdC5hcmdzKTtcblx0XHRcdGlucHV0cy5wdXNoKC4uLnJlc3VsdC52YXJpYWJsZXMpO1xuXHRcdFx0bm90aWNlcy5wdXNoKC4uLnJlc3VsdC5ub3RpY2VzKTtcblx0XHR9XG5cblx0XHRpZiAoc2VydmVyUGFja2FnZS5lbnZpcm9ubWVudFZhcmlhYmxlcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB7IGlucHV0czogZW52SW5wdXRzLCB2YXJpYWJsZXM6IGVudlZhcmlhYmxlcywgbm90aWNlczogZW52Tm90aWNlcyB9ID0gdGhpcy5wcm9jZXNzS2V5VmFsdWVJbnB1dHMoc2VydmVyUGFja2FnZS5lbnZpcm9ubWVudFZhcmlhYmxlcyA/PyBbXSk7XG5cdFx0XHRpbnB1dHMucHVzaCguLi5lbnZWYXJpYWJsZXMpO1xuXHRcdFx0bm90aWNlcy5wdXNoKC4uLmVudk5vdGljZXMpO1xuXHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGVudklucHV0cykpIHtcblx0XHRcdFx0ZW52W25hbWVdID0gdmFsdWU7XG5cdFx0XHRcdGlmIChzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5VHlwZSA9PT0gUmVnaXN0cnlUeXBlLkRPQ0tFUikge1xuXHRcdFx0XHRcdGFyZ3MucHVzaCgnLWUnKTtcblx0XHRcdFx0XHRhcmdzLnB1c2gobmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRzd2l0Y2ggKHNlcnZlclBhY2thZ2UucmVnaXN0cnlUeXBlKSB7XG5cdFx0XHRjYXNlIFJlZ2lzdHJ5VHlwZS5OT0RFOlxuXHRcdFx0XHRpZiAoc2VydmVyUGFja2FnZS5yZWdpc3RyeUJhc2VVcmwpIHtcblx0XHRcdFx0XHRhcmdzLnB1c2goJy0tcmVnaXN0cnknLCBzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXJncy5wdXNoKHNlcnZlclBhY2thZ2UudmVyc2lvbiA/IGAke3NlcnZlclBhY2thZ2UuaWRlbnRpZmllcn1AJHtzZXJ2ZXJQYWNrYWdlLnZlcnNpb259YCA6IHNlcnZlclBhY2thZ2UuaWRlbnRpZmllcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSZWdpc3RyeVR5cGUuUFlUSE9OOlxuXHRcdFx0XHRpZiAoc2VydmVyUGFja2FnZS5yZWdpc3RyeUJhc2VVcmwpIHtcblx0XHRcdFx0XHRhcmdzLnB1c2goJy0taW5kZXgtdXJsJywgc2VydmVyUGFja2FnZS5yZWdpc3RyeUJhc2VVcmwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFyZ3MucHVzaChzZXJ2ZXJQYWNrYWdlLnZlcnNpb24gPyBgJHtzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXJ9QCR7c2VydmVyUGFja2FnZS52ZXJzaW9ufWAgOiBzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmVnaXN0cnlUeXBlLkRPQ0tFUjpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IGRvY2tlcklkZW50aWZpZXIgPSBzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybFxuXHRcdFx0XHRcdFx0PyBgJHtzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybH0vJHtzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXJ9YFxuXHRcdFx0XHRcdFx0OiBzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXI7XG5cdFx0XHRcdFx0YXJncy5wdXNoKHNlcnZlclBhY2thZ2UudmVyc2lvbiA/IGAke2RvY2tlcklkZW50aWZpZXJ9OiR7c2VydmVyUGFja2FnZS52ZXJzaW9ufWAgOiBkb2NrZXJJZGVudGlmaWVyKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBSZWdpc3RyeVR5cGUuTlVHRVQ6XG5cdFx0XHRcdGFyZ3MucHVzaChzZXJ2ZXJQYWNrYWdlLnZlcnNpb24gPyBgJHtzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXJ9QCR7c2VydmVyUGFja2FnZS52ZXJzaW9ufWAgOiBzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRhcmdzLnB1c2goJy0teWVzJyk7IC8vIGluc3RhbGxhdGlvbiBpcyBjb25maXJtZWQgYnkgdGhlIFVJLCBzbyAtLXllcyBpcyBhcHByb3ByaWF0ZSBoZXJlXG5cdFx0XHRcdGlmIChzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybCkge1xuXHRcdFx0XHRcdGFyZ3MucHVzaCgnLS1zb3VyY2UnLCBzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlcnZlclBhY2thZ2UucGFja2FnZUFyZ3VtZW50cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXJncy5wdXNoKCctLScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXJQYWNrYWdlLnBhY2thZ2VBcmd1bWVudHM/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5wcm9jZXNzQXJndW1lbnRzKHNlcnZlclBhY2thZ2UucGFja2FnZUFyZ3VtZW50cyk7XG5cdFx0XHRhcmdzLnB1c2goLi4ucmVzdWx0LmFyZ3MpO1xuXHRcdFx0aW5wdXRzLnB1c2goLi4ucmVzdWx0LnZhcmlhYmxlcyk7XG5cdFx0XHRub3RpY2VzLnB1c2goLi4ucmVzdWx0Lm5vdGljZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRub3RpY2VzLFxuXHRcdFx0bWNwU2VydmVyQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHRoaXMuZ2V0Q29tbWFuZE5hbWUoc2VydmVyUGFja2FnZS5yZWdpc3RyeVR5cGUpLFxuXHRcdFx0XHRcdGFyZ3M6IGFyZ3MubGVuZ3RoID8gYXJncyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlbnY6IE9iamVjdC5rZXlzKGVudikubGVuZ3RoID8gZW52IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnB1dHM6IGlucHV0cy5sZW5ndGggPyBpbnB1dHMgOiB1bmRlZmluZWQsXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDb21tYW5kTmFtZShwYWNrYWdlVHlwZTogUmVnaXN0cnlUeXBlKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHBhY2thZ2VUeXBlKSB7XG5cdFx0XHRjYXNlIFJlZ2lzdHJ5VHlwZS5OT0RFOiByZXR1cm4gJ25weCc7XG5cdFx0XHRjYXNlIFJlZ2lzdHJ5VHlwZS5ET0NLRVI6IHJldHVybiAnZG9ja2VyJztcblx0XHRcdGNhc2UgUmVnaXN0cnlUeXBlLlBZVEhPTjogcmV0dXJuICd1dngnO1xuXHRcdFx0Y2FzZSBSZWdpc3RyeVR5cGUuTlVHRVQ6IHJldHVybiAnZG54Jztcblx0XHR9XG5cdFx0cmV0dXJuIHBhY2thZ2VUeXBlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFZhcmlhYmxlcyh2YXJpYWJsZUlucHV0czogUmVjb3JkPHN0cmluZywgSU1jcFNlcnZlcklucHV0Pik6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdIHtcblx0XHRjb25zdCB2YXJpYWJsZXM6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModmFyaWFibGVJbnB1dHMpKSB7XG5cdFx0XHR2YXJpYWJsZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBrZXksXG5cdFx0XHRcdHR5cGU6IHZhbHVlLmNob2ljZXMgPyBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUElDSyA6IE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB2YWx1ZS5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0cGFzc3dvcmQ6ICEhdmFsdWUuaXNTZWNyZXQsXG5cdFx0XHRcdGRlZmF1bHQ6IHZhbHVlLmRlZmF1bHQsXG5cdFx0XHRcdG9wdGlvbnM6IHZhbHVlLmNob2ljZXMsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhcmlhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc0tleVZhbHVlSW5wdXRzKGtleVZhbHVlSW5wdXRzOiBSZWFkb25seUFycmF5PElNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0Pik6IHsgaW5wdXRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyB2YXJpYWJsZXM6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdOyBub3RpY2VzOiBzdHJpbmdbXSB9IHtcblx0XHRjb25zdCBub3RpY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGlucHV0czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGNvbnN0IHZhcmlhYmxlczogSU1jcFNlcnZlclZhcmlhYmxlW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaW5wdXQgb2Yga2V5VmFsdWVJbnB1dHMpIHtcblx0XHRcdGNvbnN0IGlucHV0VmFyaWFibGVzID0gaW5wdXQudmFyaWFibGVzID8gdGhpcy5nZXRWYXJpYWJsZXMoaW5wdXQudmFyaWFibGVzKSA6IFtdO1xuXHRcdFx0bGV0IHZhbHVlID0gaW5wdXQudmFsdWUgfHwgJyc7XG5cblx0XHRcdC8vIElmIGV4cGxpY2l0IHZhcmlhYmxlcyBleGlzdCwgdXNlIHRoZW0gcmVnYXJkbGVzcyBvZiB2YWx1ZVxuXHRcdFx0aWYgKGlucHV0VmFyaWFibGVzLmxlbmd0aCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGlucHV0VmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKGB7JHt2YXJpYWJsZS5pZH19YCwgYFxcJHtpbnB1dDoke3ZhcmlhYmxlLmlkfX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2YXJpYWJsZXMucHVzaCguLi5pbnB1dFZhcmlhYmxlcyk7XG5cdFx0XHR9IGVsc2UgaWYgKCF2YWx1ZSAmJiAoaW5wdXQuZGVzY3JpcHRpb24gfHwgaW5wdXQuY2hvaWNlcyB8fCBpbnB1dC5kZWZhdWx0ICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdC8vIE9ubHkgY3JlYXRlIGF1dG8tZ2VuZXJhdGVkIGlucHV0IHZhcmlhYmxlIGlmIG5vIGV4cGxpY2l0IHZhcmlhYmxlcyBhbmQgbm8gdmFsdWVcblx0XHRcdFx0dmFyaWFibGVzLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBpbnB1dC5uYW1lLFxuXHRcdFx0XHRcdHR5cGU6IGlucHV0LmNob2ljZXMgPyBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUElDSyA6IE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGlucHV0LmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHRcdHBhc3N3b3JkOiAhIWlucHV0LmlzU2VjcmV0LFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGlucHV0LmRlZmF1bHQsXG5cdFx0XHRcdFx0b3B0aW9uczogaW5wdXQuY2hvaWNlcyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHZhbHVlID0gYFxcJHtpbnB1dDoke2lucHV0Lm5hbWV9fWA7XG5cdFx0XHR9XG5cblx0XHRcdGlucHV0c1tpbnB1dC5uYW1lXSA9IHZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGlucHV0cywgdmFyaWFibGVzLCBub3RpY2VzIH07XG5cdH1cblxuXHRwcml2YXRlIHByb2Nlc3NBcmd1bWVudHMoYXJndW1lbnRzTGlzdDogcmVhZG9ubHkgSU1jcFNlcnZlckFyZ3VtZW50W10pOiB7IGFyZ3M6IHN0cmluZ1tdOyB2YXJpYWJsZXM6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdOyBub3RpY2VzOiBzdHJpbmdbXSB9IHtcblx0XHRjb25zdCBhcmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHZhcmlhYmxlczogSU1jcFNlcnZlclZhcmlhYmxlW10gPSBbXTtcblx0XHRjb25zdCBub3RpY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYXJnIG9mIGFyZ3VtZW50c0xpc3QpIHtcblx0XHRcdGNvbnN0IGFyZ1ZhcmlhYmxlcyA9IGFyZy52YXJpYWJsZXMgPyB0aGlzLmdldFZhcmlhYmxlcyhhcmcudmFyaWFibGVzKSA6IFtdO1xuXG5cdFx0XHRpZiAoYXJnLnR5cGUgPT09ICdwb3NpdGlvbmFsJykge1xuXHRcdFx0XHRsZXQgdmFsdWUgPSBhcmcudmFsdWU7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgYXJnVmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoYHske3ZhcmlhYmxlLmlkfX1gLCBgXFwke2lucHV0OiR7dmFyaWFibGUuaWR9fWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhcmdzLnB1c2godmFsdWUpO1xuXHRcdFx0XHRcdGlmIChhcmdWYXJpYWJsZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR2YXJpYWJsZXMucHVzaCguLi5hcmdWYXJpYWJsZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChhcmcudmFsdWVIaW50ICYmIChhcmcuZGVzY3JpcHRpb24gfHwgYXJnLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHQvLyBDcmVhdGUgaW5wdXQgdmFyaWFibGUgZm9yIHBvc2l0aW9uYWwgYXJndW1lbnQgd2l0aG91dCB2YWx1ZVxuXHRcdFx0XHRcdHZhcmlhYmxlcy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiBhcmcudmFsdWVIaW50LFxuXHRcdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVmFyaWFibGVUeXBlLlBST01QVCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBhcmcuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0XHRwYXNzd29yZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBhcmcuZGVmYXVsdCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhcmdzLnB1c2goYFxcJHtpbnB1dDoke2FyZy52YWx1ZUhpbnR9fWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEZhbGxiYWNrIHRvIHZhbHVlX2hpbnQgYXMgbGl0ZXJhbFxuXHRcdFx0XHRcdGFyZ3MucHVzaChhcmcudmFsdWVIaW50ID8/ICcnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChhcmcudHlwZSA9PT0gJ25hbWVkJykge1xuXHRcdFx0XHRpZiAoIWFyZy5uYW1lKSB7XG5cdFx0XHRcdFx0bm90aWNlcy5wdXNoKGBOYW1lZCBhcmd1bWVudCBpcyBtaXNzaW5nIGEgbmFtZS4gJHtKU09OLnN0cmluZ2lmeShhcmcpfWApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFyZ3MucHVzaChhcmcubmFtZSk7XG5cdFx0XHRcdGlmIChhcmcudmFsdWUpIHtcblx0XHRcdFx0XHRsZXQgdmFsdWUgPSBhcmcudmFsdWU7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiBhcmdWYXJpYWJsZXMpIHtcblx0XHRcdFx0XHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZShgeyR7dmFyaWFibGUuaWR9fWAsIGBcXCR7aW5wdXQ6JHt2YXJpYWJsZS5pZH19YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFyZ3MucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKGFyZ1ZhcmlhYmxlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHZhcmlhYmxlcy5wdXNoKC4uLmFyZ1ZhcmlhYmxlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGFyZy5kZXNjcmlwdGlvbiB8fCBhcmcuZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGlucHV0IHZhcmlhYmxlIGZvciBuYW1lZCBhcmd1bWVudCB3aXRob3V0IHZhbHVlXG5cdFx0XHRcdFx0Y29uc3QgdmFyaWFibGVJZCA9IGFyZy5uYW1lLnJlcGxhY2UoL14tLT8vLCAnJyk7XG5cdFx0XHRcdFx0dmFyaWFibGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IHZhcmlhYmxlSWQsXG5cdFx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBULFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFyZy5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdHBhc3N3b3JkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IGFyZy5kZWZhdWx0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFyZ3MucHVzaChgXFwke2lucHV0OiR7dmFyaWFibGVJZH19YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgYXJncywgdmFyaWFibGVzLCBub3RpY2VzIH07XG5cdH1cblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RDb21tb25NY3BNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSByZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIGxvY2FsID0gbmV3IE1hcDxzdHJpbmcsIElMb2NhbE1jcFNlcnZlcj4oKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uSW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uSW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlci5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRnZXQgb25EaWRJbnN0YWxsTWNwU2VydmVycygpIHsgcmV0dXJuIHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMuZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkVXBkYXRlTWNwU2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT4oKSk7XG5cdGdldCBvbkRpZFVwZGF0ZU1jcFNlcnZlcnMoKSB7IHJldHVybiB0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VW5pbnN0YWxsTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRnZXQgb25Vbmluc3RhbGxNY3BTZXJ2ZXIoKSB7IHJldHVybiB0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5ldmVudDsgfVxuXG5cdHByb3RlY3RlZCBfb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdGdldCBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlcigpIHsgcmV0dXJuIHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG1jcFJlc291cmNlOiBVUkksXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHRhcmdldDogTWNwUmVzb3VyY2VUYXJnZXQsXG5cdFx0QElNY3BHYWxsZXJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbWNwR2FsbGVyeVNlcnZpY2U6IElNY3BHYWxsZXJ5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZTogSU1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobG9nU2VydmljZSk7XG5cdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy51cGRhdGVMb2NhbCgpLCA1MCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuZm9yY2VzIHRoZSBlbnRlcnByaXNlIGFsbG93L2RlbnkgcG9saWN5IGF0IHRoZSBwb2ludCBvZiBwZXJzaXN0ZW5jZS4gQ2FsbGVkIGJ5IGV2ZXJ5XG5cdCAqIGluc3RhbGwgcGF0aCAoaW5zdGFsbGFibGUgYW5kIGVhY2ggZ2FsbGVyeSBvdmVycmlkZSkgYWdhaW5zdCB0aGUgZnVsbHkgcmVzb2x2ZWQgc2VydmVyXG5cdCAqIGNvbmZpZ3VyYXRpb24sIHNvIGEgY2FsbGVyIHRoYXQgZ29lcyBzdHJhaWdodCB0byB0aGUgbWFuYWdlbWVudCBBUEkgY2Fubm90IGJ5cGFzcyB0aGVcblx0ICogYGNhbkluc3RhbGxgIFVJIGNoZWNrLCBhbmQgYSBnYWxsZXJ5IGVudHJ5IGNhbm5vdCBzbGlwIHRocm91Z2ggaWYgaXRzIHJlc29sdmVkIGNvbW1hbmQvVVJMXG5cdCAqIGRpZmZlcnMgZnJvbSB0aGUgcHJlLXJlc29sdXRpb24gbWV0YWRhdGEuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZW5zdXJlU2VydmVyQWxsb3dlZChzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyIHwgSUluc3RhbGxhYmxlTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5hbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UuaXNBbGxvd2VkKHNlcnZlcik7XG5cdFx0aWYgKHJlc3VsdCAhPT0gdHJ1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHJlc3VsdC52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpcy5sb2NhbCA9IGF3YWl0IHRoaXMucG9wdWxhdGVMb2NhbFNlcnZlcnMoKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLnN0YXJ0V2F0Y2hpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBvcHVsYXRlTG9jYWxTZXJ2ZXJzKCk6IFByb21pc2U8TWFwPHN0cmluZywgSUxvY2FsTWNwU2VydmVyPj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQWJzdHJhY3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlI3BvcHVsYXRlTG9jYWxTZXJ2ZXJzJywgdGhpcy5tY3BSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBsb2NhbCA9IG5ldyBNYXA8c3RyaW5nLCBJTG9jYWxNY3BTZXJ2ZXI+KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNjYW5uZWRNY3BTZXJ2ZXJzID0gYXdhaXQgdGhpcy5tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLnNjYW5NY3BTZXJ2ZXJzKHRoaXMubWNwUmVzb3VyY2UsIHRoaXMudGFyZ2V0KTtcblx0XHRcdGlmIChzY2FubmVkTWNwU2VydmVycy5zZXJ2ZXJzKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChPYmplY3QuZW50cmllcyhzY2FubmVkTWNwU2VydmVycy5zZXJ2ZXJzKS5tYXAoYXN5bmMgKFtuYW1lLCBzY2FubmVkU2VydmVyXSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IHRoaXMuc2NhbkxvY2FsU2VydmVyKG5hbWUsIHNjYW5uZWRTZXJ2ZXIsIHNjYW5uZWRNY3BTZXJ2ZXJzLnNhbmRib3gpO1xuXHRcdFx0XHRcdGxvY2FsLnNldChuYW1lLCBzZXJ2ZXIpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnQ291bGQgbm90IHJlYWQgdXNlciBNQ1Agc2VydmVyczonLCBlcnJvcik7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGFydFdhdGNoaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5tY3BSZXNvdXJjZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHModGhpcy5tY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHVwZGF0ZUxvY2FsKHNvdXJjZT86IElHYWxsZXJ5TWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBhd2FpdCB0aGlzLnBvcHVsYXRlTG9jYWxTZXJ2ZXJzKCk7XG5cblx0XHRcdGNvbnN0IGFkZGVkOiBJTG9jYWxNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdXBkYXRlZDogSUxvY2FsTWNwU2VydmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBbLi4udGhpcy5sb2NhbC5rZXlzKCldLmZpbHRlcihuYW1lID0+ICFjdXJyZW50LmhhcyhuYW1lKSk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2NhbC5kZWxldGUoc2VydmVyKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgc2VydmVyXSBvZiBjdXJyZW50KSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5sb2NhbC5nZXQobmFtZSk7XG5cdFx0XHRcdGlmIChwcmV2aW91cykge1xuXHRcdFx0XHRcdGlmICghZXF1YWxzKHByZXZpb3VzLCBzZXJ2ZXIpKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkLnB1c2goc2VydmVyKTtcblx0XHRcdFx0XHRcdHRoaXMubG9jYWwuc2V0KG5hbWUsIHNlcnZlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFkZGVkLnB1c2goc2VydmVyKTtcblx0XHRcdFx0XHR0aGlzLmxvY2FsLnNldChuYW1lLCBzZXJ2ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2NhbC5kZWxldGUoc2VydmVyKTtcblx0XHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7IG5hbWU6IHNlcnZlciwgbWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1cGRhdGVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZmlyZSh1cGRhdGVkLm1hcChzZXJ2ZXIgPT4gKHsgbmFtZTogc2VydmVyLm5hbWUsIGxvY2FsOiBzZXJ2ZXIsIHNvdXJjZTogc291cmNlPy5uYW1lID09PSBzZXJ2ZXIubmFtZSA/IHNvdXJjZSA6IHVuZGVmaW5lZCwgbWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UgfSkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFkZGVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLmZpcmUoYWRkZWQubWFwKHNlcnZlciA9PiAoeyBuYW1lOiBzZXJ2ZXIubmFtZSwgbG9jYWw6IHNlcnZlciwgc291cmNlOiBzb3VyY2U/Lm5hbWUgPT09IHNlcnZlci5uYW1lID8gc291cmNlIDogdW5kZWZpbmVkLCBtY3BSZXNvdXJjZTogdGhpcy5tY3BSZXNvdXJjZSB9KSkpO1xuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgaW5zdGFsbGVkIE1DUCBzZXJ2ZXJzOicsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRJbnN0YWxsZWQoKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXJbXT4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMubG9jYWwudmFsdWVzKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNjYW5Mb2NhbFNlcnZlcihuYW1lOiBzdHJpbmcsIGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIHJvb3RTYW5kYm94PzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRsZXQgbWNwU2VydmVySW5mbyA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxTZXJ2ZXJJbmZvKG5hbWUsIGNvbmZpZyk7XG5cdFx0aWYgKCFtY3BTZXJ2ZXJJbmZvKSB7XG5cdFx0XHRtY3BTZXJ2ZXJJbmZvID0geyBuYW1lLCB2ZXJzaW9uOiBjb25maWcudmVyc2lvbiwgZ2FsbGVyeVVybDogaXNTdHJpbmcoY29uZmlnLmdhbGxlcnkpID8gY29uZmlnLmdhbGxlcnkgOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdGNvbmZpZyxcblx0XHRcdHJvb3RTYW5kYm94LFxuXHRcdFx0bWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UsXG5cdFx0XHR2ZXJzaW9uOiBtY3BTZXJ2ZXJJbmZvLnZlcnNpb24sXG5cdFx0XHRsb2NhdGlvbjogbWNwU2VydmVySW5mby5sb2NhdGlvbixcblx0XHRcdGRpc3BsYXlOYW1lOiBtY3BTZXJ2ZXJJbmZvLmRpc3BsYXlOYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IG1jcFNlcnZlckluZm8uZGVzY3JpcHRpb24sXG5cdFx0XHRwdWJsaXNoZXI6IG1jcFNlcnZlckluZm8ucHVibGlzaGVyLFxuXHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IG1jcFNlcnZlckluZm8ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRnYWxsZXJ5VXJsOiBtY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmwsXG5cdFx0XHRnYWxsZXJ5SWQ6IG1jcFNlcnZlckluZm8uZ2FsbGVyeUlkLFxuXHRcdFx0cmVwb3NpdG9yeVVybDogbWNwU2VydmVySW5mby5yZXBvc2l0b3J5VXJsLFxuXHRcdFx0cmVhZG1lVXJsOiBtY3BTZXJ2ZXJJbmZvLnJlYWRtZVVybCxcblx0XHRcdGljb246IG1jcFNlcnZlckluZm8uaWNvbixcblx0XHRcdGNvZGljb246IG1jcFNlcnZlckluZm8uY29kaWNvbixcblx0XHRcdG1hbmlmZXN0OiBtY3BTZXJ2ZXJJbmZvLm1hbmlmZXN0LFxuXHRcdFx0c291cmNlOiBjb25maWcuZ2FsbGVyeSA/ICdnYWxsZXJ5JyA6ICdsb2NhbCdcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciwgb3B0aW9ucz86IE9taXQ8SW5zdGFsbE9wdGlvbnMsICdtY3BSZXNvdXJjZSc+KTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01DUCBNYW5hZ2VtZW50IFNlcnZpY2U6IGluc3RhbGwnLCBzZXJ2ZXIubmFtZSk7XG5cdFx0dGhpcy5lbnN1cmVTZXJ2ZXJBbGxvd2VkKHNlcnZlcik7XG5cblx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7IG5hbWU6IHNlcnZlci5uYW1lLCBtY3BSZXNvdXJjZTogdGhpcy5tY3BSZXNvdXJjZSB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLmFkZE1jcFNlcnZlcnMoW3NlcnZlcl0sIHRoaXMubWNwUmVzb3VyY2UsIHRoaXMudGFyZ2V0KTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTG9jYWwoKTtcblx0XHRcdGNvbnN0IGxvY2FsID0gdGhpcy5sb2NhbC5nZXQoc2VydmVyLm5hbWUpO1xuXHRcdFx0aWYgKCFsb2NhbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBpbnN0YWxsIE1DUCBzZXJ2ZXI6ICR7c2VydmVyLm5hbWV9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWw7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKFt7IG5hbWU6IHNlcnZlci5uYW1lLCBlcnJvcjogZSwgbWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UgfV0pO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1bmluc3RhbGwoc2VydmVyOiBJTG9jYWxNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBPbWl0PFVuaW5zdGFsbE9wdGlvbnMsICdtY3BSZXNvdXJjZSc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNQ1AgTWFuYWdlbWVudCBTZXJ2aWNlOiB1bmluc3RhbGwnLCBzZXJ2ZXIubmFtZSk7XG5cdFx0dGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7IG5hbWU6IHNlcnZlci5uYW1lLCBtY3BSZXNvdXJjZTogdGhpcy5tY3BSZXNvdXJjZSB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2VydmVycyA9IGF3YWl0IHRoaXMubWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5zY2FuTWNwU2VydmVycyh0aGlzLm1jcFJlc291cmNlLCB0aGlzLnRhcmdldCk7XG5cdFx0XHRpZiAoIWN1cnJlbnRTZXJ2ZXJzLnNlcnZlcnMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLnJlbW92ZU1jcFNlcnZlcnMoW3NlcnZlci5uYW1lXSwgdGhpcy5tY3BSZXNvdXJjZSwgdGhpcy50YXJnZXQpO1xuXHRcdFx0aWYgKHNlcnZlci5sb2NhdGlvbikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChVUkkucmV2aXZlKHNlcnZlci5sb2NhdGlvbiksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbCgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoeyBuYW1lOiBzZXJ2ZXIubmFtZSwgZXJyb3I6IGUsIG1jcFJlc291cmNlOiB0aGlzLm1jcFJlc291cmNlIH0pO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0TG9jYWxTZXJ2ZXJJbmZvKG5hbWU6IHN0cmluZywgbWNwU2VydmVyQ29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbik6IFByb21pc2U8SUxvY2FsTWNwU2VydmVySW5mbyB8IHVuZGVmaW5lZD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBpbnN0YWxsRnJvbVVyaSh1cmk6IFVSSSwgb3B0aW9ucz86IE9taXQ8SW5zdGFsbE9wdGlvbnMsICdtY3BSZXNvdXJjZSc+KTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+O1xufVxuXG5leHBvcnQgY2xhc3MgTWNwVXNlclJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBtY3BMb2NhdGlvbjogVVJJO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1jcFJlc291cmNlOiBVUkksXG5cdFx0QElNY3BHYWxsZXJ5U2VydmljZSBtY3BHYWxsZXJ5U2VydmljZTogSU1jcEdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSBtY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlOiBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSxcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG1jcFJlc291cmNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIG1jcEdhbGxlcnlTZXJ2aWNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBtY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLCBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UpO1xuXHRcdHRoaXMubWNwTG9jYXRpb24gPSB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCAnbWNwJyk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxNY3BTZXJ2ZXIsIGdhbGxlcnk6IElHYWxsZXJ5TWNwU2VydmVyKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZU1ldGFkYXRhRnJvbUdhbGxlcnkoZ2FsbGVyeSk7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbChnYWxsZXJ5KTtcblx0XHRjb25zdCB1cGRhdGVkTG9jYWwgPSAoYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoKSkuZmluZChzID0+IHMubmFtZSA9PT0gbG9jYWwubmFtZSk7XG5cdFx0aWYgKCF1cGRhdGVkTG9jYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZpbmQgTUNQIHNlcnZlcjogJHtsb2NhbC5uYW1lfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdXBkYXRlZExvY2FsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHVwZGF0ZU1ldGFkYXRhRnJvbUdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIpOiBQcm9taXNlPElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbj4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gZ2FsbGVyeS5jb25maWd1cmF0aW9uO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRMb2NhdGlvbihnYWxsZXJ5Lm5hbWUsIGdhbGxlcnkudmVyc2lvbik7XG5cdFx0Y29uc3QgbWFuaWZlc3RQYXRoID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGxvY2F0aW9uLCAnbWFuaWZlc3QuanNvbicpO1xuXHRcdGNvbnN0IGxvY2FsOiBJTG9jYWxNY3BTZXJ2ZXJJbmZvID0ge1xuXHRcdFx0Z2FsbGVyeVVybDogZ2FsbGVyeS5nYWxsZXJ5VXJsLFxuXHRcdFx0Z2FsbGVyeUlkOiBnYWxsZXJ5LmlkLFxuXHRcdFx0bmFtZTogZ2FsbGVyeS5uYW1lLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGdhbGxlcnkuZGlzcGxheU5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZ2FsbGVyeS5kZXNjcmlwdGlvbixcblx0XHRcdHZlcnNpb246IGdhbGxlcnkudmVyc2lvbixcblx0XHRcdHB1Ymxpc2hlcjogZ2FsbGVyeS5wdWJsaXNoZXIsXG5cdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZ2FsbGVyeS5wdWJsaXNoZXJEaXNwbGF5TmFtZSxcblx0XHRcdHJlcG9zaXRvcnlVcmw6IGdhbGxlcnkucmVwb3NpdG9yeVVybCxcblx0XHRcdGxpY2Vuc2VVcmw6IGdhbGxlcnkubGljZW5zZSxcblx0XHRcdGljb246IGdhbGxlcnkuaWNvbixcblx0XHRcdGNvZGljb246IGdhbGxlcnkuY29kaWNvbixcblx0XHRcdG1hbmlmZXN0LFxuXHRcdH07XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUobWFuaWZlc3RQYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGxvY2FsKSkpO1xuXG5cdFx0aWYgKGdhbGxlcnkucmVhZG1lVXJsIHx8IGdhbGxlcnkucmVhZG1lKSB7XG5cdFx0XHRjb25zdCByZWFkbWUgPSBnYWxsZXJ5LnJlYWRtZSA/IGdhbGxlcnkucmVhZG1lIDogYXdhaXQgdGhpcy5tY3BHYWxsZXJ5U2VydmljZS5nZXRSZWFkbWUoZ2FsbGVyeSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgobG9jYXRpb24sICdSRUFETUUubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhyZWFkbWUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWFuaWZlc3Q7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TG9jYWxTZXJ2ZXJJbmZvKG5hbWU6IHN0cmluZywgbWNwU2VydmVyQ29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbik6IFByb21pc2U8SUxvY2FsTWNwU2VydmVySW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBzdG9yZWRNY3BTZXJ2ZXJJbmZvOiBJTG9jYWxNY3BTZXJ2ZXJJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZWFkbWVVcmw6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAobWNwU2VydmVyQ29uZmlnLmdhbGxlcnkpIHtcblx0XHRcdGxvY2F0aW9uID0gdGhpcy5nZXRMb2NhdGlvbihuYW1lLCBtY3BTZXJ2ZXJDb25maWcudmVyc2lvbik7XG5cdFx0XHRjb25zdCBtYW5pZmVzdExvY2F0aW9uID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGxvY2F0aW9uLCAnbWFuaWZlc3QuanNvbicpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUobWFuaWZlc3RMb2NhdGlvbik7XG5cdFx0XHRcdHN0b3JlZE1jcFNlcnZlckluZm8gPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSkgYXMgSUxvY2FsTWNwU2VydmVySW5mbztcblxuXHRcdFx0XHQvLyBtaWdyYXRlXG5cdFx0XHRcdGlmIChzdG9yZWRNY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmw/LmluY2x1ZGVzKCcvdjAvJykpIHtcblx0XHRcdFx0XHRzdG9yZWRNY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmwgPSBzdG9yZWRNY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmwuc3Vic3RyaW5nKDAsIHN0b3JlZE1jcFNlcnZlckluZm8uZ2FsbGVyeVVybC5pbmRleE9mKCcvdjAvJykpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmlmZXN0TG9jYXRpb24sIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc3RvcmVkTWNwU2VydmVySW5mbykpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN0b3JlZE1jcFNlcnZlckluZm8ubG9jYXRpb24gPSBsb2NhdGlvbjtcblx0XHRcdFx0cmVhZG1lVXJsID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGxvY2F0aW9uLCAnUkVBRE1FLm1kJyk7XG5cdFx0XHRcdGlmICghYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocmVhZG1lVXJsKSkge1xuXHRcdFx0XHRcdHJlYWRtZVVybCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdG9yZWRNY3BTZXJ2ZXJJbmZvLnJlYWRtZVVybCA9IHJlYWRtZVVybDtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTUNQIE1hbmFnZW1lbnQgU2VydmljZTogbWFuaWZlc3Qgbm90IGZvdW5kJywgbWFuaWZlc3RMb2NhdGlvbi50b1N0cmluZygpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ01DUCBNYW5hZ2VtZW50IFNlcnZpY2U6IGZhaWxlZCB0byByZWFkIG1hbmlmZXN0JywgbG9jYXRpb24udG9TdHJpbmcoKSwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHN0b3JlZE1jcFNlcnZlckluZm87XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0TG9jYXRpb24obmFtZTogc3RyaW5nLCB2ZXJzaW9uPzogc3RyaW5nKTogVVJJIHtcblx0XHRuYW1lID0gbmFtZS5yZXBsYWNlKCcvJywgJy4nKTtcblx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMubWNwTG9jYXRpb24sIHZlcnNpb24gPyBgJHtuYW1lfS0ke3ZlcnNpb259YCA6IG5hbWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluc3RhbGxGcm9tVXJpKHVyaTogVVJJLCBvcHRpb25zPzogT21pdDxJbnN0YWxsT3B0aW9ucywgJ21jcFJlc291cmNlJz4pOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBzdXBwb3J0ZWQuJyk7XG5cdH1cblxuXHRvdmVycmlkZSBjYW5JbnN0YWxsKCk6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0TWNwTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdENvbW1vbk1jcE1hbmFnZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSU1jcE1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlOiBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobG9nU2VydmljZSk7XG5cdH1cblxuXHRjYW5JbnN0YWxsKHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIgfCBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIpOiB0cnVlIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRjb25zdCBhbGxvd2VkVG9JbnN0YWxsID0gdGhpcy5hbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UuaXNBbGxvd2VkKHNlcnZlcik7XG5cdFx0aWYgKGFsbG93ZWRUb0luc3RhbGwgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ25vdCBhbGxvd2VkIHRvIGluc3RhbGwnLCBcIlRoaXMgbWNwIHNlcnZlciBjYW5ub3QgYmUgaW5zdGFsbGVkIGJlY2F1c2UgezB9XCIsIGFsbG93ZWRUb0luc3RhbGwudmFsdWUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcE1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RNY3BNYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElNY3BNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25JbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5zdGFsbE1jcFNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25JbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25JbnN0YWxsTWNwU2VydmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzID0gdGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZU1jcFNlcnZlcnMgPSB0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Vbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlcyA9IG5ldyBSZXNvdXJjZU1hcDx7IHNlcnZpY2U6IE1jcFVzZXJSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIH0gJiBJRGlzcG9zYWJsZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UobWNwUmVzb3VyY2U6IFVSSSk6IE1jcFVzZXJSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIHtcblx0XHRsZXQgbWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZSA9IHRoaXMubWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZXMuZ2V0KG1jcFJlc291cmNlKTtcblx0XHRpZiAoIW1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNyZWF0ZU1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UobWNwUmVzb3VyY2UpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uSW5zdGFsbE1jcFNlcnZlcihlID0+IHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlci5maXJlKGUpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzKGUgPT4gdGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKGUpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFVwZGF0ZU1jcFNlcnZlcnMoZSA9PiB0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZmlyZShlKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25Vbmluc3RhbGxNY3BTZXJ2ZXIoZSA9PiB0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5maXJlKGUpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFVuaW5zdGFsbE1jcFNlcnZlcihlID0+IHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoZSkpKTtcblx0XHRcdHRoaXMubWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZXMuc2V0KG1jcFJlc291cmNlLCBtY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlID0geyBzZXJ2aWNlLCBkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBtY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlLnNlcnZpY2U7XG5cdH1cblxuXHRhc3luYyBnZXRJbnN0YWxsZWQobWNwUmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcltdPiB7XG5cdFx0Y29uc3QgbWNwUmVzb3VyY2VVcmkgPSBtY3BSZXNvdXJjZSB8fCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdHJldHVybiB0aGlzLmdldE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UobWNwUmVzb3VyY2VVcmkpLmdldEluc3RhbGxlZCgpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRjb25zdCBtY3BSZXNvdXJjZVVyaSA9IG9wdGlvbnM/Lm1jcFJlc291cmNlIHx8IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShtY3BSZXNvdXJjZVVyaSkuaW5zdGFsbChzZXJ2ZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsKHNlcnZlcjogSUxvY2FsTWNwU2VydmVyLCBvcHRpb25zPzogVW5pbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1jcFJlc291cmNlVXJpID0gb3B0aW9ucz8ubWNwUmVzb3VyY2UgfHwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRyZXR1cm4gdGhpcy5nZXRNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKG1jcFJlc291cmNlVXJpKS51bmluc3RhbGwoc2VydmVyLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxGcm9tR2FsbGVyeShzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdGNvbnN0IG1jcFJlc291cmNlVXJpID0gb3B0aW9ucz8ubWNwUmVzb3VyY2UgfHwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRyZXR1cm4gdGhpcy5nZXRNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKG1jcFJlc291cmNlVXJpKS5pbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxNY3BTZXJ2ZXIsIGdhbGxlcnk6IElHYWxsZXJ5TWNwU2VydmVyLCBtY3BSZXNvdXJjZT86IFVSSSk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShtY3BSZXNvdXJjZSB8fCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlKS51cGRhdGVNZXRhZGF0YShsb2NhbCwgZ2FsbGVyeSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZXMuZm9yRWFjaChzZXJ2aWNlID0+IHNlcnZpY2UuZGlzcG9zZSgpKTtcblx0XHR0aGlzLm1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2VzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZU1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UobWNwUmVzb3VyY2U6IFVSSSk6IE1jcFVzZXJSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BVc2VyUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZSwgbWNwUmVzb3VyY2UpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCLGNBQWMsNkJBQTZCO0FBQ3pFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQXlFLG9CQUEySSxjQUFnRyxpQ0FBaUg7QUFDcmEsU0FBdUQsdUJBQWdELHFCQUFxQjtBQUM1SCxTQUFTLGtDQUFxRDtBQXVCdkQsSUFBZSxxQ0FBZixjQUEwRCxXQUE0QztBQUFBLEVBaUI1RyxZQUNpQyxZQUMvQjtBQUNELFVBQU07QUFGMEI7QUFBQSxFQUdqQztBQUFBLEVBRUEsc0NBQXNDLFVBQTBDLGFBQThEO0FBRzdJLFFBQUksZ0JBQWdCLGFBQWEsVUFBVSxTQUFTLFNBQVMsUUFBUTtBQUNwRSxZQUFNLE1BQU0sU0FBUyxRQUFRLENBQUMsRUFBRTtBQUNoQyxZQUFNLFVBQVUsU0FBUyxRQUFRLENBQUMsRUFBRSxXQUFXLENBQUM7QUFDaEQsWUFBTSxFQUFFLFFBQUFBLFNBQVEsVUFBVSxJQUFJLEtBQUssc0JBQXNCLElBQUksV0FBVyxtQ0FBbUMsSUFBSSxRQUFRLE9BQU8sT0FBSyxFQUFFLEtBQUssWUFBWSxNQUFNLGVBQWUsSUFBSSxPQUFPO0FBQ3RMLGFBQU87QUFBQSxRQUNOLHdCQUF3QjtBQUFBLFVBQ3ZCLFFBQVE7QUFBQSxZQUNQLE1BQU0sY0FBYztBQUFBLFlBQ3BCLEtBQUssU0FBUyxRQUFRLENBQUMsRUFBRTtBQUFBLFlBQ3pCLFNBQVMsT0FBTyxLQUFLQSxPQUFNLEVBQUUsU0FBU0EsVUFBUztBQUFBLFVBQ2hEO0FBQUEsVUFDQSxRQUFRLFVBQVUsU0FBUyxZQUFZO0FBQUEsUUFDeEM7QUFBQSxRQUNBLFNBQVMsQ0FBQztBQUFBLE1BQ1g7QUFBQSxJQUNEO0FBR0EsVUFBTSxnQkFBZ0IsU0FBUyxVQUFVLEtBQUssT0FBSyxFQUFFLGlCQUFpQixXQUFXLEtBQUssU0FBUyxXQUFXLENBQUM7QUFDM0csUUFBSSxDQUFDLGVBQWU7QUFDbkIsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFDMUM7QUFFQSxVQUFNLE9BQWlCLENBQUM7QUFDeEIsVUFBTSxTQUErQixDQUFDO0FBQ3RDLFVBQU0sTUFBOEIsQ0FBQztBQUNyQyxVQUFNLFVBQW9CLENBQUM7QUFFM0IsUUFBSSxjQUFjLGlCQUFpQixhQUFhLFFBQVE7QUFDdkQsV0FBSyxLQUFLLEtBQUs7QUFDZixXQUFLLEtBQUssSUFBSTtBQUNkLFdBQUssS0FBSyxNQUFNO0FBQUEsSUFDakI7QUFFQSxRQUFJLGNBQWMsa0JBQWtCLFFBQVE7QUFDM0MsWUFBTSxTQUFTLEtBQUssaUJBQWlCLGNBQWMsb0JBQW9CLENBQUMsQ0FBQztBQUN6RSxXQUFLLEtBQUssR0FBRyxPQUFPLElBQUk7QUFDeEIsYUFBTyxLQUFLLEdBQUcsT0FBTyxTQUFTO0FBQy9CLGNBQVEsS0FBSyxHQUFHLE9BQU8sT0FBTztBQUFBLElBQy9CO0FBRUEsUUFBSSxjQUFjLHNCQUFzQixRQUFRO0FBQy9DLFlBQU0sRUFBRSxRQUFRLFdBQVcsV0FBVyxjQUFjLFNBQVMsV0FBVyxJQUFJLEtBQUssc0JBQXNCLGNBQWMsd0JBQXdCLENBQUMsQ0FBQztBQUMvSSxhQUFPLEtBQUssR0FBRyxZQUFZO0FBQzNCLGNBQVEsS0FBSyxHQUFHLFVBQVU7QUFDMUIsaUJBQVcsQ0FBQyxNQUFNLEtBQUssS0FBSyxPQUFPLFFBQVEsU0FBUyxHQUFHO0FBQ3RELFlBQUksSUFBSSxJQUFJO0FBQ1osWUFBSSxjQUFjLGlCQUFpQixhQUFhLFFBQVE7QUFDdkQsZUFBSyxLQUFLLElBQUk7QUFDZCxlQUFLLEtBQUssSUFBSTtBQUFBLFFBQ2Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFlBQVEsY0FBYyxjQUFjO0FBQUEsTUFDbkMsS0FBSyxhQUFhO0FBQ2pCLFlBQUksY0FBYyxpQkFBaUI7QUFDbEMsZUFBSyxLQUFLLGNBQWMsY0FBYyxlQUFlO0FBQUEsUUFDdEQ7QUFDQSxhQUFLLEtBQUssY0FBYyxVQUFVLEdBQUcsY0FBYyxVQUFVLElBQUksY0FBYyxPQUFPLEtBQUssY0FBYyxVQUFVO0FBQ25IO0FBQUEsTUFDRCxLQUFLLGFBQWE7QUFDakIsWUFBSSxjQUFjLGlCQUFpQjtBQUNsQyxlQUFLLEtBQUssZUFBZSxjQUFjLGVBQWU7QUFBQSxRQUN2RDtBQUNBLGFBQUssS0FBSyxjQUFjLFVBQVUsR0FBRyxjQUFjLFVBQVUsSUFBSSxjQUFjLE9BQU8sS0FBSyxjQUFjLFVBQVU7QUFDbkg7QUFBQSxNQUNELEtBQUssYUFBYSxRQUNqQjtBQUNDLGNBQU0sbUJBQW1CLGNBQWMsa0JBQ3BDLEdBQUcsY0FBYyxlQUFlLElBQUksY0FBYyxVQUFVLEtBQzVELGNBQWM7QUFDakIsYUFBSyxLQUFLLGNBQWMsVUFBVSxHQUFHLGdCQUFnQixJQUFJLGNBQWMsT0FBTyxLQUFLLGdCQUFnQjtBQUNuRztBQUFBLE1BQ0Q7QUFBQSxNQUNELEtBQUssYUFBYTtBQUNqQixhQUFLLEtBQUssY0FBYyxVQUFVLEdBQUcsY0FBYyxVQUFVLElBQUksY0FBYyxPQUFPLEtBQUssY0FBYyxVQUFVO0FBQ25ILGFBQUssS0FBSyxPQUFPO0FBQ2pCLFlBQUksY0FBYyxpQkFBaUI7QUFDbEMsZUFBSyxLQUFLLFlBQVksY0FBYyxlQUFlO0FBQUEsUUFDcEQ7QUFDQSxZQUFJLGNBQWMsa0JBQWtCLFFBQVE7QUFDM0MsZUFBSyxLQUFLLElBQUk7QUFBQSxRQUNmO0FBQ0E7QUFBQSxJQUNGO0FBRUEsUUFBSSxjQUFjLGtCQUFrQixRQUFRO0FBQzNDLFlBQU0sU0FBUyxLQUFLLGlCQUFpQixjQUFjLGdCQUFnQjtBQUNuRSxXQUFLLEtBQUssR0FBRyxPQUFPLElBQUk7QUFDeEIsYUFBTyxLQUFLLEdBQUcsT0FBTyxTQUFTO0FBQy9CLGNBQVEsS0FBSyxHQUFHLE9BQU8sT0FBTztBQUFBLElBQy9CO0FBRUEsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLHdCQUF3QjtBQUFBLFFBQ3ZCLFFBQVE7QUFBQSxVQUNQLE1BQU0sY0FBYztBQUFBLFVBQ3BCLFNBQVMsS0FBSyxlQUFlLGNBQWMsWUFBWTtBQUFBLFVBQ3ZELE1BQU0sS0FBSyxTQUFTLE9BQU87QUFBQSxVQUMzQixLQUFLLE9BQU8sS0FBSyxHQUFHLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFDdEM7QUFBQSxRQUNBLFFBQVEsT0FBTyxTQUFTLFNBQVM7QUFBQSxNQUNsQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFVSxlQUFlLGFBQW1DO0FBQzNELFlBQVEsYUFBYTtBQUFBLE1BQ3BCLEtBQUssYUFBYTtBQUFNLGVBQU87QUFBQSxNQUMvQixLQUFLLGFBQWE7QUFBUSxlQUFPO0FBQUEsTUFDakMsS0FBSyxhQUFhO0FBQVEsZUFBTztBQUFBLE1BQ2pDLEtBQUssYUFBYTtBQUFPLGVBQU87QUFBQSxJQUNqQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFVSxhQUFhLGdCQUF1RTtBQUM3RixVQUFNLFlBQWtDLENBQUM7QUFDekMsZUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxjQUFjLEdBQUc7QUFDMUQsZ0JBQVUsS0FBSztBQUFBLFFBQ2QsSUFBSTtBQUFBLFFBQ0osTUFBTSxNQUFNLFVBQVUsc0JBQXNCLE9BQU8sc0JBQXNCO0FBQUEsUUFDekUsYUFBYSxNQUFNLGVBQWU7QUFBQSxRQUNsQyxVQUFVLENBQUMsQ0FBQyxNQUFNO0FBQUEsUUFDbEIsU0FBUyxNQUFNO0FBQUEsUUFDZixTQUFTLE1BQU07QUFBQSxNQUNoQixDQUFDO0FBQUEsSUFDRjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBc0IsZ0JBQWdKO0FBQzdLLFVBQU0sVUFBb0IsQ0FBQztBQUMzQixVQUFNLFNBQWlDLENBQUM7QUFDeEMsVUFBTSxZQUFrQyxDQUFDO0FBRXpDLGVBQVcsU0FBUyxnQkFBZ0I7QUFDbkMsWUFBTSxpQkFBaUIsTUFBTSxZQUFZLEtBQUssYUFBYSxNQUFNLFNBQVMsSUFBSSxDQUFDO0FBQy9FLFVBQUksUUFBUSxNQUFNLFNBQVM7QUFHM0IsVUFBSSxlQUFlLFFBQVE7QUFDMUIsbUJBQVcsWUFBWSxnQkFBZ0I7QUFDdEMsa0JBQVEsTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLEtBQUssWUFBWSxTQUFTLEVBQUUsR0FBRztBQUFBLFFBQ3JFO0FBQ0Esa0JBQVUsS0FBSyxHQUFHLGNBQWM7QUFBQSxNQUNqQyxXQUFXLENBQUMsVUFBVSxNQUFNLGVBQWUsTUFBTSxXQUFXLE1BQU0sWUFBWSxTQUFZO0FBRXpGLGtCQUFVLEtBQUs7QUFBQSxVQUNkLElBQUksTUFBTTtBQUFBLFVBQ1YsTUFBTSxNQUFNLFVBQVUsc0JBQXNCLE9BQU8sc0JBQXNCO0FBQUEsVUFDekUsYUFBYSxNQUFNLGVBQWU7QUFBQSxVQUNsQyxVQUFVLENBQUMsQ0FBQyxNQUFNO0FBQUEsVUFDbEIsU0FBUyxNQUFNO0FBQUEsVUFDZixTQUFTLE1BQU07QUFBQSxRQUNoQixDQUFDO0FBQ0QsZ0JBQVEsWUFBWSxNQUFNLElBQUk7QUFBQSxNQUMvQjtBQUVBLGFBQU8sTUFBTSxJQUFJLElBQUk7QUFBQSxJQUN0QjtBQUVBLFdBQU8sRUFBRSxRQUFRLFdBQVcsUUFBUTtBQUFBLEVBQ3JDO0FBQUEsRUFFUSxpQkFBaUIsZUFBc0g7QUFDOUksVUFBTSxPQUFpQixDQUFDO0FBQ3hCLFVBQU0sWUFBa0MsQ0FBQztBQUN6QyxVQUFNLFVBQW9CLENBQUM7QUFDM0IsZUFBVyxPQUFPLGVBQWU7QUFDaEMsWUFBTSxlQUFlLElBQUksWUFBWSxLQUFLLGFBQWEsSUFBSSxTQUFTLElBQUksQ0FBQztBQUV6RSxVQUFJLElBQUksU0FBUyxjQUFjO0FBQzlCLFlBQUksUUFBUSxJQUFJO0FBQ2hCLFlBQUksT0FBTztBQUNWLHFCQUFXLFlBQVksY0FBYztBQUNwQyxvQkFBUSxNQUFNLFFBQVEsSUFBSSxTQUFTLEVBQUUsS0FBSyxZQUFZLFNBQVMsRUFBRSxHQUFHO0FBQUEsVUFDckU7QUFDQSxlQUFLLEtBQUssS0FBSztBQUNmLGNBQUksYUFBYSxRQUFRO0FBQ3hCLHNCQUFVLEtBQUssR0FBRyxZQUFZO0FBQUEsVUFDL0I7QUFBQSxRQUNELFdBQVcsSUFBSSxjQUFjLElBQUksZUFBZSxJQUFJLFlBQVksU0FBWTtBQUUzRSxvQkFBVSxLQUFLO0FBQUEsWUFDZCxJQUFJLElBQUk7QUFBQSxZQUNSLE1BQU0sc0JBQXNCO0FBQUEsWUFDNUIsYUFBYSxJQUFJLGVBQWU7QUFBQSxZQUNoQyxVQUFVO0FBQUEsWUFDVixTQUFTLElBQUk7QUFBQSxVQUNkLENBQUM7QUFDRCxlQUFLLEtBQUssWUFBWSxJQUFJLFNBQVMsR0FBRztBQUFBLFFBQ3ZDLE9BQU87QUFFTixlQUFLLEtBQUssSUFBSSxhQUFhLEVBQUU7QUFBQSxRQUM5QjtBQUFBLE1BQ0QsV0FBVyxJQUFJLFNBQVMsU0FBUztBQUNoQyxZQUFJLENBQUMsSUFBSSxNQUFNO0FBQ2Qsa0JBQVEsS0FBSyxxQ0FBcUMsS0FBSyxVQUFVLEdBQUcsQ0FBQyxFQUFFO0FBQ3ZFO0FBQUEsUUFDRDtBQUNBLGFBQUssS0FBSyxJQUFJLElBQUk7QUFDbEIsWUFBSSxJQUFJLE9BQU87QUFDZCxjQUFJLFFBQVEsSUFBSTtBQUNoQixxQkFBVyxZQUFZLGNBQWM7QUFDcEMsb0JBQVEsTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFLEtBQUssWUFBWSxTQUFTLEVBQUUsR0FBRztBQUFBLFVBQ3JFO0FBQ0EsZUFBSyxLQUFLLEtBQUs7QUFDZixjQUFJLGFBQWEsUUFBUTtBQUN4QixzQkFBVSxLQUFLLEdBQUcsWUFBWTtBQUFBLFVBQy9CO0FBQUEsUUFDRCxXQUFXLElBQUksZUFBZSxJQUFJLFlBQVksUUFBVztBQUV4RCxnQkFBTSxhQUFhLElBQUksS0FBSyxRQUFRLFFBQVEsRUFBRTtBQUM5QyxvQkFBVSxLQUFLO0FBQUEsWUFDZCxJQUFJO0FBQUEsWUFDSixNQUFNLHNCQUFzQjtBQUFBLFlBQzVCLGFBQWEsSUFBSSxlQUFlO0FBQUEsWUFDaEMsVUFBVTtBQUFBLFlBQ1YsU0FBUyxJQUFJO0FBQUEsVUFDZCxDQUFDO0FBQ0QsZUFBSyxLQUFLLFlBQVksVUFBVSxHQUFHO0FBQUEsUUFDcEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sRUFBRSxNQUFNLFdBQVcsUUFBUTtBQUFBLEVBQ25DO0FBRUQ7QUFoUXNCLHFDQUFmO0FBQUEsRUFrQko7QUFBQSxHQWxCbUI7QUFrUWYsSUFBZSx1Q0FBZixjQUE0RCxtQ0FBbUM7QUFBQSxFQXFCckcsWUFDb0IsYUFDQSxRQUNvQixtQkFDTixhQUNPLG9CQUMzQixZQUNrQywyQkFDRCwwQkFDN0M7QUFDRCxVQUFNLFVBQVU7QUFURztBQUNBO0FBQ29CO0FBQ047QUFDTztBQUVPO0FBQ0Q7QUF6Qi9DLFNBQVEsUUFBUSxvQkFBSSxJQUE2QjtBQUVqRCxTQUFtQixzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBK0IsQ0FBQztBQUM1RixTQUFTLHFCQUFxQixLQUFLLG9CQUFvQjtBQUV2RCxTQUFtQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksUUFBa0MsQ0FBQztBQUduRyxTQUFtQix5QkFBeUIsS0FBSyxVQUFVLElBQUksUUFBa0MsQ0FBQztBQUdsRyxTQUFtQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBaUMsQ0FBQztBQUdoRyxTQUFVLDJCQUEyQixLQUFLLFVBQVUsSUFBSSxRQUFvQyxDQUFDO0FBYzVGLFNBQUssK0JBQStCLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNLEtBQUssWUFBWSxHQUFHLEVBQUUsQ0FBQztBQUFBLEVBQ3RHO0FBQUEsRUF2QkEsSUFBSSx5QkFBeUI7QUFBRSxXQUFPLEtBQUssd0JBQXdCO0FBQUEsRUFBTztBQUFBLEVBRzFFLElBQUksd0JBQXdCO0FBQUUsV0FBTyxLQUFLLHVCQUF1QjtBQUFBLEVBQU87QUFBQSxFQUd4RSxJQUFJLHVCQUF1QjtBQUFFLFdBQU8sS0FBSyxzQkFBc0I7QUFBQSxFQUFPO0FBQUEsRUFHdEUsSUFBSSwwQkFBMEI7QUFBRSxXQUFPLEtBQUsseUJBQXlCO0FBQUEsRUFBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUF1QmxFLG9CQUFvQixRQUF5RDtBQUN0RixVQUFNLFNBQVMsS0FBSyx5QkFBeUIsVUFBVSxNQUFNO0FBQzdELFFBQUksV0FBVyxNQUFNO0FBQ3BCLFlBQU0sSUFBSSxNQUFNLE9BQU8sS0FBSztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBNEI7QUFDbkMsUUFBSSxDQUFDLEtBQUssbUJBQW1CO0FBQzVCLFdBQUsscUJBQXFCLFlBQVk7QUFDckMsWUFBSTtBQUNILGVBQUssUUFBUSxNQUFNLEtBQUsscUJBQXFCO0FBQUEsUUFDOUMsVUFBRTtBQUNELGVBQUssY0FBYztBQUFBLFFBQ3BCO0FBQUEsTUFDRCxHQUFHO0FBQUEsSUFDSjtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWMsdUJBQThEO0FBQzNFLFNBQUssV0FBVyxNQUFNLDZEQUE2RCxLQUFLLFlBQVksU0FBUyxDQUFDO0FBQzlHLFVBQU0sUUFBUSxvQkFBSSxJQUE2QjtBQUMvQyxRQUFJO0FBQ0gsWUFBTSxvQkFBb0IsTUFBTSxLQUFLLDBCQUEwQixlQUFlLEtBQUssYUFBYSxLQUFLLE1BQU07QUFDM0csVUFBSSxrQkFBa0IsU0FBUztBQUM5QixjQUFNLFFBQVEsV0FBVyxPQUFPLFFBQVEsa0JBQWtCLE9BQU8sRUFBRSxJQUFJLE9BQU8sQ0FBQyxNQUFNLGFBQWEsTUFBTTtBQUN2RyxnQkFBTSxTQUFTLE1BQU0sS0FBSyxnQkFBZ0IsTUFBTSxlQUFlLGtCQUFrQixPQUFPO0FBQ3hGLGdCQUFNLElBQUksTUFBTSxNQUFNO0FBQUEsUUFDdkIsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0sb0NBQW9DLEtBQUs7QUFDL0QsWUFBTTtBQUFBLElBQ1A7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0JBQXNCO0FBQzdCLFNBQUssVUFBVSxLQUFLLFlBQVksTUFBTSxLQUFLLFdBQVcsQ0FBQztBQUN2RCxTQUFLLFVBQVUsS0FBSyxZQUFZLGlCQUFpQixPQUFLO0FBQ3JELFVBQUksRUFBRSxRQUFRLEtBQUssV0FBVyxHQUFHO0FBQ2hDLGFBQUssNkJBQTZCLFNBQVM7QUFBQSxNQUM1QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBZ0IsWUFBWSxRQUEyQztBQUN0RSxRQUFJO0FBQ0gsWUFBTSxVQUFVLE1BQU0sS0FBSyxxQkFBcUI7QUFFaEQsWUFBTSxRQUEyQixDQUFDO0FBQ2xDLFlBQU0sVUFBNkIsQ0FBQztBQUNwQyxZQUFNLFVBQVUsQ0FBQyxHQUFHLEtBQUssTUFBTSxLQUFLLENBQUMsRUFBRSxPQUFPLFVBQVEsQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDO0FBRXhFLGlCQUFXLFVBQVUsU0FBUztBQUM3QixhQUFLLE1BQU0sT0FBTyxNQUFNO0FBQUEsTUFDekI7QUFFQSxpQkFBVyxDQUFDLE1BQU0sTUFBTSxLQUFLLFNBQVM7QUFDckMsY0FBTSxXQUFXLEtBQUssTUFBTSxJQUFJLElBQUk7QUFDcEMsWUFBSSxVQUFVO0FBQ2IsY0FBSSxDQUFDLE9BQU8sVUFBVSxNQUFNLEdBQUc7QUFDOUIsb0JBQVEsS0FBSyxNQUFNO0FBQ25CLGlCQUFLLE1BQU0sSUFBSSxNQUFNLE1BQU07QUFBQSxVQUM1QjtBQUFBLFFBQ0QsT0FBTztBQUNOLGdCQUFNLEtBQUssTUFBTTtBQUNqQixlQUFLLE1BQU0sSUFBSSxNQUFNLE1BQU07QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxVQUFVLFNBQVM7QUFDN0IsYUFBSyxNQUFNLE9BQU8sTUFBTTtBQUN4QixhQUFLLHlCQUF5QixLQUFLLEVBQUUsTUFBTSxRQUFRLGFBQWEsS0FBSyxZQUFZLENBQUM7QUFBQSxNQUNuRjtBQUVBLFVBQUksUUFBUSxRQUFRO0FBQ25CLGFBQUssdUJBQXVCLEtBQUssUUFBUSxJQUFJLGFBQVcsRUFBRSxNQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVEsUUFBUSxRQUFRLFNBQVMsT0FBTyxPQUFPLFNBQVMsUUFBVyxhQUFhLEtBQUssWUFBWSxFQUFFLENBQUM7QUFBQSxNQUN6TDtBQUVBLFVBQUksTUFBTSxRQUFRO0FBQ2pCLGFBQUssd0JBQXdCLEtBQUssTUFBTSxJQUFJLGFBQVcsRUFBRSxNQUFNLE9BQU8sTUFBTSxPQUFPLFFBQVEsUUFBUSxRQUFRLFNBQVMsT0FBTyxPQUFPLFNBQVMsUUFBVyxhQUFhLEtBQUssWUFBWSxFQUFFLENBQUM7QUFBQSxNQUN4TDtBQUFBLElBRUQsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0seUNBQXlDLEtBQUs7QUFBQSxJQUNyRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZUFBMkM7QUFDaEQsVUFBTSxLQUFLLFdBQVc7QUFDdEIsV0FBTyxNQUFNLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUFBLEVBQ3RDO0FBQUEsRUFFQSxNQUFnQixnQkFBZ0IsTUFBYyxRQUFpQyxhQUFrRTtBQUNoSixRQUFJLGdCQUFnQixNQUFNLEtBQUssbUJBQW1CLE1BQU0sTUFBTTtBQUM5RCxRQUFJLENBQUMsZUFBZTtBQUNuQixzQkFBZ0IsRUFBRSxNQUFNLFNBQVMsT0FBTyxTQUFTLFlBQVksU0FBUyxPQUFPLE9BQU8sSUFBSSxPQUFPLFVBQVUsT0FBVTtBQUFBLElBQ3BIO0FBRUEsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsYUFBYSxLQUFLO0FBQUEsTUFDbEIsU0FBUyxjQUFjO0FBQUEsTUFDdkIsVUFBVSxjQUFjO0FBQUEsTUFDeEIsYUFBYSxjQUFjO0FBQUEsTUFDM0IsYUFBYSxjQUFjO0FBQUEsTUFDM0IsV0FBVyxjQUFjO0FBQUEsTUFDekIsc0JBQXNCLGNBQWM7QUFBQSxNQUNwQyxZQUFZLGNBQWM7QUFBQSxNQUMxQixXQUFXLGNBQWM7QUFBQSxNQUN6QixlQUFlLGNBQWM7QUFBQSxNQUM3QixXQUFXLGNBQWM7QUFBQSxNQUN6QixNQUFNLGNBQWM7QUFBQSxNQUNwQixTQUFTLGNBQWM7QUFBQSxNQUN2QixVQUFVLGNBQWM7QUFBQSxNQUN4QixRQUFRLE9BQU8sVUFBVSxZQUFZO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFFBQVEsUUFBK0IsU0FBeUU7QUFDckgsU0FBSyxXQUFXLE1BQU0sbUNBQW1DLE9BQU8sSUFBSTtBQUNwRSxTQUFLLG9CQUFvQixNQUFNO0FBRS9CLFNBQUssb0JBQW9CLEtBQUssRUFBRSxNQUFNLE9BQU8sTUFBTSxhQUFhLEtBQUssWUFBWSxDQUFDO0FBQ2xGLFFBQUk7QUFDSCxZQUFNLEtBQUssMEJBQTBCLGNBQWMsQ0FBQyxNQUFNLEdBQUcsS0FBSyxhQUFhLEtBQUssTUFBTTtBQUMxRixZQUFNLEtBQUssWUFBWTtBQUN2QixZQUFNLFFBQVEsS0FBSyxNQUFNLElBQUksT0FBTyxJQUFJO0FBQ3hDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsY0FBTSxJQUFJLE1BQU0saUNBQWlDLE9BQU8sSUFBSSxFQUFFO0FBQUEsTUFDL0Q7QUFDQSxhQUFPO0FBQUEsSUFDUixTQUFTLEdBQUc7QUFDWCxXQUFLLHdCQUF3QixLQUFLLENBQUMsRUFBRSxNQUFNLE9BQU8sTUFBTSxPQUFPLEdBQUcsYUFBYSxLQUFLLFlBQVksQ0FBQyxDQUFDO0FBQ2xHLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxVQUFVLFFBQXlCLFNBQWdFO0FBQ3hHLFNBQUssV0FBVyxNQUFNLHFDQUFxQyxPQUFPLElBQUk7QUFDdEUsU0FBSyxzQkFBc0IsS0FBSyxFQUFFLE1BQU0sT0FBTyxNQUFNLGFBQWEsS0FBSyxZQUFZLENBQUM7QUFFcEYsUUFBSTtBQUNILFlBQU0saUJBQWlCLE1BQU0sS0FBSywwQkFBMEIsZUFBZSxLQUFLLGFBQWEsS0FBSyxNQUFNO0FBQ3hHLFVBQUksQ0FBQyxlQUFlLFNBQVM7QUFDNUI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxLQUFLLDBCQUEwQixpQkFBaUIsQ0FBQyxPQUFPLElBQUksR0FBRyxLQUFLLGFBQWEsS0FBSyxNQUFNO0FBQ2xHLFVBQUksT0FBTyxVQUFVO0FBQ3BCLGNBQU0sS0FBSyxZQUFZLElBQUksSUFBSSxPQUFPLE9BQU8sUUFBUSxHQUFHLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxNQUM1RTtBQUNBLFlBQU0sS0FBSyxZQUFZO0FBQUEsSUFDeEIsU0FBUyxHQUFHO0FBQ1gsV0FBSyx5QkFBeUIsS0FBSyxFQUFFLE1BQU0sT0FBTyxNQUFNLE9BQU8sR0FBRyxhQUFhLEtBQUssWUFBWSxDQUFDO0FBQ2pHLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUlEO0FBOU1zQix1Q0FBZjtBQUFBLEVBd0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTdCbUI7QUFnTmYsSUFBTSxtQ0FBTixjQUErQyxxQ0FBcUM7QUFBQSxFQUkxRixZQUNDLGFBQ29CLG1CQUNOLGFBQ08sb0JBQ1IsWUFDZSwyQkFDRCwwQkFDTixvQkFDcEI7QUFDRCxVQUFNLGFBQWEsb0JBQW9CLE1BQU0sbUJBQW1CLGFBQWEsb0JBQW9CLFlBQVksMkJBQTJCLHdCQUF3QjtBQUNoSyxTQUFLLGNBQWMsbUJBQW1CLE9BQU8sU0FBUyxtQkFBbUIscUJBQXFCLEtBQUs7QUFBQSxFQUNwRztBQUFBLEVBRUEsTUFBTSxtQkFBbUIsUUFBMkIsU0FBb0Q7QUFDdkcsVUFBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFNLGVBQWUsT0FBd0IsU0FBc0Q7QUFDbEcsVUFBTSxLQUFLLDBCQUEwQixPQUFPO0FBQzVDLFVBQU0sS0FBSyxZQUFZLE9BQU87QUFDOUIsVUFBTSxnQkFBZ0IsTUFBTSxLQUFLLGFBQWEsR0FBRyxLQUFLLE9BQUssRUFBRSxTQUFTLE1BQU0sSUFBSTtBQUNoRixRQUFJLENBQUMsY0FBYztBQUNsQixZQUFNLElBQUksTUFBTSw4QkFBOEIsTUFBTSxJQUFJLEVBQUU7QUFBQSxJQUMzRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFnQiwwQkFBMEIsU0FBcUU7QUFDOUcsVUFBTSxXQUFXLFFBQVE7QUFDekIsVUFBTSxXQUFXLEtBQUssWUFBWSxRQUFRLE1BQU0sUUFBUSxPQUFPO0FBQy9ELFVBQU0sZUFBZSxLQUFLLG1CQUFtQixPQUFPLFNBQVMsVUFBVSxlQUFlO0FBQ3RGLFVBQU0sUUFBNkI7QUFBQSxNQUNsQyxZQUFZLFFBQVE7QUFBQSxNQUNwQixXQUFXLFFBQVE7QUFBQSxNQUNuQixNQUFNLFFBQVE7QUFBQSxNQUNkLGFBQWEsUUFBUTtBQUFBLE1BQ3JCLGFBQWEsUUFBUTtBQUFBLE1BQ3JCLFNBQVMsUUFBUTtBQUFBLE1BQ2pCLFdBQVcsUUFBUTtBQUFBLE1BQ25CLHNCQUFzQixRQUFRO0FBQUEsTUFDOUIsZUFBZSxRQUFRO0FBQUEsTUFDdkIsWUFBWSxRQUFRO0FBQUEsTUFDcEIsTUFBTSxRQUFRO0FBQUEsTUFDZCxTQUFTLFFBQVE7QUFBQSxNQUNqQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLEtBQUssWUFBWSxVQUFVLGNBQWMsU0FBUyxXQUFXLEtBQUssVUFBVSxLQUFLLENBQUMsQ0FBQztBQUV6RixRQUFJLFFBQVEsYUFBYSxRQUFRLFFBQVE7QUFDeEMsWUFBTSxTQUFTLFFBQVEsU0FBUyxRQUFRLFNBQVMsTUFBTSxLQUFLLGtCQUFrQixVQUFVLFNBQVMsa0JBQWtCLElBQUk7QUFDdkgsWUFBTSxLQUFLLFlBQVksVUFBVSxLQUFLLG1CQUFtQixPQUFPLFNBQVMsVUFBVSxXQUFXLEdBQUcsU0FBUyxXQUFXLE1BQU0sQ0FBQztBQUFBLElBQzdIO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWdCLG1CQUFtQixNQUFjLGlCQUFvRjtBQUNwSSxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLGdCQUFnQixTQUFTO0FBQzVCLGlCQUFXLEtBQUssWUFBWSxNQUFNLGdCQUFnQixPQUFPO0FBQ3pELFlBQU0sbUJBQW1CLEtBQUssbUJBQW1CLE9BQU8sU0FBUyxVQUFVLGVBQWU7QUFDMUYsVUFBSTtBQUNILGNBQU0sVUFBVSxNQUFNLEtBQUssWUFBWSxTQUFTLGdCQUFnQjtBQUNoRSw4QkFBc0IsS0FBSyxNQUFNLFFBQVEsTUFBTSxTQUFTLENBQUM7QUFHekQsWUFBSSxvQkFBb0IsWUFBWSxTQUFTLE1BQU0sR0FBRztBQUNyRCw4QkFBb0IsYUFBYSxvQkFBb0IsV0FBVyxVQUFVLEdBQUcsb0JBQW9CLFdBQVcsUUFBUSxNQUFNLENBQUM7QUFDM0gsZ0JBQU0sS0FBSyxZQUFZLFVBQVUsa0JBQWtCLFNBQVMsV0FBVyxLQUFLLFVBQVUsbUJBQW1CLENBQUMsQ0FBQztBQUFBLFFBQzVHO0FBRUEsNEJBQW9CLFdBQVc7QUFDL0Isb0JBQVksS0FBSyxtQkFBbUIsT0FBTyxTQUFTLFVBQVUsV0FBVztBQUN6RSxZQUFJLENBQUMsTUFBTSxLQUFLLFlBQVksT0FBTyxTQUFTLEdBQUc7QUFDOUMsc0JBQVk7QUFBQSxRQUNiO0FBQ0EsNEJBQW9CLFlBQVk7QUFBQSxNQUNqQyxTQUFTLEdBQUc7QUFDWCxZQUFJLHNCQUFzQixDQUFDLE1BQU0sb0JBQW9CLGdCQUFnQjtBQUNwRSxlQUFLLFdBQVcsTUFBTSw4Q0FBOEMsaUJBQWlCLFNBQVMsQ0FBQztBQUFBLFFBQ2hHLE9BQU87QUFDTixlQUFLLFdBQVcsTUFBTSxtREFBbUQsU0FBUyxTQUFTLEdBQUcsQ0FBQztBQUFBLFFBQ2hHO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVUsWUFBWSxNQUFjLFNBQXVCO0FBQzFELFdBQU8sS0FBSyxRQUFRLEtBQUssR0FBRztBQUM1QixXQUFPLEtBQUssbUJBQW1CLE9BQU8sU0FBUyxLQUFLLGFBQWEsVUFBVSxHQUFHLElBQUksSUFBSSxPQUFPLEtBQUssSUFBSTtBQUFBLEVBQ3ZHO0FBQUEsRUFFbUIsZUFBZSxLQUFVLFNBQXlFO0FBQ3BILFVBQU0sSUFBSSxNQUFNLHVCQUF1QjtBQUFBLEVBQ3hDO0FBQUEsRUFFUyxhQUFxQztBQUM3QyxVQUFNLElBQUksTUFBTSxlQUFlO0FBQUEsRUFDaEM7QUFFRDtBQTVHYSxtQ0FBTjtBQUFBLEVBTUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVO0FBOEdOLElBQWUsK0JBQWYsY0FBb0QsbUNBQW9FO0FBQUEsRUFFOUgsWUFDK0MsMEJBQ2pDLFlBQ1o7QUFDRCxVQUFNLFVBQVU7QUFIOEI7QUFBQSxFQUkvQztBQUFBLEVBRUEsV0FBVyxRQUEyRTtBQUNyRixVQUFNLG1CQUFtQixLQUFLLHlCQUF5QixVQUFVLE1BQU07QUFDdkUsUUFBSSxxQkFBcUIsTUFBTTtBQUM5QixhQUFPLElBQUksZUFBZSxTQUFTLDBCQUEwQixtREFBbUQsaUJBQWlCLEtBQUssQ0FBQztBQUFBLElBQ3hJO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWhCc0IsK0JBQWY7QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEdBSm1CO0FBa0JmLElBQU0sdUJBQU4sY0FBbUMsNkJBQThEO0FBQUEsRUFtQnZHLFlBQzRCLDBCQUNkLFlBQzhCLHlCQUNELHNCQUN6QztBQUNELFVBQU0sMEJBQTBCLFVBQVU7QUFIQztBQUNEO0FBckIzQyxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBK0IsQ0FBQztBQUMxRixTQUFTLHFCQUFxQixLQUFLLG9CQUFvQjtBQUV2RCxTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksUUFBMkMsQ0FBQztBQUMxRyxTQUFTLHlCQUF5QixLQUFLLHdCQUF3QjtBQUUvRCxTQUFpQix5QkFBeUIsS0FBSyxVQUFVLElBQUksUUFBMkMsQ0FBQztBQUN6RyxTQUFTLHdCQUF3QixLQUFLLHVCQUF1QjtBQUU3RCxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBaUMsQ0FBQztBQUM5RixTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUUzRCxTQUFpQiwyQkFBMkIsS0FBSyxVQUFVLElBQUksUUFBb0MsQ0FBQztBQUNwRyxTQUFTLDBCQUEwQixLQUFLLHlCQUF5QjtBQUVqRSxTQUFpQixnQ0FBZ0MsSUFBSSxZQUF5RTtBQUFBLEVBUzlIO0FBQUEsRUFFUSxnQ0FBZ0MsYUFBb0Q7QUFDM0YsUUFBSSwrQkFBK0IsS0FBSyw4QkFBOEIsSUFBSSxXQUFXO0FBQ3JGLFFBQUksQ0FBQyw4QkFBOEI7QUFDbEMsWUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFlBQU0sVUFBVSxZQUFZLElBQUksS0FBSyxtQ0FBbUMsV0FBVyxDQUFDO0FBQ3BGLGtCQUFZLElBQUksUUFBUSxtQkFBbUIsT0FBSyxLQUFLLG9CQUFvQixLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ2pGLGtCQUFZLElBQUksUUFBUSx1QkFBdUIsT0FBSyxLQUFLLHdCQUF3QixLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLGtCQUFZLElBQUksUUFBUSxzQkFBc0IsT0FBSyxLQUFLLHVCQUF1QixLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3ZGLGtCQUFZLElBQUksUUFBUSxxQkFBcUIsT0FBSyxLQUFLLHNCQUFzQixLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3JGLGtCQUFZLElBQUksUUFBUSx3QkFBd0IsT0FBSyxLQUFLLHlCQUF5QixLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzNGLFdBQUssOEJBQThCLElBQUksYUFBYSwrQkFBK0IsRUFBRSxTQUFTLFNBQVMsTUFBTSxZQUFZLFFBQVEsRUFBRSxDQUFDO0FBQUEsSUFDckk7QUFDQSxXQUFPLDZCQUE2QjtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxNQUFNLGFBQWEsYUFBK0M7QUFDakUsVUFBTSxpQkFBaUIsZUFBZSxLQUFLLHdCQUF3QixlQUFlO0FBQ2xGLFdBQU8sS0FBSyxnQ0FBZ0MsY0FBYyxFQUFFLGFBQWE7QUFBQSxFQUMxRTtBQUFBLEVBRUEsTUFBTSxRQUFRLFFBQStCLFNBQW9EO0FBQ2hHLFVBQU0saUJBQWlCLFNBQVMsZUFBZSxLQUFLLHdCQUF3QixlQUFlO0FBQzNGLFdBQU8sS0FBSyxnQ0FBZ0MsY0FBYyxFQUFFLFFBQVEsUUFBUSxPQUFPO0FBQUEsRUFDcEY7QUFBQSxFQUVBLE1BQU0sVUFBVSxRQUF5QixTQUEyQztBQUNuRixVQUFNLGlCQUFpQixTQUFTLGVBQWUsS0FBSyx3QkFBd0IsZUFBZTtBQUMzRixXQUFPLEtBQUssZ0NBQWdDLGNBQWMsRUFBRSxVQUFVLFFBQVEsT0FBTztBQUFBLEVBQ3RGO0FBQUEsRUFFQSxNQUFNLG1CQUFtQixRQUEyQixTQUFvRDtBQUN2RyxVQUFNLGlCQUFpQixTQUFTLGVBQWUsS0FBSyx3QkFBd0IsZUFBZTtBQUMzRixXQUFPLEtBQUssZ0NBQWdDLGNBQWMsRUFBRSxtQkFBbUIsUUFBUSxPQUFPO0FBQUEsRUFDL0Y7QUFBQSxFQUVBLE1BQU0sZUFBZSxPQUF3QixTQUE0QixhQUE2QztBQUNySCxXQUFPLEtBQUssZ0NBQWdDLGVBQWUsS0FBSyx3QkFBd0IsZUFBZSxXQUFXLEVBQUUsZUFBZSxPQUFPLE9BQU87QUFBQSxFQUNsSjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyw4QkFBOEIsUUFBUSxhQUFXLFFBQVEsUUFBUSxDQUFDO0FBQ3ZFLFNBQUssOEJBQThCLE1BQU07QUFDekMsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRVUsbUNBQW1DLGFBQW9EO0FBQ2hHLFdBQU8sS0FBSyxxQkFBcUIsZUFBZSxrQ0FBa0MsV0FBVztBQUFBLEVBQzlGO0FBRUQ7QUE3RWEsdUJBQU47QUFBQSxFQW9CSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkJVOyIsCiAgIm5hbWVzIjogWyJpbnB1dHMiXQp9Cg==
