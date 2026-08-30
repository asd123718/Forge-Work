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
import { createCancelablePromise, timeout } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { Mimes } from "../../../base/common/mime.js";
import { isWeb } from "../../../base/common/platform.js";
import { joinPath, relativePath } from "../../../base/common/resources.js";
import { isObject, isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { IProductService } from "../../product/common/productService.js";
import { asJson, asText, asTextOrError, hasNoContent, IRequestService, isSuccess, isSuccess as isSuccessContext } from "../../request/common/request.js";
import { getServiceMachineId } from "../../externalServices/common/serviceMachineId.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { HEADER_EXECUTION_ID, HEADER_OPERATION_ID, IUserDataSyncLogService, IUserDataSyncStoreManagementService, SYNC_SERVICE_URL_TYPE, UserDataSyncErrorCode, UserDataSyncStoreError } from "./userDataSync.js";
const CONFIGURATION_SYNC_STORE_KEY = "configurationSync.store";
const SYNC_PREVIOUS_STORE = "sync.previous.store";
const DONOT_MAKE_REQUESTS_UNTIL_KEY = "sync.donot-make-requests-until";
const USER_SESSION_ID_KEY = "sync.user-session-id";
const MACHINE_SESSION_ID_KEY = "sync.machine-session-id";
const REQUEST_SESSION_LIMIT = 100;
const REQUEST_SESSION_INTERVAL = 1e3 * 60 * 5;
let AbstractUserDataSyncStoreManagementService = class extends Disposable {
  constructor(productService, configurationService, storageService) {
    super();
    this.productService = productService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this._onDidChangeUserDataSyncStore = this._register(new Emitter());
    this.onDidChangeUserDataSyncStore = this._onDidChangeUserDataSyncStore.event;
    this.updateUserDataSyncStore();
    const disposable = this._register(new DisposableStore());
    this._register(Event.filter(storageService.onDidChangeValue(StorageScope.APPLICATION, SYNC_SERVICE_URL_TYPE, disposable), () => this.userDataSyncStoreType !== this.userDataSyncStore?.type, disposable)(() => this.updateUserDataSyncStore()));
  }
  get userDataSyncStore() {
    return this._userDataSyncStore;
  }
  get userDataSyncStoreType() {
    return this.storageService.get(SYNC_SERVICE_URL_TYPE, StorageScope.APPLICATION);
  }
  set userDataSyncStoreType(type) {
    this.storageService.store(SYNC_SERVICE_URL_TYPE, type, StorageScope.APPLICATION, isWeb ? StorageTarget.USER : StorageTarget.MACHINE);
  }
  updateUserDataSyncStore() {
    this._userDataSyncStore = this.toUserDataSyncStore(this.productService[CONFIGURATION_SYNC_STORE_KEY]);
    this._onDidChangeUserDataSyncStore.fire();
  }
  toUserDataSyncStore(configurationSyncStore) {
    if (!configurationSyncStore) {
      return void 0;
    }
    configurationSyncStore = isWeb && configurationSyncStore.web ? { ...configurationSyncStore, ...configurationSyncStore.web } : configurationSyncStore;
    if (isString(configurationSyncStore.url) && isObject(configurationSyncStore.authenticationProviders) && Object.keys(configurationSyncStore.authenticationProviders).every((authenticationProviderId) => Array.isArray(configurationSyncStore.authenticationProviders[authenticationProviderId].scopes))) {
      const syncStore = configurationSyncStore;
      const canSwitch = !!syncStore.canSwitch;
      const defaultType = syncStore.url === syncStore.insidersUrl ? "insiders" : "stable";
      const type = (canSwitch ? this.userDataSyncStoreType : void 0) || defaultType;
      const url = type === "insiders" ? syncStore.insidersUrl : type === "stable" ? syncStore.stableUrl : syncStore.url;
      return {
        url: URI.parse(url),
        type,
        defaultType,
        defaultUrl: URI.parse(syncStore.url),
        stableUrl: URI.parse(syncStore.stableUrl),
        insidersUrl: URI.parse(syncStore.insidersUrl),
        canSwitch,
        authenticationProviders: Object.keys(syncStore.authenticationProviders).reduce((result, id) => {
          result.push({ id, scopes: syncStore.authenticationProviders[id].scopes });
          return result;
        }, [])
      };
    }
    return void 0;
  }
};
AbstractUserDataSyncStoreManagementService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService)
], AbstractUserDataSyncStoreManagementService);
let UserDataSyncStoreManagementService = class extends AbstractUserDataSyncStoreManagementService {
  constructor(productService, configurationService, storageService) {
    super(productService, configurationService, storageService);
    const previousConfigurationSyncStore = this.storageService.get(SYNC_PREVIOUS_STORE, StorageScope.APPLICATION);
    if (previousConfigurationSyncStore) {
      this.previousConfigurationSyncStore = JSON.parse(previousConfigurationSyncStore);
    }
    const syncStore = this.productService[CONFIGURATION_SYNC_STORE_KEY];
    if (syncStore) {
      this.storageService.store(SYNC_PREVIOUS_STORE, JSON.stringify(syncStore), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(SYNC_PREVIOUS_STORE, StorageScope.APPLICATION);
    }
  }
  async switch(type) {
    if (type !== this.userDataSyncStoreType) {
      this.userDataSyncStoreType = type;
      this.updateUserDataSyncStore();
    }
  }
  async getPreviousUserDataSyncStore() {
    return this.toUserDataSyncStore(this.previousConfigurationSyncStore);
  }
};
UserDataSyncStoreManagementService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService)
], UserDataSyncStoreManagementService);
let UserDataSyncStoreClient = class extends Disposable {
  constructor(userDataSyncStoreUrl, productService, requestService, logService, environmentService, fileService, storageService) {
    super();
    this.requestService = requestService;
    this.logService = logService;
    this.storageService = storageService;
    this._onTokenFailed = this._register(new Emitter());
    this.onTokenFailed = this._onTokenFailed.event;
    this._onTokenSucceed = this._register(new Emitter());
    this.onTokenSucceed = this._onTokenSucceed.event;
    this._donotMakeRequestsUntil = void 0;
    this._onDidChangeDonotMakeRequestsUntil = this._register(new Emitter());
    this.onDidChangeDonotMakeRequestsUntil = this._onDidChangeDonotMakeRequestsUntil.event;
    this.resetDonotMakeRequestsUntilPromise = void 0;
    this.updateUserDataSyncStoreUrl(userDataSyncStoreUrl);
    this.commonHeadersPromise = getServiceMachineId(environmentService, fileService, storageService).then((uuid) => {
      const headers = {
        "X-Client-Name": `${productService.applicationName}${isWeb ? "-web" : ""}`,
        "X-Client-Version": productService.version
      };
      if (productService.commit) {
        headers["X-Client-Commit"] = productService.commit;
      }
      return headers;
    });
    this.session = new RequestsSession(REQUEST_SESSION_LIMIT, REQUEST_SESSION_INTERVAL, this.requestService, this.logService);
    this.initDonotMakeRequestsUntil();
    this._register(toDisposable(() => {
      if (this.resetDonotMakeRequestsUntilPromise) {
        this.resetDonotMakeRequestsUntilPromise.cancel();
        this.resetDonotMakeRequestsUntilPromise = void 0;
      }
    }));
  }
  get donotMakeRequestsUntil() {
    return this._donotMakeRequestsUntil;
  }
  setAuthToken(token, type) {
    this.authToken = { token, type };
  }
  updateUserDataSyncStoreUrl(userDataSyncStoreUrl) {
    this.userDataSyncStoreUrl = userDataSyncStoreUrl ? joinPath(userDataSyncStoreUrl, "v1") : void 0;
  }
  initDonotMakeRequestsUntil() {
    const donotMakeRequestsUntil = this.storageService.getNumber(DONOT_MAKE_REQUESTS_UNTIL_KEY, StorageScope.APPLICATION);
    if (donotMakeRequestsUntil && Date.now() < donotMakeRequestsUntil) {
      this.setDonotMakeRequestsUntil(new Date(donotMakeRequestsUntil));
    }
  }
  setDonotMakeRequestsUntil(donotMakeRequestsUntil) {
    if (this._donotMakeRequestsUntil?.getTime() !== donotMakeRequestsUntil?.getTime()) {
      this._donotMakeRequestsUntil = donotMakeRequestsUntil;
      if (this.resetDonotMakeRequestsUntilPromise) {
        this.resetDonotMakeRequestsUntilPromise.cancel();
        this.resetDonotMakeRequestsUntilPromise = void 0;
      }
      if (this._donotMakeRequestsUntil) {
        this.storageService.store(DONOT_MAKE_REQUESTS_UNTIL_KEY, this._donotMakeRequestsUntil.getTime(), StorageScope.APPLICATION, StorageTarget.MACHINE);
        this.resetDonotMakeRequestsUntilPromise = createCancelablePromise((token) => timeout(this._donotMakeRequestsUntil.getTime() - Date.now(), token).then(() => this.setDonotMakeRequestsUntil(void 0)));
        this.resetDonotMakeRequestsUntilPromise.then(
          null,
          (e) => null
          /* ignore error */
        );
      } else {
        this.storageService.remove(DONOT_MAKE_REQUESTS_UNTIL_KEY, StorageScope.APPLICATION);
      }
      this._onDidChangeDonotMakeRequestsUntil.fire();
    }
  }
  // #region Collection
  async getAllCollections(headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "collection").toString();
    headers = { ...headers };
    headers["Content-Type"] = "application/json";
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.getAllCollections" }, [], CancellationToken.None);
    return (await asJson(context))?.map(({ id }) => id) || [];
  }
  async createCollection(headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "collection").toString();
    headers = { ...headers };
    headers["Content-Type"] = Mimes.text;
    const context = await this.request(url, { type: "POST", headers, callSite: "userDataSync.createCollection" }, [], CancellationToken.None);
    const collectionId = await asTextOrError(context);
    if (!collectionId) {
      throw new UserDataSyncStoreError("Server did not return the collection id", url, UserDataSyncErrorCode.NoCollection, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    return collectionId;
  }
  async deleteCollection(collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = collection ? joinPath(this.userDataSyncStoreUrl, "collection", collection).toString() : joinPath(this.userDataSyncStoreUrl, "collection").toString();
    headers = { ...headers };
    await this.request(url, { type: "DELETE", headers, callSite: "userDataSync.deleteCollection" }, [], CancellationToken.None);
  }
  // #endregion
  // #region Resource
  async getAllResourceRefs(resource, collection) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const uri = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource);
    const headers = {};
    const context = await this.request(uri.toString(), { type: "GET", headers, callSite: "userDataSync.getAllResourceRefs" }, [], CancellationToken.None);
    const result = await asJson(context) || [];
    return result.map(({ url, created }) => ({
      ref: relativePath(uri, uri.with({ path: url })),
      created: created * 1e3
      /* Server returns in seconds */
    }));
  }
  async resolveResourceContent(resource, ref, collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString();
    headers = { ...headers };
    headers["Cache-Control"] = "no-cache";
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.resolveResourceContent" }, [], CancellationToken.None);
    const content = await asTextOrError(context);
    return content;
  }
  async deleteResource(resource, ref, collection) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = ref !== null ? joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString() : this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
    const headers = {};
    await this.request(url, { type: "DELETE", headers, callSite: "userDataSync.deleteResource" }, [], CancellationToken.None);
  }
  async deleteResources() {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "resource").toString();
    const headers = { "Content-Type": Mimes.text };
    await this.request(url, { type: "DELETE", headers, callSite: "userDataSync.deleteResources" }, [], CancellationToken.None);
  }
  async readResource(resource, oldValue, collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), "latest").toString();
    headers = { ...headers };
    headers["Cache-Control"] = "no-cache";
    if (oldValue) {
      headers["If-None-Match"] = oldValue.ref;
    }
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.readResource" }, [304], CancellationToken.None);
    let userData = null;
    if (context.res.statusCode === 304) {
      userData = oldValue;
    }
    if (userData === null) {
      const ref = context.res.headers["etag"];
      if (!ref) {
        throw new UserDataSyncStoreError("Server did not return the ref", url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      const content = await asTextOrError(context);
      if (!content && context.res.statusCode === 304) {
        throw new UserDataSyncStoreError("Empty response", url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      userData = { ref, content };
    }
    return userData;
  }
  async writeResource(resource, data, ref, collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
    headers = { ...headers };
    headers["Content-Type"] = Mimes.text;
    if (ref) {
      headers["If-Match"] = ref;
    }
    const context = await this.request(url, { type: "POST", data, headers, callSite: "userDataSync.writeResource" }, [], CancellationToken.None);
    const newRef = context.res.headers["etag"];
    if (!newRef) {
      throw new UserDataSyncStoreError("Server did not return the ref", url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    return newRef;
  }
  // #endregion
  async manifest(oldValue, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "manifest").toString();
    headers = { ...headers };
    headers["Content-Type"] = "application/json";
    if (oldValue) {
      headers["If-None-Match"] = oldValue.ref;
    }
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.manifest" }, [304], CancellationToken.None);
    let manifest = null;
    if (context.res.statusCode === 304) {
      manifest = oldValue;
    }
    if (!manifest) {
      const ref = context.res.headers["etag"];
      if (!ref) {
        throw new UserDataSyncStoreError("Server did not return the ref", url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      const content = await asTextOrError(context);
      if (!content && context.res.statusCode === 304) {
        throw new UserDataSyncStoreError("Empty response", url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      if (content) {
        manifest = { ...JSON.parse(content), ref };
      }
    }
    const currentSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
    if (currentSessionId && manifest && currentSessionId !== manifest.session) {
      this.clearSession();
    }
    if (manifest === null && currentSessionId) {
      this.clearSession();
    }
    if (manifest) {
      this.storageService.store(USER_SESSION_ID_KEY, manifest.session, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return manifest;
  }
  async clear() {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    await this.deleteCollection();
    await this.deleteResources();
    this.clearSession();
  }
  async getLatestData(headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "download", "latest").toString();
    headers = { ...headers };
    headers["Content-Type"] = "application/json";
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.getLatestData" }, [], CancellationToken.None);
    if (!isSuccess(context)) {
      throw new UserDataSyncStoreError("Server returned " + context.res.statusCode, url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    const serverData = await asJson(context);
    if (!serverData) {
      return null;
    }
    const result = {};
    if (serverData.resources) {
      result.resources = {};
      for (const resource in serverData.resources) {
        const [resourceData] = serverData.resources[resource];
        result.resources[resource] = {
          content: resourceData.content,
          ref: resourceData.ref
        };
      }
    }
    if (serverData.collections) {
      result.collections = {};
      for (const collection in serverData.collections) {
        const resources = {};
        result.collections[collection] = { resources };
        for (const resource in serverData.collections[collection].resources) {
          const [resourceData] = serverData.collections[collection].resources[resource];
          resources[resource] = {
            content: resourceData.content,
            ref: resourceData.ref
          };
        }
      }
    }
    return result;
  }
  async getActivityData() {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "download").toString();
    const headers = {};
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.getActivityData" }, [], CancellationToken.None);
    if (!isSuccess(context)) {
      throw new UserDataSyncStoreError("Server returned " + context.res.statusCode, url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    if (hasNoContent(context)) {
      throw new UserDataSyncStoreError("Empty response", url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    return context.stream;
  }
  getResourceUrl(userDataSyncStoreUrl, collection, resource) {
    return collection ? joinPath(userDataSyncStoreUrl, "collection", collection, "resource", resource) : joinPath(userDataSyncStoreUrl, "resource", resource);
  }
  clearSession() {
    this.storageService.remove(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
    this.storageService.remove(MACHINE_SESSION_ID_KEY, StorageScope.APPLICATION);
  }
  async request(url, options, successCodes, token) {
    if (!this.authToken) {
      throw new UserDataSyncStoreError("No Auth Token Available", url, UserDataSyncErrorCode.Unauthorized, void 0, void 0);
    }
    if (this._donotMakeRequestsUntil && Date.now() < this._donotMakeRequestsUntil.getTime()) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter, void 0, void 0);
    }
    this.setDonotMakeRequestsUntil(void 0);
    const commonHeaders = await this.commonHeadersPromise;
    options.headers = {
      ...options.headers || {},
      ...commonHeaders,
      "X-Account-Type": this.authToken.type,
      "authorization": `Bearer ${this.authToken.token}`
    };
    this.addSessionHeaders(options.headers);
    this.logService.trace("Sending request to server", { url, type: options.type, headers: { ...options.headers, ...{ authorization: void 0 } } });
    let context;
    try {
      context = await this.session.request(url, options, token);
    } catch (e) {
      if (!(e instanceof UserDataSyncStoreError)) {
        let code = UserDataSyncErrorCode.RequestFailed;
        const errorMessage = getErrorMessage(e).toLowerCase();
        if (errorMessage.includes("xhr timeout")) {
          code = UserDataSyncErrorCode.RequestTimeout;
        } else if (errorMessage.includes("protocol") && errorMessage.includes("not supported")) {
          code = UserDataSyncErrorCode.RequestProtocolNotSupported;
        } else if (errorMessage.includes("request path contains unescaped characters")) {
          code = UserDataSyncErrorCode.RequestPathNotEscaped;
        } else if (errorMessage.includes("headers must be an object")) {
          code = UserDataSyncErrorCode.RequestHeadersNotObject;
        } else if (isCancellationError(e)) {
          code = UserDataSyncErrorCode.RequestCanceled;
        }
        e = new UserDataSyncStoreError(`Connection refused for the request '${url}'.`, url, code, void 0, void 0);
      }
      this.logService.info("Request failed", url);
      throw e;
    }
    const operationId = context.res.headers[HEADER_OPERATION_ID];
    const requestInfo = { url, status: context.res.statusCode, "execution-id": options.headers[HEADER_EXECUTION_ID], "operation-id": operationId };
    const isSuccess2 = isSuccessContext(context) || context.res.statusCode && successCodes.includes(context.res.statusCode);
    let failureMessage = "";
    if (isSuccess2) {
      this.logService.trace("Request succeeded", requestInfo);
    } else {
      failureMessage = await asText(context) || "";
      this.logService.info("Request failed", requestInfo, failureMessage);
    }
    if (context.res.statusCode === 401 || context.res.statusCode === 403) {
      this.authToken = void 0;
      if (context.res.statusCode === 401) {
        this._onTokenFailed.fire(UserDataSyncErrorCode.Unauthorized);
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Unauthorized (401).`, url, UserDataSyncErrorCode.Unauthorized, context.res.statusCode, operationId);
      }
      if (context.res.statusCode === 403) {
        this._onTokenFailed.fire(UserDataSyncErrorCode.Forbidden);
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the access is forbidden (403).`, url, UserDataSyncErrorCode.Forbidden, context.res.statusCode, operationId);
      }
    }
    this._onTokenSucceed.fire();
    if (context.res.statusCode === 404) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not found (404).`, url, UserDataSyncErrorCode.NotFound, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 405) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested endpoint is not found (405). ${failureMessage}`, url, UserDataSyncErrorCode.MethodNotFound, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 409) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Conflict (409). There is new data for this resource. Make the request again with latest data.`, url, UserDataSyncErrorCode.Conflict, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 410) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not longer available (410).`, url, UserDataSyncErrorCode.Gone, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 412) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Precondition Failed (412). There is new data for this resource. Make the request again with latest data.`, url, UserDataSyncErrorCode.PreconditionFailed, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 413) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too large payload (413).`, url, UserDataSyncErrorCode.TooLarge, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 426) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed with status Upgrade Required (426). Please upgrade the client and try again.`, url, UserDataSyncErrorCode.UpgradeRequired, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 429) {
      const retryAfter = context.res.headers["retry-after"];
      if (retryAfter) {
        this.setDonotMakeRequestsUntil(new Date(Date.now() + parseInt(retryAfter) * 1e3));
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter, context.res.statusCode, operationId);
      } else {
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequests, context.res.statusCode, operationId);
      }
    }
    if (!isSuccess2) {
      throw new UserDataSyncStoreError("Server returned " + context.res.statusCode, url, UserDataSyncErrorCode.Unknown, context.res.statusCode, operationId);
    }
    return context;
  }
  addSessionHeaders(headers) {
    let machineSessionId = this.storageService.get(MACHINE_SESSION_ID_KEY, StorageScope.APPLICATION);
    if (machineSessionId === void 0) {
      machineSessionId = generateUuid();
      this.storageService.store(MACHINE_SESSION_ID_KEY, machineSessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    headers["X-Machine-Session-Id"] = machineSessionId;
    const userSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
    if (userSessionId !== void 0) {
      headers["X-User-Session-Id"] = userSessionId;
    }
  }
};
UserDataSyncStoreClient = __decorateClass([
  __decorateParam(1, IProductService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IStorageService)
], UserDataSyncStoreClient);
let UserDataSyncStoreService = class extends UserDataSyncStoreClient {
  constructor(userDataSyncStoreManagementService, productService, requestService, logService, environmentService, fileService, storageService) {
    super(userDataSyncStoreManagementService.userDataSyncStore?.url, productService, requestService, logService, environmentService, fileService, storageService);
    this._register(userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => this.updateUserDataSyncStoreUrl(userDataSyncStoreManagementService.userDataSyncStore?.url)));
  }
};
UserDataSyncStoreService = __decorateClass([
  __decorateParam(0, IUserDataSyncStoreManagementService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IStorageService)
], UserDataSyncStoreService);
class RequestsSession {
  constructor(limit, interval, requestService, logService) {
    this.limit = limit;
    this.interval = interval;
    this.requestService = requestService;
    this.logService = logService;
    this.requests = [];
    this.startTime = void 0;
  }
  request(url, options, token) {
    if (this.isExpired()) {
      this.reset();
    }
    options.url = url;
    if (this.requests.length >= this.limit) {
      this.logService.info("Too many requests", ...this.requests);
      throw new UserDataSyncStoreError(`Too many requests. Only ${this.limit} requests allowed in ${this.interval / (1e3 * 60)} minutes.`, url, UserDataSyncErrorCode.LocalTooManyRequests, void 0, void 0);
    }
    this.startTime = this.startTime || /* @__PURE__ */ new Date();
    this.requests.push(url);
    return this.requestService.request(options, token);
  }
  isExpired() {
    return this.startTime !== void 0 && (/* @__PURE__ */ new Date()).getTime() - this.startTime.getTime() > this.interval;
  }
  reset() {
    this.requests = [];
    this.startTime = void 0;
  }
}
export {
  AbstractUserDataSyncStoreManagementService,
  RequestsSession,
  UserDataSyncStoreClient,
  UserDataSyncStoreManagementService,
  UserDataSyncStoreService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHVzZXJEYXRhU3luY1N0b3JlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TeW5jU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IGpvaW5QYXRoLCByZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUhlYWRlcnMsIElSZXF1ZXN0Q29udGV4dCwgSVJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNKc29uLCBhc1RleHQsIGFzVGV4dE9yRXJyb3IsIGhhc05vQ29udGVudCwgSVJlcXVlc3RTZXJ2aWNlLCBpc1N1Y2Nlc3MsIGlzU3VjY2VzcyBhcyBpc1N1Y2Nlc3NDb250ZXh0IH0gZnJvbSAnLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBnZXRTZXJ2aWNlTWFjaGluZUlkIH0gZnJvbSAnLi4vLi4vZXh0ZXJuYWxTZXJ2aWNlcy9jb21tb24vc2VydmljZU1hY2hpbmVJZC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSEVBREVSX0VYRUNVVElPTl9JRCwgSEVBREVSX09QRVJBVElPTl9JRCwgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIElSZXNvdXJjZVJlZkhhbmRsZSwgSVVzZXJEYXRhLCBJVXNlckRhdGFNYW5pZmVzdCwgSVVzZXJEYXRhU3luY0xhdGVzdERhdGEsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmUsIElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLCBTZXJ2ZXJSZXNvdXJjZSwgU1lOQ19TRVJWSUNFX1VSTF9UWVBFLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IsIFVzZXJEYXRhU3luY1N0b3JlVHlwZSB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5cbnR5cGUgSURvd25sb2FkTGF0ZXN0RGF0YVR5cGUgPSB7XG5cdHJlc291cmNlcz86IHtcblx0XHRbcmVzb3VyY2VJZDogc3RyaW5nXTogW0lVc2VyRGF0YV07XG5cdH07XG5cdGNvbGxlY3Rpb25zPzoge1xuXHRcdFtjb2xsZWN0aW9uSWQ6IHN0cmluZ106IHtcblx0XHRcdHJlc291cmNlcz86IHtcblx0XHRcdFx0W3Jlc291cmNlSWQ6IHN0cmluZ106IFtJVXNlckRhdGFdO1xuXHRcdFx0fSB8IHVuZGVmaW5lZDtcblx0XHR9O1xuXHR9O1xufTtcblxuY29uc3QgQ09ORklHVVJBVElPTl9TWU5DX1NUT1JFX0tFWSA9ICdjb25maWd1cmF0aW9uU3luYy5zdG9yZSc7XG5jb25zdCBTWU5DX1BSRVZJT1VTX1NUT1JFID0gJ3N5bmMucHJldmlvdXMuc3RvcmUnO1xuY29uc3QgRE9OT1RfTUFLRV9SRVFVRVNUU19VTlRJTF9LRVkgPSAnc3luYy5kb25vdC1tYWtlLXJlcXVlc3RzLXVudGlsJztcbmNvbnN0IFVTRVJfU0VTU0lPTl9JRF9LRVkgPSAnc3luYy51c2VyLXNlc3Npb24taWQnO1xuY29uc3QgTUFDSElORV9TRVNTSU9OX0lEX0tFWSA9ICdzeW5jLm1hY2hpbmUtc2Vzc2lvbi1pZCc7XG5jb25zdCBSRVFVRVNUX1NFU1NJT05fTElNSVQgPSAxMDA7XG5jb25zdCBSRVFVRVNUX1NFU1NJT05fSU5URVJWQUwgPSAxMDAwICogNjAgKiA1OyAvKiA1IG1pbnV0ZXMgKi9cblxudHlwZSBVc2VyRGF0YVN5bmNTdG9yZSA9IElVc2VyRGF0YVN5bmNTdG9yZSAmIHsgZGVmYXVsdFR5cGU6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSB9O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VVc2VyRGF0YVN5bmNTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVVzZXJEYXRhU3luY1N0b3JlID0gdGhpcy5fb25EaWRDaGFuZ2VVc2VyRGF0YVN5bmNTdG9yZS5ldmVudDtcblx0cHJpdmF0ZSBfdXNlckRhdGFTeW5jU3RvcmU6IFVzZXJEYXRhU3luY1N0b3JlIHwgdW5kZWZpbmVkO1xuXHRnZXQgdXNlckRhdGFTeW5jU3RvcmUoKTogVXNlckRhdGFTeW5jU3RvcmUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fdXNlckRhdGFTeW5jU3RvcmU7IH1cblxuXHRwcm90ZWN0ZWQgZ2V0IHVzZXJEYXRhU3luY1N0b3JlVHlwZSgpOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTWU5DX1NFUlZJQ0VfVVJMX1RZUEUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgYXMgVXNlckRhdGFTeW5jU3RvcmVUeXBlO1xuXHR9XG5cdHByb3RlY3RlZCBzZXQgdXNlckRhdGFTeW5jU3RvcmVUeXBlKHR5cGU6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1lOQ19TRVJWSUNFX1VSTF9UWVBFLCB0eXBlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGlzV2ViID8gU3RvcmFnZVRhcmdldC5VU0VSIC8qIHN5bmMgaW4gd2ViICovIDogU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMudXBkYXRlVXNlckRhdGFTeW5jU3RvcmUoKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIoc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFNZTkNfU0VSVklDRV9VUkxfVFlQRSwgZGlzcG9zYWJsZSksICgpID0+IHRoaXMudXNlckRhdGFTeW5jU3RvcmVUeXBlICE9PSB0aGlzLnVzZXJEYXRhU3luY1N0b3JlPy50eXBlLCBkaXNwb3NhYmxlKSgoKSA9PiB0aGlzLnVwZGF0ZVVzZXJEYXRhU3luY1N0b3JlKCkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVVc2VyRGF0YVN5bmNTdG9yZSgpOiB2b2lkIHtcblx0XHR0aGlzLl91c2VyRGF0YVN5bmNTdG9yZSA9IHRoaXMudG9Vc2VyRGF0YVN5bmNTdG9yZSh0aGlzLnByb2R1Y3RTZXJ2aWNlW0NPTkZJR1VSQVRJT05fU1lOQ19TVE9SRV9LRVldKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVVzZXJEYXRhU3luY1N0b3JlLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCB0b1VzZXJEYXRhU3luY1N0b3JlKGNvbmZpZ3VyYXRpb25TeW5jU3RvcmU6IENvbmZpZ3VyYXRpb25TeW5jU3RvcmUgJiB7IHdlYj86IENvbmZpZ3VyYXRpb25TeW5jU3RvcmUgfSB8IHVuZGVmaW5lZCk6IFVzZXJEYXRhU3luY1N0b3JlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWNvbmZpZ3VyYXRpb25TeW5jU3RvcmUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIENoZWNrIGZvciB3ZWIgb3ZlcnJpZGVzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IHdoaWxlIHJlYWRpbmcgcHJldmlvdXMgc3RvcmVcblx0XHRjb25maWd1cmF0aW9uU3luY1N0b3JlID0gaXNXZWIgJiYgY29uZmlndXJhdGlvblN5bmNTdG9yZS53ZWIgPyB7IC4uLmNvbmZpZ3VyYXRpb25TeW5jU3RvcmUsIC4uLmNvbmZpZ3VyYXRpb25TeW5jU3RvcmUud2ViIH0gOiBjb25maWd1cmF0aW9uU3luY1N0b3JlO1xuXHRcdGlmIChpc1N0cmluZyhjb25maWd1cmF0aW9uU3luY1N0b3JlLnVybClcblx0XHRcdCYmIGlzT2JqZWN0KGNvbmZpZ3VyYXRpb25TeW5jU3RvcmUuYXV0aGVudGljYXRpb25Qcm92aWRlcnMpXG5cdFx0XHQmJiBPYmplY3Qua2V5cyhjb25maWd1cmF0aW9uU3luY1N0b3JlLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKS5ldmVyeShhdXRoZW50aWNhdGlvblByb3ZpZGVySWQgPT4gQXJyYXkuaXNBcnJheShjb25maWd1cmF0aW9uU3luY1N0b3JlLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzW2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZF0uc2NvcGVzKSlcblx0XHQpIHtcblx0XHRcdGNvbnN0IHN5bmNTdG9yZSA9IGNvbmZpZ3VyYXRpb25TeW5jU3RvcmUgYXMgQ29uZmlndXJhdGlvblN5bmNTdG9yZTtcblx0XHRcdGNvbnN0IGNhblN3aXRjaCA9ICEhc3luY1N0b3JlLmNhblN3aXRjaDtcblx0XHRcdGNvbnN0IGRlZmF1bHRUeXBlOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUgPSBzeW5jU3RvcmUudXJsID09PSBzeW5jU3RvcmUuaW5zaWRlcnNVcmwgPyAnaW5zaWRlcnMnIDogJ3N0YWJsZSc7XG5cdFx0XHRjb25zdCB0eXBlOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUgPSAoY2FuU3dpdGNoID8gdGhpcy51c2VyRGF0YVN5bmNTdG9yZVR5cGUgOiB1bmRlZmluZWQpIHx8IGRlZmF1bHRUeXBlO1xuXHRcdFx0Y29uc3QgdXJsID0gdHlwZSA9PT0gJ2luc2lkZXJzJyA/IHN5bmNTdG9yZS5pbnNpZGVyc1VybFxuXHRcdFx0XHQ6IHR5cGUgPT09ICdzdGFibGUnID8gc3luY1N0b3JlLnN0YWJsZVVybFxuXHRcdFx0XHRcdDogc3luY1N0b3JlLnVybDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVybDogVVJJLnBhcnNlKHVybCksXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdGRlZmF1bHRUeXBlLFxuXHRcdFx0XHRkZWZhdWx0VXJsOiBVUkkucGFyc2Uoc3luY1N0b3JlLnVybCksXG5cdFx0XHRcdHN0YWJsZVVybDogVVJJLnBhcnNlKHN5bmNTdG9yZS5zdGFibGVVcmwpLFxuXHRcdFx0XHRpbnNpZGVyc1VybDogVVJJLnBhcnNlKHN5bmNTdG9yZS5pbnNpZGVyc1VybCksXG5cdFx0XHRcdGNhblN3aXRjaCxcblx0XHRcdFx0YXV0aGVudGljYXRpb25Qcm92aWRlcnM6IE9iamVjdC5rZXlzKHN5bmNTdG9yZS5hdXRoZW50aWNhdGlvblByb3ZpZGVycykucmVkdWNlPElBdXRoZW50aWNhdGlvblByb3ZpZGVyW10+KChyZXN1bHQsIGlkKSA9PiB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyBpZCwgc2NvcGVzOiBzeW5jU3RvcmUuYXV0aGVudGljYXRpb25Qcm92aWRlcnNbaWRdLnNjb3BlcyB9KTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9LCBbXSlcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhYnN0cmFjdCBzd2l0Y2godHlwZTogVXNlckRhdGFTeW5jU3RvcmVUeXBlKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgZ2V0UHJldmlvdXNVc2VyRGF0YVN5bmNTdG9yZSgpOiBQcm9taXNlPElVc2VyRGF0YVN5bmNTdG9yZSB8IHVuZGVmaW5lZD47XG5cbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aW91c0NvbmZpZ3VyYXRpb25TeW5jU3RvcmU6IENvbmZpZ3VyYXRpb25TeW5jU3RvcmUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNDb25maWd1cmF0aW9uU3luY1N0b3JlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoU1lOQ19QUkVWSU9VU19TVE9SRSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAocHJldmlvdXNDb25maWd1cmF0aW9uU3luY1N0b3JlKSB7XG5cdFx0XHR0aGlzLnByZXZpb3VzQ29uZmlndXJhdGlvblN5bmNTdG9yZSA9IEpTT04ucGFyc2UocHJldmlvdXNDb25maWd1cmF0aW9uU3luY1N0b3JlKTtcblx0XHR9XG5cblx0XHRjb25zdCBzeW5jU3RvcmUgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlW0NPTkZJR1VSQVRJT05fU1lOQ19TVE9SRV9LRVldO1xuXHRcdGlmIChzeW5jU3RvcmUpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1lOQ19QUkVWSU9VU19TVE9SRSwgSlNPTi5zdHJpbmdpZnkoc3luY1N0b3JlKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTWU5DX1BSRVZJT1VTX1NUT1JFLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN3aXRjaCh0eXBlOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZSAhPT0gdGhpcy51c2VyRGF0YVN5bmNTdG9yZVR5cGUpIHtcblx0XHRcdHRoaXMudXNlckRhdGFTeW5jU3RvcmVUeXBlID0gdHlwZTtcblx0XHRcdHRoaXMudXBkYXRlVXNlckRhdGFTeW5jU3RvcmUoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRQcmV2aW91c1VzZXJEYXRhU3luY1N0b3JlKCk6IFByb21pc2U8SVVzZXJEYXRhU3luY1N0b3JlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMudG9Vc2VyRGF0YVN5bmNTdG9yZSh0aGlzLnByZXZpb3VzQ29uZmlndXJhdGlvblN5bmNTdG9yZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSB1c2VyRGF0YVN5bmNTdG9yZVVybDogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgYXV0aFRva2VuOiB7IHRva2VuOiBzdHJpbmc7IHR5cGU6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbW1vbkhlYWRlcnNQcm9taXNlOiBQcm9taXNlPElIZWFkZXJzPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uOiBSZXF1ZXN0c1Nlc3Npb247XG5cblx0cHJpdmF0ZSBfb25Ub2tlbkZhaWxlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVzZXJEYXRhU3luY0Vycm9yQ29kZT4oKSk7XG5cdHJlYWRvbmx5IG9uVG9rZW5GYWlsZWQgPSB0aGlzLl9vblRva2VuRmFpbGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uVG9rZW5TdWNjZWVkOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uVG9rZW5TdWNjZWVkOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uVG9rZW5TdWNjZWVkLmV2ZW50O1xuXG5cdHByaXZhdGUgX2Rvbm90TWFrZVJlcXVlc3RzVW50aWw6IERhdGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBkb25vdE1ha2VSZXF1ZXN0c1VudGlsKCkgeyByZXR1cm4gdGhpcy5fZG9ub3RNYWtlUmVxdWVzdHNVbnRpbDsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZURvbm90TWFrZVJlcXVlc3RzVW50aWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEb25vdE1ha2VSZXF1ZXN0c1VudGlsID0gdGhpcy5fb25EaWRDaGFuZ2VEb25vdE1ha2VSZXF1ZXN0c1VudGlsLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXJEYXRhU3luY1N0b3JlVXJsOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy51cGRhdGVVc2VyRGF0YVN5bmNTdG9yZVVybCh1c2VyRGF0YVN5bmNTdG9yZVVybCk7XG5cdFx0dGhpcy5jb21tb25IZWFkZXJzUHJvbWlzZSA9IGdldFNlcnZpY2VNYWNoaW5lSWQoZW52aXJvbm1lbnRTZXJ2aWNlLCBmaWxlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpXG5cdFx0XHQudGhlbih1dWlkID0+IHtcblx0XHRcdFx0Y29uc3QgaGVhZGVyczogSUhlYWRlcnMgPSB7XG5cdFx0XHRcdFx0J1gtQ2xpZW50LU5hbWUnOiBgJHtwcm9kdWN0U2VydmljZS5hcHBsaWNhdGlvbk5hbWV9JHtpc1dlYiA/ICctd2ViJyA6ICcnfWAsXG5cdFx0XHRcdFx0J1gtQ2xpZW50LVZlcnNpb24nOiBwcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAocHJvZHVjdFNlcnZpY2UuY29tbWl0KSB7XG5cdFx0XHRcdFx0aGVhZGVyc1snWC1DbGllbnQtQ29tbWl0J10gPSBwcm9kdWN0U2VydmljZS5jb21taXQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGhlYWRlcnM7XG5cdFx0XHR9KTtcblxuXHRcdC8qIEEgcmVxdWVzdHMgc2Vzc2lvbiB0aGF0IGxpbWl0cyByZXF1ZXN0cyBwZXIgc2Vzc2lvbnMgKi9cblx0XHR0aGlzLnNlc3Npb24gPSBuZXcgUmVxdWVzdHNTZXNzaW9uKFJFUVVFU1RfU0VTU0lPTl9MSU1JVCwgUkVRVUVTVF9TRVNTSU9OX0lOVEVSVkFMLCB0aGlzLnJlcXVlc3RTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuaW5pdERvbm90TWFrZVJlcXVlc3RzVW50aWwoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMucmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLnJlc2V0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbFByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMucmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzZXRBdXRoVG9rZW4odG9rZW46IHN0cmluZywgdHlwZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5hdXRoVG9rZW4gPSB7IHRva2VuLCB0eXBlIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlVXNlckRhdGFTeW5jU3RvcmVVcmwodXNlckRhdGFTeW5jU3RvcmVVcmw6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwgPSB1c2VyRGF0YVN5bmNTdG9yZVVybCA/IGpvaW5QYXRoKHVzZXJEYXRhU3luY1N0b3JlVXJsLCAndjEnKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgaW5pdERvbm90TWFrZVJlcXVlc3RzVW50aWwoKTogdm9pZCB7XG5cdFx0Y29uc3QgZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKERPTk9UX01BS0VfUkVRVUVTVFNfVU5USUxfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChkb25vdE1ha2VSZXF1ZXN0c1VudGlsICYmIERhdGUubm93KCkgPCBkb25vdE1ha2VSZXF1ZXN0c1VudGlsKSB7XG5cdFx0XHR0aGlzLnNldERvbm90TWFrZVJlcXVlc3RzVW50aWwobmV3IERhdGUoZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2V0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbChkb25vdE1ha2VSZXF1ZXN0c1VudGlsOiBEYXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rvbm90TWFrZVJlcXVlc3RzVW50aWw/LmdldFRpbWUoKSAhPT0gZG9ub3RNYWtlUmVxdWVzdHNVbnRpbD8uZ2V0VGltZSgpKSB7XG5cdFx0XHR0aGlzLl9kb25vdE1ha2VSZXF1ZXN0c1VudGlsID0gZG9ub3RNYWtlUmVxdWVzdHNVbnRpbDtcblxuXHRcdFx0aWYgKHRoaXMucmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLnJlc2V0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbFByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMucmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2Rvbm90TWFrZVJlcXVlc3RzVW50aWwpIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShET05PVF9NQUtFX1JFUVVFU1RTX1VOVElMX0tFWSwgdGhpcy5fZG9ub3RNYWtlUmVxdWVzdHNVbnRpbC5nZXRUaW1lKCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0dGhpcy5yZXNldERvbm90TWFrZVJlcXVlc3RzVW50aWxQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGltZW91dCh0aGlzLl9kb25vdE1ha2VSZXF1ZXN0c1VudGlsIS5nZXRUaW1lKCkgLSBEYXRlLm5vdygpLCB0b2tlbikudGhlbigoKSA9PiB0aGlzLnNldERvbm90TWFrZVJlcXVlc3RzVW50aWwodW5kZWZpbmVkKSkpO1xuXHRcdFx0XHR0aGlzLnJlc2V0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbFByb21pc2UudGhlbihudWxsLCBlID0+IG51bGwgLyogaWdub3JlIGVycm9yICovKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKERPTk9UX01BS0VfUkVRVUVTVFNfVU5USUxfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURvbm90TWFrZVJlcXVlc3RzVW50aWwuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vICNyZWdpb24gQ29sbGVjdGlvblxuXG5cdGFzeW5jIGdldEFsbENvbGxlY3Rpb25zKGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gam9pblBhdGgodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgJ2NvbGxlY3Rpb24nKS50b1N0cmluZygpO1xuXHRcdGhlYWRlcnMgPSB7IC4uLmhlYWRlcnMgfTtcblx0XHRoZWFkZXJzWydDb250ZW50LVR5cGUnXSA9ICdhcHBsaWNhdGlvbi9qc29uJztcblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3QodXJsLCB7IHR5cGU6ICdHRVQnLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VzZXJEYXRhU3luYy5nZXRBbGxDb2xsZWN0aW9ucycgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0cmV0dXJuIChhd2FpdCBhc0pzb248eyBpZDogc3RyaW5nIH1bXT4oY29udGV4dCkpPy5tYXAoKHsgaWQgfSkgPT4gaWQpIHx8IFtdO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlQ29sbGVjdGlvbihoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCAnY29sbGVjdGlvbicpLnRvU3RyaW5nKCk7XG5cdFx0aGVhZGVycyA9IHsgLi4uaGVhZGVycyB9O1xuXHRcdGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddID0gTWltZXMudGV4dDtcblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3QodXJsLCB7IHR5cGU6ICdQT1NUJywgaGVhZGVycywgY2FsbFNpdGU6ICd1c2VyRGF0YVN5bmMuY3JlYXRlQ29sbGVjdGlvbicgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGNvbGxlY3Rpb25JZCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0aWYgKCFjb2xsZWN0aW9uSWQpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdTZXJ2ZXIgZGlkIG5vdCByZXR1cm4gdGhlIGNvbGxlY3Rpb24gaWQnLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ob0NvbGxlY3Rpb24sIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIGNvbnRleHQucmVzLmhlYWRlcnNbSEVBREVSX09QRVJBVElPTl9JRF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gY29sbGVjdGlvbklkO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlQ29sbGVjdGlvbihjb2xsZWN0aW9uPzogc3RyaW5nLCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gY29sbGVjdGlvbiA/IGpvaW5QYXRoKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsICdjb2xsZWN0aW9uJywgY29sbGVjdGlvbikudG9TdHJpbmcoKSA6IGpvaW5QYXRoKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsICdjb2xsZWN0aW9uJykudG9TdHJpbmcoKTtcblx0XHRoZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cblx0XHRhd2FpdCB0aGlzLnJlcXVlc3QodXJsLCB7IHR5cGU6ICdERUxFVEUnLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VzZXJEYXRhU3luYy5kZWxldGVDb2xsZWN0aW9uJyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBSZXNvdXJjZVxuXG5cdGFzeW5jIGdldEFsbFJlc291cmNlUmVmcyhyZXNvdXJjZTogU2VydmVyUmVzb3VyY2UsIGNvbGxlY3Rpb24/OiBzdHJpbmcpOiBQcm9taXNlPElSZXNvdXJjZVJlZkhhbmRsZVtdPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpID0gdGhpcy5nZXRSZXNvdXJjZVVybCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCBjb2xsZWN0aW9uLCByZXNvdXJjZSk7XG5cdFx0Y29uc3QgaGVhZGVyczogSUhlYWRlcnMgPSB7fTtcblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3QodXJpLnRvU3RyaW5nKCksIHsgdHlwZTogJ0dFVCcsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLmdldEFsbFJlc291cmNlUmVmcycgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXNKc29uPHsgdXJsOiBzdHJpbmc7IGNyZWF0ZWQ6IG51bWJlciB9W10+KGNvbnRleHQpIHx8IFtdO1xuXHRcdHJldHVybiByZXN1bHQubWFwKCh7IHVybCwgY3JlYXRlZCB9KSA9PiAoeyByZWY6IHJlbGF0aXZlUGF0aCh1cmksIHVyaS53aXRoKHsgcGF0aDogdXJsIH0pKSEsIGNyZWF0ZWQ6IGNyZWF0ZWQgKiAxMDAwIC8qIFNlcnZlciByZXR1cm5zIGluIHNlY29uZHMgKi8gfSkpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVJlc291cmNlQ29udGVudChyZXNvdXJjZTogU2VydmVyUmVzb3VyY2UsIHJlZjogc3RyaW5nLCBjb2xsZWN0aW9uPzogc3RyaW5nLCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gam9pblBhdGgodGhpcy5nZXRSZXNvdXJjZVVybCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCBjb2xsZWN0aW9uLCByZXNvdXJjZSksIHJlZikudG9TdHJpbmcoKTtcblx0XHRoZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cdFx0aGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ25vLWNhY2hlJztcblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3QodXJsLCB7IHR5cGU6ICdHRVQnLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VzZXJEYXRhU3luYy5yZXNvbHZlUmVzb3VyY2VDb250ZW50JyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdH1cblxuXHRhc3luYyBkZWxldGVSZXNvdXJjZShyZXNvdXJjZTogU2VydmVyUmVzb3VyY2UsIHJlZjogc3RyaW5nIHwgbnVsbCwgY29sbGVjdGlvbj86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBzZXR0aW5ncyBzeW5jIHN0b3JlIHVybCBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVybCA9IHJlZiAhPT0gbnVsbCA/IGpvaW5QYXRoKHRoaXMuZ2V0UmVzb3VyY2VVcmwodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgY29sbGVjdGlvbiwgcmVzb3VyY2UpLCByZWYpLnRvU3RyaW5nKCkgOiB0aGlzLmdldFJlc291cmNlVXJsKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsIGNvbGxlY3Rpb24sIHJlc291cmNlKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGhlYWRlcnM6IElIZWFkZXJzID0ge307XG5cblx0XHRhd2FpdCB0aGlzLnJlcXVlc3QodXJsLCB7IHR5cGU6ICdERUxFVEUnLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VzZXJEYXRhU3luYy5kZWxldGVSZXNvdXJjZScgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlUmVzb3VyY2VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBzZXR0aW5ncyBzeW5jIHN0b3JlIHVybCBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVybCA9IGpvaW5QYXRoKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsICdyZXNvdXJjZScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgaGVhZGVyczogSUhlYWRlcnMgPSB7ICdDb250ZW50LVR5cGUnOiBNaW1lcy50ZXh0IH07XG5cblx0XHRhd2FpdCB0aGlzLnJlcXVlc3QodXJsLCB7IHR5cGU6ICdERUxFVEUnLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VzZXJEYXRhU3luYy5kZWxldGVSZXNvdXJjZXMnIH0sIFtdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGFzeW5jIHJlYWRSZXNvdXJjZShyZXNvdXJjZTogU2VydmVyUmVzb3VyY2UsIG9sZFZhbHVlOiBJVXNlckRhdGEgfCBudWxsLCBjb2xsZWN0aW9uPzogc3RyaW5nLCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTxJVXNlckRhdGE+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aCh0aGlzLmdldFJlc291cmNlVXJsKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsIGNvbGxlY3Rpb24sIHJlc291cmNlKSwgJ2xhdGVzdCcpLnRvU3RyaW5nKCk7XG5cdFx0aGVhZGVycyA9IHsgLi4uaGVhZGVycyB9O1xuXHRcdC8vIERpc2FibGUgY2FjaGluZyBhcyB0aGV5IGFyZSBjYWNoZWQgYnkgc3luY2hyb25pc2Vyc1xuXHRcdGhlYWRlcnNbJ0NhY2hlLUNvbnRyb2wnXSA9ICduby1jYWNoZSc7XG5cdFx0aWYgKG9sZFZhbHVlKSB7XG5cdFx0XHRoZWFkZXJzWydJZi1Ob25lLU1hdGNoJ10gPSBvbGRWYWx1ZS5yZWY7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0dFVCcsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLnJlYWRSZXNvdXJjZScgfSwgWzMwNF0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0bGV0IHVzZXJEYXRhOiBJVXNlckRhdGEgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMzA0KSB7XG5cdFx0XHR1c2VyRGF0YSA9IG9sZFZhbHVlO1xuXHRcdH1cblxuXHRcdGlmICh1c2VyRGF0YSA9PT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgcmVmID0gY29udGV4dC5yZXMuaGVhZGVyc1snZXRhZyddO1xuXHRcdFx0aWYgKCFyZWYpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoJ1NlcnZlciBkaWQgbm90IHJldHVybiB0aGUgcmVmJywgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTm9SZWYsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIGNvbnRleHQucmVzLmhlYWRlcnNbSEVBREVSX09QRVJBVElPTl9JRF0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgYXNUZXh0T3JFcnJvcihjb250ZXh0KTtcblx0XHRcdGlmICghY29udGVudCAmJiBjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSAzMDQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoJ0VtcHR5IHJlc3BvbnNlJywgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRW1wdHlSZXNwb25zZSwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgY29udGV4dC5yZXMuaGVhZGVyc1tIRUFERVJfT1BFUkFUSU9OX0lEXSk7XG5cdFx0XHR9XG5cblx0XHRcdHVzZXJEYXRhID0geyByZWYsIGNvbnRlbnQgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdXNlckRhdGE7XG5cdH1cblxuXHRhc3luYyB3cml0ZVJlc291cmNlKHJlc291cmNlOiBTZXJ2ZXJSZXNvdXJjZSwgZGF0YTogc3RyaW5nLCByZWY6IHN0cmluZyB8IG51bGwsIGNvbGxlY3Rpb24/OiBzdHJpbmcsIGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBzZXR0aW5ncyBzeW5jIHN0b3JlIHVybCBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVybCA9IHRoaXMuZ2V0UmVzb3VyY2VVcmwodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgY29sbGVjdGlvbiwgcmVzb3VyY2UpLnRvU3RyaW5nKCk7XG5cdFx0aGVhZGVycyA9IHsgLi4uaGVhZGVycyB9O1xuXHRcdGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddID0gTWltZXMudGV4dDtcblx0XHRpZiAocmVmKSB7XG5cdFx0XHRoZWFkZXJzWydJZi1NYXRjaCddID0gcmVmO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3QodXJsLCB7IHR5cGU6ICdQT1NUJywgZGF0YSwgaGVhZGVycywgY2FsbFNpdGU6ICd1c2VyRGF0YVN5bmMud3JpdGVSZXNvdXJjZScgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgbmV3UmVmID0gY29udGV4dC5yZXMuaGVhZGVyc1snZXRhZyddO1xuXHRcdGlmICghbmV3UmVmKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcignU2VydmVyIGRpZCBub3QgcmV0dXJuIHRoZSByZWYnLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ob1JlZiwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgY29udGV4dC5yZXMuaGVhZGVyc1tIRUFERVJfT1BFUkFUSU9OX0lEXSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXdSZWY7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0YXN5bmMgbWFuaWZlc3Qob2xkVmFsdWU6IElVc2VyRGF0YU1hbmlmZXN0IHwgbnVsbCwgaGVhZGVyczogSUhlYWRlcnMgPSB7fSk6IFByb21pc2U8SVVzZXJEYXRhTWFuaWZlc3QgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gam9pblBhdGgodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgJ21hbmlmZXN0JykudG9TdHJpbmcoKTtcblx0XHRoZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cdFx0aGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSAnYXBwbGljYXRpb24vanNvbic7XG5cdFx0aWYgKG9sZFZhbHVlKSB7XG5cdFx0XHRoZWFkZXJzWydJZi1Ob25lLU1hdGNoJ10gPSBvbGRWYWx1ZS5yZWY7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0dFVCcsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLm1hbmlmZXN0JyB9LCBbMzA0XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRsZXQgbWFuaWZlc3Q6IElVc2VyRGF0YU1hbmlmZXN0IHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDMwNCkge1xuXHRcdFx0bWFuaWZlc3QgPSBvbGRWYWx1ZTtcblx0XHR9XG5cblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRjb25zdCByZWYgPSBjb250ZXh0LnJlcy5oZWFkZXJzWydldGFnJ107XG5cdFx0XHRpZiAoIXJlZikge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcignU2VydmVyIGRpZCBub3QgcmV0dXJuIHRoZSByZWYnLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ob1JlZiwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgY29udGV4dC5yZXMuaGVhZGVyc1tIRUFERVJfT1BFUkFUSU9OX0lEXSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBhc1RleHRPckVycm9yKGNvbnRleHQpO1xuXHRcdFx0aWYgKCFjb250ZW50ICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDMwNCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcignRW1wdHkgcmVzcG9uc2UnLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5FbXB0eVJlc3BvbnNlLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBjb250ZXh0LnJlcy5oZWFkZXJzW0hFQURFUl9PUEVSQVRJT05fSURdKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0bWFuaWZlc3QgPSB7IC4uLkpTT04ucGFyc2UoY29udGVudCksIHJlZiB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uSWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChVU0VSX1NFU1NJT05fSURfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXG5cdFx0aWYgKGN1cnJlbnRTZXNzaW9uSWQgJiYgbWFuaWZlc3QgJiYgY3VycmVudFNlc3Npb25JZCAhPT0gbWFuaWZlc3Quc2Vzc2lvbikge1xuXHRcdFx0Ly8gU2VydmVyIHNlc3Npb24gaXMgZGlmZmVyZW50IGZyb20gY2xpZW50IHNlc3Npb24gc28gY2xlYXIgY2FjaGVkIHNlc3Npb24uXG5cdFx0XHR0aGlzLmNsZWFyU2Vzc2lvbigpO1xuXHRcdH1cblxuXHRcdGlmIChtYW5pZmVzdCA9PT0gbnVsbCAmJiBjdXJyZW50U2Vzc2lvbklkKSB7XG5cdFx0XHQvLyBzZXJ2ZXIgc2Vzc2lvbiBpcyBjbGVhcmVkIHNvIGNsZWFyIGNhY2hlZCBzZXNzaW9uLlxuXHRcdFx0dGhpcy5jbGVhclNlc3Npb24oKTtcblx0XHR9XG5cblx0XHRpZiAobWFuaWZlc3QpIHtcblx0XHRcdC8vIHVwZGF0ZSBzZXNzaW9uXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFVTRVJfU0VTU0lPTl9JRF9LRVksIG1hbmlmZXN0LnNlc3Npb24sIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWFuaWZlc3Q7XG5cdH1cblxuXHRhc3luYyBjbGVhcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmRlbGV0ZUNvbGxlY3Rpb24oKTtcblx0XHRhd2FpdCB0aGlzLmRlbGV0ZVJlc291cmNlcygpO1xuXG5cdFx0Ly8gY2xlYXIgY2FjaGVkIHNlc3Npb24uXG5cdFx0dGhpcy5jbGVhclNlc3Npb24oKTtcblx0fVxuXG5cdGFzeW5jIGdldExhdGVzdERhdGEoaGVhZGVyczogSUhlYWRlcnMgPSB7fSk6IFByb21pc2U8SVVzZXJEYXRhU3luY0xhdGVzdERhdGEgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gam9pblBhdGgodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgJ2Rvd25sb2FkJywgJ2xhdGVzdCcpLnRvU3RyaW5nKCk7XG5cblx0XHRoZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cdFx0aGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSAnYXBwbGljYXRpb24vanNvbic7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0dFVCcsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLmdldExhdGVzdERhdGEnIH0sIFtdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGlmICghaXNTdWNjZXNzKGNvbnRleHQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcignU2VydmVyIHJldHVybmVkICcgKyBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5FbXB0eVJlc3BvbnNlLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBjb250ZXh0LnJlcy5oZWFkZXJzW0hFQURFUl9PUEVSQVRJT05fSURdKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2ZXJEYXRhID0gYXdhaXQgYXNKc29uPElEb3dubG9hZExhdGVzdERhdGFUeXBlPihjb250ZXh0KTtcblx0XHRpZiAoIXNlcnZlckRhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSVVzZXJEYXRhU3luY0xhdGVzdERhdGEgPSB7fTtcblx0XHRpZiAoc2VydmVyRGF0YS5yZXNvdXJjZXMpIHtcblx0XHRcdHJlc3VsdC5yZXNvdXJjZXMgPSB7fTtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2UgaW4gc2VydmVyRGF0YS5yZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3QgW3Jlc291cmNlRGF0YV0gPSBzZXJ2ZXJEYXRhLnJlc291cmNlc1tyZXNvdXJjZV07XG5cdFx0XHRcdHJlc3VsdC5yZXNvdXJjZXNbcmVzb3VyY2VdID0ge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlRGF0YS5jb250ZW50LFxuXHRcdFx0XHRcdHJlZjogcmVzb3VyY2VEYXRhLnJlZlxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXJEYXRhLmNvbGxlY3Rpb25zKSB7XG5cdFx0XHRyZXN1bHQuY29sbGVjdGlvbnMgPSB7fTtcblx0XHRcdGZvciAoY29uc3QgY29sbGVjdGlvbiBpbiBzZXJ2ZXJEYXRhLmNvbGxlY3Rpb25zKSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlczogSVN0cmluZ0RpY3Rpb25hcnk8SVVzZXJEYXRhPiA9IHt9O1xuXHRcdFx0XHRyZXN1bHQuY29sbGVjdGlvbnNbY29sbGVjdGlvbl0gPSB7IHJlc291cmNlcyB9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIGluIHNlcnZlckRhdGEuY29sbGVjdGlvbnNbY29sbGVjdGlvbl0ucmVzb3VyY2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgW3Jlc291cmNlRGF0YV0gPSBzZXJ2ZXJEYXRhLmNvbGxlY3Rpb25zW2NvbGxlY3Rpb25dLnJlc291cmNlc1tyZXNvdXJjZV07XG5cdFx0XHRcdFx0cmVzb3VyY2VzW3Jlc291cmNlXSA9IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHJlc291cmNlRGF0YS5jb250ZW50LFxuXHRcdFx0XHRcdFx0cmVmOiByZXNvdXJjZURhdGEucmVmXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBnZXRBY3Rpdml0eURhdGEoKTogUHJvbWlzZTxWU0J1ZmZlclJlYWRhYmxlU3RyZWFtPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gam9pblBhdGgodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgJ2Rvd25sb2FkJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9O1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0dFVCcsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLmdldEFjdGl2aXR5RGF0YScgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0aWYgKCFpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdTZXJ2ZXIgcmV0dXJuZWQgJyArIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkVtcHR5UmVzcG9uc2UsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIGNvbnRleHQucmVzLmhlYWRlcnNbSEVBREVSX09QRVJBVElPTl9JRF0pO1xuXHRcdH1cblxuXHRcdGlmIChoYXNOb0NvbnRlbnQoY29udGV4dCkpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdFbXB0eSByZXNwb25zZScsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkVtcHR5UmVzcG9uc2UsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIGNvbnRleHQucmVzLmhlYWRlcnNbSEVBREVSX09QRVJBVElPTl9JRF0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb250ZXh0LnN0cmVhbTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVzb3VyY2VVcmwodXNlckRhdGFTeW5jU3RvcmVVcmw6IFVSSSwgY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNvdXJjZTogU2VydmVyUmVzb3VyY2UpOiBVUkkge1xuXHRcdHJldHVybiBjb2xsZWN0aW9uID8gam9pblBhdGgodXNlckRhdGFTeW5jU3RvcmVVcmwsICdjb2xsZWN0aW9uJywgY29sbGVjdGlvbiwgJ3Jlc291cmNlJywgcmVzb3VyY2UpIDogam9pblBhdGgodXNlckRhdGFTeW5jU3RvcmVVcmwsICdyZXNvdXJjZScsIHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFVTRVJfU0VTU0lPTl9JRF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoTUFDSElORV9TRVNTSU9OX0lEX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVxdWVzdCh1cmw6IHN0cmluZywgb3B0aW9uczogSVJlcXVlc3RPcHRpb25zLCBzdWNjZXNzQ29kZXM6IG51bWJlcltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGlmICghdGhpcy5hdXRoVG9rZW4pIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdObyBBdXRoIFRva2VuIEF2YWlsYWJsZScsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlVuYXV0aG9yaXplZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9kb25vdE1ha2VSZXF1ZXN0c1VudGlsICYmIERhdGUubm93KCkgPCB0aGlzLl9kb25vdE1ha2VSZXF1ZXN0c1VudGlsLmdldFRpbWUoKSkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIG9mIHRvbyBtYW55IHJlcXVlc3RzICg0MjkpLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb01hbnlSZXF1ZXN0c0FuZFJldHJ5QWZ0ZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5zZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsKHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBjb21tb25IZWFkZXJzID0gYXdhaXQgdGhpcy5jb21tb25IZWFkZXJzUHJvbWlzZTtcblx0XHRvcHRpb25zLmhlYWRlcnMgPSB7XG5cdFx0XHQuLi4ob3B0aW9ucy5oZWFkZXJzIHx8IHt9KSxcblx0XHRcdC4uLmNvbW1vbkhlYWRlcnMsXG5cdFx0XHQnWC1BY2NvdW50LVR5cGUnOiB0aGlzLmF1dGhUb2tlbi50eXBlLFxuXHRcdFx0J2F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dGhpcy5hdXRoVG9rZW4udG9rZW59YCxcblx0XHR9O1xuXG5cdFx0Ly8gQWRkIHNlc3Npb24gaGVhZGVyc1xuXHRcdHRoaXMuYWRkU2Vzc2lvbkhlYWRlcnMob3B0aW9ucy5oZWFkZXJzKTtcblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnU2VuZGluZyByZXF1ZXN0IHRvIHNlcnZlcicsIHsgdXJsLCB0eXBlOiBvcHRpb25zLnR5cGUsIGhlYWRlcnM6IHsgLi4ub3B0aW9ucy5oZWFkZXJzLCAuLi57IGF1dGhvcml6YXRpb246IHVuZGVmaW5lZCB9IH0gfSk7XG5cblx0XHRsZXQgY29udGV4dDtcblx0XHR0cnkge1xuXHRcdFx0Y29udGV4dCA9IGF3YWl0IHRoaXMuc2Vzc2lvbi5yZXF1ZXN0KHVybCwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmICghKGUgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKSkge1xuXHRcdFx0XHRsZXQgY29kZSA9IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5SZXF1ZXN0RmFpbGVkO1xuXHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBnZXRFcnJvck1lc3NhZ2UoZSkudG9Mb3dlckNhc2UoKTtcblxuXHRcdFx0XHQvLyBSZXF1ZXN0IHRpbWVkIG91dFxuXHRcdFx0XHRpZiAoZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCd4aHIgdGltZW91dCcpKSB7XG5cdFx0XHRcdFx0Y29kZSA9IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5SZXF1ZXN0VGltZW91dDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlcXVlc3QgcHJvdG9jb2wgbm90IHN1cHBvcnRlZFxuXHRcdFx0XHRlbHNlIGlmIChlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ3Byb3RvY29sJykgJiYgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdub3Qgc3VwcG9ydGVkJykpIHtcblx0XHRcdFx0XHRjb2RlID0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlJlcXVlc3RQcm90b2NvbE5vdFN1cHBvcnRlZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlcXVlc3QgcGF0aCBub3QgZXNjYXBlZFxuXHRcdFx0XHRlbHNlIGlmIChlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ3JlcXVlc3QgcGF0aCBjb250YWlucyB1bmVzY2FwZWQgY2hhcmFjdGVycycpKSB7XG5cdFx0XHRcdFx0Y29kZSA9IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5SZXF1ZXN0UGF0aE5vdEVzY2FwZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXF1ZXN0IGhlYWRlciBub3QgYW4gb2JqZWN0XG5cdFx0XHRcdGVsc2UgaWYgKGVycm9yTWVzc2FnZS5pbmNsdWRlcygnaGVhZGVycyBtdXN0IGJlIGFuIG9iamVjdCcpKSB7XG5cdFx0XHRcdFx0Y29kZSA9IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5SZXF1ZXN0SGVhZGVyc05vdE9iamVjdDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlcXVlc3QgY2FuY2VsZWRcblx0XHRcdFx0ZWxzZSBpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRcdGNvZGUgPSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuUmVxdWVzdENhbmNlbGVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZSA9IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKGBDb25uZWN0aW9uIHJlZnVzZWQgZm9yIHRoZSByZXF1ZXN0ICcke3VybH0nLmAsIHVybCwgY29kZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1JlcXVlc3QgZmFpbGVkJywgdXJsKTtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSBjb250ZXh0LnJlcy5oZWFkZXJzW0hFQURFUl9PUEVSQVRJT05fSURdO1xuXHRcdGNvbnN0IHJlcXVlc3RJbmZvID0geyB1cmwsIHN0YXR1czogY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgJ2V4ZWN1dGlvbi1pZCc6IG9wdGlvbnMuaGVhZGVyc1tIRUFERVJfRVhFQ1VUSU9OX0lEXSwgJ29wZXJhdGlvbi1pZCc6IG9wZXJhdGlvbklkIH07XG5cdFx0Y29uc3QgaXNTdWNjZXNzID0gaXNTdWNjZXNzQ29udGV4dChjb250ZXh0KSB8fCAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSAmJiBzdWNjZXNzQ29kZXMuaW5jbHVkZXMoY29udGV4dC5yZXMuc3RhdHVzQ29kZSkpO1xuXHRcdGxldCBmYWlsdXJlTWVzc2FnZSA9ICcnO1xuXHRcdGlmIChpc1N1Y2Nlc3MpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnUmVxdWVzdCBzdWNjZWVkZWQnLCByZXF1ZXN0SW5mbyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZhaWx1cmVNZXNzYWdlID0gYXdhaXQgYXNUZXh0KGNvbnRleHQpIHx8ICcnO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1JlcXVlc3QgZmFpbGVkJywgcmVxdWVzdEluZm8sIGZhaWx1cmVNZXNzYWdlKTtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDAxIHx8IGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQwMykge1xuXHRcdFx0dGhpcy5hdXRoVG9rZW4gPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDAxKSB7XG5cdFx0XHRcdHRoaXMuX29uVG9rZW5GYWlsZWQuZmlyZShVc2VyRGF0YVN5bmNFcnJvckNvZGUuVW5hdXRob3JpemVkKTtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIG9mIFVuYXV0aG9yaXplZCAoNDAxKS5gLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5VbmF1dGhvcml6ZWQsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIG9wZXJhdGlvbklkKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MDMpIHtcblx0XHRcdFx0dGhpcy5fb25Ub2tlbkZhaWxlZC5maXJlKFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Gb3JiaWRkZW4pO1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2UgdGhlIGFjY2VzcyBpcyBmb3JiaWRkZW4gKDQwMykuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRm9yYmlkZGVuLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25Ub2tlblN1Y2NlZWQuZmlyZSgpO1xuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQwNCkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIHRoZSByZXF1ZXN0ZWQgcmVzb3VyY2UgaXMgbm90IGZvdW5kICg0MDQpLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLk5vdEZvdW5kLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQwNSkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIHRoZSByZXF1ZXN0ZWQgZW5kcG9pbnQgaXMgbm90IGZvdW5kICg0MDUpLiAke2ZhaWx1cmVNZXNzYWdlfWAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLk1ldGhvZE5vdEZvdW5kLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQwOSkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIG9mIENvbmZsaWN0ICg0MDkpLiBUaGVyZSBpcyBuZXcgZGF0YSBmb3IgdGhpcyByZXNvdXJjZS4gTWFrZSB0aGUgcmVxdWVzdCBhZ2FpbiB3aXRoIGxhdGVzdCBkYXRhLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkNvbmZsaWN0LCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQxMCkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIHRoZSByZXF1ZXN0ZWQgcmVzb3VyY2UgaXMgbm90IGxvbmdlciBhdmFpbGFibGUgKDQxMCkuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuR29uZSwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgb3BlcmF0aW9uSWQpO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MTIpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKGAke29wdGlvbnMudHlwZX0gcmVxdWVzdCAnJHt1cmx9JyBmYWlsZWQgYmVjYXVzZSBvZiBQcmVjb25kaXRpb24gRmFpbGVkICg0MTIpLiBUaGVyZSBpcyBuZXcgZGF0YSBmb3IgdGhpcyByZXNvdXJjZS4gTWFrZSB0aGUgcmVxdWVzdCBhZ2FpbiB3aXRoIGxhdGVzdCBkYXRhLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlByZWNvbmRpdGlvbkZhaWxlZCwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgb3BlcmF0aW9uSWQpO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MTMpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKGAke29wdGlvbnMudHlwZX0gcmVxdWVzdCAnJHt1cmx9JyBmYWlsZWQgYmVjYXVzZSBvZiB0b28gbGFyZ2UgcGF5bG9hZCAoNDEzKS5gLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29MYXJnZSwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgb3BlcmF0aW9uSWQpO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MjYpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKGAke29wdGlvbnMudHlwZX0gcmVxdWVzdCAnJHt1cmx9JyBmYWlsZWQgd2l0aCBzdGF0dXMgVXBncmFkZSBSZXF1aXJlZCAoNDI2KS4gUGxlYXNlIHVwZ3JhZGUgdGhlIGNsaWVudCBhbmQgdHJ5IGFnYWluLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlVwZ3JhZGVSZXF1aXJlZCwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgb3BlcmF0aW9uSWQpO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MjkpIHtcblx0XHRcdGNvbnN0IHJldHJ5QWZ0ZXIgPSBjb250ZXh0LnJlcy5oZWFkZXJzWydyZXRyeS1hZnRlciddO1xuXHRcdFx0aWYgKHJldHJ5QWZ0ZXIpIHtcblx0XHRcdFx0dGhpcy5zZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsKG5ldyBEYXRlKERhdGUubm93KCkgKyAocGFyc2VJbnQocmV0cnlBZnRlcikgKiAxMDAwKSkpO1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2Ugb2YgdG9vIG1hbnkgcmVxdWVzdHMgKDQyOSkuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTWFueVJlcXVlc3RzQW5kUmV0cnlBZnRlciwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgb3BlcmF0aW9uSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIG9mIHRvbyBtYW55IHJlcXVlc3RzICg0MjkpLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb01hbnlSZXF1ZXN0cywgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgb3BlcmF0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaXNTdWNjZXNzKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcignU2VydmVyIHJldHVybmVkICcgKyBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Vbmtub3duLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRleHQ7XG5cdH1cblxuXHRwcml2YXRlIGFkZFNlc3Npb25IZWFkZXJzKGhlYWRlcnM6IElIZWFkZXJzKTogdm9pZCB7XG5cdFx0bGV0IG1hY2hpbmVTZXNzaW9uSWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChNQUNISU5FX1NFU1NJT05fSURfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChtYWNoaW5lU2Vzc2lvbklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdG1hY2hpbmVTZXNzaW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTUFDSElORV9TRVNTSU9OX0lEX0tFWSwgbWFjaGluZVNlc3Npb25JZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRoZWFkZXJzWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddID0gbWFjaGluZVNlc3Npb25JZDtcblxuXHRcdGNvbnN0IHVzZXJTZXNzaW9uSWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChVU0VSX1NFU1NJT05fSURfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICh1c2VyU2Vzc2lvbklkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGhlYWRlcnNbJ1gtVXNlci1TZXNzaW9uLUlkJ10gPSB1c2VyU2Vzc2lvbklkO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgZXh0ZW5kcyBVc2VyRGF0YVN5bmNTdG9yZUNsaWVudCBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UgdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU/LnVybCwgcHJvZHVjdFNlcnZpY2UsIHJlcXVlc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVVzZXJEYXRhU3luY1N0b3JlKCgpID0+IHRoaXMudXBkYXRlVXNlckRhdGFTeW5jU3RvcmVVcmwodXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8udXJsKSkpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFJlcXVlc3RzU2Vzc2lvbiB7XG5cblx0cHJpdmF0ZSByZXF1ZXN0czogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBzdGFydFRpbWU6IERhdGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsaW1pdDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW50ZXJ2YWw6IG51bWJlciwgLyogaW4gbXMgKi9cblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRyZXF1ZXN0KHVybDogc3RyaW5nLCBvcHRpb25zOiBJUmVxdWVzdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0aWYgKHRoaXMuaXNFeHBpcmVkKCkpIHtcblx0XHRcdHRoaXMucmVzZXQoKTtcblx0XHR9XG5cblx0XHRvcHRpb25zLnVybCA9IHVybDtcblxuXHRcdGlmICh0aGlzLnJlcXVlc3RzLmxlbmd0aCA+PSB0aGlzLmxpbWl0KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnVG9vIG1hbnkgcmVxdWVzdHMnLCAuLi50aGlzLnJlcXVlc3RzKTtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKGBUb28gbWFueSByZXF1ZXN0cy4gT25seSAke3RoaXMubGltaXR9IHJlcXVlc3RzIGFsbG93ZWQgaW4gJHt0aGlzLmludGVydmFsIC8gKDEwMDAgKiA2MCl9IG1pbnV0ZXMuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxUb29NYW55UmVxdWVzdHMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0YXJ0VGltZSA9IHRoaXMuc3RhcnRUaW1lIHx8IG5ldyBEYXRlKCk7XG5cdFx0dGhpcy5yZXF1ZXN0cy5wdXNoKHVybCk7XG5cblx0XHRyZXR1cm4gdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KG9wdGlvbnMsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgaXNFeHBpcmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXJ0VGltZSAhPT0gdW5kZWZpbmVkICYmIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdGhpcy5zdGFydFRpbWUuZ2V0VGltZSgpID4gdGhpcy5pbnRlcnZhbDtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXF1ZXN0cyA9IFtdO1xuXHRcdHRoaXMuc3RhcnRUaW1lID0gdW5kZWZpbmVkO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBNEIseUJBQXlCLGVBQWU7QUFDcEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIsMkJBQTJCO0FBQ3JELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWE7QUFFdEIsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFFBQVEsUUFBUSxlQUFlLGNBQWMsaUJBQWlCLFdBQVcsYUFBYSx3QkFBd0I7QUFDdkgsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxxQkFBcUIscUJBQXlILHlCQUE2QyxxQ0FBZ0YsdUJBQXVCLHVCQUF1Qiw4QkFBcUQ7QUFpQnZYLE1BQU0sK0JBQStCO0FBQ3JDLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sMkJBQTJCLE1BQU8sS0FBSztBQUl0QyxJQUFlLDZDQUFmLGNBQWtFLFdBQTBEO0FBQUEsRUFnQmxJLFlBQ3FDLGdCQUNNLHNCQUNOLGdCQUNuQztBQUNELFVBQU07QUFKOEI7QUFDTTtBQUNOO0FBZnJDLFNBQWlCLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDbkYsU0FBUywrQkFBK0IsS0FBSyw4QkFB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
