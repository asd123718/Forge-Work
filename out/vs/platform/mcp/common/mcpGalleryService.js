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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { format2, uppercaseFirstLetter } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { asJson, asText, isSuccess, IRequestService } from "../../request/common/request.js";
import { GalleryMcpServerStatus, McpGalleryResolveStatus, RegistryType, TransportType } from "./mcpManagement.js";
import { IMcpGalleryManifestService, McpGalleryManifestStatus, getMcpGalleryManifestResourceUri, McpGalleryResourceType } from "./mcpGalleryManifest.js";
import { CancellationError, isCancellationError } from "../../../base/common/errors.js";
import { isObject, isString } from "../../../base/common/types.js";
var IconMimeType = /* @__PURE__ */ ((IconMimeType2) => {
  IconMimeType2["PNG"] = "image/png";
  IconMimeType2["JPEG"] = "image/jpeg";
  IconMimeType2["JPG"] = "image/jpg";
  IconMimeType2["SVG"] = "image/svg+xml";
  IconMimeType2["WEBP"] = "image/webp";
  return IconMimeType2;
})(IconMimeType || {});
var IconTheme = /* @__PURE__ */ ((IconTheme2) => {
  IconTheme2["LIGHT"] = "light";
  IconTheme2["DARK"] = "dark";
  return IconTheme2;
})(IconTheme || {});
var McpServerSchemaVersion_v2025_07_09;
((McpServerSchemaVersion_v2025_07_092) => {
  McpServerSchemaVersion_v2025_07_092.VERSION = "v0-2025-07-09";
  McpServerSchemaVersion_v2025_07_092.SCHEMA = `https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json`;
  class Serializer {
    toRawGalleryMcpServerResult(input) {
      if (!input || typeof input !== "object" || !Array.isArray(input.servers)) {
        return void 0;
      }
      const from = input;
      const servers = [];
      for (const server of from.servers) {
        const rawServer = this.toRawGalleryMcpServer(server);
        if (!rawServer) {
          return void 0;
        }
        servers.push(rawServer);
      }
      return {
        metadata: {
          count: from.metadata.count ?? 0,
          nextCursor: from.metadata?.next_cursor
        },
        servers
      };
    }
    toRawGalleryMcpServer(input) {
      if (!input || typeof input !== "object") {
        return void 0;
      }
      const from = input;
      if (!from.name || !isString(from.name) || (!from.description || !isString(from.description)) || (!from.version || !isString(from.version))) {
        return void 0;
      }
      if (from.$schema && from.$schema !== McpServerSchemaVersion_v2025_07_092.SCHEMA) {
        return void 0;
      }
      const registryInfo = from._meta?.["io.modelcontextprotocol.registry/official"];
      function convertServerInput(input2) {
        return {
          ...input2,
          isRequired: input2.is_required,
          isSecret: input2.is_secret
        };
      }
      function convertVariables(variables) {
        const result = {};
        for (const [key, value] of Object.entries(variables)) {
          result[key] = convertServerInput(value);
        }
        return result;
      }
      function convertServerArgument(arg) {
        if (arg.type === "positional") {
          return {
            ...arg,
            valueHint: arg.value_hint,
            isRepeated: arg.is_repeated,
            isRequired: arg.is_required,
            isSecret: arg.is_secret,
            variables: arg.variables ? convertVariables(arg.variables) : void 0
          };
        }
        return {
          ...arg,
          isRepeated: arg.is_repeated,
          isRequired: arg.is_required,
          isSecret: arg.is_secret,
          variables: arg.variables ? convertVariables(arg.variables) : void 0
        };
      }
      function convertKeyValueInput(input2) {
        return {
          ...input2,
          isRequired: input2.is_required,
          isSecret: input2.is_secret,
          variables: input2.variables ? convertVariables(input2.variables) : void 0
        };
      }
      function convertTransport(input2) {
        switch (input2.type) {
          case "stdio":
            return {
              type: TransportType.STDIO
            };
          case "streamable-http":
            return {
              type: TransportType.STREAMABLE_HTTP,
              url: input2.url,
              headers: input2.headers?.map(convertKeyValueInput)
            };
          case "sse":
            return {
              type: TransportType.SSE,
              url: input2.url,
              headers: input2.headers?.map(convertKeyValueInput)
            };
          default:
            return {
              type: TransportType.STDIO
            };
        }
      }
      function convertRegistryType(input2) {
        switch (input2) {
          case "npm":
            return RegistryType.NODE;
          case "docker":
          case "docker-hub":
          case "oci":
            return RegistryType.DOCKER;
          case "pypi":
            return RegistryType.PYTHON;
          case "nuget":
            return RegistryType.NUGET;
          case "mcpb":
            return RegistryType.MCPB;
          default:
            return RegistryType.NODE;
        }
      }
      const gitHubInfo = from._meta["io.modelcontextprotocol.registry/publisher-provided"]?.github;
      return {
        id: registryInfo.id,
        name: from.name,
        description: from.description,
        repository: from.repository ? {
          url: from.repository.url,
          source: from.repository.source,
          id: from.repository.id
        } : void 0,
        readme: from.repository?.readme,
        version: from.version,
        createdAt: from.created_at,
        updatedAt: from.updated_at,
        packages: from.packages?.map((p) => ({
          identifier: p.identifier ?? p.name,
          registryType: convertRegistryType(p.registry_type ?? p.registry_name),
          version: p.version,
          fileSha256: p.file_sha256,
          registryBaseUrl: p.registry_base_url,
          transport: p.transport ? convertTransport(p.transport) : { type: TransportType.STDIO },
          packageArguments: p.package_arguments?.map(convertServerArgument),
          runtimeHint: p.runtime_hint,
          runtimeArguments: p.runtime_arguments?.map(convertServerArgument),
          environmentVariables: p.environment_variables?.map(convertKeyValueInput)
        })),
        remotes: from.remotes?.map((remote) => {
          const type = remote.type ?? remote.transport_type ?? remote.transport;
          return {
            type: type === TransportType.SSE ? TransportType.SSE : TransportType.STREAMABLE_HTTP,
            url: remote.url,
            headers: remote.headers?.map(convertKeyValueInput)
          };
        }),
        registryInfo: {
          isLatest: registryInfo.is_latest,
          publishedAt: registryInfo.published_at,
          updatedAt: registryInfo.updated_at
        },
        githubInfo: gitHubInfo ? {
          name: gitHubInfo.name,
          nameWithOwner: gitHubInfo.name_with_owner,
          displayName: gitHubInfo.display_name,
          isInOrganization: gitHubInfo.is_in_organization,
          license: gitHubInfo.license,
          opengraphImageUrl: gitHubInfo.opengraph_image_url,
          ownerAvatarUrl: gitHubInfo.owner_avatar_url,
          primaryLanguage: gitHubInfo.primary_language,
          primaryLanguageColor: gitHubInfo.primary_language_color,
          pushedAt: gitHubInfo.pushed_at,
          stargazerCount: gitHubInfo.stargazer_count,
          topics: gitHubInfo.topics,
          usesCustomOpengraphImage: gitHubInfo.uses_custom_opengraph_image
        } : void 0
      };
    }
  }
  McpServerSchemaVersion_v2025_07_092.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v2025_07_09 || (McpServerSchemaVersion_v2025_07_09 = {}));
var McpServerSchemaVersion_v0_1;
((McpServerSchemaVersion_v0_12) => {
  McpServerSchemaVersion_v0_12.VERSION = "v0.1";
  class Serializer {
    toRawGalleryMcpServerResult(input) {
      if (!input || typeof input !== "object" || !Array.isArray(input.servers)) {
        return void 0;
      }
      const from = input;
      const servers = [];
      for (const server of from.servers) {
        const rawServer = this.toRawGalleryMcpServer(server);
        if (!rawServer) {
          if (servers.length === 0) {
            return void 0;
          } else {
            continue;
          }
        }
        servers.push(rawServer);
      }
      return {
        metadata: from.metadata,
        servers
      };
    }
    toRawGalleryMcpServer(input) {
      if (!input || typeof input !== "object") {
        return void 0;
      }
      const from = input;
      if (!from.server || !isObject(from.server) || (!from.server.name || !isString(from.server.name)) || (!from.server.description || !isString(from.server.description)) || (!from.server.version || !isString(from.server.version))) {
        return void 0;
      }
      const { "io.modelcontextprotocol.registry/official": registryInfo, ...apicInfo } = from._meta;
      const githubInfo = from.server._meta?.["io.modelcontextprotocol.registry/publisher-provided"]?.github;
      return {
        name: from.server.name,
        description: from.server.description,
        version: from.server.version,
        title: from.server.title,
        repository: from.server.repository ? {
          url: from.server.repository.url,
          source: from.server.repository.source,
          id: from.server.repository.id
        } : void 0,
        readme: githubInfo?.readme,
        icons: from.server.icons,
        websiteUrl: from.server.websiteUrl,
        packages: from.server.packages,
        remotes: from.server.remotes,
        status: registryInfo?.status,
        registryInfo,
        githubInfo,
        apicInfo
      };
    }
  }
  McpServerSchemaVersion_v0_12.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v0_1 || (McpServerSchemaVersion_v0_1 = {}));
var McpServerSchemaVersion_v0;
((McpServerSchemaVersion_v02) => {
  McpServerSchemaVersion_v02.VERSION = "v0";
  class Serializer {
    constructor() {
      this.galleryMcpServerDataSerializers = [];
      this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v0_1.SERIALIZER);
      this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v2025_07_09.SERIALIZER);
    }
    toRawGalleryMcpServerResult(input) {
      for (const serializer of this.galleryMcpServerDataSerializers) {
        const result = serializer.toRawGalleryMcpServerResult(input);
        if (result) {
          return result;
        }
      }
      return void 0;
    }
    toRawGalleryMcpServer(input) {
      for (const serializer of this.galleryMcpServerDataSerializers) {
        const result = serializer.toRawGalleryMcpServer(input);
        if (result) {
          return result;
        }
      }
      return void 0;
    }
  }
  McpServerSchemaVersion_v02.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v0 || (McpServerSchemaVersion_v0 = {}));
const DefaultPageSize = 50;
const DefaultQueryState = {
  pageSize: DefaultPageSize
};
class Query {
  constructor(state = DefaultQueryState) {
    this.state = state;
  }
  get pageSize() {
    return this.state.pageSize;
  }
  get searchText() {
    return this.state.searchText;
  }
  get cursor() {
    return this.state.cursor;
  }
  withPage(cursor, pageSize = this.pageSize) {
    return new Query({ ...this.state, pageSize, cursor });
  }
  withSearchText(searchText) {
    return new Query({ ...this.state, searchText });
  }
}
let McpGalleryService = class extends Disposable {
  constructor(requestService, fileService, logService, mcpGalleryManifestService) {
    super();
    this.requestService = requestService;
    this.fileService = fileService;
    this.logService = logService;
    this.mcpGalleryManifestService = mcpGalleryManifestService;
    this.galleryMcpServerDataSerializers = /* @__PURE__ */ new Map();
    this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0.VERSION, McpServerSchemaVersion_v0.SERIALIZER);
    this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0_1.VERSION, McpServerSchemaVersion_v0_1.SERIALIZER);
  }
  isEnabled() {
    return this.mcpGalleryManifestService.mcpGalleryManifestStatus === McpGalleryManifestStatus.Available;
  }
  async query(options, token = CancellationToken.None) {
    const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    if (!mcpGalleryManifest) {
      return {
        firstPage: { items: [], hasMore: false },
        getNextPage: async () => ({ items: [], hasMore: false })
      };
    }
    let query = new Query();
    if (options?.text) {
      query = query.withSearchText(options.text.trim());
    }
    const { servers, metadata } = await this.queryGalleryMcpServers(query, mcpGalleryManifest, token);
    let currentCursor = metadata.nextCursor;
    return {
      firstPage: { items: servers, hasMore: !!metadata.nextCursor },
      getNextPage: async (ct) => {
        if (ct.isCancellationRequested) {
          throw new CancellationError();
        }
        if (!currentCursor) {
          return { items: [], hasMore: false };
        }
        const { servers: servers2, metadata: nextMetadata } = await this.queryGalleryMcpServers(query.withPage(currentCursor).withSearchText(void 0), mcpGalleryManifest, ct);
        currentCursor = nextMetadata.nextCursor;
        return { items: servers2, hasMore: !!nextMetadata.nextCursor };
      }
    };
  }
  async getMcpServersFromGallery(infos) {
    const resolved = await this.resolveMcpServersFromGallery(infos);
    const mcpServers = [];
    for (const result of resolved.values()) {
      if (result.status === McpGalleryResolveStatus.Found) {
        mcpServers.push(result.server);
      }
    }
    return mcpServers;
  }
  async resolveMcpServersFromGallery(infos) {
    const result = /* @__PURE__ */ new Map();
    const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    if (!mcpGalleryManifest) {
      for (const info of infos) {
        result.set(info.name, { status: McpGalleryResolveStatus.Failed });
      }
      return result;
    }
    await Promise.all(infos.map(async (info) => {
      try {
        const mcpServer = await this.getMcpServerByName(info, mcpGalleryManifest);
        result.set(info.name, mcpServer ? { status: McpGalleryResolveStatus.Found, server: mcpServer } : { status: McpGalleryResolveStatus.NotFound });
      } catch (error) {
        this.logService.warn(`Failed to resolve MCP server '${info.name}' from gallery: ${error}`);
        result.set(info.name, { status: McpGalleryResolveStatus.Failed });
      }
    }));
    return result;
  }
  async getMcpServerByName({ name, id }, mcpGalleryManifest) {
    const urls = [
      this.getLatestServerVersionUrl(name, mcpGalleryManifest),
      this.getNamedServerUrl(name, mcpGalleryManifest),
      id ? this.getServerIdUrl(id, mcpGalleryManifest) : void 0
    ];
    let attempted = false;
    let lastError;
    for (const url of urls) {
      if (!url) {
        continue;
      }
      attempted = true;
      try {
        const mcpServer = await this.getMcpServer(url);
        if (mcpServer) {
          if (mcpServer.name === name) {
            return mcpServer;
          }
          lastError = new Error(`MCP server lookup for '${name}' returned '${mcpServer.name}'`);
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (!attempted) {
      throw new Error(`Cannot resolve MCP server '${name}': registry manifest has no server lookup endpoint`);
    }
    if (lastError !== void 0) {
      throw lastError;
    }
    return void 0;
  }
  async getReadme(gallery, token) {
    const readmeUrl = gallery.readmeUrl;
    if (!readmeUrl) {
      return Promise.resolve(localize("noReadme", "No README available"));
    }
    const uri = URI.parse(readmeUrl);
    if (uri.scheme === Schemas.file) {
      try {
        const content = await this.fileService.readFile(uri);
        return content.value.toString();
      } catch (error) {
        this.logService.error(`Failed to read file from ${uri}: ${error}`);
      }
    }
    if (uri.authority !== "raw.githubusercontent.com") {
      return new MarkdownString(localize("readme.viewInBrowser", "You can find information about this server [here]({0})", readmeUrl)).value;
    }
    const context = await this.requestService.request({
      type: "GET",
      url: readmeUrl,
      callSite: "mcpGalleryService.getReadme"
    }, token);
    const result = await asText(context);
    if (!result) {
      throw new Error(`Failed to fetch README from ${readmeUrl}`);
    }
    return result;
  }
  toGalleryMcpServer(server, manifest) {
    let publisher = "";
    let displayName = server.title;
    if (server.githubInfo?.name) {
      if (!displayName) {
        displayName = server.githubInfo.name.split("-").map((s) => s.toLowerCase() === "mcp" ? "MCP" : s.toLowerCase() === "github" ? "GitHub" : uppercaseFirstLetter(s)).join(" ");
      }
      publisher = server.githubInfo.nameWithOwner.split("/")[0];
    } else {
      const nameParts = server.name.split("/");
      if (nameParts.length > 0) {
        const domainParts = nameParts[0].split(".");
        if (domainParts.length > 0) {
          publisher = domainParts[domainParts.length - 1];
        }
      }
      if (!displayName) {
        displayName = nameParts[nameParts.length - 1].split("-").map((s) => uppercaseFirstLetter(s)).join(" ");
      }
    }
    if (server.githubInfo?.displayName) {
      displayName = server.githubInfo.displayName;
    }
    let icon;
    if (server.githubInfo?.preferredImage) {
      icon = {
        light: server.githubInfo.preferredImage,
        dark: server.githubInfo.preferredImage
      };
    } else if (server.githubInfo?.ownerAvatarUrl) {
      icon = {
        light: server.githubInfo.ownerAvatarUrl,
        dark: server.githubInfo.ownerAvatarUrl
      };
    } else if (server.apicInfo?.["x-ms-icon"]) {
      icon = {
        light: server.apicInfo["x-ms-icon"],
        dark: server.apicInfo["x-ms-icon"]
      };
    } else if (server.icons && server.icons.length > 0) {
      const lightIcon = server.icons.find((icon2) => icon2.theme === "light") ?? server.icons[0];
      const darkIcon = server.icons.find((icon2) => icon2.theme === "dark") ?? lightIcon;
      icon = {
        light: lightIcon.src,
        dark: darkIcon.src
      };
    }
    const webUrl = manifest ? this.getWebUrl(server.name, manifest) : void 0;
    const publisherUrl = manifest ? this.getPublisherUrl(publisher, manifest) : void 0;
    return {
      id: server.id,
      name: server.name,
      displayName,
      galleryUrl: manifest?.url,
      webUrl,
      description: server.description,
      status: server.status ?? GalleryMcpServerStatus.Active,
      version: server.version,
      isLatest: server.registryInfo?.isLatest ?? true,
      publishDate: server.registryInfo?.publishedAt ? Date.parse(server.registryInfo.publishedAt) : void 0,
      lastUpdated: server.githubInfo?.pushedAt ? Date.parse(server.githubInfo.pushedAt) : server.registryInfo?.updatedAt ? Date.parse(server.registryInfo.updatedAt) : void 0,
      repositoryUrl: server.repository?.url,
      readme: server.readme,
      icon,
      publisher,
      publisherUrl,
      license: server.githubInfo?.license,
      starsCount: server.githubInfo?.stargazerCount,
      topics: server.githubInfo?.topics,
      configuration: {
        packages: server.packages,
        remotes: server.remotes
      }
    };
  }
  async queryGalleryMcpServers(query, mcpGalleryManifest, token) {
    const { servers, metadata } = await this.queryRawGalleryMcpServers(query, mcpGalleryManifest, token);
    return {
      servers: servers.map((item) => this.toGalleryMcpServer(item, mcpGalleryManifest)),
      metadata
    };
  }
  async queryRawGalleryMcpServers(query, mcpGalleryManifest, token) {
    const mcpGalleryUrl = this.getMcpGalleryUrl(mcpGalleryManifest);
    if (!mcpGalleryUrl) {
      return { servers: [], metadata: { count: 0 } };
    }
    const uri = URI.parse(mcpGalleryUrl);
    if (uri.scheme === Schemas.file) {
      try {
        const content = await this.fileService.readFile(uri);
        const data2 = content.value.toString();
        return JSON.parse(data2);
      } catch (error) {
        this.logService.error(`Failed to read file from ${uri}: ${error}`);
      }
    }
    let url = `${mcpGalleryUrl}?limit=${query.pageSize}&version=latest`;
    if (query.cursor) {
      url += `&cursor=${query.cursor}`;
    }
    if (query.searchText) {
      const text = encodeURIComponent(query.searchText);
      url += `&search=${text}`;
    }
    let context;
    try {
      context = await this.requestService.request({
        type: "GET",
        url,
        callSite: "mcpGalleryService.queryMcpServers"
      }, token);
    } catch (error) {
      if (isCancellationError(error)) {
        throw error;
      }
      this.logService.error(`Failed to query MCP gallery: ${error}`);
      return { servers: [], metadata: { count: 0 } };
    }
    if (!isSuccess(context)) {
      this.logService.error(`Failed to query MCP gallery: Server returned ${context.res.statusCode}`);
      return { servers: [], metadata: { count: 0 } };
    }
    const data = await asJson(context);
    if (!data) {
      return { servers: [], metadata: { count: 0 } };
    }
    const result = this.serializeMcpServersResult(data, mcpGalleryManifest);
    if (!result) {
      throw new Error(`Failed to serialize MCP servers result from ${mcpGalleryUrl}`, data);
    }
    return result;
  }
  async getMcpServer(mcpServerUrl, mcpGalleryManifest) {
    const context = await this.requestService.request({
      type: "GET",
      url: mcpServerUrl,
      callSite: "mcpGalleryService.getMcpServer"
    }, CancellationToken.None);
    if (context.res.statusCode === 404) {
      return void 0;
    }
    if (context.res.statusCode && context.res.statusCode >= 400) {
      throw new Error(`Failed to fetch MCP server from ${mcpServerUrl}: server responded with ${context.res.statusCode}`);
    }
    const data = await asJson(context);
    if (!data) {
      throw new Error(`Failed to fetch MCP server from ${mcpServerUrl}: empty response`);
    }
    if (!mcpGalleryManifest) {
      mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    }
    mcpGalleryManifest = mcpGalleryManifest && mcpServerUrl.startsWith(mcpGalleryManifest.url) ? mcpGalleryManifest : null;
    const server = this.serializeMcpServer(data, mcpGalleryManifest);
    if (!server) {
      throw new Error(`Failed to serialize MCP server from ${mcpServerUrl}`, data);
    }
    return this.toGalleryMcpServer(server, mcpGalleryManifest);
  }
  serializeMcpServer(data, mcpGalleryManifest) {
    return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServer(data);
  }
  serializeMcpServersResult(data, mcpGalleryManifest) {
    return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServerResult(data);
  }
  getSerializer(mcpGalleryManifest) {
    const version = mcpGalleryManifest?.version ?? "v0";
    return this.galleryMcpServerDataSerializers.get(version);
  }
  getNamedServerUrl(name, mcpGalleryManifest) {
    const namedResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerNamedResourceUri);
    if (!namedResourceUriTemplate) {
      return void 0;
    }
    return format2(namedResourceUriTemplate, { name });
  }
  getServerIdUrl(id, mcpGalleryManifest) {
    const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerIdUri);
    if (!resourceUriTemplate) {
      return void 0;
    }
    return format2(resourceUriTemplate, { id });
  }
  getLatestServerVersionUrl(name, mcpGalleryManifest) {
    const latestVersionResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerLatestVersionUri);
    if (!latestVersionResourceUriTemplate) {
      return void 0;
    }
    return format2(latestVersionResourceUriTemplate, { name: encodeURIComponent(name) });
  }
  getWebUrl(name, mcpGalleryManifest) {
    const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerWebUri);
    if (!resourceUriTemplate) {
      return void 0;
    }
    return format2(resourceUriTemplate, { name });
  }
  getPublisherUrl(name, mcpGalleryManifest) {
    const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.PublisherUriTemplate);
    if (!resourceUriTemplate) {
      return void 0;
    }
    return format2(resourceUriTemplate, { name });
  }
  getMcpGalleryUrl(mcpGalleryManifest) {
    return getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServersQueryService);
  }
};
McpGalleryService = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IMcpGalleryManifestService)
], McpGalleryService);
export {
  McpGalleryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFxjb21tb25cXG1jcEdhbGxlcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGZvcm1hdDIsIHVwcGVyY2FzZUZpcnN0TGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYXNKc29uLCBhc1RleHQsIGlzU3VjY2VzcywgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBHYWxsZXJ5TWNwU2VydmVyU3RhdHVzLCBJR2FsbGVyeU1jcFNlcnZlciwgSU1jcEdhbGxlcnlTZXJ2ZXJSZXNvbHZlUmVzdWx0LCBJTWNwR2FsbGVyeVNlcnZpY2UsIElNY3BTZXJ2ZXJBcmd1bWVudCwgSU1jcFNlcnZlcklucHV0LCBJTWNwU2VydmVyS2V5VmFsdWVJbnB1dCwgSU1jcFNlcnZlclBhY2thZ2UsIElRdWVyeU9wdGlvbnMsIE1jcEdhbGxlcnlSZXNvbHZlU3RhdHVzLCBSZWdpc3RyeVR5cGUsIFNzZVRyYW5zcG9ydCwgU3RyZWFtYWJsZUh0dHBUcmFuc3BvcnQsIFRyYW5zcG9ydCwgVHJhbnNwb3J0VHlwZSB9IGZyb20gJy4vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSwgTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzLCBnZXRNY3BHYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaSwgTWNwR2FsbGVyeVJlc291cmNlVHlwZSwgSU1jcEdhbGxlcnlNYW5pZmVzdCB9IGZyb20gJy4vbWNwR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IElJdGVyYXRpdmVQYWdlciwgSUl0ZXJhdGl2ZVBhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5pbnRlcmZhY2UgSU1jcFJlZ2lzdHJ5SW5mbyB7XG5cdHJlYWRvbmx5IGlzTGF0ZXN0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHVibGlzaGVkQXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVwZGF0ZWRBdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElHaXRIdWJJbmZvIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lV2l0aE93bmVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBpc0luT3JnYW5pemF0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGljZW5zZT86IHN0cmluZztcblx0cmVhZG9ubHkgb3BlbmdyYXBoSW1hZ2VVcmw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG93bmVyQXZhdGFyVXJsPzogc3RyaW5nO1xuXHRyZWFkb25seSBwcmVmZXJyZWRJbWFnZT86IHN0cmluZztcblx0cmVhZG9ubHkgcHJpbWFyeUxhbmd1YWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSBwcmltYXJ5TGFuZ3VhZ2VDb2xvcj86IHN0cmluZztcblx0cmVhZG9ubHkgcHVzaGVkQXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlYWRtZT86IHN0cmluZztcblx0cmVhZG9ubHkgc3RhcmdhemVyQ291bnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRvcGljcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSB1c2VzQ3VzdG9tT3BlbmdyYXBoSW1hZ2U/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUF6dXJlQVBJQ2VudGVySW5mbyB7XG5cdHJlYWRvbmx5ICd4LW1zLWljb24nPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzTWV0YWRhdGEge1xuXHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBuZXh0Q3Vyc29yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHtcblx0cmVhZG9ubHkgbWV0YWRhdGE6IElSYXdHYWxsZXJ5TWNwU2VydmVyc01ldGFkYXRhO1xuXHRyZWFkb25seSBzZXJ2ZXJzOiByZWFkb25seSBJUmF3R2FsbGVyeU1jcFNlcnZlcltdO1xufVxuXG5pbnRlcmZhY2UgSUdhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHtcblx0cmVhZG9ubHkgbWV0YWRhdGE6IElSYXdHYWxsZXJ5TWNwU2VydmVyc01ldGFkYXRhO1xuXHRyZWFkb25seSBzZXJ2ZXJzOiBJR2FsbGVyeU1jcFNlcnZlcltdO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlNY3BTZXJ2ZXIge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0cmVhZG9ubHkgaWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHRyZWFkb25seSByZXBvc2l0b3J5Pzoge1xuXHRcdHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHVybDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlkPzogc3RyaW5nO1xuXHR9O1xuXHRyZWFkb25seSByZWFkbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb25zPzogcmVhZG9ubHkgSVJhd0dhbGxlcnlNY3BTZXJ2ZXJJY29uW107XG5cdHJlYWRvbmx5IHN0YXR1cz86IEdhbGxlcnlNY3BTZXJ2ZXJTdGF0dXM7XG5cdHJlYWRvbmx5IHdlYnNpdGVVcmw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNyZWF0ZWRBdD86IHN0cmluZztcblx0cmVhZG9ubHkgdXBkYXRlZEF0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBwYWNrYWdlcz86IHJlYWRvbmx5IElNY3BTZXJ2ZXJQYWNrYWdlW107XG5cdHJlYWRvbmx5IHJlbW90ZXM/OiBSZWFkb25seUFycmF5PFNzZVRyYW5zcG9ydCB8IFN0cmVhbWFibGVIdHRwVHJhbnNwb3J0Pjtcblx0cmVhZG9ubHkgcmVnaXN0cnlJbmZvPzogSU1jcFJlZ2lzdHJ5SW5mbztcblx0cmVhZG9ubHkgZ2l0aHViSW5mbz86IElHaXRIdWJJbmZvO1xuXHRyZWFkb25seSBhcGljSW5mbz86IElBenVyZUFQSUNlbnRlckluZm87XG59XG5cbmludGVyZmFjZSBJR2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVyIHtcblx0dG9SYXdHYWxsZXJ5TWNwU2VydmVyUmVzdWx0KGlucHV0OiB1bmtub3duKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHR0b1Jhd0dhbGxlcnlNY3BTZXJ2ZXIoaW5wdXQ6IHVua25vd24pOiBJUmF3R2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElSYXdHYWxsZXJ5TWNwU2VydmVySWNvbiB7XG5cdHJlYWRvbmx5IHNyYzogc3RyaW5nO1xuXHRyZWFkb25seSB0aGVtZT86IEljb25UaGVtZTtcblx0cmVhZG9ubHkgc2l6ZXM/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgbWltZVR5cGU/OiBJY29uTWltZVR5cGU7XG59XG5cbmNvbnN0IGVudW0gSWNvbk1pbWVUeXBlIHtcblx0UE5HID0gJ2ltYWdlL3BuZycsXG5cdEpQRUcgPSAnaW1hZ2UvanBlZycsXG5cdEpQRyA9ICdpbWFnZS9qcGcnLFxuXHRTVkcgPSAnaW1hZ2Uvc3ZnK3htbCcsXG5cdFdFQlAgPSAnaW1hZ2Uvd2VicCcsXG59XG5cbmNvbnN0IGVudW0gSWNvblRoZW1lIHtcblx0TElHSFQgPSAnbGlnaHQnLFxuXHREQVJLID0gJ2RhcmsnLFxufVxuXG5uYW1lc3BhY2UgTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MjAyNV8wN18wOSB7XG5cblx0ZXhwb3J0IGNvbnN0IFZFUlNJT04gPSAndjAtMjAyNS0wNy0wOSc7XG5cdGV4cG9ydCBjb25zdCBTQ0hFTUEgPSBgaHR0cHM6Ly9zdGF0aWMubW9kZWxjb250ZXh0cHJvdG9jb2wuaW8vc2NoZW1hcy8yMDI1LTA3LTA5L3NlcnZlci5zY2hlbWEuanNvbmA7XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbnB1dCB7XG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaXNfcmVxdWlyZWQ/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGZvcm1hdD86ICdzdHJpbmcnIHwgJ251bWJlcicgfCAnYm9vbGVhbicgfCAnZmlsZXBhdGgnO1xuXHRcdHJlYWRvbmx5IHZhbHVlPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlzX3NlY3JldD86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgZGVmYXVsdD86IHN0cmluZztcblx0XHRyZWFkb25seSBjaG9pY2VzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlclZhcmlhYmxlSW5wdXQgZXh0ZW5kcyBSYXdHYWxsZXJ5TWNwU2VydmVySW5wdXQge1xuXHRcdHJlYWRvbmx5IHZhcmlhYmxlcz86IFJlY29yZDxzdHJpbmcsIFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbnB1dD47XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlclBvc2l0aW9uYWxBcmd1bWVudCBleHRlbmRzIFJhd0dhbGxlcnlNY3BTZXJ2ZXJWYXJpYWJsZUlucHV0IHtcblx0XHRyZWFkb25seSB0eXBlOiAncG9zaXRpb25hbCc7XG5cdFx0cmVhZG9ubHkgdmFsdWVfaGludD86IHN0cmluZztcblx0XHRyZWFkb25seSBpc19yZXBlYXRlZD86IGJvb2xlYW47XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlck5hbWVkQXJndW1lbnQgZXh0ZW5kcyBSYXdHYWxsZXJ5TWNwU2VydmVyVmFyaWFibGVJbnB1dCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogJ25hbWVkJztcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaXNfcmVwZWF0ZWQ/OiBib29sZWFuO1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0IGV4dGVuZHMgUmF3R2FsbGVyeU1jcFNlcnZlclZhcmlhYmxlSW5wdXQge1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSB2YWx1ZT86IHN0cmluZztcblx0fVxuXG5cdHR5cGUgUmF3R2FsbGVyeU1jcFNlcnZlckFyZ3VtZW50ID0gUmF3R2FsbGVyeU1jcFNlcnZlclBvc2l0aW9uYWxBcmd1bWVudCB8IFJhd0dhbGxlcnlNY3BTZXJ2ZXJOYW1lZEFyZ3VtZW50O1xuXG5cdGludGVyZmFjZSBNY3BTZXJ2ZXJEZXByZWNhdGVkUmVtb3RlIHtcblx0XHRyZWFkb25seSB0cmFuc3BvcnRfdHlwZT86ICdzdHJlYW1hYmxlJyB8ICdzc2UnO1xuXHRcdHJlYWRvbmx5IHRyYW5zcG9ydD86ICdzdHJlYW1hYmxlJyB8ICdzc2UnO1xuXHRcdHJlYWRvbmx5IHVybDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGhlYWRlcnM/OiBSZWFkb25seUFycmF5PFJhd0dhbGxlcnlNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0Pjtcblx0fVxuXG5cdHR5cGUgUmF3R2FsbGVyeU1jcFNlcnZlclJlbW90ZXMgPSBSZWFkb25seUFycmF5PFNzZVRyYW5zcG9ydCB8IFN0cmVhbWFibGVIdHRwVHJhbnNwb3J0IHwgTWNwU2VydmVyRGVwcmVjYXRlZFJlbW90ZT47XG5cblx0dHlwZSBSYXdHYWxsZXJ5VHJhbnNwb3J0ID0gU3RkaW9UcmFuc3BvcnQgfCBTdHJlYW1hYmxlSHR0cFRyYW5zcG9ydCB8IFNzZVRyYW5zcG9ydDtcblxuXHRpbnRlcmZhY2UgU3RkaW9UcmFuc3BvcnQge1xuXHRcdHJlYWRvbmx5IHR5cGU6ICdzdGRpbyc7XG5cdH1cblxuXHRpbnRlcmZhY2UgU3RyZWFtYWJsZUh0dHBUcmFuc3BvcnQge1xuXHRcdHJlYWRvbmx5IHR5cGU6ICdzdHJlYW1hYmxlLWh0dHAnIHwgJ3NzZSc7XG5cdFx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaGVhZGVycz86IFJlYWRvbmx5QXJyYXk8UmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQ+O1xuXHR9XG5cblx0aW50ZXJmYWNlIFNzZVRyYW5zcG9ydCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogJ3NzZSc7XG5cdFx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaGVhZGVycz86IFJlYWRvbmx5QXJyYXk8UmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQ+O1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJQYWNrYWdlIHtcblx0XHRyZWFkb25seSByZWdpc3RyeV9uYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHJlZ2lzdHJ5X3R5cGU6ICducG0nIHwgJ3B5cGknIHwgJ2RvY2tlci1odWInIHwgJ251Z2V0JyB8ICdyZW1vdGUnIHwgJ21jcGInO1xuXHRcdHJlYWRvbmx5IHJlZ2lzdHJ5X2Jhc2VfdXJsPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlkZW50aWZpZXI6IHN0cmluZztcblx0XHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZmlsZV9zaGEyNTY/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdHJhbnNwb3J0PzogUmF3R2FsbGVyeVRyYW5zcG9ydDtcblx0XHRyZWFkb25seSBwYWNrYWdlX2FyZ3VtZW50cz86IHJlYWRvbmx5IFJhd0dhbGxlcnlNY3BTZXJ2ZXJBcmd1bWVudFtdO1xuXHRcdHJlYWRvbmx5IHJ1bnRpbWVfaGludD86IHN0cmluZztcblx0XHRyZWFkb25seSBydW50aW1lX2FyZ3VtZW50cz86IHJlYWRvbmx5IFJhd0dhbGxlcnlNY3BTZXJ2ZXJBcmd1bWVudFtdO1xuXHRcdHJlYWRvbmx5IGVudmlyb25tZW50X3ZhcmlhYmxlcz86IFJlYWRvbmx5QXJyYXk8UmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQ+O1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXIge1xuXHRcdHJlYWRvbmx5ICRzY2hlbWE6IHN0cmluZztcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0XHRyZWFkb25seSBzdGF0dXM/OiAnYWN0aXZlJyB8ICdkZXByZWNhdGVkJztcblx0XHRyZWFkb25seSByZXBvc2l0b3J5Pzoge1xuXHRcdFx0cmVhZG9ubHkgc291cmNlOiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IGlkPzogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgcmVhZG1lPzogc3RyaW5nO1xuXHRcdH07XG5cdFx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHdlYnNpdGVfdXJsPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNyZWF0ZWRfYXQ6IHN0cmluZztcblx0XHRyZWFkb25seSB1cGRhdGVkX2F0OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcGFja2FnZXM/OiByZWFkb25seSBSYXdHYWxsZXJ5TWNwU2VydmVyUGFja2FnZVtdO1xuXHRcdHJlYWRvbmx5IHJlbW90ZXM/OiBSYXdHYWxsZXJ5TWNwU2VydmVyUmVtb3Rlcztcblx0XHRyZWFkb25seSBfbWV0YToge1xuXHRcdFx0cmVhZG9ubHkgJ2lvLm1vZGVsY29udGV4dHByb3RvY29sLnJlZ2lzdHJ5L29mZmljaWFsJzoge1xuXHRcdFx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSBpc19sYXRlc3Q6IGJvb2xlYW47XG5cdFx0XHRcdHJlYWRvbmx5IHB1Ymxpc2hlZF9hdDogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSB1cGRhdGVkX2F0OiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IHJlbGVhc2VfZGF0ZT86IHN0cmluZztcblx0XHRcdH07XG5cdFx0XHRyZWFkb25seSAnaW8ubW9kZWxjb250ZXh0cHJvdG9jb2wucmVnaXN0cnkvcHVibGlzaGVyLXByb3ZpZGVkJz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdH07XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQge1xuXHRcdHJlYWRvbmx5IG1ldGFkYXRhOiB7XG5cdFx0XHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHRcdFx0cmVhZG9ubHkgbmV4dF9jdXJzb3I/OiBzdHJpbmc7XG5cdFx0fTtcblx0XHRyZWFkb25seSBzZXJ2ZXJzOiByZWFkb25seSBSYXdHYWxsZXJ5TWNwU2VydmVyW107XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2l0SHViSW5mbyB7XG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG5hbWVfd2l0aF9vd25lcjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGRpc3BsYXlfbmFtZT86IHN0cmluZztcblx0XHRyZWFkb25seSBpc19pbl9vcmdhbml6YXRpb24/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGxpY2Vuc2U/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgb3BlbmdyYXBoX2ltYWdlX3VybD86IHN0cmluZztcblx0XHRyZWFkb25seSBvd25lcl9hdmF0YXJfdXJsPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHByaW1hcnlfbGFuZ3VhZ2U/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcHJpbWFyeV9sYW5ndWFnZV9jb2xvcj86IHN0cmluZztcblx0XHRyZWFkb25seSBwdXNoZWRfYXQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc3RhcmdhemVyX2NvdW50PzogbnVtYmVyO1xuXHRcdHJlYWRvbmx5IHRvcGljcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdHJlYWRvbmx5IHVzZXNfY3VzdG9tX29wZW5ncmFwaF9pbWFnZT86IGJvb2xlYW47XG5cdH1cblxuXHRjbGFzcyBTZXJpYWxpemVyIGltcGxlbWVudHMgSUdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplciB7XG5cblx0XHRwdWJsaWMgdG9SYXdHYWxsZXJ5TWNwU2VydmVyUmVzdWx0KGlucHV0OiB1bmtub3duKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0JyB8fCAhQXJyYXkuaXNBcnJheSgoaW5wdXQgYXMgUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQpLnNlcnZlcnMpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyb20gPSA8UmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQ+aW5wdXQ7XG5cblx0XHRcdGNvbnN0IHNlcnZlcnM6IElSYXdHYWxsZXJ5TWNwU2VydmVyW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIGZyb20uc2VydmVycykge1xuXHRcdFx0XHRjb25zdCByYXdTZXJ2ZXIgPSB0aGlzLnRvUmF3R2FsbGVyeU1jcFNlcnZlcihzZXJ2ZXIpO1xuXHRcdFx0XHRpZiAoIXJhd1NlcnZlcikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VydmVycy5wdXNoKHJhd1NlcnZlcik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0Y291bnQ6IGZyb20ubWV0YWRhdGEuY291bnQgPz8gMCxcblx0XHRcdFx0XHRuZXh0Q3Vyc29yOiBmcm9tLm1ldGFkYXRhPy5uZXh0X2N1cnNvclxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXJ2ZXJzXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHB1YmxpYyB0b1Jhd0dhbGxlcnlNY3BTZXJ2ZXIoaW5wdXQ6IHVua25vd24pOiBJUmF3R2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0XHRpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZnJvbSA9IDxSYXdHYWxsZXJ5TWNwU2VydmVyPmlucHV0O1xuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdCghZnJvbS5uYW1lIHx8ICFpc1N0cmluZyhmcm9tLm5hbWUpKVxuXHRcdFx0XHR8fCAoIWZyb20uZGVzY3JpcHRpb24gfHwgIWlzU3RyaW5nKGZyb20uZGVzY3JpcHRpb24pKVxuXHRcdFx0XHR8fCAoIWZyb20udmVyc2lvbiB8fCAhaXNTdHJpbmcoZnJvbS52ZXJzaW9uKSlcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZnJvbS4kc2NoZW1hICYmIGZyb20uJHNjaGVtYSAhPT0gTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MjAyNV8wN18wOS5TQ0hFTUEpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVnaXN0cnlJbmZvID0gZnJvbS5fbWV0YT8uWydpby5tb2RlbGNvbnRleHRwcm90b2NvbC5yZWdpc3RyeS9vZmZpY2lhbCddO1xuXG5cdFx0XHRmdW5jdGlvbiBjb252ZXJ0U2VydmVySW5wdXQoaW5wdXQ6IFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbnB1dCk6IElNY3BTZXJ2ZXJJbnB1dCB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uaW5wdXQsXG5cdFx0XHRcdFx0aXNSZXF1aXJlZDogaW5wdXQuaXNfcmVxdWlyZWQsXG5cdFx0XHRcdFx0aXNTZWNyZXQ6IGlucHV0LmlzX3NlY3JldCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gY29udmVydFZhcmlhYmxlcyh2YXJpYWJsZXM6IFJlY29yZDxzdHJpbmcsIFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbnB1dD4pOiBSZWNvcmQ8c3RyaW5nLCBJTWNwU2VydmVySW5wdXQ+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBJTWNwU2VydmVySW5wdXQ+ID0ge307XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhYmxlcykpIHtcblx0XHRcdFx0XHRyZXN1bHRba2V5XSA9IGNvbnZlcnRTZXJ2ZXJJbnB1dCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gY29udmVydFNlcnZlckFyZ3VtZW50KGFyZzogUmF3R2FsbGVyeU1jcFNlcnZlckFyZ3VtZW50KTogSU1jcFNlcnZlckFyZ3VtZW50IHtcblx0XHRcdFx0aWYgKGFyZy50eXBlID09PSAncG9zaXRpb25hbCcpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4uYXJnLFxuXHRcdFx0XHRcdFx0dmFsdWVIaW50OiBhcmcudmFsdWVfaGludCxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGFyZy5pc19yZXBlYXRlZCxcblx0XHRcdFx0XHRcdGlzUmVxdWlyZWQ6IGFyZy5pc19yZXF1aXJlZCxcblx0XHRcdFx0XHRcdGlzU2VjcmV0OiBhcmcuaXNfc2VjcmV0LFxuXHRcdFx0XHRcdFx0dmFyaWFibGVzOiBhcmcudmFyaWFibGVzID8gY29udmVydFZhcmlhYmxlcyhhcmcudmFyaWFibGVzKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYXJnLFxuXHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGFyZy5pc19yZXBlYXRlZCxcblx0XHRcdFx0XHRpc1JlcXVpcmVkOiBhcmcuaXNfcmVxdWlyZWQsXG5cdFx0XHRcdFx0aXNTZWNyZXQ6IGFyZy5pc19zZWNyZXQsXG5cdFx0XHRcdFx0dmFyaWFibGVzOiBhcmcudmFyaWFibGVzID8gY29udmVydFZhcmlhYmxlcyhhcmcudmFyaWFibGVzKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gY29udmVydEtleVZhbHVlSW5wdXQoaW5wdXQ6IFJhd0dhbGxlcnlNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0KTogSU1jcFNlcnZlcktleVZhbHVlSW5wdXQge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmlucHV0LFxuXHRcdFx0XHRcdGlzUmVxdWlyZWQ6IGlucHV0LmlzX3JlcXVpcmVkLFxuXHRcdFx0XHRcdGlzU2VjcmV0OiBpbnB1dC5pc19zZWNyZXQsXG5cdFx0XHRcdFx0dmFyaWFibGVzOiBpbnB1dC52YXJpYWJsZXMgPyBjb252ZXJ0VmFyaWFibGVzKGlucHV0LnZhcmlhYmxlcykgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGNvbnZlcnRUcmFuc3BvcnQoaW5wdXQ6IFJhd0dhbGxlcnlUcmFuc3BvcnQpOiBUcmFuc3BvcnQge1xuXHRcdFx0XHRzd2l0Y2ggKGlucHV0LnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdzdGRpbyc6XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjYXNlICdzdHJlYW1hYmxlLWh0dHAnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogVHJhbnNwb3J0VHlwZS5TVFJFQU1BQkxFX0hUVFAsXG5cdFx0XHRcdFx0XHRcdHVybDogaW5wdXQudXJsLFxuXHRcdFx0XHRcdFx0XHRoZWFkZXJzOiBpbnB1dC5oZWFkZXJzPy5tYXAoY29udmVydEtleVZhbHVlSW5wdXQpLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjYXNlICdzc2UnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogVHJhbnNwb3J0VHlwZS5TU0UsXG5cdFx0XHRcdFx0XHRcdHVybDogaW5wdXQudXJsLFxuXHRcdFx0XHRcdFx0XHRoZWFkZXJzOiBpbnB1dC5oZWFkZXJzPy5tYXAoY29udmVydEtleVZhbHVlSW5wdXQpLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gY29udmVydFJlZ2lzdHJ5VHlwZShpbnB1dDogc3RyaW5nKTogUmVnaXN0cnlUeXBlIHtcblx0XHRcdFx0c3dpdGNoIChpbnB1dCkge1xuXHRcdFx0XHRcdGNhc2UgJ25wbSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gUmVnaXN0cnlUeXBlLk5PREU7XG5cdFx0XHRcdFx0Y2FzZSAnZG9ja2VyJzpcblx0XHRcdFx0XHRjYXNlICdkb2NrZXItaHViJzpcblx0XHRcdFx0XHRjYXNlICdvY2knOlxuXHRcdFx0XHRcdFx0cmV0dXJuIFJlZ2lzdHJ5VHlwZS5ET0NLRVI7XG5cdFx0XHRcdFx0Y2FzZSAncHlwaSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gUmVnaXN0cnlUeXBlLlBZVEhPTjtcblx0XHRcdFx0XHRjYXNlICdudWdldCc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gUmVnaXN0cnlUeXBlLk5VR0VUO1xuXHRcdFx0XHRcdGNhc2UgJ21jcGInOlxuXHRcdFx0XHRcdFx0cmV0dXJuIFJlZ2lzdHJ5VHlwZS5NQ1BCO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4gUmVnaXN0cnlUeXBlLk5PREU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ2l0SHViSW5mbzogUmF3R2l0SHViSW5mbyB8IHVuZGVmaW5lZCA9IGZyb20uX21ldGFbJ2lvLm1vZGVsY29udGV4dHByb3RvY29sLnJlZ2lzdHJ5L3B1Ymxpc2hlci1wcm92aWRlZCddPy5naXRodWIgYXMgUmF3R2l0SHViSW5mbyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHJlZ2lzdHJ5SW5mby5pZCxcblx0XHRcdFx0bmFtZTogZnJvbS5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZnJvbS5kZXNjcmlwdGlvbixcblx0XHRcdFx0cmVwb3NpdG9yeTogZnJvbS5yZXBvc2l0b3J5ID8ge1xuXHRcdFx0XHRcdHVybDogZnJvbS5yZXBvc2l0b3J5LnVybCxcblx0XHRcdFx0XHRzb3VyY2U6IGZyb20ucmVwb3NpdG9yeS5zb3VyY2UsXG5cdFx0XHRcdFx0aWQ6IGZyb20ucmVwb3NpdG9yeS5pZCxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVhZG1lOiBmcm9tLnJlcG9zaXRvcnk/LnJlYWRtZSxcblx0XHRcdFx0dmVyc2lvbjogZnJvbS52ZXJzaW9uLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IGZyb20uY3JlYXRlZF9hdCxcblx0XHRcdFx0dXBkYXRlZEF0OiBmcm9tLnVwZGF0ZWRfYXQsXG5cdFx0XHRcdHBhY2thZ2VzOiBmcm9tLnBhY2thZ2VzPy5tYXA8SU1jcFNlcnZlclBhY2thZ2U+KHAgPT4gKHtcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBwLmlkZW50aWZpZXIgPz8gcC5uYW1lLFxuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogY29udmVydFJlZ2lzdHJ5VHlwZShwLnJlZ2lzdHJ5X3R5cGUgPz8gcC5yZWdpc3RyeV9uYW1lKSxcblx0XHRcdFx0XHR2ZXJzaW9uOiBwLnZlcnNpb24sXG5cdFx0XHRcdFx0ZmlsZVNoYTI1NjogcC5maWxlX3NoYTI1Nixcblx0XHRcdFx0XHRyZWdpc3RyeUJhc2VVcmw6IHAucmVnaXN0cnlfYmFzZV91cmwsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiBwLnRyYW5zcG9ydCA/IGNvbnZlcnRUcmFuc3BvcnQocC50cmFuc3BvcnQpIDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0cGFja2FnZUFyZ3VtZW50czogcC5wYWNrYWdlX2FyZ3VtZW50cz8ubWFwKGNvbnZlcnRTZXJ2ZXJBcmd1bWVudCksXG5cdFx0XHRcdFx0cnVudGltZUhpbnQ6IHAucnVudGltZV9oaW50LFxuXHRcdFx0XHRcdHJ1bnRpbWVBcmd1bWVudHM6IHAucnVudGltZV9hcmd1bWVudHM/Lm1hcChjb252ZXJ0U2VydmVyQXJndW1lbnQpLFxuXHRcdFx0XHRcdGVudmlyb25tZW50VmFyaWFibGVzOiBwLmVudmlyb25tZW50X3ZhcmlhYmxlcz8ubWFwKGNvbnZlcnRLZXlWYWx1ZUlucHV0KSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRyZW1vdGVzOiBmcm9tLnJlbW90ZXM/Lm1hcChyZW1vdGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHR5cGUgPSAoPFJhd0dhbGxlcnlUcmFuc3BvcnQ+cmVtb3RlKS50eXBlID8/ICg8TWNwU2VydmVyRGVwcmVjYXRlZFJlbW90ZT5yZW1vdGUpLnRyYW5zcG9ydF90eXBlID8/ICg8TWNwU2VydmVyRGVwcmVjYXRlZFJlbW90ZT5yZW1vdGUpLnRyYW5zcG9ydDtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogdHlwZSA9PT0gVHJhbnNwb3J0VHlwZS5TU0UgPyBUcmFuc3BvcnRUeXBlLlNTRSA6IFRyYW5zcG9ydFR5cGUuU1RSRUFNQUJMRV9IVFRQLFxuXHRcdFx0XHRcdFx0dXJsOiByZW1vdGUudXJsLFxuXHRcdFx0XHRcdFx0aGVhZGVyczogcmVtb3RlLmhlYWRlcnM/Lm1hcChjb252ZXJ0S2V5VmFsdWVJbnB1dClcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0cmVnaXN0cnlJbmZvOiB7XG5cdFx0XHRcdFx0aXNMYXRlc3Q6IHJlZ2lzdHJ5SW5mby5pc19sYXRlc3QsXG5cdFx0XHRcdFx0cHVibGlzaGVkQXQ6IHJlZ2lzdHJ5SW5mby5wdWJsaXNoZWRfYXQsXG5cdFx0XHRcdFx0dXBkYXRlZEF0OiByZWdpc3RyeUluZm8udXBkYXRlZF9hdCxcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2l0aHViSW5mbzogZ2l0SHViSW5mbyA/IHtcblx0XHRcdFx0XHRuYW1lOiBnaXRIdWJJbmZvLm5hbWUsXG5cdFx0XHRcdFx0bmFtZVdpdGhPd25lcjogZ2l0SHViSW5mby5uYW1lX3dpdGhfb3duZXIsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGdpdEh1YkluZm8uZGlzcGxheV9uYW1lLFxuXHRcdFx0XHRcdGlzSW5Pcmdhbml6YXRpb246IGdpdEh1YkluZm8uaXNfaW5fb3JnYW5pemF0aW9uLFxuXHRcdFx0XHRcdGxpY2Vuc2U6IGdpdEh1YkluZm8ubGljZW5zZSxcblx0XHRcdFx0XHRvcGVuZ3JhcGhJbWFnZVVybDogZ2l0SHViSW5mby5vcGVuZ3JhcGhfaW1hZ2VfdXJsLFxuXHRcdFx0XHRcdG93bmVyQXZhdGFyVXJsOiBnaXRIdWJJbmZvLm93bmVyX2F2YXRhcl91cmwsXG5cdFx0XHRcdFx0cHJpbWFyeUxhbmd1YWdlOiBnaXRIdWJJbmZvLnByaW1hcnlfbGFuZ3VhZ2UsXG5cdFx0XHRcdFx0cHJpbWFyeUxhbmd1YWdlQ29sb3I6IGdpdEh1YkluZm8ucHJpbWFyeV9sYW5ndWFnZV9jb2xvcixcblx0XHRcdFx0XHRwdXNoZWRBdDogZ2l0SHViSW5mby5wdXNoZWRfYXQsXG5cdFx0XHRcdFx0c3RhcmdhemVyQ291bnQ6IGdpdEh1YkluZm8uc3RhcmdhemVyX2NvdW50LFxuXHRcdFx0XHRcdHRvcGljczogZ2l0SHViSW5mby50b3BpY3MsXG5cdFx0XHRcdFx0dXNlc0N1c3RvbU9wZW5ncmFwaEltYWdlOiBnaXRIdWJJbmZvLnVzZXNfY3VzdG9tX29wZW5ncmFwaF9pbWFnZVxuXHRcdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBTRVJJQUxJWkVSID0gbmV3IFNlcmlhbGl6ZXIoKTtcbn1cblxubmFtZXNwYWNlIE1jcFNlcnZlclNjaGVtYVZlcnNpb25fdjBfMSB7XG5cblx0ZXhwb3J0IGNvbnN0IFZFUlNJT04gPSAndjAuMSc7XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbnB1dCB7XG5cdFx0cmVhZG9ubHkgY2hvaWNlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdHJlYWRvbmx5IGRlZmF1bHQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZm9ybWF0PzogJ3N0cmluZycgfCAnbnVtYmVyJyB8ICdib29sZWFuJyB8ICdmaWxlcGF0aCc7XG5cdFx0cmVhZG9ubHkgaXNSZXF1aXJlZD86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgaXNTZWNyZXQ/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHBsYWNlaG9sZGVyPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHZhbHVlPzogc3RyaW5nO1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJWYXJpYWJsZUlucHV0IGV4dGVuZHMgUmF3R2FsbGVyeU1jcFNlcnZlcklucHV0IHtcblx0XHRyZWFkb25seSB2YXJpYWJsZXM/OiBSZWNvcmQ8c3RyaW5nLCBSYXdHYWxsZXJ5TWNwU2VydmVySW5wdXQ+O1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJQb3NpdGlvbmFsQXJndW1lbnQgZXh0ZW5kcyBSYXdHYWxsZXJ5TWNwU2VydmVyVmFyaWFibGVJbnB1dCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogJ3Bvc2l0aW9uYWwnO1xuXHRcdHJlYWRvbmx5IHZhbHVlSGludD86IHN0cmluZztcblx0XHRyZWFkb25seSBpc1JlcGVhdGVkPzogYm9vbGVhbjtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyTmFtZWRBcmd1bWVudCBleHRlbmRzIFJhd0dhbGxlcnlNY3BTZXJ2ZXJWYXJpYWJsZUlucHV0IHtcblx0XHRyZWFkb25seSB0eXBlOiAnbmFtZWQnO1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBpc1JlcGVhdGVkPzogYm9vbGVhbjtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyS2V5VmFsdWVJbnB1dCBleHRlbmRzIFJhd0dhbGxlcnlNY3BTZXJ2ZXJWYXJpYWJsZUlucHV0IHtcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdH1cblxuXHR0eXBlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJBcmd1bWVudCA9IFJhd0dhbGxlcnlNY3BTZXJ2ZXJQb3NpdGlvbmFsQXJndW1lbnQgfCBSYXdHYWxsZXJ5TWNwU2VydmVyTmFtZWRBcmd1bWVudDtcblxuXHR0eXBlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJSZW1vdGVzID0gUmVhZG9ubHlBcnJheTxTc2VUcmFuc3BvcnQgfCBTdHJlYW1hYmxlSHR0cFRyYW5zcG9ydD47XG5cblx0dHlwZSBSYXdHYWxsZXJ5VHJhbnNwb3J0ID0gU3RkaW9UcmFuc3BvcnQgfCBTdHJlYW1hYmxlSHR0cFRyYW5zcG9ydCB8IFNzZVRyYW5zcG9ydDtcblxuXHRpbnRlcmZhY2UgU3RkaW9UcmFuc3BvcnQge1xuXHRcdHJlYWRvbmx5IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU87XG5cdH1cblxuXHRpbnRlcmZhY2UgU3RyZWFtYWJsZUh0dHBUcmFuc3BvcnQge1xuXHRcdHJlYWRvbmx5IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RSRUFNQUJMRV9IVFRQO1xuXHRcdHJlYWRvbmx5IHVybDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGhlYWRlcnM/OiBSZWFkb25seUFycmF5PFJhd0dhbGxlcnlNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0Pjtcblx0fVxuXG5cdGludGVyZmFjZSBTc2VUcmFuc3BvcnQge1xuXHRcdHJlYWRvbmx5IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1NFO1xuXHRcdHJlYWRvbmx5IHVybDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGhlYWRlcnM/OiBSZWFkb25seUFycmF5PFJhd0dhbGxlcnlNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0Pjtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyUGFja2FnZSB7XG5cdFx0cmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlO1xuXHRcdHJlYWRvbmx5IHRyYW5zcG9ydDogUmF3R2FsbGVyeVRyYW5zcG9ydDtcblx0XHRyZWFkb25seSBmaWxlU2hhMjU2Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGVudmlyb25tZW50VmFyaWFibGVzPzogUmVhZG9ubHlBcnJheTxSYXdHYWxsZXJ5TWNwU2VydmVyS2V5VmFsdWVJbnB1dD47XG5cdFx0cmVhZG9ubHkgcGFja2FnZUFyZ3VtZW50cz86IHJlYWRvbmx5IFJhd0dhbGxlcnlNY3BTZXJ2ZXJBcmd1bWVudFtdO1xuXHRcdHJlYWRvbmx5IHJlZ2lzdHJ5QmFzZVVybD86IHN0cmluZztcblx0XHRyZWFkb25seSBydW50aW1lQXJndW1lbnRzPzogcmVhZG9ubHkgUmF3R2FsbGVyeU1jcFNlcnZlckFyZ3VtZW50W107XG5cdFx0cmVhZG9ubHkgcnVudGltZUhpbnQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdmVyc2lvbj86IHN0cmluZztcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyIHtcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0XHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgJHNjaGVtYTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGljb25zPzogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJJY29uW107XG5cdFx0cmVhZG9ubHkgcmVwb3NpdG9yeT86IHtcblx0XHRcdHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBzdWJmb2xkZXI/OiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBpZD86IHN0cmluZztcblx0XHR9O1xuXHRcdHJlYWRvbmx5IHdlYnNpdGVVcmw/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcGFja2FnZXM/OiByZWFkb25seSBSYXdHYWxsZXJ5TWNwU2VydmVyUGFja2FnZVtdO1xuXHRcdHJlYWRvbmx5IHJlbW90ZXM/OiBSYXdHYWxsZXJ5TWNwU2VydmVyUmVtb3Rlcztcblx0XHRyZWFkb25seSBfbWV0YT86IHtcblx0XHRcdHJlYWRvbmx5ICdpby5tb2RlbGNvbnRleHRwcm90b2NvbC5yZWdpc3RyeS9wdWJsaXNoZXItcHJvdmlkZWQnPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0fSAmIElBenVyZUFQSUNlbnRlckluZm87XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlckluZm8ge1xuXHRcdHJlYWRvbmx5IHNlcnZlcjogUmF3R2FsbGVyeU1jcFNlcnZlcjtcblx0XHRyZWFkb25seSBfbWV0YToge1xuXHRcdFx0cmVhZG9ubHkgJ2lvLm1vZGVsY29udGV4dHByb3RvY29sLnJlZ2lzdHJ5L29mZmljaWFsJz86IHtcblx0XHRcdFx0cmVhZG9ubHkgc3RhdHVzOiBHYWxsZXJ5TWNwU2VydmVyU3RhdHVzO1xuXHRcdFx0XHRyZWFkb25seSBpc0xhdGVzdDogYm9vbGVhbjtcblx0XHRcdFx0cmVhZG9ubHkgcHVibGlzaGVkQXQ6IHN0cmluZztcblx0XHRcdFx0cmVhZG9ubHkgdXBkYXRlZEF0Pzogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHR9O1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHtcblx0XHRyZWFkb25seSBtZXRhZGF0YToge1xuXHRcdFx0cmVhZG9ubHkgY291bnQ6IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IG5leHRDdXJzb3I/OiBzdHJpbmc7XG5cdFx0fTtcblx0XHRyZWFkb25seSBzZXJ2ZXJzOiByZWFkb25seSBSYXdHYWxsZXJ5TWNwU2VydmVySW5mb1tdO1xuXHR9XG5cblx0Y2xhc3MgU2VyaWFsaXplciBpbXBsZW1lbnRzIElHYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXIge1xuXG5cdFx0cHVibGljIHRvUmF3R2FsbGVyeU1jcFNlcnZlclJlc3VsdChpbnB1dDogdW5rbm93bik6IElSYXdHYWxsZXJ5TWNwU2VydmVyc1Jlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcgfHwgIUFycmF5LmlzQXJyYXkoKGlucHV0IGFzIFJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0KS5zZXJ2ZXJzKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmcm9tID0gPFJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0PmlucHV0O1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJzOiBJUmF3R2FsbGVyeU1jcFNlcnZlcltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBmcm9tLnNlcnZlcnMpIHtcblx0XHRcdFx0Y29uc3QgcmF3U2VydmVyID0gdGhpcy50b1Jhd0dhbGxlcnlNY3BTZXJ2ZXIoc2VydmVyKTtcblx0XHRcdFx0aWYgKCFyYXdTZXJ2ZXIpIHtcblx0XHRcdFx0XHRpZiAoc2VydmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRzZXJ2ZXJzLnB1c2gocmF3U2VydmVyKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWV0YWRhdGE6IGZyb20ubWV0YWRhdGEsXG5cdFx0XHRcdHNlcnZlcnNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cHVibGljIHRvUmF3R2FsbGVyeU1jcFNlcnZlcihpbnB1dDogdW5rbm93bik6IElSYXdHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmcm9tID0gPFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbmZvPmlucHV0O1xuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdCghZnJvbS5zZXJ2ZXIgfHwgIWlzT2JqZWN0KGZyb20uc2VydmVyKSlcblx0XHRcdFx0fHwgKCFmcm9tLnNlcnZlci5uYW1lIHx8ICFpc1N0cmluZyhmcm9tLnNlcnZlci5uYW1lKSlcblx0XHRcdFx0fHwgKCFmcm9tLnNlcnZlci5kZXNjcmlwdGlvbiB8fCAhaXNTdHJpbmcoZnJvbS5zZXJ2ZXIuZGVzY3JpcHRpb24pKVxuXHRcdFx0XHR8fCAoIWZyb20uc2VydmVyLnZlcnNpb24gfHwgIWlzU3RyaW5nKGZyb20uc2VydmVyLnZlcnNpb24pKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgJ2lvLm1vZGVsY29udGV4dHByb3RvY29sLnJlZ2lzdHJ5L29mZmljaWFsJzogcmVnaXN0cnlJbmZvLCAuLi5hcGljSW5mbyB9ID0gZnJvbS5fbWV0YTtcblx0XHRcdGNvbnN0IGdpdGh1YkluZm8gPSBmcm9tLnNlcnZlci5fbWV0YT8uWydpby5tb2RlbGNvbnRleHRwcm90b2NvbC5yZWdpc3RyeS9wdWJsaXNoZXItcHJvdmlkZWQnXT8uZ2l0aHViIGFzIElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRuYW1lOiBmcm9tLnNlcnZlci5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZnJvbS5zZXJ2ZXIuZGVzY3JpcHRpb24sXG5cdFx0XHRcdHZlcnNpb246IGZyb20uc2VydmVyLnZlcnNpb24sXG5cdFx0XHRcdHRpdGxlOiBmcm9tLnNlcnZlci50aXRsZSxcblx0XHRcdFx0cmVwb3NpdG9yeTogZnJvbS5zZXJ2ZXIucmVwb3NpdG9yeSA/IHtcblx0XHRcdFx0XHR1cmw6IGZyb20uc2VydmVyLnJlcG9zaXRvcnkudXJsLFxuXHRcdFx0XHRcdHNvdXJjZTogZnJvbS5zZXJ2ZXIucmVwb3NpdG9yeS5zb3VyY2UsXG5cdFx0XHRcdFx0aWQ6IGZyb20uc2VydmVyLnJlcG9zaXRvcnkuaWQsXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlYWRtZTogZ2l0aHViSW5mbz8ucmVhZG1lLFxuXHRcdFx0XHRpY29uczogZnJvbS5zZXJ2ZXIuaWNvbnMsXG5cdFx0XHRcdHdlYnNpdGVVcmw6IGZyb20uc2VydmVyLndlYnNpdGVVcmwsXG5cdFx0XHRcdHBhY2thZ2VzOiBmcm9tLnNlcnZlci5wYWNrYWdlcyxcblx0XHRcdFx0cmVtb3RlczogZnJvbS5zZXJ2ZXIucmVtb3Rlcyxcblx0XHRcdFx0c3RhdHVzOiByZWdpc3RyeUluZm8/LnN0YXR1cyxcblx0XHRcdFx0cmVnaXN0cnlJbmZvLFxuXHRcdFx0XHRnaXRodWJJbmZvLFxuXHRcdFx0XHRhcGljSW5mb1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgU0VSSUFMSVpFUiA9IG5ldyBTZXJpYWxpemVyKCk7XG59XG5cbm5hbWVzcGFjZSBNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YwIHtcblxuXHRleHBvcnQgY29uc3QgVkVSU0lPTiA9ICd2MCc7XG5cblx0Y2xhc3MgU2VyaWFsaXplciBpbXBsZW1lbnRzIElHYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXIge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBnYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzOiBJR2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVyW10gPSBbXTtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0dGhpcy5nYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzLnB1c2goTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MF8xLlNFUklBTElaRVIpO1xuXHRcdFx0dGhpcy5nYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzLnB1c2goTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MjAyNV8wN18wOS5TRVJJQUxJWkVSKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdG9SYXdHYWxsZXJ5TWNwU2VydmVyUmVzdWx0KGlucHV0OiB1bmtub3duKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRcdGZvciAoY29uc3Qgc2VyaWFsaXplciBvZiB0aGlzLmdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplcnMpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VyaWFsaXplci50b1Jhd0dhbGxlcnlNY3BTZXJ2ZXJSZXN1bHQoaW5wdXQpO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRwdWJsaWMgdG9SYXdHYWxsZXJ5TWNwU2VydmVyKGlucHV0OiB1bmtub3duKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdFx0Zm9yIChjb25zdCBzZXJpYWxpemVyIG9mIHRoaXMuZ2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVycykge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBzZXJpYWxpemVyLnRvUmF3R2FsbGVyeU1jcFNlcnZlcihpbnB1dCk7XG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBTRVJJQUxJWkVSID0gbmV3IFNlcmlhbGl6ZXIoKTtcbn1cblxuY29uc3QgRGVmYXVsdFBhZ2VTaXplID0gNTA7XG5cbmludGVyZmFjZSBJUXVlcnlTdGF0ZSB7XG5cdHJlYWRvbmx5IHNlYXJjaFRleHQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGN1cnNvcj86IHN0cmluZztcblx0cmVhZG9ubHkgcGFnZVNpemU6IG51bWJlcjtcbn1cblxuY29uc3QgRGVmYXVsdFF1ZXJ5U3RhdGU6IElRdWVyeVN0YXRlID0ge1xuXHRwYWdlU2l6ZTogRGVmYXVsdFBhZ2VTaXplLFxufTtcblxuY2xhc3MgUXVlcnkge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc3RhdGUgPSBEZWZhdWx0UXVlcnlTdGF0ZSkgeyB9XG5cblx0Z2V0IHBhZ2VTaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnN0YXRlLnBhZ2VTaXplOyB9XG5cdGdldCBzZWFyY2hUZXh0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnN0YXRlLnNlYXJjaFRleHQ7IH1cblx0Z2V0IGN1cnNvcigpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5zdGF0ZS5jdXJzb3I7IH1cblxuXHR3aXRoUGFnZShjdXJzb3I6IHN0cmluZywgcGFnZVNpemU6IG51bWJlciA9IHRoaXMucGFnZVNpemUpOiBRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBRdWVyeSh7IC4uLnRoaXMuc3RhdGUsIHBhZ2VTaXplLCBjdXJzb3IgfSk7XG5cdH1cblxuXHR3aXRoU2VhcmNoVGV4dChzZWFyY2hUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBRdWVyeSB7XG5cdFx0cmV0dXJuIG5ldyBRdWVyeSh7IC4uLnRoaXMuc3RhdGUsIHNlYXJjaFRleHQgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcEdhbGxlcnlTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BHYWxsZXJ5U2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZ2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVyczogTWFwPHN0cmluZywgSUdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplcj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5nYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuZ2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVycy5zZXQoTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MC5WRVJTSU9OLCBNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YwLlNFUklBTElaRVIpO1xuXHRcdHRoaXMuZ2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVycy5zZXQoTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MF8xLlZFUlNJT04sIE1jcFNlcnZlclNjaGVtYVZlcnNpb25fdjBfMS5TRVJJQUxJWkVSKTtcblx0fVxuXG5cdGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cyA9PT0gTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkF2YWlsYWJsZTtcblx0fVxuXG5cdGFzeW5jIHF1ZXJ5KG9wdGlvbnM/OiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJSXRlcmF0aXZlUGFnZXI8SUdhbGxlcnlNY3BTZXJ2ZXI+PiB7XG5cdFx0Y29uc3QgbWNwR2FsbGVyeU1hbmlmZXN0ID0gYXdhaXQgdGhpcy5tY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldE1jcEdhbGxlcnlNYW5pZmVzdCgpO1xuXHRcdGlmICghbWNwR2FsbGVyeU1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmaXJzdFBhZ2U6IHsgaXRlbXM6IFtdLCBoYXNNb3JlOiBmYWxzZSB9LFxuXHRcdFx0XHRnZXROZXh0UGFnZTogYXN5bmMgKCkgPT4gKHsgaXRlbXM6IFtdLCBoYXNNb3JlOiBmYWxzZSB9KVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRsZXQgcXVlcnkgPSBuZXcgUXVlcnkoKTtcblx0XHRpZiAob3B0aW9ucz8udGV4dCkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoU2VhcmNoVGV4dChvcHRpb25zLnRleHQudHJpbSgpKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHNlcnZlcnMsIG1ldGFkYXRhIH0gPSBhd2FpdCB0aGlzLnF1ZXJ5R2FsbGVyeU1jcFNlcnZlcnMocXVlcnksIG1jcEdhbGxlcnlNYW5pZmVzdCwgdG9rZW4pO1xuXG5cdFx0bGV0IGN1cnJlbnRDdXJzb3IgPSBtZXRhZGF0YS5uZXh0Q3Vyc29yO1xuXHRcdHJldHVybiB7XG5cdFx0XHRmaXJzdFBhZ2U6IHsgaXRlbXM6IHNlcnZlcnMsIGhhc01vcmU6ICEhbWV0YWRhdGEubmV4dEN1cnNvciB9LFxuXHRcdFx0Z2V0TmV4dFBhZ2U6IGFzeW5jIChjdDogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElJdGVyYXRpdmVQYWdlPElHYWxsZXJ5TWNwU2VydmVyPj4gPT4ge1xuXHRcdFx0XHRpZiAoY3QuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWN1cnJlbnRDdXJzb3IpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBpdGVtczogW10sIGhhc01vcmU6IGZhbHNlIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBzZXJ2ZXJzLCBtZXRhZGF0YTogbmV4dE1ldGFkYXRhIH0gPSBhd2FpdCB0aGlzLnF1ZXJ5R2FsbGVyeU1jcFNlcnZlcnMocXVlcnkud2l0aFBhZ2UoY3VycmVudEN1cnNvcikud2l0aFNlYXJjaFRleHQodW5kZWZpbmVkKSwgbWNwR2FsbGVyeU1hbmlmZXN0LCBjdCk7XG5cdFx0XHRcdGN1cnJlbnRDdXJzb3IgPSBuZXh0TWV0YWRhdGEubmV4dEN1cnNvcjtcblx0XHRcdFx0cmV0dXJuIHsgaXRlbXM6IHNlcnZlcnMsIGhhc01vcmU6ICEhbmV4dE1ldGFkYXRhLm5leHRDdXJzb3IgfTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0TWNwU2VydmVyc0Zyb21HYWxsZXJ5KGluZm9zOiB7IG5hbWU6IHN0cmluZzsgaWQ/OiBzdHJpbmcgfVtdKTogUHJvbWlzZTxJR2FsbGVyeU1jcFNlcnZlcltdPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLnJlc29sdmVNY3BTZXJ2ZXJzRnJvbUdhbGxlcnkoaW5mb3MpO1xuXHRcdGNvbnN0IG1jcFNlcnZlcnM6IElHYWxsZXJ5TWNwU2VydmVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXNvbHZlZC52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09IE1jcEdhbGxlcnlSZXNvbHZlU3RhdHVzLkZvdW5kKSB7XG5cdFx0XHRcdG1jcFNlcnZlcnMucHVzaChyZXN1bHQuc2VydmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1jcFNlcnZlcnM7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlTWNwU2VydmVyc0Zyb21HYWxsZXJ5KGluZm9zOiB7IG5hbWU6IHN0cmluZzsgaWQ/OiBzdHJpbmcgfVtdKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBJTWNwR2FsbGVyeVNlcnZlclJlc29sdmVSZXN1bHQ+PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIElNY3BHYWxsZXJ5U2VydmVyUmVzb2x2ZVJlc3VsdD4oKTtcblx0XHRjb25zdCBtY3BHYWxsZXJ5TWFuaWZlc3QgPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0TWNwR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0aWYgKCFtY3BHYWxsZXJ5TWFuaWZlc3QpIHtcblx0XHRcdC8vIFdpdGhvdXQgYSByZWdpc3RyeSBtYW5pZmVzdCB3ZSBjYW5ub3QgZGV0ZXJtaW5lIG1lbWJlcnNoaXA7IHJlcG9ydCBhcyBmYWlsZWRcblx0XHRcdC8vICh1bmRldGVybWluZWQpIHNvIGNhbGxlcnMgZG8gbm90IHRyZWF0IHRoaXMgYXMgYSBkZWZpbml0aXZlIFwibm90IGZvdW5kXCIuXG5cdFx0XHRmb3IgKGNvbnN0IGluZm8gb2YgaW5mb3MpIHtcblx0XHRcdFx0cmVzdWx0LnNldChpbmZvLm5hbWUsIHsgc3RhdHVzOiBNY3BHYWxsZXJ5UmVzb2x2ZVN0YXR1cy5GYWlsZWQgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKGluZm9zLm1hcChhc3luYyBpbmZvID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1jcFNlcnZlciA9IGF3YWl0IHRoaXMuZ2V0TWNwU2VydmVyQnlOYW1lKGluZm8sIG1jcEdhbGxlcnlNYW5pZmVzdCk7XG5cdFx0XHRcdHJlc3VsdC5zZXQoaW5mby5uYW1lLCBtY3BTZXJ2ZXJcblx0XHRcdFx0XHQ/IHsgc3RhdHVzOiBNY3BHYWxsZXJ5UmVzb2x2ZVN0YXR1cy5Gb3VuZCwgc2VydmVyOiBtY3BTZXJ2ZXIgfVxuXHRcdFx0XHRcdDogeyBzdGF0dXM6IE1jcEdhbGxlcnlSZXNvbHZlU3RhdHVzLk5vdEZvdW5kIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEZhaWxlZCB0byByZXNvbHZlIE1DUCBzZXJ2ZXIgJyR7aW5mby5uYW1lfScgZnJvbSBnYWxsZXJ5OiAke2Vycm9yfWApO1xuXHRcdFx0XHRyZXN1bHQuc2V0KGluZm8ubmFtZSwgeyBzdGF0dXM6IE1jcEdhbGxlcnlSZXNvbHZlU3RhdHVzLkZhaWxlZCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRNY3BTZXJ2ZXJCeU5hbWUoeyBuYW1lLCBpZCB9OiB7IG5hbWU6IHN0cmluZzsgaWQ/OiBzdHJpbmcgfSwgbWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0KTogUHJvbWlzZTxJR2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHVybHMgPSBbXG5cdFx0XHR0aGlzLmdldExhdGVzdFNlcnZlclZlcnNpb25VcmwobmFtZSwgbWNwR2FsbGVyeU1hbmlmZXN0KSxcblx0XHRcdHRoaXMuZ2V0TmFtZWRTZXJ2ZXJVcmwobmFtZSwgbWNwR2FsbGVyeU1hbmlmZXN0KSxcblx0XHRcdGlkID8gdGhpcy5nZXRTZXJ2ZXJJZFVybChpZCwgbWNwR2FsbGVyeU1hbmlmZXN0KSA6IHVuZGVmaW5lZCxcblx0XHRdO1xuXG5cdFx0bGV0IGF0dGVtcHRlZCA9IGZhbHNlO1xuXHRcdGxldCBsYXN0RXJyb3I6IHVua25vd247XG5cdFx0Zm9yIChjb25zdCB1cmwgb2YgdXJscykge1xuXHRcdFx0aWYgKCF1cmwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRhdHRlbXB0ZWQgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWNwU2VydmVyID0gYXdhaXQgdGhpcy5nZXRNY3BTZXJ2ZXIodXJsKTtcblx0XHRcdFx0aWYgKG1jcFNlcnZlcikge1xuXHRcdFx0XHRcdGlmIChtY3BTZXJ2ZXIubmFtZSA9PT0gbmFtZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1jcFNlcnZlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFzdEVycm9yID0gbmV3IEVycm9yKGBNQ1Agc2VydmVyIGxvb2t1cCBmb3IgJyR7bmFtZX0nIHJldHVybmVkICcke21jcFNlcnZlci5uYW1lfSdgKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gVHJhbnNpZW50L3VuZGV0ZXJtaW5lZCBmYWlsdXJlIG9uIHRoaXMgZW5kcG9pbnQ6IHJlbWVtYmVyIGl0IGFuZCBzdGlsbFxuXHRcdFx0XHQvLyB0cnkgdGhlIHJlbWFpbmluZyBlbmRwb2ludHMgYmVmb3JlIGdpdmluZyB1cC5cblx0XHRcdFx0bGFzdEVycm9yID0gZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT25seSByZXBvcnQgYSBkZWZpbml0aXZlIFwibm90IGZvdW5kXCIgKHVuZGVmaW5lZCkgd2hlbiBhdCBsZWFzdCBvbmUgZW5kcG9pbnRcblx0XHQvLyB3YXMgcXVlcmllZCBhbmQgZXZlcnkgYXR0ZW1wdCByZXR1cm5lZCBhbiBhdXRob3JpdGF0aXZlIG5lZ2F0aXZlLiBJZiBub1xuXHRcdC8vIGVuZHBvaW50IGNvdWxkIGJlIHF1ZXJpZWQsIG9yIGFueSBhdHRlbXB0IGZhaWxlZCB0cmFuc2llbnRseSwgc3VyZmFjZSBhblxuXHRcdC8vIGVycm9yIHNvIG1lbWJlcnNoaXAgaXMgdHJlYXRlZCBhcyB1bmRldGVybWluZWQgcmF0aGVyIHRoYW4gYWJzZW50LlxuXHRcdGlmICghYXR0ZW1wdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIE1DUCBzZXJ2ZXIgJyR7bmFtZX0nOiByZWdpc3RyeSBtYW5pZmVzdCBoYXMgbm8gc2VydmVyIGxvb2t1cCBlbmRwb2ludGApO1xuXHRcdH1cblx0XHRpZiAobGFzdEVycm9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IGxhc3RFcnJvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVhZG1lKGdhbGxlcnk6IElHYWxsZXJ5TWNwU2VydmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlYWRtZVVybCA9IGdhbGxlcnkucmVhZG1lVXJsO1xuXHRcdGlmICghcmVhZG1lVXJsKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGxvY2FsaXplKCdub1JlYWRtZScsICdObyBSRUFETUUgYXZhaWxhYmxlJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShyZWFkbWVVcmwpO1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byByZWFkIGZpbGUgZnJvbSAke3VyaX06ICR7ZXJyb3J9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHVyaS5hdXRob3JpdHkgIT09ICdyYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tJykge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncmVhZG1lLnZpZXdJbkJyb3dzZXInLCBcIllvdSBjYW4gZmluZCBpbmZvcm1hdGlvbiBhYm91dCB0aGlzIHNlcnZlciBbaGVyZV0oezB9KVwiLCByZWFkbWVVcmwpKS52YWx1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHtcblx0XHRcdHR5cGU6ICdHRVQnLFxuXHRcdFx0dXJsOiByZWFkbWVVcmwsXG5cdFx0XHRjYWxsU2l0ZTogJ21jcEdhbGxlcnlTZXJ2aWNlLmdldFJlYWRtZSdcblx0XHR9LCB0b2tlbik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhc1RleHQoY29udGV4dCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIFJFQURNRSBmcm9tICR7cmVhZG1lVXJsfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHRvR2FsbGVyeU1jcFNlcnZlcihzZXJ2ZXI6IElSYXdHYWxsZXJ5TWNwU2VydmVyLCBtYW5pZmVzdDogSU1jcEdhbGxlcnlNYW5pZmVzdCB8IG51bGwpOiBJR2FsbGVyeU1jcFNlcnZlciB7XG5cdFx0bGV0IHB1Ymxpc2hlciA9ICcnO1xuXHRcdGxldCBkaXNwbGF5TmFtZSA9IHNlcnZlci50aXRsZTtcblxuXHRcdGlmIChzZXJ2ZXIuZ2l0aHViSW5mbz8ubmFtZSkge1xuXHRcdFx0aWYgKCFkaXNwbGF5TmFtZSkge1xuXHRcdFx0XHRkaXNwbGF5TmFtZSA9IHNlcnZlci5naXRodWJJbmZvLm5hbWUuc3BsaXQoJy0nKS5tYXAocyA9PiBzLnRvTG93ZXJDYXNlKCkgPT09ICdtY3AnID8gJ01DUCcgOiBzLnRvTG93ZXJDYXNlKCkgPT09ICdnaXRodWInID8gJ0dpdEh1YicgOiB1cHBlcmNhc2VGaXJzdExldHRlcihzKSkuam9pbignICcpO1xuXHRcdFx0fVxuXHRcdFx0cHVibGlzaGVyID0gc2VydmVyLmdpdGh1YkluZm8ubmFtZVdpdGhPd25lci5zcGxpdCgnLycpWzBdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBuYW1lUGFydHMgPSBzZXJ2ZXIubmFtZS5zcGxpdCgnLycpO1xuXHRcdFx0aWYgKG5hbWVQYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGRvbWFpblBhcnRzID0gbmFtZVBhcnRzWzBdLnNwbGl0KCcuJyk7XG5cdFx0XHRcdGlmIChkb21haW5QYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cHVibGlzaGVyID0gZG9tYWluUGFydHNbZG9tYWluUGFydHMubGVuZ3RoIC0gMV07IC8vIEFsd2F5cyB0YWtlIHRoZSBsYXN0IHBhcnQgYXMgb3duZXJcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFkaXNwbGF5TmFtZSkge1xuXHRcdFx0XHRkaXNwbGF5TmFtZSA9IG5hbWVQYXJ0c1tuYW1lUGFydHMubGVuZ3RoIC0gMV0uc3BsaXQoJy0nKS5tYXAocyA9PiB1cHBlcmNhc2VGaXJzdExldHRlcihzKSkuam9pbignICcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXIuZ2l0aHViSW5mbz8uZGlzcGxheU5hbWUpIHtcblx0XHRcdGRpc3BsYXlOYW1lID0gc2VydmVyLmdpdGh1YkluZm8uZGlzcGxheU5hbWU7XG5cdFx0fVxuXG5cdFx0bGV0IGljb246IHsgbGlnaHQ6IHN0cmluZzsgZGFyazogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoc2VydmVyLmdpdGh1YkluZm8/LnByZWZlcnJlZEltYWdlKSB7XG5cdFx0XHRpY29uID0ge1xuXHRcdFx0XHRsaWdodDogc2VydmVyLmdpdGh1YkluZm8ucHJlZmVycmVkSW1hZ2UsXG5cdFx0XHRcdGRhcms6IHNlcnZlci5naXRodWJJbmZvLnByZWZlcnJlZEltYWdlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHNlcnZlci5naXRodWJJbmZvPy5vd25lckF2YXRhclVybCkge1xuXHRcdFx0aWNvbiA9IHtcblx0XHRcdFx0bGlnaHQ6IHNlcnZlci5naXRodWJJbmZvLm93bmVyQXZhdGFyVXJsLFxuXHRcdFx0XHRkYXJrOiBzZXJ2ZXIuZ2l0aHViSW5mby5vd25lckF2YXRhclVybFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChzZXJ2ZXIuYXBpY0luZm8/LlsneC1tcy1pY29uJ10pIHtcblx0XHRcdGljb24gPSB7XG5cdFx0XHRcdGxpZ2h0OiBzZXJ2ZXIuYXBpY0luZm9bJ3gtbXMtaWNvbiddLFxuXHRcdFx0XHRkYXJrOiBzZXJ2ZXIuYXBpY0luZm9bJ3gtbXMtaWNvbiddXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHNlcnZlci5pY29ucyAmJiBzZXJ2ZXIuaWNvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgbGlnaHRJY29uID0gc2VydmVyLmljb25zLmZpbmQoaWNvbiA9PiBpY29uLnRoZW1lID09PSAnbGlnaHQnKSA/PyBzZXJ2ZXIuaWNvbnNbMF07XG5cdFx0XHRjb25zdCBkYXJrSWNvbiA9IHNlcnZlci5pY29ucy5maW5kKGljb24gPT4gaWNvbi50aGVtZSA9PT0gJ2RhcmsnKSA/PyBsaWdodEljb247XG5cdFx0XHRpY29uID0ge1xuXHRcdFx0XHRsaWdodDogbGlnaHRJY29uLnNyYyxcblx0XHRcdFx0ZGFyazogZGFya0ljb24uc3JjXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdlYlVybCA9IG1hbmlmZXN0ID8gdGhpcy5nZXRXZWJVcmwoc2VydmVyLm5hbWUsIG1hbmlmZXN0KSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwdWJsaXNoZXJVcmwgPSBtYW5pZmVzdCA/IHRoaXMuZ2V0UHVibGlzaGVyVXJsKHB1Ymxpc2hlciwgbWFuaWZlc3QpIDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBzZXJ2ZXIuaWQsXG5cdFx0XHRuYW1lOiBzZXJ2ZXIubmFtZSxcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0Z2FsbGVyeVVybDogbWFuaWZlc3Q/LnVybCxcblx0XHRcdHdlYlVybCxcblx0XHRcdGRlc2NyaXB0aW9uOiBzZXJ2ZXIuZGVzY3JpcHRpb24sXG5cdFx0XHRzdGF0dXM6IHNlcnZlci5zdGF0dXMgPz8gR2FsbGVyeU1jcFNlcnZlclN0YXR1cy5BY3RpdmUsXG5cdFx0XHR2ZXJzaW9uOiBzZXJ2ZXIudmVyc2lvbixcblx0XHRcdGlzTGF0ZXN0OiBzZXJ2ZXIucmVnaXN0cnlJbmZvPy5pc0xhdGVzdCA/PyB0cnVlLFxuXHRcdFx0cHVibGlzaERhdGU6IHNlcnZlci5yZWdpc3RyeUluZm8/LnB1Ymxpc2hlZEF0ID8gRGF0ZS5wYXJzZShzZXJ2ZXIucmVnaXN0cnlJbmZvLnB1Ymxpc2hlZEF0KSA6IHVuZGVmaW5lZCxcblx0XHRcdGxhc3RVcGRhdGVkOiBzZXJ2ZXIuZ2l0aHViSW5mbz8ucHVzaGVkQXQgPyBEYXRlLnBhcnNlKHNlcnZlci5naXRodWJJbmZvLnB1c2hlZEF0KSA6IHNlcnZlci5yZWdpc3RyeUluZm8/LnVwZGF0ZWRBdCA/IERhdGUucGFyc2Uoc2VydmVyLnJlZ2lzdHJ5SW5mby51cGRhdGVkQXQpIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVwb3NpdG9yeVVybDogc2VydmVyLnJlcG9zaXRvcnk/LnVybCxcblx0XHRcdHJlYWRtZTogc2VydmVyLnJlYWRtZSxcblx0XHRcdGljb24sXG5cdFx0XHRwdWJsaXNoZXIsXG5cdFx0XHRwdWJsaXNoZXJVcmwsXG5cdFx0XHRsaWNlbnNlOiBzZXJ2ZXIuZ2l0aHViSW5mbz8ubGljZW5zZSxcblx0XHRcdHN0YXJzQ291bnQ6IHNlcnZlci5naXRodWJJbmZvPy5zdGFyZ2F6ZXJDb3VudCxcblx0XHRcdHRvcGljczogc2VydmVyLmdpdGh1YkluZm8/LnRvcGljcyxcblx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0cGFja2FnZXM6IHNlcnZlci5wYWNrYWdlcyxcblx0XHRcdFx0cmVtb3Rlczogc2VydmVyLnJlbW90ZXNcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeUdhbGxlcnlNY3BTZXJ2ZXJzKHF1ZXJ5OiBRdWVyeSwgbWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5TWNwU2VydmVyc1Jlc3VsdD4ge1xuXHRcdGNvbnN0IHsgc2VydmVycywgbWV0YWRhdGEgfSA9IGF3YWl0IHRoaXMucXVlcnlSYXdHYWxsZXJ5TWNwU2VydmVycyhxdWVyeSwgbWNwR2FsbGVyeU1hbmlmZXN0LCB0b2tlbik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlcnZlcnM6IHNlcnZlcnMubWFwKGl0ZW0gPT4gdGhpcy50b0dhbGxlcnlNY3BTZXJ2ZXIoaXRlbSwgbWNwR2FsbGVyeU1hbmlmZXN0KSksXG5cdFx0XHRtZXRhZGF0YVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5UmF3R2FsbGVyeU1jcFNlcnZlcnMocXVlcnk6IFF1ZXJ5LCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0PiB7XG5cdFx0Y29uc3QgbWNwR2FsbGVyeVVybCA9IHRoaXMuZ2V0TWNwR2FsbGVyeVVybChtY3BHYWxsZXJ5TWFuaWZlc3QpO1xuXHRcdGlmICghbWNwR2FsbGVyeVVybCkge1xuXHRcdFx0cmV0dXJuIHsgc2VydmVyczogW10sIG1ldGFkYXRhOiB7IGNvdW50OiAwIH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UobWNwR2FsbGVyeVVybCk7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byByZWFkIGZpbGUgZnJvbSAke3VyaX06ICR7ZXJyb3J9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHVybCA9IGAke21jcEdhbGxlcnlVcmx9P2xpbWl0PSR7cXVlcnkucGFnZVNpemV9JnZlcnNpb249bGF0ZXN0YDtcblx0XHRpZiAocXVlcnkuY3Vyc29yKSB7XG5cdFx0XHR1cmwgKz0gYCZjdXJzb3I9JHtxdWVyeS5jdXJzb3J9YDtcblx0XHR9XG5cdFx0aWYgKHF1ZXJ5LnNlYXJjaFRleHQpIHtcblx0XHRcdGNvbnN0IHRleHQgPSBlbmNvZGVVUklDb21wb25lbnQocXVlcnkuc2VhcmNoVGV4dCk7XG5cdFx0XHR1cmwgKz0gYCZzZWFyY2g9JHt0ZXh0fWA7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbnRleHQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdFx0dXJsLFxuXHRcdFx0XHRjYWxsU2l0ZTogJ21jcEdhbGxlcnlTZXJ2aWNlLnF1ZXJ5TWNwU2VydmVycydcblx0XHRcdH0sIHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gcXVlcnkgTUNQIGdhbGxlcnk6ICR7ZXJyb3J9YCk7XG5cdFx0XHRyZXR1cm4geyBzZXJ2ZXJzOiBbXSwgbWV0YWRhdGE6IHsgY291bnQ6IDAgfSB9O1xuXHRcdH1cblxuXHRcdGlmICghaXNTdWNjZXNzKGNvbnRleHQpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBxdWVyeSBNQ1AgZ2FsbGVyeTogU2VydmVyIHJldHVybmVkICR7Y29udGV4dC5yZXMuc3RhdHVzQ29kZX1gKTtcblx0XHRcdHJldHVybiB7IHNlcnZlcnM6IFtdLCBtZXRhZGF0YTogeyBjb3VudDogMCB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGFzSnNvbihjb250ZXh0KTtcblxuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHsgc2VydmVyczogW10sIG1ldGFkYXRhOiB7IGNvdW50OiAwIH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnNlcmlhbGl6ZU1jcFNlcnZlcnNSZXN1bHQoZGF0YSwgbWNwR2FsbGVyeU1hbmlmZXN0KTtcblxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBzZXJpYWxpemUgTUNQIHNlcnZlcnMgcmVzdWx0IGZyb20gJHttY3BHYWxsZXJ5VXJsfWAsIGRhdGEpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBnZXRNY3BTZXJ2ZXIobWNwU2VydmVyVXJsOiBzdHJpbmcsIG1jcEdhbGxlcnlNYW5pZmVzdD86IElNY3BHYWxsZXJ5TWFuaWZlc3QgfCBudWxsKTogUHJvbWlzZTxJR2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHR1cmw6IG1jcFNlcnZlclVybCxcblx0XHRcdGNhbGxTaXRlOiAnbWNwR2FsbGVyeVNlcnZpY2UuZ2V0TWNwU2VydmVyJ1xuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gQSBkZWZpbml0aXZlIDQwNCBtZWFucyB0aGUgcmVnaXN0cnkgYXV0aG9yaXRhdGl2ZWx5IGRvZXMgbm90IGNvbnRhaW4gdGhpc1xuXHRcdC8vIHNlcnZlci4gQW55IG90aGVyIGVycm9yIHN0YXR1cyAoZS5nLiA0MDEvNDAzLzQyOS81eHgpIGlzIHRyYW5zaWVudCBvclxuXHRcdC8vIHVuZGV0ZXJtaW5lZCBhbmQgbXVzdCB0aHJvdyBzbyBjYWxsZXJzIGRvIG5vdCB0cmVhdCBpdCBhcyBhIFwibm90IGZvdW5kXCIuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQwNCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSAmJiBjb250ZXh0LnJlcy5zdGF0dXNDb2RlID49IDQwMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggTUNQIHNlcnZlciBmcm9tICR7bWNwU2VydmVyVXJsfTogc2VydmVyIHJlc3BvbmRlZCB3aXRoICR7Y29udGV4dC5yZXMuc3RhdHVzQ29kZX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gYXdhaXQgYXNKc29uKGNvbnRleHQpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggTUNQIHNlcnZlciBmcm9tICR7bWNwU2VydmVyVXJsfTogZW1wdHkgcmVzcG9uc2VgKTtcblx0XHR9XG5cblx0XHRpZiAoIW1jcEdhbGxlcnlNYW5pZmVzdCkge1xuXHRcdFx0bWNwR2FsbGVyeU1hbmlmZXN0ID0gYXdhaXQgdGhpcy5tY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldE1jcEdhbGxlcnlNYW5pZmVzdCgpO1xuXHRcdH1cblx0XHRtY3BHYWxsZXJ5TWFuaWZlc3QgPSBtY3BHYWxsZXJ5TWFuaWZlc3QgJiYgbWNwU2VydmVyVXJsLnN0YXJ0c1dpdGgobWNwR2FsbGVyeU1hbmlmZXN0LnVybCkgPyBtY3BHYWxsZXJ5TWFuaWZlc3QgOiBudWxsO1xuXG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5zZXJpYWxpemVNY3BTZXJ2ZXIoZGF0YSwgbWNwR2FsbGVyeU1hbmlmZXN0KTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gc2VyaWFsaXplIE1DUCBzZXJ2ZXIgZnJvbSAke21jcFNlcnZlclVybH1gLCBkYXRhKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50b0dhbGxlcnlNY3BTZXJ2ZXIoc2VydmVyLCBtY3BHYWxsZXJ5TWFuaWZlc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXJpYWxpemVNY3BTZXJ2ZXIoZGF0YTogdW5rbm93biwgbWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0IHwgbnVsbCk6IElSYXdHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTZXJpYWxpemVyKG1jcEdhbGxlcnlNYW5pZmVzdCk/LnRvUmF3R2FsbGVyeU1jcFNlcnZlcihkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgc2VyaWFsaXplTWNwU2VydmVyc1Jlc3VsdChkYXRhOiB1bmtub3duLCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QgfCBudWxsKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTZXJpYWxpemVyKG1jcEdhbGxlcnlNYW5pZmVzdCk/LnRvUmF3R2FsbGVyeU1jcFNlcnZlclJlc3VsdChkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VyaWFsaXplcihtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QgfCBudWxsKTogSUdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmVyc2lvbiA9IG1jcEdhbGxlcnlNYW5pZmVzdD8udmVyc2lvbiA/PyAndjAnO1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplcnMuZ2V0KHZlcnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROYW1lZFNlcnZlclVybChuYW1lOiBzdHJpbmcsIG1jcEdhbGxlcnlNYW5pZmVzdDogSU1jcEdhbGxlcnlNYW5pZmVzdCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbmFtZWRSZXNvdXJjZVVyaVRlbXBsYXRlID0gZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWNwR2FsbGVyeU1hbmlmZXN0LCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlck5hbWVkUmVzb3VyY2VVcmkpO1xuXHRcdGlmICghbmFtZWRSZXNvdXJjZVVyaVRlbXBsYXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9ybWF0MihuYW1lZFJlc291cmNlVXJpVGVtcGxhdGUsIHsgbmFtZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVySWRVcmwoaWQ6IHN0cmluZywgbWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXNvdXJjZVVyaVRlbXBsYXRlID0gZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWNwR2FsbGVyeU1hbmlmZXN0LCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlcklkVXJpKTtcblx0XHRpZiAoIXJlc291cmNlVXJpVGVtcGxhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmb3JtYXQyKHJlc291cmNlVXJpVGVtcGxhdGUsIHsgaWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIGdldExhdGVzdFNlcnZlclZlcnNpb25VcmwobmFtZTogc3RyaW5nLCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhdGVzdFZlcnNpb25SZXNvdXJjZVVyaVRlbXBsYXRlID0gZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWNwR2FsbGVyeU1hbmlmZXN0LCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlckxhdGVzdFZlcnNpb25VcmkpO1xuXHRcdGlmICghbGF0ZXN0VmVyc2lvblJlc291cmNlVXJpVGVtcGxhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmb3JtYXQyKGxhdGVzdFZlcnNpb25SZXNvdXJjZVVyaVRlbXBsYXRlLCB7IG5hbWU6IGVuY29kZVVSSUNvbXBvbmVudChuYW1lKSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V2ViVXJsKG5hbWU6IHN0cmluZywgbWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXNvdXJjZVVyaVRlbXBsYXRlID0gZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWNwR2FsbGVyeU1hbmlmZXN0LCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlcldlYlVyaSk7XG5cdFx0aWYgKCFyZXNvdXJjZVVyaVRlbXBsYXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9ybWF0MihyZXNvdXJjZVVyaVRlbXBsYXRlLCB7IG5hbWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFB1Ymxpc2hlclVybChuYW1lOiBzdHJpbmcsIG1jcEdhbGxlcnlNYW5pZmVzdDogSU1jcEdhbGxlcnlNYW5pZmVzdCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VVcmlUZW1wbGF0ZSA9IGdldE1jcEdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpKG1jcEdhbGxlcnlNYW5pZmVzdCwgTWNwR2FsbGVyeVJlc291cmNlVHlwZS5QdWJsaXNoZXJVcmlUZW1wbGF0ZSk7XG5cdFx0aWYgKCFyZXNvdXJjZVVyaVRlbXBsYXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9ybWF0MihyZXNvdXJjZVVyaVRlbXBsYXRlLCB7IG5hbWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1jcEdhbGxlcnlVcmwobWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWNwR2FsbGVyeU1hbmlmZXN0LCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlcnNRdWVyeVNlcnZpY2UpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyw0QkFBNEI7QUFDOUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsUUFBUSxRQUFRLFdBQVcsdUJBQXVCO0FBQzNELFNBQVMsd0JBQStMLHlCQUF5QixjQUFnRSxxQkFBcUI7QUFDdFQsU0FBUyw0QkFBNEIsMEJBQTBCLGtDQUFrQyw4QkFBbUQ7QUFFcEosU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsVUFBVSxnQkFBZ0I7QUFpRm5DLElBQVcsZUFBWCxrQkFBV0Esa0JBQVg7QUFDQyxFQUFBQSxjQUFBLFNBQU07QUFDTixFQUFBQSxjQUFBLFVBQU87QUFDUCxFQUFBQSxjQUFBLFNBQU07QUFDTixFQUFBQSxjQUFBLFNBQU07QUFDTixFQUFBQSxjQUFBLFVBQU87QUFMRyxTQUFBQTtBQUFBLEdBQUE7QUFRWCxJQUFXLFlBQVgsa0JBQVdDLGVBQVg7QUFDQyxFQUFBQSxX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O0FBQ3RDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxRQUFRLGtDQUFrQyxFQUFFLE1BQU0sbUJBQW1CLElBQUksRUFBRSxDQUFDO0FBQUEsRUFDcEY7QUFBQSxFQUVRLFVBQVUsTUFBYyxvQkFBNkQ7QUFDNUYsVUFBTSxzQkFBc0IsaUNBQWlDLG9CQUFvQix1QkFBdUIsZUFBZTtBQUN2SCxRQUFJLENBQUMscUJBQXFCO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxRQUFRLHFCQUFxQixFQUFFLEtBQUssQ0FBQztBQUFBLEVBQzdDO0FBQUEsRUFFUSxnQkFBZ0IsTUFBYyxvQkFBNkQ7QUFDbEcsVUFBTSxzQkFBc0IsaUNBQWlDLG9CQUFvQix1QkFBdUIsb0JBQW9CO0FBQzVILFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLFFBQVEscUJBQXFCLEVBQUUsS0FBSyxDQUFDO0FBQUEsRUFDN0M7QUFBQSxFQUVRLGlCQUFpQixvQkFBNkQ7QUFDckYsV0FBTyxpQ0FBaUMsb0JBQW9CLHVCQUF1QixzQkFBc0I7QUFBQSxFQUMxRztBQUVEO0FBcGFhLG9CQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbIkljb25NaW1lVHlwZSIsICJJY29uVGhlbWUiLCAiTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MjAyNV8wN18wOSIsICJpbnB1dCIsICJNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YwXzEiLCAiTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MCIsICJzZXJ2ZXJzIiwgImljb24iLCAiZGF0YSJdCn0K
