import { bufferToStream, VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { ConfigurationService } from "../../../configuration/common/configurationService.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { GlobalExtensionEnablementService } from "../../../extensionManagement/common/extensionEnablementService.js";
import { IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../extensionManagement/common/extensionManagement.js";
import { IFileService } from "../../../files/common/files.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { IProductService } from "../../../product/common/productService.js";
import { IRequestService } from "../../../request/common/request.js";
import { InMemoryStorageService, IStorageService } from "../../../storage/common/storage.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { IUriIdentityService } from "../../../uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
import { ExtensionStorageService, IExtensionStorageService } from "../../../extensionManagement/common/extensionStorage.js";
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from "../../common/ignoredExtensions.js";
import { ALL_SYNC_RESOURCES, getDefaultIgnoredSettings, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration, SyncResource, USER_DATA_SYNC_SCHEME } from "../../common/userDataSync.js";
import { IUserDataSyncAccountService, UserDataSyncAccountService } from "../../common/userDataSyncAccount.js";
import { UserDataSyncLocalStoreService } from "../../common/userDataSyncLocalStoreService.js";
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from "../../common/userDataSyncMachines.js";
import { UserDataSyncEnablementService } from "../../common/userDataSyncEnablementService.js";
import { UserDataSyncService } from "../../common/userDataSyncService.js";
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from "../../common/userDataSyncStoreService.js";
import { InMemoryUserDataProfilesService, IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { NullPolicyService } from "../../../policy/common/policy.js";
import { IUserDataProfileStorageService } from "../../../userDataProfile/common/userDataProfileStorageService.js";
import { TestUserDataProfileStorageService } from "../../../userDataProfile/test/common/userDataProfileStorageService.test.js";
import { IMeteredConnectionService } from "../../../meteredConnection/common/meteredConnection.js";
class UserDataSyncClient extends Disposable {
  constructor(testServer = new UserDataSyncTestServer()) {
    super();
    this.testServer = testServer;
    this.instantiationService = this._register(new TestInstantiationService());
  }
  async setUp(empty = false) {
    this._register(registerConfiguration());
    const logService = this.instantiationService.stub(ILogService, new NullLogService());
    const userRoamingDataHome = URI.file("userdata").with({ scheme: Schemas.inMemory });
    const userDataSyncHome = joinPath(userRoamingDataHome, ".sync");
    const environmentService = this.instantiationService.stub(IEnvironmentService, {
      userDataSyncHome,
      userRoamingDataHome,
      cacheHome: joinPath(userRoamingDataHome, "cache"),
      argvResource: joinPath(userRoamingDataHome, "argv.json"),
      sync: "on"
    });
    this.instantiationService.stub(IProductService, {
      _serviceBrand: void 0,
      ...product,
      ...{
        "configurationSync.store": {
          url: this.testServer.url,
          stableUrl: this.testServer.url,
          insidersUrl: this.testServer.url,
          canSwitch: false,
          authenticationProviders: { "test": { scopes: [] } }
        }
      }
    });
    const fileService = this._register(new FileService(logService));
    this._register(fileService.registerProvider(Schemas.inMemory, this._register(new InMemoryFileSystemProvider())));
    this._register(fileService.registerProvider(USER_DATA_SYNC_SCHEME, this._register(new InMemoryFileSystemProvider())));
    this.instantiationService.stub(IFileService, fileService);
    const uriIdentityService = this._register(this.instantiationService.createInstance(UriIdentityService));
    this.instantiationService.stub(IUriIdentityService, uriIdentityService);
    const userDataProfilesService = this._register(new InMemoryUserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
    this.instantiationService.stub(IUserDataProfilesService, userDataProfilesService);
    const storageService = this._register(new TestStorageService(userDataProfilesService.defaultProfile));
    this.instantiationService.stub(IStorageService, this._register(storageService));
    this.instantiationService.stub(IUserDataProfileStorageService, this._register(new TestUserDataProfileStorageService(false, storageService)));
    const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, new NullPolicyService(), logService));
    await configurationService.initialize();
    this.instantiationService.stub(IConfigurationService, configurationService);
    this.instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: new Emitter().event });
    this.instantiationService.stub(IRequestService, this.testServer);
    this.instantiationService.stub(IUserDataSyncLogService, logService);
    this.instantiationService.stub(ITelemetryService, NullTelemetryService);
    this.instantiationService.stub(IUserDataSyncStoreManagementService, this._register(this.instantiationService.createInstance(UserDataSyncStoreManagementService)));
    this.instantiationService.stub(IUserDataSyncStoreService, this._register(this.instantiationService.createInstance(UserDataSyncStoreService)));
    const userDataSyncAccountService = this._register(this.instantiationService.createInstance(UserDataSyncAccountService));
    await userDataSyncAccountService.updateAccount({ authenticationProviderId: "authenticationProviderId", token: "token" });
    this.instantiationService.stub(IUserDataSyncAccountService, userDataSyncAccountService);
    this.instantiationService.stub(IUserDataSyncMachinesService, this._register(this.instantiationService.createInstance(UserDataSyncMachinesService)));
    this.instantiationService.stub(IUserDataSyncLocalStoreService, this._register(this.instantiationService.createInstance(UserDataSyncLocalStoreService)));
    this.instantiationService.stub(IUserDataSyncUtilService, new TestUserDataSyncUtilService());
    this.instantiationService.stub(IUserDataSyncEnablementService, this._register(this.instantiationService.createInstance(UserDataSyncEnablementService)));
    this.instantiationService.stub(IExtensionManagementService, {
      async getInstalled() {
        return [];
      },
      onDidInstallExtensions: new Emitter().event,
      onDidUninstallExtension: new Emitter().event
    });
    this.instantiationService.stub(IGlobalExtensionEnablementService, this._register(this.instantiationService.createInstance(GlobalExtensionEnablementService)));
    this.instantiationService.stub(IExtensionStorageService, this._register(this.instantiationService.createInstance(ExtensionStorageService)));
    this.instantiationService.stub(IIgnoredExtensionsManagementService, this.instantiationService.createInstance(IgnoredExtensionsManagementService));
    this.instantiationService.stub(IExtensionGalleryService, {
      isEnabled() {
        return true;
      },
      async getCompatibleExtension() {
        return null;
      }
    });
    this.instantiationService.stub(IUserDataSyncService, this._register(this.instantiationService.createInstance(UserDataSyncService)));
    if (!empty) {
      await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({})));
      await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([])));
      await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "c.json"), VSBuffer.fromString(`{}`));
      await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, "c.prompt.md"), VSBuffer.fromString(" "));
      await fileService.writeFile(userDataProfilesService.defaultProfile.tasksResource, VSBuffer.fromString(`{}`));
      await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ "locale": "en" })));
    }
    await configurationService.reloadConfiguration();
    this.instantiationService.get(IUserDataSyncEnablementService).setResourceEnablement(SyncResource.Prompts, true);
  }
  async sync() {
    await (await this.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
  }
  read(resource, collection) {
    return this.instantiationService.get(IUserDataSyncStoreService).readResource(resource, null, collection);
  }
  async getLatestRef(resource) {
    const manifest = await this._getResourceManifest();
    return manifest?.[resource] ?? null;
  }
  async _getResourceManifest() {
    const manifest = await this.instantiationService.get(IUserDataSyncStoreService).manifest(null);
    return manifest?.latest ?? null;
  }
  getSynchronizer(source) {
    return this.instantiationService.get(IUserDataSyncService).getOrCreateActiveProfileSynchronizer(this.instantiationService.get(IUserDataProfilesService).defaultProfile, void 0).enabled.find((s) => s.resource === source);
  }
}
const ALL_SERVER_RESOURCES = [...ALL_SYNC_RESOURCES, "machines"];
class UserDataSyncTestServer {
  constructor(rateLimit = Number.MAX_SAFE_INTEGER, retryAfter) {
    this.rateLimit = rateLimit;
    this.retryAfter = retryAfter;
    this.onDidCompleteRequest = Event.None;
    this.url = "http://host:3000";
    this.session = null;
    this.collections = /* @__PURE__ */ new Map();
    this.data = /* @__PURE__ */ new Map();
    this._requests = [];
    this._requestsWithAllHeaders = [];
    this._responses = [];
    this.manifestRef = 0;
    this.collectionCounter = 0;
  }
  get requests() {
    return this._requests;
  }
  get requestsWithAllHeaders() {
    return this._requestsWithAllHeaders;
  }
  get responses() {
    return this._responses;
  }
  reset() {
    this._requests = [];
    this._responses = [];
    this._requestsWithAllHeaders = [];
  }
  async resolveProxy(url) {
    return url;
  }
  async lookupAuthorization(authInfo) {
    return void 0;
  }
  async lookupKerberosAuthorization(url) {
    return void 0;
  }
  async loadCertificates() {
    return [];
  }
  async request(options, token) {
    if (this._requests.length === this.rateLimit) {
      return this.toResponse(429, this.retryAfter ? { "retry-after": `${this.retryAfter}` } : void 0);
    }
    const headers = {};
    if (options.headers) {
      if (options.headers["If-None-Match"]) {
        headers["If-None-Match"] = options.headers["If-None-Match"];
      }
      if (options.headers["If-Match"]) {
        headers["If-Match"] = options.headers["If-Match"];
      }
    }
    this._requests.push({ url: options.url, type: options.type, headers });
    this._requestsWithAllHeaders.push({ url: options.url, type: options.type, headers: options.headers });
    const requestContext = await this.doRequest(options);
    this._responses.push({ status: requestContext.res.statusCode });
    return requestContext;
  }
  async doRequest(options) {
    const versionUrl = `${this.url}/v1/`;
    const relativePath = options.url.indexOf(versionUrl) === 0 ? options.url.substring(versionUrl.length) : void 0;
    const segments = relativePath ? relativePath.split("/") : [];
    if (options.type === "GET" && segments.length === 1 && segments[0] === "manifest") {
      return this.getManifest(options.headers);
    }
    if (options.type === "GET" && segments.length === 3 && segments[0] === "resource") {
      return this.getResourceData(void 0, segments[1], segments[2] === "latest" ? void 0 : segments[2], options.headers);
    }
    if (options.type === "POST" && segments.length === 2 && segments[0] === "resource") {
      return this.writeData(void 0, segments[1], options.data, options.headers);
    }
    if (options.type === "GET" && segments.length === 5 && segments[0] === "collection" && segments[2] === "resource") {
      return this.getResourceData(segments[1], segments[3], segments[4] === "latest" ? void 0 : segments[4], options.headers);
    }
    if (options.type === "POST" && segments.length === 4 && segments[0] === "collection" && segments[2] === "resource") {
      return this.writeData(segments[1], segments[3], options.data, options.headers);
    }
    if (options.type === "DELETE" && segments.length === 2 && segments[0] === "resource") {
      return this.deleteResourceData(void 0, segments[1]);
    }
    if (options.type === "DELETE" && segments.length === 1 && segments[0] === "resource") {
      return this.clear(options.headers);
    }
    if (options.type === "DELETE" && segments[0] === "collection") {
      return this.toResponse(204);
    }
    if (options.type === "POST" && segments.length === 1 && segments[0] === "collection") {
      return this.createCollection();
    }
    return this.toResponse(501);
  }
  async getManifest(headers) {
    if (this.session) {
      const latest = /* @__PURE__ */ Object.create({});
      this.data.forEach((value, key) => latest[key] = value.ref);
      let collections = void 0;
      if (this.collectionCounter) {
        collections = {};
        for (let collectionId = 1; collectionId <= this.collectionCounter; collectionId++) {
          const collectionData = this.collections.get(`${collectionId}`);
          if (collectionData) {
            const latest2 = /* @__PURE__ */ Object.create({});
            collectionData.forEach((value, key) => latest2[key] = value.ref);
            collections[`${collectionId}`] = { latest: latest2 };
          }
        }
      }
      const manifest = { session: this.session, latest, collections, ref: "1" };
      return this.toResponse(200, { "Content-Type": "application/json", etag: `${this.manifestRef++}` }, JSON.stringify(manifest));
    }
    return this.toResponse(204, { etag: `${this.manifestRef++}` });
  }
  async getResourceData(collection, resource, ref, headers = {}) {
    const collectionData = collection ? this.collections.get(collection) : this.data;
    if (!collectionData) {
      return this.toResponse(501);
    }
    const resourceKey = ALL_SERVER_RESOURCES.find((key) => key === resource);
    if (resourceKey) {
      const data = collectionData.get(resourceKey);
      if (ref && data?.ref !== ref) {
        return this.toResponse(404);
      }
      if (!data) {
        return this.toResponse(204, { etag: "0" });
      }
      if (headers["If-None-Match"] === data.ref) {
        return this.toResponse(304);
      }
      return this.toResponse(200, { etag: data.ref }, data.content || "");
    }
    return this.toResponse(204);
  }
  async writeData(collection, resource, content = "", headers = {}) {
    if (!this.session) {
      this.session = generateUuid();
    }
    const collectionData = collection ? this.collections.get(collection) : this.data;
    if (!collectionData) {
      return this.toResponse(501);
    }
    const resourceKey = ALL_SERVER_RESOURCES.find((key) => key === resource);
    if (resourceKey) {
      const data = collectionData.get(resourceKey);
      if (headers["If-Match"] !== void 0 && headers["If-Match"] !== (data ? data.ref : "0")) {
        return this.toResponse(412);
      }
      const ref = `${parseInt(data?.ref || "0") + 1}`;
      collectionData.set(resourceKey, { ref, content });
      return this.toResponse(200, { etag: ref });
    }
    return this.toResponse(204);
  }
  async deleteResourceData(collection, resource, headers = {}) {
    const collectionData = collection ? this.collections.get(collection) : this.data;
    if (!collectionData) {
      return this.toResponse(501);
    }
    const resourceKey = ALL_SERVER_RESOURCES.find((key) => key === resource);
    if (resourceKey) {
      collectionData.delete(resourceKey);
      return this.toResponse(200);
    }
    return this.toResponse(404);
  }
  async createCollection() {
    const collectionId = `${++this.collectionCounter}`;
    this.collections.set(collectionId, /* @__PURE__ */ new Map());
    return this.toResponse(200, {}, collectionId);
  }
  async clear(headers) {
    this.collections.clear();
    this.data.clear();
    this.session = null;
    this.collectionCounter = 0;
    return this.toResponse(204);
  }
  toResponse(statusCode, headers, data) {
    return {
      res: {
        headers: headers || {},
        statusCode
      },
      stream: bufferToStream(VSBuffer.fromString(data || ""))
    };
  }
}
class TestUserDataSyncUtilService {
  async resolveDefaultCoreIgnoredSettings() {
    return getDefaultIgnoredSettings();
  }
  async resolveUserBindings(userbindings) {
    const keys = {};
    for (const keybinding of userbindings) {
      keys[keybinding] = keybinding;
    }
    return keys;
  }
  async resolveFormattingOptions(file) {
    return { eol: "\n", insertSpaces: false, tabSize: 4 };
  }
}
class TestStorageService extends InMemoryStorageService {
  constructor(profileStorageProfile) {
    super();
    this.profileStorageProfile = profileStorageProfile;
  }
  hasScope(profile) {
    return this.profileStorageProfile.id === profile.id;
  }
}
export {
  TestUserDataSyncUtilService,
  UserDataSyncClient,
  UserDataSyncTestServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHVzZXJEYXRhU3luY0NsaWVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGJ1ZmZlclRvU3RyZWFtLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRm9ybWF0dGluZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUhlYWRlcnMsIElSZXF1ZXN0Q29udGV4dCwgSVJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIEluc3RhbGxFeHRlbnNpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhJbmZvLCBDcmVkZW50aWFscywgSVJlcXVlc3RDb21wbGV0ZUV2ZW50LCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlLCBJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IElnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UsIElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lnbm9yZWRFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFMTF9TWU5DX1JFU09VUkNFUywgZ2V0RGVmYXVsdElnbm9yZWRTZXR0aW5ncywgSVVzZXJEYXRhLCBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLCByZWdpc3RlckNvbmZpZ3VyYXRpb24sIFNlcnZlclJlc291cmNlLCBTeW5jUmVzb3VyY2UsIElVc2VyRGF0YVN5bmNocm9uaXNlciwgSVVzZXJEYXRhUmVzb3VyY2VNYW5pZmVzdCwgSVVzZXJEYXRhQ29sbGVjdGlvbk1hbmlmZXN0LCBVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIElVc2VyRGF0YU1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UsIFVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luY0FjY291bnQuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSwgVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luY01hY2hpbmVzLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLCBVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5VXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IE51bGxQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvdGVzdC9jb21tb24vdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UudGVzdC5qcyc7XG5pbXBvcnQgeyBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbWV0ZXJlZENvbm5lY3Rpb24vY29tbW9uL21ldGVyZWRDb25uZWN0aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY0NsaWVudCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdGVzdFNlcnZlcjogVXNlckRhdGFTeW5jVGVzdFNlcnZlciA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCkpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHR9XG5cblx0YXN5bmMgc2V0VXAoZW1wdHk6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQ29uZmlndXJhdGlvbigpKTtcblxuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHVzZXJSb2FtaW5nRGF0YUhvbWUgPSBVUkkuZmlsZSgndXNlcmRhdGEnKS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5IH0pO1xuXHRcdGNvbnN0IHVzZXJEYXRhU3luY0hvbWUgPSBqb2luUGF0aCh1c2VyUm9hbWluZ0RhdGFIb21lLCAnLnN5bmMnKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwge1xuXHRcdFx0dXNlckRhdGFTeW5jSG9tZSxcblx0XHRcdHVzZXJSb2FtaW5nRGF0YUhvbWUsXG5cdFx0XHRjYWNoZUhvbWU6IGpvaW5QYXRoKHVzZXJSb2FtaW5nRGF0YUhvbWUsICdjYWNoZScpLFxuXHRcdFx0YXJndlJlc291cmNlOiBqb2luUGF0aCh1c2VyUm9hbWluZ0RhdGFIb21lLCAnYXJndi5qc29uJyksXG5cdFx0XHRzeW5jOiAnb24nXG5cdFx0fSk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2R1Y3RTZXJ2aWNlLCB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIC4uLnByb2R1Y3QsIC4uLntcblx0XHRcdFx0J2NvbmZpZ3VyYXRpb25TeW5jLnN0b3JlJzoge1xuXHRcdFx0XHRcdHVybDogdGhpcy50ZXN0U2VydmVyLnVybCxcblx0XHRcdFx0XHRzdGFibGVVcmw6IHRoaXMudGVzdFNlcnZlci51cmwsXG5cdFx0XHRcdFx0aW5zaWRlcnNVcmw6IHRoaXMudGVzdFNlcnZlci51cmwsXG5cdFx0XHRcdFx0Y2FuU3dpdGNoOiBmYWxzZSxcblx0XHRcdFx0XHRhdXRoZW50aWNhdGlvblByb3ZpZGVyczogeyAndGVzdCc6IHsgc2NvcGVzOiBbXSB9IH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgdGhpcy5fcmVnaXN0ZXIobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihVU0VSX0RBVEFfU1lOQ19TQ0hFTUUsIHRoaXMuX3JlZ2lzdGVyKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXJpSWRlbnRpdHlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSk7XG5cblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbk1lbW9yeVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKGVudmlyb25tZW50U2VydmljZSwgZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRlc3RTdG9yYWdlU2VydmljZSh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSwgdGhpcy5fcmVnaXN0ZXIobmV3IFRlc3RVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZShmYWxzZSwgc3RvcmFnZVNlcnZpY2UpKSk7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb25maWd1cmF0aW9uU2VydmljZSh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIGxvZ1NlcnZpY2UpKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UsIHsgaXNDb25uZWN0aW9uTWV0ZXJlZDogZmFsc2UsIG9uRGlkQ2hhbmdlSXNDb25uZWN0aW9uTWV0ZXJlZDogbmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKS5ldmVudCB9KTtcblxuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVxdWVzdFNlcnZpY2UsIHRoaXMudGVzdFNlcnZlcik7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlKSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY1N0b3JlU2VydmljZSkpKTtcblxuXHRcdGNvbnN0IHVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgdXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UudXBkYXRlQWNjb3VudCh7IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZDogJ2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCcsIHRva2VuOiAndG9rZW4nIH0pO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UsIHVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLCB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSkpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlKSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2UsIG5ldyBUZXN0VXNlckRhdGFTeW5jVXRpbFNlcnZpY2UoKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSwgdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSkpKTtcblxuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdGFzeW5jIGdldEluc3RhbGxlZCgpIHsgcmV0dXJuIFtdOyB9LFxuXHRcdFx0b25EaWRJbnN0YWxsRXh0ZW5zaW9uczogbmV3IEVtaXR0ZXI8cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPigpLmV2ZW50LFxuXHRcdFx0b25EaWRVbmluc3RhbGxFeHRlbnNpb246IG5ldyBFbWl0dGVyPERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50PigpLmV2ZW50LFxuXHRcdH0pO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TdG9yYWdlU2VydmljZSwgdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25TdG9yYWdlU2VydmljZSkpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUlnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIHtcblx0XHRcdGlzRW5hYmxlZCgpIHsgcmV0dXJuIHRydWU7IH0sXG5cdFx0XHRhc3luYyBnZXRDb21wYXRpYmxlRXh0ZW5zaW9uKCkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVN5bmNTZXJ2aWNlLCB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY1NlcnZpY2UpKSk7XG5cblx0XHRpZiAoIWVtcHR5KSB7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7fSkpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KFtdKSkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ2MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGB7fWApKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5wcm9tcHRzSG9tZSwgJ2MucHJvbXB0Lm1kJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJyAnKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhge31gKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3ZSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdsb2NhbGUnOiAnZW4nIH0pKSk7XG5cdFx0fVxuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlbG9hZENvbmZpZ3VyYXRpb24oKTtcblxuXHRcdC8vIGBwcm9tcHRzYCByZXNvdXJjZSBpcyBkaXNhYmxlZCBieSBkZWZhdWx0LCBzbyBlbmFibGUgaXQgZm9yIHRlc3RzXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZVxuXHRcdFx0LmdldChJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UpXG5cdFx0XHQuc2V0UmVzb3VyY2VFbmFibGVtZW50KFN5bmNSZXNvdXJjZS5Qcm9tcHRzLCB0cnVlKTtcblx0fVxuXG5cdGFzeW5jIHN5bmMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgKGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTZXJ2aWNlKS5jcmVhdGVTeW5jVGFzayhudWxsKSkucnVuKCk7XG5cdH1cblxuXHRyZWFkKHJlc291cmNlOiBTeW5jUmVzb3VyY2UsIGNvbGxlY3Rpb24/OiBzdHJpbmcpOiBQcm9taXNlPElVc2VyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5yZWFkUmVzb3VyY2UocmVzb3VyY2UsIG51bGwsIGNvbGxlY3Rpb24pO1xuXHR9XG5cblx0YXN5bmMgZ2V0TGF0ZXN0UmVmKHJlc291cmNlOiBTeW5jUmVzb3VyY2UpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuX2dldFJlc291cmNlTWFuaWZlc3QoKTtcblx0XHRyZXR1cm4gbWFuaWZlc3Q/LltyZXNvdXJjZV0gPz8gbnVsbDtcblx0fVxuXG5cdGFzeW5jIF9nZXRSZXNvdXJjZU1hbmlmZXN0KCk6IFByb21pc2U8SVVzZXJEYXRhUmVzb3VyY2VNYW5pZmVzdCB8IG51bGw+IHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpLm1hbmlmZXN0KG51bGwpO1xuXHRcdHJldHVybiBtYW5pZmVzdD8ubGF0ZXN0ID8/IG51bGw7XG5cdH1cblxuXHRnZXRTeW5jaHJvbml6ZXIoc291cmNlOiBTeW5jUmVzb3VyY2UpOiBJVXNlckRhdGFTeW5jaHJvbmlzZXIge1xuXHRcdHJldHVybiAodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1NlcnZpY2UpIGFzIFVzZXJEYXRhU3luY1NlcnZpY2UpLmdldE9yQ3JlYXRlQWN0aXZlUHJvZmlsZVN5bmNocm9uaXplcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpLmRlZmF1bHRQcm9maWxlLCB1bmRlZmluZWQpLmVuYWJsZWQuZmluZChzID0+IHMucmVzb3VyY2UgPT09IHNvdXJjZSkhO1xuXHR9XG5cbn1cblxuY29uc3QgQUxMX1NFUlZFUl9SRVNPVVJDRVM6IFNlcnZlclJlc291cmNlW10gPSBbLi4uQUxMX1NZTkNfUkVTT1VSQ0VTLCAnbWFjaGluZXMnXTtcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgaW1wbGVtZW50cyBJUmVxdWVzdFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENvbXBsZXRlUmVxdWVzdCA9IEV2ZW50Lk5vbmUgYXMgRXZlbnQ8SVJlcXVlc3RDb21wbGV0ZUV2ZW50PjtcblxuXHRyZWFkb25seSB1cmw6IHN0cmluZyA9ICdodHRwOi8vaG9zdDozMDAwJztcblx0cHJpdmF0ZSBzZXNzaW9uOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBjb2xsZWN0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8U2VydmVyUmVzb3VyY2UsIElVc2VyRGF0YT4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGF0YSA9IG5ldyBNYXA8U2VydmVyUmVzb3VyY2UsIElVc2VyRGF0YT4oKTtcblxuXHRwcml2YXRlIF9yZXF1ZXN0czogeyB1cmw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBoZWFkZXJzPzogSUhlYWRlcnMgfVtdID0gW107XG5cdGdldCByZXF1ZXN0cygpOiB7IHVybDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IGhlYWRlcnM/OiBJSGVhZGVycyB9W10geyByZXR1cm4gdGhpcy5fcmVxdWVzdHM7IH1cblxuXHRwcml2YXRlIF9yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzOiB7IHVybDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IGhlYWRlcnM/OiBJSGVhZGVycyB9W10gPSBbXTtcblx0Z2V0IHJlcXVlc3RzV2l0aEFsbEhlYWRlcnMoKTogeyB1cmw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBoZWFkZXJzPzogSUhlYWRlcnMgfVtdIHsgcmV0dXJuIHRoaXMuX3JlcXVlc3RzV2l0aEFsbEhlYWRlcnM7IH1cblxuXHRwcml2YXRlIF9yZXNwb25zZXM6IHsgc3RhdHVzOiBudW1iZXIgfVtdID0gW107XG5cdGdldCByZXNwb25zZXMoKTogeyBzdGF0dXM6IG51bWJlciB9W10geyByZXR1cm4gdGhpcy5fcmVzcG9uc2VzOyB9XG5cdHJlc2V0KCk6IHZvaWQgeyB0aGlzLl9yZXF1ZXN0cyA9IFtdOyB0aGlzLl9yZXNwb25zZXMgPSBbXTsgdGhpcy5fcmVxdWVzdHNXaXRoQWxsSGVhZGVycyA9IFtdOyB9XG5cblx0cHJpdmF0ZSBtYW5pZmVzdFJlZiA9IDA7XG5cdHByaXZhdGUgY29sbGVjdGlvbkNvdW50ZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcmF0ZUxpbWl0ID0gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIHByaXZhdGUgcmVhZG9ubHkgcmV0cnlBZnRlcj86IG51bWJlcikgeyB9XG5cblx0YXN5bmMgcmVzb2x2ZVByb3h5KHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVybDsgfVxuXHRhc3luYyBsb29rdXBBdXRob3JpemF0aW9uKGF1dGhJbmZvOiBBdXRoSW5mbyk6IFByb21pc2U8Q3JlZGVudGlhbHMgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24odXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGxvYWRDZXJ0aWZpY2F0ZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4geyByZXR1cm4gW107IH1cblxuXHRhc3luYyByZXF1ZXN0KG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRpZiAodGhpcy5fcmVxdWVzdHMubGVuZ3RoID09PSB0aGlzLnJhdGVMaW1pdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSg0MjksIHRoaXMucmV0cnlBZnRlciA/IHsgJ3JldHJ5LWFmdGVyJzogYCR7dGhpcy5yZXRyeUFmdGVyfWAgfSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGhlYWRlcnM6IElIZWFkZXJzID0ge307XG5cdFx0aWYgKG9wdGlvbnMuaGVhZGVycykge1xuXHRcdFx0aWYgKG9wdGlvbnMuaGVhZGVyc1snSWYtTm9uZS1NYXRjaCddKSB7XG5cdFx0XHRcdGhlYWRlcnNbJ0lmLU5vbmUtTWF0Y2gnXSA9IG9wdGlvbnMuaGVhZGVyc1snSWYtTm9uZS1NYXRjaCddO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnMuaGVhZGVyc1snSWYtTWF0Y2gnXSkge1xuXHRcdFx0XHRoZWFkZXJzWydJZi1NYXRjaCddID0gb3B0aW9ucy5oZWFkZXJzWydJZi1NYXRjaCddO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9yZXF1ZXN0cy5wdXNoKHsgdXJsOiBvcHRpb25zLnVybCEsIHR5cGU6IG9wdGlvbnMudHlwZSEsIGhlYWRlcnMgfSk7XG5cdFx0dGhpcy5fcmVxdWVzdHNXaXRoQWxsSGVhZGVycy5wdXNoKHsgdXJsOiBvcHRpb25zLnVybCEsIHR5cGU6IG9wdGlvbnMudHlwZSEsIGhlYWRlcnM6IG9wdGlvbnMuaGVhZGVycyB9KTtcblx0XHRjb25zdCByZXF1ZXN0Q29udGV4dCA9IGF3YWl0IHRoaXMuZG9SZXF1ZXN0KG9wdGlvbnMpO1xuXHRcdHRoaXMuX3Jlc3BvbnNlcy5wdXNoKHsgc3RhdHVzOiByZXF1ZXN0Q29udGV4dC5yZXMuc3RhdHVzQ29kZSEgfSk7XG5cdFx0cmV0dXJuIHJlcXVlc3RDb250ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlcXVlc3Qob3B0aW9uczogSVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRjb25zdCB2ZXJzaW9uVXJsID0gYCR7dGhpcy51cmx9L3YxL2A7XG5cdFx0Y29uc3QgcmVsYXRpdmVQYXRoID0gb3B0aW9ucy51cmwhLmluZGV4T2YodmVyc2lvblVybCkgPT09IDAgPyBvcHRpb25zLnVybCEuc3Vic3RyaW5nKHZlcnNpb25VcmwubGVuZ3RoKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZWdtZW50cyA9IHJlbGF0aXZlUGF0aCA/IHJlbGF0aXZlUGF0aC5zcGxpdCgnLycpIDogW107XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gJ0dFVCcgJiYgc2VnbWVudHMubGVuZ3RoID09PSAxICYmIHNlZ21lbnRzWzBdID09PSAnbWFuaWZlc3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRNYW5pZmVzdChvcHRpb25zLmhlYWRlcnMpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy50eXBlID09PSAnR0VUJyAmJiBzZWdtZW50cy5sZW5ndGggPT09IDMgJiYgc2VnbWVudHNbMF0gPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFJlc291cmNlRGF0YSh1bmRlZmluZWQsIHNlZ21lbnRzWzFdLCBzZWdtZW50c1syXSA9PT0gJ2xhdGVzdCcgPyB1bmRlZmluZWQgOiBzZWdtZW50c1syXSwgb3B0aW9ucy5oZWFkZXJzKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gJ1BPU1QnICYmIHNlZ21lbnRzLmxlbmd0aCA9PT0gMiAmJiBzZWdtZW50c1swXSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMud3JpdGVEYXRhKHVuZGVmaW5lZCwgc2VnbWVudHNbMV0sIG9wdGlvbnMuZGF0YSwgb3B0aW9ucy5oZWFkZXJzKTtcblx0XHR9XG5cdFx0Ly8gcmVzb3VyY2VzIGluIGNvbGxlY3Rpb25cblx0XHRpZiAob3B0aW9ucy50eXBlID09PSAnR0VUJyAmJiBzZWdtZW50cy5sZW5ndGggPT09IDUgJiYgc2VnbWVudHNbMF0gPT09ICdjb2xsZWN0aW9uJyAmJiBzZWdtZW50c1syXSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0UmVzb3VyY2VEYXRhKHNlZ21lbnRzWzFdLCBzZWdtZW50c1szXSwgc2VnbWVudHNbNF0gPT09ICdsYXRlc3QnID8gdW5kZWZpbmVkIDogc2VnbWVudHNbNF0sIG9wdGlvbnMuaGVhZGVycyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnR5cGUgPT09ICdQT1NUJyAmJiBzZWdtZW50cy5sZW5ndGggPT09IDQgJiYgc2VnbWVudHNbMF0gPT09ICdjb2xsZWN0aW9uJyAmJiBzZWdtZW50c1syXSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMud3JpdGVEYXRhKHNlZ21lbnRzWzFdLCBzZWdtZW50c1szXSwgb3B0aW9ucy5kYXRhLCBvcHRpb25zLmhlYWRlcnMpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy50eXBlID09PSAnREVMRVRFJyAmJiBzZWdtZW50cy5sZW5ndGggPT09IDIgJiYgc2VnbWVudHNbMF0gPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlbGV0ZVJlc291cmNlRGF0YSh1bmRlZmluZWQsIHNlZ21lbnRzWzFdKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gJ0RFTEVURScgJiYgc2VnbWVudHMubGVuZ3RoID09PSAxICYmIHNlZ21lbnRzWzBdID09PSAncmVzb3VyY2UnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhcihvcHRpb25zLmhlYWRlcnMpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy50eXBlID09PSAnREVMRVRFJyAmJiBzZWdtZW50c1swXSA9PT0gJ2NvbGxlY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwNCk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnR5cGUgPT09ICdQT1NUJyAmJiBzZWdtZW50cy5sZW5ndGggPT09IDEgJiYgc2VnbWVudHNbMF0gPT09ICdjb2xsZWN0aW9uJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlQ29sbGVjdGlvbigpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDUwMSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1hbmlmZXN0KGhlYWRlcnM/OiBJSGVhZGVycyk6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0aWYgKHRoaXMuc2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgbGF0ZXN0OiBSZWNvcmQ8U2VydmVyUmVzb3VyY2UsIHN0cmluZz4gPSBPYmplY3QuY3JlYXRlKHt9KTtcblx0XHRcdHRoaXMuZGF0YS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiBsYXRlc3Rba2V5XSA9IHZhbHVlLnJlZik7XG5cdFx0XHRsZXQgY29sbGVjdGlvbnM6IElVc2VyRGF0YUNvbGxlY3Rpb25NYW5pZmVzdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLmNvbGxlY3Rpb25Db3VudGVyKSB7XG5cdFx0XHRcdGNvbGxlY3Rpb25zID0ge307XG5cdFx0XHRcdGZvciAobGV0IGNvbGxlY3Rpb25JZCA9IDE7IGNvbGxlY3Rpb25JZCA8PSB0aGlzLmNvbGxlY3Rpb25Db3VudGVyOyBjb2xsZWN0aW9uSWQrKykge1xuXHRcdFx0XHRcdGNvbnN0IGNvbGxlY3Rpb25EYXRhID0gdGhpcy5jb2xsZWN0aW9ucy5nZXQoYCR7Y29sbGVjdGlvbklkfWApO1xuXHRcdFx0XHRcdGlmIChjb2xsZWN0aW9uRGF0YSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGF0ZXN0OiBSZWNvcmQ8U2VydmVyUmVzb3VyY2UsIHN0cmluZz4gPSBPYmplY3QuY3JlYXRlKHt9KTtcblx0XHRcdFx0XHRcdGNvbGxlY3Rpb25EYXRhLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IGxhdGVzdFtrZXldID0gdmFsdWUucmVmKTtcblx0XHRcdFx0XHRcdGNvbGxlY3Rpb25zW2Ake2NvbGxlY3Rpb25JZH1gXSA9IHsgbGF0ZXN0IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSVVzZXJEYXRhTWFuaWZlc3QgPSB7IHNlc3Npb246IHRoaXMuc2Vzc2lvbiwgbGF0ZXN0LCBjb2xsZWN0aW9ucywgcmVmOiAnMScgfTtcblx0XHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsIGV0YWc6IGAke3RoaXMubWFuaWZlc3RSZWYrK31gIH0sIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0KSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoMjA0LCB7IGV0YWc6IGAke3RoaXMubWFuaWZlc3RSZWYrK31gIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZXNvdXJjZURhdGEoY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNvdXJjZTogc3RyaW5nLCByZWY/OiBzdHJpbmcsIGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb25EYXRhID0gY29sbGVjdGlvbiA/IHRoaXMuY29sbGVjdGlvbnMuZ2V0KGNvbGxlY3Rpb24pIDogdGhpcy5kYXRhO1xuXHRcdGlmICghY29sbGVjdGlvbkRhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoNTAxKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZUtleSA9IEFMTF9TRVJWRVJfUkVTT1VSQ0VTLmZpbmQoa2V5ID0+IGtleSA9PT0gcmVzb3VyY2UpO1xuXHRcdGlmIChyZXNvdXJjZUtleSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGNvbGxlY3Rpb25EYXRhLmdldChyZXNvdXJjZUtleSk7XG5cdFx0XHRpZiAocmVmICYmIGRhdGE/LnJlZiAhPT0gcmVmKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoNDA0KTtcblx0XHRcdH1cblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwNCwgeyBldGFnOiAnMCcgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVhZGVyc1snSWYtTm9uZS1NYXRjaCddID09PSBkYXRhLnJlZikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDMwNCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwMCwgeyBldGFnOiBkYXRhLnJlZiB9LCBkYXRhLmNvbnRlbnQgfHwgJycpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwNCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdyaXRlRGF0YShjb2xsZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc291cmNlOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyA9ICcnLCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRpZiAoIXRoaXMuc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5zZXNzaW9uID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbGxlY3Rpb25EYXRhID0gY29sbGVjdGlvbiA/IHRoaXMuY29sbGVjdGlvbnMuZ2V0KGNvbGxlY3Rpb24pIDogdGhpcy5kYXRhO1xuXHRcdGlmICghY29sbGVjdGlvbkRhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoNTAxKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2VLZXkgPSBBTExfU0VSVkVSX1JFU09VUkNFUy5maW5kKGtleSA9PiBrZXkgPT09IHJlc291cmNlKTtcblx0XHRpZiAocmVzb3VyY2VLZXkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSBjb2xsZWN0aW9uRGF0YS5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdFx0aWYgKGhlYWRlcnNbJ0lmLU1hdGNoJ10gIT09IHVuZGVmaW5lZCAmJiBoZWFkZXJzWydJZi1NYXRjaCddICE9PSAoZGF0YSA/IGRhdGEucmVmIDogJzAnKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDQxMik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWYgPSBgJHtwYXJzZUludChkYXRhPy5yZWYgfHwgJzAnKSArIDF9YDtcblx0XHRcdGNvbGxlY3Rpb25EYXRhLnNldChyZXNvdXJjZUtleSwgeyByZWYsIGNvbnRlbnQgfSk7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwMCwgeyBldGFnOiByZWYgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoMjA0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVsZXRlUmVzb3VyY2VEYXRhKGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzb3VyY2U6IHN0cmluZywgaGVhZGVyczogSUhlYWRlcnMgPSB7fSk6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbkRhdGEgPSBjb2xsZWN0aW9uID8gdGhpcy5jb2xsZWN0aW9ucy5nZXQoY29sbGVjdGlvbikgOiB0aGlzLmRhdGE7XG5cdFx0aWYgKCFjb2xsZWN0aW9uRGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSg1MDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlS2V5ID0gQUxMX1NFUlZFUl9SRVNPVVJDRVMuZmluZChrZXkgPT4ga2V5ID09PSByZXNvdXJjZSk7XG5cdFx0aWYgKHJlc291cmNlS2V5KSB7XG5cdFx0XHRjb2xsZWN0aW9uRGF0YS5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgyMDApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoNDA0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlQ29sbGVjdGlvbigpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb25JZCA9IGAkeysrdGhpcy5jb2xsZWN0aW9uQ291bnRlcn1gO1xuXHRcdHRoaXMuY29sbGVjdGlvbnMuc2V0KGNvbGxlY3Rpb25JZCwgbmV3IE1hcCgpKTtcblx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwMCwge30sIGNvbGxlY3Rpb25JZCk7XG5cdH1cblxuXHRhc3luYyBjbGVhcihoZWFkZXJzPzogSUhlYWRlcnMpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdHRoaXMuY29sbGVjdGlvbnMuY2xlYXIoKTtcblx0XHR0aGlzLmRhdGEuY2xlYXIoKTtcblx0XHR0aGlzLnNlc3Npb24gPSBudWxsO1xuXHRcdHRoaXMuY29sbGVjdGlvbkNvdW50ZXIgPSAwO1xuXHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoMjA0KTtcblx0fVxuXG5cdHByaXZhdGUgdG9SZXNwb25zZShzdGF0dXNDb2RlOiBudW1iZXIsIGhlYWRlcnM/OiBJSGVhZGVycywgZGF0YT86IHN0cmluZyk6IElSZXF1ZXN0Q29udGV4dCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlczoge1xuXHRcdFx0XHRoZWFkZXJzOiBoZWFkZXJzIHx8IHt9LFxuXHRcdFx0XHRzdGF0dXNDb2RlXG5cdFx0XHR9LFxuXHRcdFx0c3RyZWFtOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKGRhdGEgfHwgJycpKVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RVc2VyRGF0YVN5bmNVdGlsU2VydmljZSBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNVdGlsU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGFzeW5jIHJlc29sdmVEZWZhdWx0Q29yZUlnbm9yZWRTZXR0aW5ncygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIGdldERlZmF1bHRJZ25vcmVkU2V0dGluZ3MoKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVVc2VyQmluZGluZ3ModXNlcmJpbmRpbmdzOiBzdHJpbmdbXSk6IFByb21pc2U8SVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPj4ge1xuXHRcdGNvbnN0IGtleXM6IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleWJpbmRpbmcgb2YgdXNlcmJpbmRpbmdzKSB7XG5cdFx0XHRrZXlzW2tleWJpbmRpbmddID0ga2V5YmluZGluZztcblx0XHR9XG5cdFx0cmV0dXJuIGtleXM7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlRm9ybWF0dGluZ09wdGlvbnMoZmlsZT86IFVSSSk6IFByb21pc2U8Rm9ybWF0dGluZ09wdGlvbnM+IHtcblx0XHRyZXR1cm4geyBlb2w6ICdcXG4nLCBpbnNlcnRTcGFjZXM6IGZhbHNlLCB0YWJTaXplOiA0IH07XG5cdH1cblxufVxuXG5jbGFzcyBUZXN0U3RvcmFnZVNlcnZpY2UgZXh0ZW5kcyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBwcm9maWxlU3RvcmFnZVByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cdG92ZXJyaWRlIGhhc1Njb3BlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wcm9maWxlU3RvcmFnZVByb2ZpbGUuaWQgPT09IHByb2ZpbGUuaWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCLGdCQUFnQjtBQUd6QyxTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQXFDLDBCQUEwQiw2QkFBNkIseUNBQWlFO0FB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
