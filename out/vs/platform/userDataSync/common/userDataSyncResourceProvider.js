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
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { getServiceMachineId } from "../../externalServices/common/serviceMachineId.js";
import { IStorageService } from "../../storage/common/storage.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncStoreService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME, CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM } from "./userDataSync.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { isSyncData } from "./abstractSynchronizer.js";
import { parseSnippets } from "./snippetsSync.js";
import { parseSettingsSyncContent } from "./settingsSync.js";
import { getKeybindingsContentFromSyncContent } from "./keybindingsSync.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { getTasksContentFromSyncContent } from "./tasksSync.js";
import { getMcpContentFromSyncContent } from "./mcpSync.js";
import { LocalExtensionsProvider, parseExtensions, stringify as stringifyExtensions } from "./extensionsSync.js";
import { LocalGlobalStateProvider, stringify as stringifyGlobalState } from "./globalStateSync.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { parseUserDataProfilesManifest, stringifyLocalProfiles } from "./userDataProfilesManifestSync.js";
import { toFormattedString } from "../../../base/common/jsonFormatter.js";
import { trim } from "../../../base/common/strings.js";
import { parsePrompts } from "./promptsSync/promptsSync.js";
let UserDataSyncResourceProviderService = class {
  constructor(userDataSyncStoreService, userDataSyncLocalStoreService, logService, uriIdentityService, environmentService, storageService, fileService, userDataProfilesService, configurationService, instantiationService) {
    this.userDataSyncStoreService = userDataSyncStoreService;
    this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.fileService = fileService;
    this.userDataProfilesService = userDataProfilesService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.extUri = uriIdentityService.extUri;
  }
  async getRemoteSyncedProfiles() {
    const userData = await this.userDataSyncStoreService.readResource(SyncResource.Profiles, null, void 0);
    if (userData.content) {
      const syncData = this.parseSyncData(userData.content, SyncResource.Profiles);
      return parseUserDataProfilesManifest(syncData);
    }
    return [];
  }
  async getLocalSyncedProfiles(location) {
    const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs(SyncResource.Profiles, void 0, location);
    if (refs.length) {
      const content = await this.userDataSyncLocalStoreService.resolveResourceContent(SyncResource.Profiles, refs[0].ref, void 0, location);
      if (content) {
        const syncData = this.parseSyncData(content, SyncResource.Profiles);
        return parseUserDataProfilesManifest(syncData);
      }
    }
    return [];
  }
  async getLocalSyncedMachines(location) {
    const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs("machines", void 0, location);
    if (refs.length) {
      const content = await this.userDataSyncLocalStoreService.resolveResourceContent("machines", refs[0].ref, void 0, location);
      if (content) {
        const machinesData = JSON.parse(content);
        return machinesData.machines.map((m) => ({ ...m, isCurrent: false }));
      }
    }
    return [];
  }
  async getRemoteSyncResourceHandles(syncResource, profile) {
    const handles = await this.userDataSyncStoreService.getAllResourceRefs(syncResource, profile?.collection);
    return handles.map(({ created, ref }) => ({
      created,
      uri: this.toUri({
        remote: true,
        syncResource,
        profile: profile?.id ?? this.userDataProfilesService.defaultProfile.id,
        location: void 0,
        collection: profile?.collection,
        ref,
        node: void 0
      })
    }));
  }
  async getLocalSyncResourceHandles(syncResource, profile, location) {
    const handles = await this.userDataSyncLocalStoreService.getAllResourceRefs(syncResource, profile?.collection, location);
    return handles.map(({ created, ref }) => ({
      created,
      uri: this.toUri({
        remote: false,
        syncResource,
        profile: profile?.id ?? this.userDataProfilesService.defaultProfile.id,
        collection: profile?.collection,
        ref,
        node: void 0,
        location
      })
    }));
  }
  resolveUserDataSyncResource({ uri }) {
    const resolved = this.resolveUri(uri);
    const profile = resolved ? this.userDataProfilesService.profiles.find((p) => p.id === resolved.profile) : void 0;
    return resolved && profile ? { profile, syncResource: resolved?.syncResource } : void 0;
  }
  async getAssociatedResources({ uri }) {
    const resolved = this.resolveUri(uri);
    if (!resolved) {
      return [];
    }
    const profile = this.userDataProfilesService.profiles.find((p) => p.id === resolved.profile);
    switch (resolved.syncResource) {
      case SyncResource.Settings:
        return this.getSettingsAssociatedResources(uri, profile);
      case SyncResource.Keybindings:
        return this.getKeybindingsAssociatedResources(uri, profile);
      case SyncResource.Tasks:
        return this.getTasksAssociatedResources(uri, profile);
      case SyncResource.Mcp:
        return this.getMcpAssociatedResources(uri, profile);
      case SyncResource.Snippets:
        return this.getSnippetsAssociatedResources(uri, profile);
      case SyncResource.Prompts:
        return this.getPromptsAssociatedResources(uri, profile);
      case SyncResource.GlobalState:
        return this.getGlobalStateAssociatedResources(uri, profile);
      case SyncResource.Extensions:
        return this.getExtensionsAssociatedResources(uri, profile);
      case SyncResource.Profiles:
        return this.getProfilesAssociatedResources(uri, profile);
      case SyncResource.WorkspaceState:
        return [];
    }
  }
  async getMachineId({ uri }) {
    const resolved = this.resolveUri(uri);
    if (!resolved) {
      return void 0;
    }
    if (resolved.remote) {
      if (resolved.ref) {
        const { content } = await this.getUserData(resolved.syncResource, resolved.ref, resolved.collection);
        if (content) {
          const syncData = this.parseSyncData(content, resolved.syncResource);
          return syncData?.machineId;
        }
      }
      return void 0;
    }
    if (resolved.location) {
      if (resolved.ref) {
        const content = await this.userDataSyncLocalStoreService.resolveResourceContent(resolved.syncResource, resolved.ref, resolved.collection, resolved.location);
        if (content) {
          const syncData = this.parseSyncData(content, resolved.syncResource);
          return syncData?.machineId;
        }
      }
      return void 0;
    }
    return getServiceMachineId(this.environmentService, this.fileService, this.storageService);
  }
  async resolveContent(uri) {
    const resolved = this.resolveUri(uri);
    if (!resolved) {
      return null;
    }
    if (resolved.node === UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE) {
      return null;
    }
    if (resolved.ref) {
      const content = await this.getContentFromStore(resolved.remote, resolved.syncResource, resolved.collection, resolved.ref, resolved.location);
      if (resolved.node && content) {
        return this.resolveNodeContent(resolved.syncResource, content, resolved.node);
      }
      return content;
    }
    if (!resolved.remote && !resolved.node) {
      return this.resolveLatestContent(resolved.syncResource, resolved.profile);
    }
    return null;
  }
  async getContentFromStore(remote, syncResource, collection, ref, location) {
    if (remote) {
      const { content } = await this.getUserData(syncResource, ref, collection);
      return content;
    }
    return this.userDataSyncLocalStoreService.resolveResourceContent(syncResource, ref, collection, location);
  }
  resolveNodeContent(syncResource, content, node) {
    const syncData = this.parseSyncData(content, syncResource);
    switch (syncResource) {
      case SyncResource.Settings:
        return this.resolveSettingsNodeContent(syncData, node);
      case SyncResource.Keybindings:
        return this.resolveKeybindingsNodeContent(syncData, node);
      case SyncResource.Tasks:
        return this.resolveTasksNodeContent(syncData, node);
      case SyncResource.Mcp:
        return this.resolveMcpNodeContent(syncData, node);
      case SyncResource.Snippets:
        return this.resolveSnippetsNodeContent(syncData, node);
      case SyncResource.Prompts:
        return this.resolvePromptsNodeContent(syncData, node);
      case SyncResource.GlobalState:
        return this.resolveGlobalStateNodeContent(syncData, node);
      case SyncResource.Extensions:
        return this.resolveExtensionsNodeContent(syncData, node);
      case SyncResource.Profiles:
        return this.resolveProfileNodeContent(syncData, node);
      case SyncResource.WorkspaceState:
        return null;
    }
  }
  async resolveLatestContent(syncResource, profileId) {
    const profile = this.userDataProfilesService.profiles.find((p) => p.id === profileId);
    if (!profile) {
      return null;
    }
    switch (syncResource) {
      case SyncResource.GlobalState:
        return this.resolveLatestGlobalStateContent(profile);
      case SyncResource.Extensions:
        return this.resolveLatestExtensionsContent(profile);
      case SyncResource.Profiles:
        return this.resolveLatestProfilesContent(profile);
      case SyncResource.Settings:
        return null;
      case SyncResource.Keybindings:
        return null;
      case SyncResource.Tasks:
        return null;
      case SyncResource.Mcp:
        return null;
      case SyncResource.Snippets:
        return null;
      case SyncResource.Prompts:
        return null;
      case SyncResource.WorkspaceState:
        return null;
    }
  }
  getSettingsAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "settings.json");
    const comparableResource = profile ? profile.settingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveSettingsNodeContent(syncData, node) {
    switch (node) {
      case "settings.json":
        return parseSettingsSyncContent(syncData.content).settings;
    }
    return null;
  }
  getKeybindingsAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "keybindings.json");
    const comparableResource = profile ? profile.keybindingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveKeybindingsNodeContent(syncData, node) {
    switch (node) {
      case "keybindings.json":
        return getKeybindingsContentFromSyncContent(syncData.content, !!this.configurationService.getValue(CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM), this.logService);
    }
    return null;
  }
  getTasksAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "tasks.json");
    const comparableResource = profile ? profile.tasksResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveTasksNodeContent(syncData, node) {
    switch (node) {
      case "tasks.json":
        return getTasksContentFromSyncContent(syncData.content, this.logService);
    }
    return null;
  }
  async getSnippetsAssociatedResources(uri, profile) {
    const content = await this.resolveContent(uri);
    if (content) {
      const syncData = this.parseSyncData(content, SyncResource.Snippets);
      if (syncData) {
        const snippets = parseSnippets(syncData);
        const result = [];
        for (const snippet of Object.keys(snippets)) {
          const resource = this.extUri.joinPath(uri, snippet);
          const comparableResource = profile ? this.extUri.joinPath(profile.snippetsHome, snippet) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
          result.push({ resource, comparableResource });
        }
        return result;
      }
    }
    return [];
  }
  resolveSnippetsNodeContent(syncData, node) {
    return parseSnippets(syncData)[node] || null;
  }
  async getPromptsAssociatedResources(uri, profile) {
    const content = await this.resolveContent(uri);
    if (content) {
      const syncData = this.parseSyncData(content, SyncResource.Prompts);
      if (syncData) {
        const prompts = parsePrompts(syncData);
        const result = [];
        for (const prompt of Object.keys(prompts)) {
          const resource = this.extUri.joinPath(uri, prompt);
          const comparableResource = profile ? this.extUri.joinPath(profile.promptsHome, prompt) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
          result.push({ resource, comparableResource });
        }
        return result;
      }
    }
    return [];
  }
  resolvePromptsNodeContent(syncData, node) {
    return parsePrompts(syncData)[node] || null;
  }
  getExtensionsAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "extensions.json");
    const comparableResource = profile ? this.toUri({
      remote: false,
      syncResource: SyncResource.Extensions,
      profile: profile.id,
      location: void 0,
      collection: void 0,
      ref: void 0,
      node: void 0
    }) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveExtensionsNodeContent(syncData, node) {
    switch (node) {
      case "extensions.json":
        return stringifyExtensions(parseExtensions(syncData), true);
    }
    return null;
  }
  async resolveLatestExtensionsContent(profile) {
    const { localExtensions } = await this.instantiationService.createInstance(LocalExtensionsProvider).getLocalExtensions(profile);
    return stringifyExtensions(localExtensions, true);
  }
  getGlobalStateAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "globalState.json");
    const comparableResource = profile ? this.toUri({
      remote: false,
      syncResource: SyncResource.GlobalState,
      profile: profile.id,
      location: void 0,
      collection: void 0,
      ref: void 0,
      node: void 0
    }) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveGlobalStateNodeContent(syncData, node) {
    switch (node) {
      case "globalState.json":
        return stringifyGlobalState(JSON.parse(syncData.content), true);
    }
    return null;
  }
  async resolveLatestGlobalStateContent(profile) {
    const localGlobalState = await this.instantiationService.createInstance(LocalGlobalStateProvider).getLocalGlobalState(profile);
    return stringifyGlobalState(localGlobalState, true);
  }
  getProfilesAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "profiles.json");
    const comparableResource = this.toUri({
      remote: false,
      syncResource: SyncResource.Profiles,
      profile: this.userDataProfilesService.defaultProfile.id,
      location: void 0,
      collection: void 0,
      ref: void 0,
      node: void 0
    });
    return [{ resource, comparableResource }];
  }
  resolveProfileNodeContent(syncData, node) {
    switch (node) {
      case "profiles.json":
        return toFormattedString(JSON.parse(syncData.content), {});
    }
    return null;
  }
  async resolveLatestProfilesContent(profile) {
    return stringifyLocalProfiles(this.userDataProfilesService.profiles.filter((p) => !p.isDefault && !p.isTransient), true);
  }
  toUri(syncResourceUriInfo) {
    const authority = syncResourceUriInfo.remote ? UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY : UserDataSyncResourceProviderService.LOCAL_BACKUP_AUTHORITY;
    const paths = [];
    if (syncResourceUriInfo.location) {
      paths.push(`scheme:${syncResourceUriInfo.location.scheme}`);
      paths.push(`authority:${syncResourceUriInfo.location.authority}`);
      paths.push(trim(syncResourceUriInfo.location.path, "/"));
    }
    paths.push(`syncResource:${syncResourceUriInfo.syncResource}`);
    paths.push(`profile:${syncResourceUriInfo.profile}`);
    if (syncResourceUriInfo.collection) {
      paths.push(`collection:${syncResourceUriInfo.collection}`);
    }
    if (syncResourceUriInfo.ref) {
      paths.push(`ref:${syncResourceUriInfo.ref}`);
    }
    if (syncResourceUriInfo.node) {
      paths.push(syncResourceUriInfo.node);
    }
    return this.extUri.joinPath(URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority, path: `/`, query: syncResourceUriInfo.location?.query, fragment: syncResourceUriInfo.location?.fragment }), ...paths);
  }
  resolveUri(uri) {
    if (uri.scheme !== USER_DATA_SYNC_SCHEME) {
      return void 0;
    }
    const paths = [];
    while (uri.path !== "/") {
      paths.unshift(this.extUri.basename(uri));
      uri = this.extUri.dirname(uri);
    }
    if (paths.length < 2) {
      return void 0;
    }
    const remote = uri.authority === UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY;
    let scheme;
    let authority;
    const locationPaths = [];
    let syncResource;
    let profile;
    let collection;
    let ref;
    let node;
    while (paths.length) {
      const path = paths.shift();
      if (path.startsWith("scheme:")) {
        scheme = path.substring("scheme:".length);
      } else if (path.startsWith("authority:")) {
        authority = path.substring("authority:".length);
      } else if (path.startsWith("syncResource:")) {
        syncResource = path.substring("syncResource:".length);
      } else if (path.startsWith("profile:")) {
        profile = path.substring("profile:".length);
      } else if (path.startsWith("collection:")) {
        collection = path.substring("collection:".length);
      } else if (path.startsWith("ref:")) {
        ref = path.substring("ref:".length);
      } else if (!syncResource) {
        locationPaths.push(path);
      } else {
        node = path;
      }
    }
    return {
      remote,
      syncResource,
      profile,
      collection,
      ref,
      node,
      location: scheme && authority !== void 0 ? this.extUri.joinPath(URI.from({ scheme, authority, query: uri.query, fragment: uri.fragment, path: "/" }), ...locationPaths) : void 0
    };
  }
  parseSyncData(content, syncResource) {
    try {
      const syncData = JSON.parse(content);
      if (isSyncData(syncData)) {
        return syncData;
      }
    } catch (error) {
      this.logService.error(error);
    }
    throw new UserDataSyncError(localize("incompatible sync data", "Cannot parse sync data as it is not compatible with the current version."), UserDataSyncErrorCode.IncompatibleRemoteContent, syncResource);
  }
  async getUserData(syncResource, ref, collection) {
    const content = await this.userDataSyncStoreService.resolveResourceContent(syncResource, ref, collection);
    return { ref, content };
  }
  getMcpAssociatedResources(uri, profile) {
    const resource = this.extUri.joinPath(uri, "mcp.json");
    const comparableResource = profile ? profile.mcpResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
    return [{ resource, comparableResource }];
  }
  resolveMcpNodeContent(syncData, node) {
    switch (node) {
      case "mcp.json":
        return getMcpContentFromSyncContent(syncData.content, this.logService);
    }
    return null;
  }
};
UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE = "not-existing-resource";
UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY = "remote-backup";
UserDataSyncResourceProviderService.LOCAL_BACKUP_AUTHORITY = "local-backup";
UserDataSyncResourceProviderService = __decorateClass([
  __decorateParam(0, IUserDataSyncStoreService),
  __decorateParam(1, IUserDataSyncLocalStoreService),
  __decorateParam(2, IUserDataSyncLogService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IUserDataProfilesService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IInstantiationService)
], UserDataSyncResourceProviderService);
export {
  UserDataSyncResourceProviderService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFxjb21tb25cXHVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBnZXRTZXJ2aWNlTWFjaGluZUlkIH0gZnJvbSAnLi4vLi4vZXh0ZXJuYWxTZXJ2aWNlcy9jb21tb24vc2VydmljZU1hY2hpbmVJZC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVN5bmNEYXRhLCBJU3luY1Jlc291cmNlSGFuZGxlLCBJVXNlckRhdGEsIElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFN5bmNSZXNvdXJjZSwgVXNlckRhdGFTeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UsIElTeW5jVXNlckRhdGFQcm9maWxlLCBDT05GSUdfU1lOQ19LRVlCSU5ESU5HU19QRVJfUExBVEZPUk0sIElVc2VyRGF0YVN5bmNSZXNvdXJjZSB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGlzU3luY0RhdGEgfSBmcm9tICcuL2Fic3RyYWN0U3luY2hyb25pemVyLmpzJztcbmltcG9ydCB7IHBhcnNlU25pcHBldHMgfSBmcm9tICcuL3NuaXBwZXRzU3luYy5qcyc7XG5pbXBvcnQgeyBwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQgfSBmcm9tICcuL3NldHRpbmdzU3luYy5qcyc7XG5pbXBvcnQgeyBnZXRLZXliaW5kaW5nc0NvbnRlbnRGcm9tU3luY0NvbnRlbnQgfSBmcm9tICcuL2tleWJpbmRpbmdzU3luYy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGdldFRhc2tzQ29udGVudEZyb21TeW5jQ29udGVudCB9IGZyb20gJy4vdGFza3NTeW5jLmpzJztcbmltcG9ydCB7IGdldE1jcENvbnRlbnRGcm9tU3luY0NvbnRlbnQgfSBmcm9tICcuL21jcFN5bmMuanMnO1xuaW1wb3J0IHsgTG9jYWxFeHRlbnNpb25zUHJvdmlkZXIsIHBhcnNlRXh0ZW5zaW9ucywgc3RyaW5naWZ5IGFzIHN0cmluZ2lmeUV4dGVuc2lvbnMgfSBmcm9tICcuL2V4dGVuc2lvbnNTeW5jLmpzJztcbmltcG9ydCB7IExvY2FsR2xvYmFsU3RhdGVQcm92aWRlciwgc3RyaW5naWZ5IGFzIHN0cmluZ2lmeUdsb2JhbFN0YXRlIH0gZnJvbSAnLi9nbG9iYWxTdGF0ZVN5bmMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBwYXJzZVVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdCwgc3RyaW5naWZ5TG9jYWxQcm9maWxlcyB9IGZyb20gJy4vdXNlckRhdGFQcm9maWxlc01hbmlmZXN0U3luYy5qcyc7XG5pbXBvcnQgeyB0b0Zvcm1hdHRlZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgdHJpbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSU1hY2hpbmVzRGF0YSwgSVVzZXJEYXRhU3luY01hY2hpbmUgfSBmcm9tICcuL3VzZXJEYXRhU3luY01hY2hpbmVzLmpzJztcbmltcG9ydCB7IHBhcnNlUHJvbXB0cyB9IGZyb20gJy4vcHJvbXB0c1N5bmMvcHJvbXB0c1N5bmMuanMnO1xuXG5pbnRlcmZhY2UgSVN5bmNSZXNvdXJjZVVyaUluZm8ge1xuXHRyZWFkb25seSByZW1vdGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlO1xuXHRyZWFkb25seSBwcm9maWxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVmOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG5vZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbG9jYXRpb246IFVSSSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTk9UX0VYSVNUSU5HX1JFU09VUkNFID0gJ25vdC1leGlzdGluZy1yZXNvdXJjZSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFTU9URV9CQUNLVVBfQVVUSE9SSVRZID0gJ3JlbW90ZS1iYWNrdXAnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMT0NBTF9CQUNLVVBfQVVUSE9SSVRZID0gJ2xvY2FsLWJhY2t1cCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHRVcmk6IElFeHRVcmk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2U6IElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZXh0VXJpID0gdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaTtcblx0fVxuXG5cdGFzeW5jIGdldFJlbW90ZVN5bmNlZFByb2ZpbGVzKCk6IFByb21pc2U8SVN5bmNVc2VyRGF0YVByb2ZpbGVbXT4ge1xuXHRcdGNvbnN0IHVzZXJEYXRhID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UucmVhZFJlc291cmNlKFN5bmNSZXNvdXJjZS5Qcm9maWxlcywgbnVsbCwgdW5kZWZpbmVkKTtcblx0XHRpZiAodXNlckRhdGEuY29udGVudCkge1xuXHRcdFx0Y29uc3Qgc3luY0RhdGEgPSB0aGlzLnBhcnNlU3luY0RhdGEodXNlckRhdGEuY29udGVudCwgU3luY1Jlc291cmNlLlByb2ZpbGVzKTtcblx0XHRcdHJldHVybiBwYXJzZVVzZXJEYXRhUHJvZmlsZXNNYW5pZmVzdChzeW5jRGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIGdldExvY2FsU3luY2VkUHJvZmlsZXMobG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElTeW5jVXNlckRhdGFQcm9maWxlW10+IHtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZS5nZXRBbGxSZXNvdXJjZVJlZnMoU3luY1Jlc291cmNlLlByb2ZpbGVzLCB1bmRlZmluZWQsIGxvY2F0aW9uKTtcblx0XHRpZiAocmVmcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLnJlc29sdmVSZXNvdXJjZUNvbnRlbnQoU3luY1Jlc291cmNlLlByb2ZpbGVzLCByZWZzWzBdLnJlZiwgdW5kZWZpbmVkLCBsb2NhdGlvbik7XG5cdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRjb25zdCBzeW5jRGF0YSA9IHRoaXMucGFyc2VTeW5jRGF0YShjb250ZW50LCBTeW5jUmVzb3VyY2UuUHJvZmlsZXMpO1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VVc2VyRGF0YVByb2ZpbGVzTWFuaWZlc3Qoc3luY0RhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyBnZXRMb2NhbFN5bmNlZE1hY2hpbmVzKGxvY2F0aW9uPzogVVJJKTogUHJvbWlzZTxJVXNlckRhdGFTeW5jTWFjaGluZVtdPiB7XG5cdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UuZ2V0QWxsUmVzb3VyY2VSZWZzKCdtYWNoaW5lcycsIHVuZGVmaW5lZCwgbG9jYXRpb24pO1xuXHRcdGlmIChyZWZzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UucmVzb2x2ZVJlc291cmNlQ29udGVudCgnbWFjaGluZXMnLCByZWZzWzBdLnJlZiwgdW5kZWZpbmVkLCBsb2NhdGlvbik7XG5cdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRjb25zdCBtYWNoaW5lc0RhdGE6IElNYWNoaW5lc0RhdGEgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0XHRyZXR1cm4gbWFjaGluZXNEYXRhLm1hY2hpbmVzLm1hcChtID0+ICh7IC4uLm0sIGlzQ3VycmVudDogZmFsc2UgfSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyBnZXRSZW1vdGVTeW5jUmVzb3VyY2VIYW5kbGVzKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBwcm9maWxlPzogSVN5bmNVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPElTeW5jUmVzb3VyY2VIYW5kbGVbXT4ge1xuXHRcdGNvbnN0IGhhbmRsZXMgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1N0b3JlU2VydmljZS5nZXRBbGxSZXNvdXJjZVJlZnMoc3luY1Jlc291cmNlLCBwcm9maWxlPy5jb2xsZWN0aW9uKTtcblx0XHRyZXR1cm4gaGFuZGxlcy5tYXAoKHsgY3JlYXRlZCwgcmVmIH0pID0+ICh7XG5cdFx0XHRjcmVhdGVkLFxuXHRcdFx0dXJpOiB0aGlzLnRvVXJpKHtcblx0XHRcdFx0cmVtb3RlOiB0cnVlLFxuXHRcdFx0XHRzeW5jUmVzb3VyY2UsXG5cdFx0XHRcdHByb2ZpbGU6IHByb2ZpbGU/LmlkID8/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuaWQsXG5cdFx0XHRcdGxvY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbGxlY3Rpb246IHByb2ZpbGU/LmNvbGxlY3Rpb24sXG5cdFx0XHRcdHJlZixcblx0XHRcdFx0bm9kZTogdW5kZWZpbmVkLFxuXHRcdFx0fSlcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRMb2NhbFN5bmNSZXNvdXJjZUhhbmRsZXMoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UsIHByb2ZpbGU/OiBJU3luY1VzZXJEYXRhUHJvZmlsZSwgbG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElTeW5jUmVzb3VyY2VIYW5kbGVbXT4ge1xuXHRcdGNvbnN0IGhhbmRsZXMgPSBhd2FpdCB0aGlzLnVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLmdldEFsbFJlc291cmNlUmVmcyhzeW5jUmVzb3VyY2UsIHByb2ZpbGU/LmNvbGxlY3Rpb24sIGxvY2F0aW9uKTtcblx0XHRyZXR1cm4gaGFuZGxlcy5tYXAoKHsgY3JlYXRlZCwgcmVmIH0pID0+ICh7XG5cdFx0XHRjcmVhdGVkLFxuXHRcdFx0dXJpOiB0aGlzLnRvVXJpKHtcblx0XHRcdFx0cmVtb3RlOiBmYWxzZSxcblx0XHRcdFx0c3luY1Jlc291cmNlLFxuXHRcdFx0XHRwcm9maWxlOiBwcm9maWxlPy5pZCA/PyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmlkLFxuXHRcdFx0XHRjb2xsZWN0aW9uOiBwcm9maWxlPy5jb2xsZWN0aW9uLFxuXHRcdFx0XHRyZWYsXG5cdFx0XHRcdG5vZGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG9jYXRpb24sXG5cdFx0XHR9KVxuXHRcdH0pKTtcblx0fVxuXG5cdHJlc29sdmVVc2VyRGF0YVN5bmNSZXNvdXJjZSh7IHVyaSB9OiBJU3luY1Jlc291cmNlSGFuZGxlKTogSVVzZXJEYXRhU3luY1Jlc291cmNlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVVyaSh1cmkpO1xuXHRcdGNvbnN0IHByb2ZpbGUgPSByZXNvbHZlZCA/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHJlc29sdmVkLnByb2ZpbGUpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiByZXNvbHZlZCAmJiBwcm9maWxlID8geyBwcm9maWxlLCBzeW5jUmVzb3VyY2U6IHJlc29sdmVkPy5zeW5jUmVzb3VyY2UgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldEFzc29jaWF0ZWRSZXNvdXJjZXMoeyB1cmkgfTogSVN5bmNSZXNvdXJjZUhhbmRsZSk6IFByb21pc2U8eyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVVyaSh1cmkpO1xuXHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcmVzb2x2ZWQucHJvZmlsZSk7XG5cdFx0c3dpdGNoIChyZXNvbHZlZC5zeW5jUmVzb3VyY2UpIHtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNldHRpbmdzOiByZXR1cm4gdGhpcy5nZXRTZXR0aW5nc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpLCBwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLktleWJpbmRpbmdzOiByZXR1cm4gdGhpcy5nZXRLZXliaW5kaW5nc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpLCBwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlRhc2tzOiByZXR1cm4gdGhpcy5nZXRUYXNrc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpLCBwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLk1jcDogcmV0dXJuIHRoaXMuZ2V0TWNwQXNzb2NpYXRlZFJlc291cmNlcyh1cmksIHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU25pcHBldHM6IHJldHVybiB0aGlzLmdldFNuaXBwZXRzQXNzb2NpYXRlZFJlc291cmNlcyh1cmksIHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuUHJvbXB0czogcmV0dXJuIHRoaXMuZ2V0UHJvbXB0c0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpLCBwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlOiByZXR1cm4gdGhpcy5nZXRHbG9iYWxTdGF0ZUFzc29jaWF0ZWRSZXNvdXJjZXModXJpLCBwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkV4dGVuc2lvbnM6IHJldHVybiB0aGlzLmdldEV4dGVuc2lvbnNBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaSwgcHJvZmlsZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Qcm9maWxlczogcmV0dXJuIHRoaXMuZ2V0UHJvZmlsZXNBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaSwgcHJvZmlsZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Xb3Jrc3BhY2VTdGF0ZTogcmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldE1hY2hpbmVJZCh7IHVyaSB9OiBJU3luY1Jlc291cmNlSGFuZGxlKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMucmVzb2x2ZVVyaSh1cmkpO1xuXHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChyZXNvbHZlZC5yZW1vdGUpIHtcblx0XHRcdGlmIChyZXNvbHZlZC5yZWYpIHtcblx0XHRcdFx0Y29uc3QgeyBjb250ZW50IH0gPSBhd2FpdCB0aGlzLmdldFVzZXJEYXRhKHJlc29sdmVkLnN5bmNSZXNvdXJjZSwgcmVzb2x2ZWQucmVmLCByZXNvbHZlZC5jb2xsZWN0aW9uKTtcblx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBzeW5jRGF0YSA9IHRoaXMucGFyc2VTeW5jRGF0YShjb250ZW50LCByZXNvbHZlZC5zeW5jUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybiBzeW5jRGF0YT8ubWFjaGluZUlkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChyZXNvbHZlZC5sb2NhdGlvbikge1xuXHRcdFx0aWYgKHJlc29sdmVkLnJlZikge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZS5yZXNvbHZlUmVzb3VyY2VDb250ZW50KHJlc29sdmVkLnN5bmNSZXNvdXJjZSwgcmVzb2x2ZWQucmVmLCByZXNvbHZlZC5jb2xsZWN0aW9uLCByZXNvbHZlZC5sb2NhdGlvbik7XG5cdFx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3luY0RhdGEgPSB0aGlzLnBhcnNlU3luY0RhdGEoY29udGVudCwgcmVzb2x2ZWQuc3luY1Jlc291cmNlKTtcblx0XHRcdFx0XHRyZXR1cm4gc3luY0RhdGE/Lm1hY2hpbmVJZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ2V0U2VydmljZU1hY2hpbmVJZCh0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29udGVudCh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlVXJpKHVyaSk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc29sdmVkLm5vZGUgPT09IFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLk5PVF9FWElTVElOR19SRVNPVVJDRSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc29sdmVkLnJlZikge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZ2V0Q29udGVudEZyb21TdG9yZShyZXNvbHZlZC5yZW1vdGUsIHJlc29sdmVkLnN5bmNSZXNvdXJjZSwgcmVzb2x2ZWQuY29sbGVjdGlvbiwgcmVzb2x2ZWQucmVmLCByZXNvbHZlZC5sb2NhdGlvbik7XG5cdFx0XHRpZiAocmVzb2x2ZWQubm9kZSAmJiBjb250ZW50KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVOb2RlQ29udGVudChyZXNvbHZlZC5zeW5jUmVzb3VyY2UsIGNvbnRlbnQsIHJlc29sdmVkLm5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvbHZlZC5yZW1vdGUgJiYgIXJlc29sdmVkLm5vZGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVMYXRlc3RDb250ZW50KHJlc29sdmVkLnN5bmNSZXNvdXJjZSwgcmVzb2x2ZWQucHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldENvbnRlbnRGcm9tU3RvcmUocmVtb3RlOiBib29sZWFuLCBzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCByZWY6IHN0cmluZywgbG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRpZiAocmVtb3RlKSB7XG5cdFx0XHRjb25zdCB7IGNvbnRlbnQgfSA9IGF3YWl0IHRoaXMuZ2V0VXNlckRhdGEoc3luY1Jlc291cmNlLCByZWYsIGNvbGxlY3Rpb24pO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLnJlc29sdmVSZXNvdXJjZUNvbnRlbnQoc3luY1Jlc291cmNlLCByZWYsIGNvbGxlY3Rpb24sIGxvY2F0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZU5vZGVDb250ZW50KHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBjb250ZW50OiBzdHJpbmcsIG5vZGU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IHN5bmNEYXRhID0gdGhpcy5wYXJzZVN5bmNEYXRhKGNvbnRlbnQsIHN5bmNSZXNvdXJjZSk7XG5cdFx0c3dpdGNoIChzeW5jUmVzb3VyY2UpIHtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNldHRpbmdzOiByZXR1cm4gdGhpcy5yZXNvbHZlU2V0dGluZ3NOb2RlQ29udGVudChzeW5jRGF0YSwgbm9kZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5LZXliaW5kaW5nczogcmV0dXJuIHRoaXMucmVzb2x2ZUtleWJpbmRpbmdzTm9kZUNvbnRlbnQoc3luY0RhdGEsIG5vZGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuVGFza3M6IHJldHVybiB0aGlzLnJlc29sdmVUYXNrc05vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLk1jcDogcmV0dXJuIHRoaXMucmVzb2x2ZU1jcE5vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNuaXBwZXRzOiByZXR1cm4gdGhpcy5yZXNvbHZlU25pcHBldHNOb2RlQ29udGVudChzeW5jRGF0YSwgbm9kZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Qcm9tcHRzOiByZXR1cm4gdGhpcy5yZXNvbHZlUHJvbXB0c05vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlOiByZXR1cm4gdGhpcy5yZXNvbHZlR2xvYmFsU3RhdGVOb2RlQ29udGVudChzeW5jRGF0YSwgbm9kZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zOiByZXR1cm4gdGhpcy5yZXNvbHZlRXh0ZW5zaW9uc05vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlByb2ZpbGVzOiByZXR1cm4gdGhpcy5yZXNvbHZlUHJvZmlsZU5vZGVDb250ZW50KHN5bmNEYXRhLCBub2RlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLldvcmtzcGFjZVN0YXRlOiByZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVMYXRlc3RDb250ZW50KHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBwcm9maWxlSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHByb2ZpbGUgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlSWQpO1xuXHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHN3aXRjaCAoc3luY1Jlc291cmNlKSB7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5HbG9iYWxTdGF0ZTogcmV0dXJuIHRoaXMucmVzb2x2ZUxhdGVzdEdsb2JhbFN0YXRlQ29udGVudChwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkV4dGVuc2lvbnM6IHJldHVybiB0aGlzLnJlc29sdmVMYXRlc3RFeHRlbnNpb25zQ29udGVudChwcm9maWxlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlByb2ZpbGVzOiByZXR1cm4gdGhpcy5yZXNvbHZlTGF0ZXN0UHJvZmlsZXNDb250ZW50KHByb2ZpbGUpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU2V0dGluZ3M6IHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3M6IHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuVGFza3M6IHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuTWNwOiByZXR1cm4gbnVsbDtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNuaXBwZXRzOiByZXR1cm4gbnVsbDtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlByb21wdHM6IHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuV29ya3NwYWNlU3RhdGU6IHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2V0dGluZ3NBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaTogVVJJLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKTogeyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IGNvbXBhcmFibGVSZXNvdXJjZSA9IHByb2ZpbGUgPyBwcm9maWxlLnNldHRpbmdzUmVzb3VyY2UgOiB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLk5PVF9FWElTVElOR19SRVNPVVJDRSk7XG5cdFx0cmV0dXJuIFt7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfV07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVTZXR0aW5nc05vZGVDb250ZW50KHN5bmNEYXRhOiBJU3luY0RhdGEsIG5vZGU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdHN3aXRjaCAobm9kZSkge1xuXHRcdFx0Y2FzZSAnc2V0dGluZ3MuanNvbic6XG5cdFx0XHRcdHJldHVybiBwYXJzZVNldHRpbmdzU3luY0NvbnRlbnQoc3luY0RhdGEuY29udGVudCkuc2V0dGluZ3M7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXliaW5kaW5nc0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpOiBVUkksIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiB7IHJlc291cmNlOiBVUkk7IGNvbXBhcmFibGVSZXNvdXJjZTogVVJJIH1bXSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksICdrZXliaW5kaW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgY29tcGFyYWJsZVJlc291cmNlID0gcHJvZmlsZSA/IHByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSA6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuTk9UX0VYSVNUSU5HX1JFU09VUkNFKTtcblx0XHRyZXR1cm4gW3sgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9XTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUtleWJpbmRpbmdzTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChub2RlKSB7XG5cdFx0XHRjYXNlICdrZXliaW5kaW5ncy5qc29uJzpcblx0XHRcdFx0cmV0dXJuIGdldEtleWJpbmRpbmdzQ29udGVudEZyb21TeW5jQ29udGVudChzeW5jRGF0YS5jb250ZW50LCAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ09ORklHX1NZTkNfS0VZQklORElOR1NfUEVSX1BMQVRGT1JNKSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhc2tzQXNzb2NpYXRlZFJlc291cmNlcyh1cmk6IFVSSSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IHsgcmVzb3VyY2U6IFVSSTsgY29tcGFyYWJsZVJlc291cmNlOiBVUkkgfVtdIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgJ3Rhc2tzLmpzb24nKTtcblx0XHRjb25zdCBjb21wYXJhYmxlUmVzb3VyY2UgPSBwcm9maWxlID8gcHJvZmlsZS50YXNrc1Jlc291cmNlIDogdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5OT1RfRVhJU1RJTkdfUkVTT1VSQ0UpO1xuXHRcdHJldHVybiBbeyByZXNvdXJjZSwgY29tcGFyYWJsZVJlc291cmNlIH1dO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlVGFza3NOb2RlQ29udGVudChzeW5jRGF0YTogSVN5bmNEYXRhLCBub2RlOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdGNhc2UgJ3Rhc2tzLmpzb24nOlxuXHRcdFx0XHRyZXR1cm4gZ2V0VGFza3NDb250ZW50RnJvbVN5bmNDb250ZW50KHN5bmNEYXRhLmNvbnRlbnQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTbmlwcGV0c0Fzc29jaWF0ZWRSZXNvdXJjZXModXJpOiBVUkksIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHsgcmVzb3VyY2U6IFVSSTsgY29tcGFyYWJsZVJlc291cmNlOiBVUkkgfVtdPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMucmVzb2x2ZUNvbnRlbnQodXJpKTtcblx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0Y29uc3Qgc3luY0RhdGEgPSB0aGlzLnBhcnNlU3luY0RhdGEoY29udGVudCwgU3luY1Jlc291cmNlLlNuaXBwZXRzKTtcblx0XHRcdGlmIChzeW5jRGF0YSkge1xuXHRcdFx0XHRjb25zdCBzbmlwcGV0cyA9IHBhcnNlU25pcHBldHMoc3luY0RhdGEpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBzbmlwcGV0IG9mIE9iamVjdC5rZXlzKHNuaXBwZXRzKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBzbmlwcGV0KTtcblx0XHRcdFx0XHRjb25zdCBjb21wYXJhYmxlUmVzb3VyY2UgPSBwcm9maWxlID8gdGhpcy5leHRVcmkuam9pblBhdGgocHJvZmlsZS5zbmlwcGV0c0hvbWUsIHNuaXBwZXQpIDogdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5OT1RfRVhJU1RJTkdfUkVTT1VSQ0UpO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVTbmlwcGV0c05vZGVDb250ZW50KHN5bmNEYXRhOiBJU3luY0RhdGEsIG5vZGU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiBwYXJzZVNuaXBwZXRzKHN5bmNEYXRhKVtub2RlXSB8fCBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRQcm9tcHRzQXNzb2NpYXRlZFJlc291cmNlcyh1cmk6IFVSSSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvbHZlQ29udGVudCh1cmkpO1xuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRjb25zdCBzeW5jRGF0YSA9IHRoaXMucGFyc2VTeW5jRGF0YShjb250ZW50LCBTeW5jUmVzb3VyY2UuUHJvbXB0cyk7XG5cdFx0XHRpZiAoc3luY0RhdGEpIHtcblx0XHRcdFx0Y29uc3QgcHJvbXB0cyA9IHBhcnNlUHJvbXB0cyhzeW5jRGF0YSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb21wdCBvZiBPYmplY3Qua2V5cyhwcm9tcHRzKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBwcm9tcHQpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBhcmFibGVSZXNvdXJjZSA9IChwcm9maWxlKVxuXHRcdFx0XHRcdFx0PyB0aGlzLmV4dFVyaS5qb2luUGF0aChwcm9maWxlLnByb21wdHNIb21lLCBwcm9tcHQpXG5cdFx0XHRcdFx0XHQ6IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuTk9UX0VYSVNUSU5HX1JFU09VUkNFKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlUHJvbXB0c05vZGVDb250ZW50KHN5bmNEYXRhOiBJU3luY0RhdGEsIG5vZGU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiBwYXJzZVByb21wdHMoc3luY0RhdGEpW25vZGVdIHx8IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvbnNBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaTogVVJJLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKTogeyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCAnZXh0ZW5zaW9ucy5qc29uJyk7XG5cdFx0Y29uc3QgY29tcGFyYWJsZVJlc291cmNlID0gcHJvZmlsZVxuXHRcdFx0PyB0aGlzLnRvVXJpKHtcblx0XHRcdFx0cmVtb3RlOiBmYWxzZSxcblx0XHRcdFx0c3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucyxcblx0XHRcdFx0cHJvZmlsZTogcHJvZmlsZS5pZCxcblx0XHRcdFx0bG9jYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29sbGVjdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWY6IHVuZGVmaW5lZCxcblx0XHRcdFx0bm9kZTogdW5kZWZpbmVkLFxuXHRcdFx0fSlcblx0XHRcdDogdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5OT1RfRVhJU1RJTkdfUkVTT1VSQ0UpO1xuXHRcdHJldHVybiBbeyByZXNvdXJjZSwgY29tcGFyYWJsZVJlc291cmNlIH1dO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlRXh0ZW5zaW9uc05vZGVDb250ZW50KHN5bmNEYXRhOiBJU3luY0RhdGEsIG5vZGU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdHN3aXRjaCAobm9kZSkge1xuXHRcdFx0Y2FzZSAnZXh0ZW5zaW9ucy5qc29uJzpcblx0XHRcdFx0cmV0dXJuIHN0cmluZ2lmeUV4dGVuc2lvbnMocGFyc2VFeHRlbnNpb25zKHN5bmNEYXRhKSwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlTGF0ZXN0RXh0ZW5zaW9uc0NvbnRlbnQocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHsgbG9jYWxFeHRlbnNpb25zIH0gPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsRXh0ZW5zaW9uc1Byb3ZpZGVyKS5nZXRMb2NhbEV4dGVuc2lvbnMocHJvZmlsZSk7XG5cdFx0cmV0dXJuIHN0cmluZ2lmeUV4dGVuc2lvbnMobG9jYWxFeHRlbnNpb25zLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0R2xvYmFsU3RhdGVBc3NvY2lhdGVkUmVzb3VyY2VzKHVyaTogVVJJLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKTogeyByZXNvdXJjZTogVVJJOyBjb21wYXJhYmxlUmVzb3VyY2U6IFVSSSB9W10ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCAnZ2xvYmFsU3RhdGUuanNvbicpO1xuXHRcdGNvbnN0IGNvbXBhcmFibGVSZXNvdXJjZSA9IHByb2ZpbGVcblx0XHRcdD8gdGhpcy50b1VyaSh7XG5cdFx0XHRcdHJlbW90ZTogZmFsc2UsXG5cdFx0XHRcdHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlLFxuXHRcdFx0XHRwcm9maWxlOiBwcm9maWxlLmlkLFxuXHRcdFx0XHRsb2NhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb2xsZWN0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlZjogdW5kZWZpbmVkLFxuXHRcdFx0XHRub2RlOiB1bmRlZmluZWQsXG5cdFx0XHR9KVxuXHRcdFx0OiB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksIFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLk5PVF9FWElTVElOR19SRVNPVVJDRSk7XG5cdFx0cmV0dXJuIFt7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfV07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVHbG9iYWxTdGF0ZU5vZGVDb250ZW50KHN5bmNEYXRhOiBJU3luY0RhdGEsIG5vZGU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdHN3aXRjaCAobm9kZSkge1xuXHRcdFx0Y2FzZSAnZ2xvYmFsU3RhdGUuanNvbic6XG5cdFx0XHRcdHJldHVybiBzdHJpbmdpZnlHbG9iYWxTdGF0ZShKU09OLnBhcnNlKHN5bmNEYXRhLmNvbnRlbnQpLCB0cnVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVMYXRlc3RHbG9iYWxTdGF0ZUNvbnRlbnQocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGxvY2FsR2xvYmFsU3RhdGUgPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsR2xvYmFsU3RhdGVQcm92aWRlcikuZ2V0TG9jYWxHbG9iYWxTdGF0ZShwcm9maWxlKTtcblx0XHRyZXR1cm4gc3RyaW5naWZ5R2xvYmFsU3RhdGUobG9jYWxHbG9iYWxTdGF0ZSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2ZpbGVzQXNzb2NpYXRlZFJlc291cmNlcyh1cmk6IFVSSSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IHsgcmVzb3VyY2U6IFVSSTsgY29tcGFyYWJsZVJlc291cmNlOiBVUkkgfVtdIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuZXh0VXJpLmpvaW5QYXRoKHVyaSwgJ3Byb2ZpbGVzLmpzb24nKTtcblx0XHRjb25zdCBjb21wYXJhYmxlUmVzb3VyY2UgPSB0aGlzLnRvVXJpKHtcblx0XHRcdHJlbW90ZTogZmFsc2UsXG5cdFx0XHRzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZS5Qcm9maWxlcyxcblx0XHRcdHByb2ZpbGU6IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuaWQsXG5cdFx0XHRsb2NhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0Y29sbGVjdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0cmVmOiB1bmRlZmluZWQsXG5cdFx0XHRub2RlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIFt7IHJlc291cmNlLCBjb21wYXJhYmxlUmVzb3VyY2UgfV07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVQcm9maWxlTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChub2RlKSB7XG5cdFx0XHRjYXNlICdwcm9maWxlcy5qc29uJzpcblx0XHRcdFx0cmV0dXJuIHRvRm9ybWF0dGVkU3RyaW5nKEpTT04ucGFyc2Uoc3luY0RhdGEuY29udGVudCksIHt9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVMYXRlc3RQcm9maWxlc0NvbnRlbnQocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdHJldHVybiBzdHJpbmdpZnlMb2NhbFByb2ZpbGVzKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmlsdGVyKHAgPT4gIXAuaXNEZWZhdWx0ICYmICFwLmlzVHJhbnNpZW50KSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvVXJpKHN5bmNSZXNvdXJjZVVyaUluZm86IElTeW5jUmVzb3VyY2VVcmlJbmZvKTogVVJJIHtcblx0XHRjb25zdCBhdXRob3JpdHkgPSBzeW5jUmVzb3VyY2VVcmlJbmZvLnJlbW90ZSA/IFVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLlJFTU9URV9CQUNLVVBfQVVUSE9SSVRZIDogVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuTE9DQUxfQkFDS1VQX0FVVEhPUklUWTtcblx0XHRjb25zdCBwYXRocyA9IFtdO1xuXHRcdGlmIChzeW5jUmVzb3VyY2VVcmlJbmZvLmxvY2F0aW9uKSB7XG5cdFx0XHRwYXRocy5wdXNoKGBzY2hlbWU6JHtzeW5jUmVzb3VyY2VVcmlJbmZvLmxvY2F0aW9uLnNjaGVtZX1gKTtcblx0XHRcdHBhdGhzLnB1c2goYGF1dGhvcml0eToke3N5bmNSZXNvdXJjZVVyaUluZm8ubG9jYXRpb24uYXV0aG9yaXR5fWApO1xuXHRcdFx0cGF0aHMucHVzaCh0cmltKHN5bmNSZXNvdXJjZVVyaUluZm8ubG9jYXRpb24ucGF0aCwgJy8nKSk7XG5cdFx0fVxuXHRcdHBhdGhzLnB1c2goYHN5bmNSZXNvdXJjZToke3N5bmNSZXNvdXJjZVVyaUluZm8uc3luY1Jlc291cmNlfWApO1xuXHRcdHBhdGhzLnB1c2goYHByb2ZpbGU6JHtzeW5jUmVzb3VyY2VVcmlJbmZvLnByb2ZpbGV9YCk7XG5cdFx0aWYgKHN5bmNSZXNvdXJjZVVyaUluZm8uY29sbGVjdGlvbikge1xuXHRcdFx0cGF0aHMucHVzaChgY29sbGVjdGlvbjoke3N5bmNSZXNvdXJjZVVyaUluZm8uY29sbGVjdGlvbn1gKTtcblx0XHR9XG5cdFx0aWYgKHN5bmNSZXNvdXJjZVVyaUluZm8ucmVmKSB7XG5cdFx0XHRwYXRocy5wdXNoKGByZWY6JHtzeW5jUmVzb3VyY2VVcmlJbmZvLnJlZn1gKTtcblx0XHR9XG5cdFx0aWYgKHN5bmNSZXNvdXJjZVVyaUluZm8ubm9kZSkge1xuXHRcdFx0cGF0aHMucHVzaChzeW5jUmVzb3VyY2VVcmlJbmZvLm5vZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRVcmkuam9pblBhdGgoVVJJLmZyb20oeyBzY2hlbWU6IFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgYXV0aG9yaXR5LCBwYXRoOiBgL2AsIHF1ZXJ5OiBzeW5jUmVzb3VyY2VVcmlJbmZvLmxvY2F0aW9uPy5xdWVyeSwgZnJhZ21lbnQ6IHN5bmNSZXNvdXJjZVVyaUluZm8ubG9jYXRpb24/LmZyYWdtZW50IH0pLCAuLi5wYXRocyk7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVVcmkodXJpOiBVUkkpOiBJU3luY1Jlc291cmNlVXJpSW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgIT09IFVTRVJfREFUQV9TWU5DX1NDSEVNRSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGF0aHM6IHN0cmluZ1tdID0gW107XG5cdFx0d2hpbGUgKHVyaS5wYXRoICE9PSAnLycpIHtcblx0XHRcdHBhdGhzLnVuc2hpZnQodGhpcy5leHRVcmkuYmFzZW5hbWUodXJpKSk7XG5cdFx0XHR1cmkgPSB0aGlzLmV4dFVyaS5kaXJuYW1lKHVyaSk7XG5cdFx0fVxuXHRcdGlmIChwYXRocy5sZW5ndGggPCAyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZW1vdGUgPSB1cmkuYXV0aG9yaXR5ID09PSBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5SRU1PVEVfQkFDS1VQX0FVVEhPUklUWTtcblx0XHRsZXQgc2NoZW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxvY2F0aW9uUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcm9maWxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVmOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG5vZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR3aGlsZSAocGF0aHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwYXRoID0gcGF0aHMuc2hpZnQoKSE7XG5cdFx0XHRpZiAocGF0aC5zdGFydHNXaXRoKCdzY2hlbWU6JykpIHtcblx0XHRcdFx0c2NoZW1lID0gcGF0aC5zdWJzdHJpbmcoJ3NjaGVtZTonLmxlbmd0aCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGguc3RhcnRzV2l0aCgnYXV0aG9yaXR5OicpKSB7XG5cdFx0XHRcdGF1dGhvcml0eSA9IHBhdGguc3Vic3RyaW5nKCdhdXRob3JpdHk6Jy5sZW5ndGgpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLnN0YXJ0c1dpdGgoJ3N5bmNSZXNvdXJjZTonKSkge1xuXHRcdFx0XHRzeW5jUmVzb3VyY2UgPSBwYXRoLnN1YnN0cmluZygnc3luY1Jlc291cmNlOicubGVuZ3RoKSBhcyBTeW5jUmVzb3VyY2U7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGguc3RhcnRzV2l0aCgncHJvZmlsZTonKSkge1xuXHRcdFx0XHRwcm9maWxlID0gcGF0aC5zdWJzdHJpbmcoJ3Byb2ZpbGU6Jy5sZW5ndGgpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLnN0YXJ0c1dpdGgoJ2NvbGxlY3Rpb246JykpIHtcblx0XHRcdFx0Y29sbGVjdGlvbiA9IHBhdGguc3Vic3RyaW5nKCdjb2xsZWN0aW9uOicubGVuZ3RoKTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC5zdGFydHNXaXRoKCdyZWY6JykpIHtcblx0XHRcdFx0cmVmID0gcGF0aC5zdWJzdHJpbmcoJ3JlZjonLmxlbmd0aCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFzeW5jUmVzb3VyY2UpIHtcblx0XHRcdFx0bG9jYXRpb25QYXRocy5wdXNoKHBhdGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bm9kZSA9IHBhdGg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRyZW1vdGUsXG5cdFx0XHRzeW5jUmVzb3VyY2U6IHN5bmNSZXNvdXJjZSEsXG5cdFx0XHRwcm9maWxlOiBwcm9maWxlISxcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRyZWYsXG5cdFx0XHRub2RlLFxuXHRcdFx0bG9jYXRpb246IHNjaGVtZSAmJiBhdXRob3JpdHkgIT09IHVuZGVmaW5lZCA/IHRoaXMuZXh0VXJpLmpvaW5QYXRoKFVSSS5mcm9tKHsgc2NoZW1lLCBhdXRob3JpdHksIHF1ZXJ5OiB1cmkucXVlcnksIGZyYWdtZW50OiB1cmkuZnJhZ21lbnQsIHBhdGg6ICcvJyB9KSwgLi4ubG9jYXRpb25QYXRocykgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVN5bmNEYXRhKGNvbnRlbnQ6IHN0cmluZywgc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UpOiBJU3luY0RhdGEge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzeW5jRGF0YTogSVN5bmNEYXRhID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRcdGlmIChpc1N5bmNEYXRhKHN5bmNEYXRhKSkge1xuXHRcdFx0XHRyZXR1cm4gc3luY0RhdGE7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNFcnJvcihsb2NhbGl6ZSgnaW5jb21wYXRpYmxlIHN5bmMgZGF0YScsIFwiQ2Fubm90IHBhcnNlIHN5bmMgZGF0YSBhcyBpdCBpcyBub3QgY29tcGF0aWJsZSB3aXRoIHRoZSBjdXJyZW50IHZlcnNpb24uXCIpLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuSW5jb21wYXRpYmxlUmVtb3RlQ29udGVudCwgc3luY1Jlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VXNlckRhdGEoc3luY1Jlc291cmNlOiBTeW5jUmVzb3VyY2UsIHJlZjogc3RyaW5nLCBjb2xsZWN0aW9uPzogc3RyaW5nKTogUHJvbWlzZTxJVXNlckRhdGE+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UucmVzb2x2ZVJlc291cmNlQ29udGVudChzeW5jUmVzb3VyY2UsIHJlZiwgY29sbGVjdGlvbik7XG5cdFx0cmV0dXJuIHsgcmVmLCBjb250ZW50IH07XG5cdH1cblxuXHRwcml2YXRlIGdldE1jcEFzc29jaWF0ZWRSZXNvdXJjZXModXJpOiBVUkksIHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiB7IHJlc291cmNlOiBVUkk7IGNvbXBhcmFibGVSZXNvdXJjZTogVVJJIH1bXSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmV4dFVyaS5qb2luUGF0aCh1cmksICdtY3AuanNvbicpO1xuXHRcdGNvbnN0IGNvbXBhcmFibGVSZXNvdXJjZSA9IHByb2ZpbGUgPyBwcm9maWxlLm1jcFJlc291cmNlIDogdGhpcy5leHRVcmkuam9pblBhdGgodXJpLCBVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5OT1RfRVhJU1RJTkdfUkVTT1VSQ0UpO1xuXHRcdHJldHVybiBbeyByZXNvdXJjZSwgY29tcGFyYWJsZVJlc291cmNlIH1dO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlTWNwTm9kZUNvbnRlbnQoc3luY0RhdGE6IElTeW5jRGF0YSwgbm9kZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChub2RlKSB7XG5cdFx0XHRjYXNlICdtY3AuanNvbic6XG5cdFx0XHRcdHJldHVybiBnZXRNY3BDb250ZW50RnJvbVN5bmNDb250ZW50KHN5bmNEYXRhLmNvbnRlbnQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQW9ELGdDQUFnQyx5QkFBeUIsMkJBQTJCLGNBQWMsbUJBQW1CLHVCQUF1Qix1QkFBbUYsNENBQW1FO0FBQ3RWLFNBQTJCLGdDQUFnQztBQUMzRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFC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QUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLFVBQVUsVUFBVSxjQUFjLFNBQVksS0FBSyxPQUFPLFNBQVMsSUFBSSxLQUFLLEVBQUUsUUFBUSxXQUFXLE9BQU8sSUFBSSxPQUFPLFVBQVUsSUFBSSxVQUFVLE1BQU0sSUFBSSxDQUFDLEdBQUcsR0FBRyxhQUFhLElBQUk7QUFBQSxJQUM5SztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGNBQWMsU0FBaUIsY0FBdUM7QUFDN0UsUUFBSTtBQUNILFlBQU0sV0FBc0IsS0FBSyxNQUFNLE9BQU87QUFDOUMsVUFBSSxXQUFXLFFBQVEsR0FBRztBQUN6QixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0sS0FBSztBQUFBLElBQzVCO0FBQ0EsVUFBTSxJQUFJLGtCQUFrQixTQUFTLDBCQUEwQiwwRUFBMEUsR0FBRyxzQkFBc0IsMkJBQTJCLFlBQVk7QUFBQSxFQUMxTTtBQUFBLEVBRUEsTUFBYyxZQUFZLGNBQTRCLEtBQWEsWUFBeUM7QUFDM0csVUFBTSxVQUFVLE1BQU0sS0FBSyx5QkFBeUIsdUJBQXVCLGNBQWMsS0FBSyxVQUFVO0FBQ3hHLFdBQU8sRUFBRSxLQUFLLFFBQVE7QUFBQSxFQUN2QjtBQUFBLEVBRVEsMEJBQTBCLEtBQVUsU0FBcUY7QUFDaEksVUFBTSxXQUFXLEtBQUssT0FBTyxTQUFTLEtBQUssVUFBVTtBQUNyRCxVQUFNLHFCQUFxQixVQUFVLFFBQVEsY0FBYyxLQUFLLE9BQU8sU0FBUyxLQUFLLG9DQUFvQyxxQkFBcUI7QUFDOUksV0FBTyxDQUFDLEVBQUUsVUFBVSxtQkFBbUIsQ0FBQztBQUFBLEVBQ3pDO0FBQUEsRUFFUSxzQkFBc0IsVUFBcUIsTUFBNkI7QUFDL0UsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLO0FBQ0osZUFBTyw2QkFBNkIsU0FBUyxTQUFTLEtBQUssVUFBVTtBQUFBLElBQ3ZFO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFRDtBQTVlYSxvQ0FJWSx3QkFBd0I7QUFKcEMsb0NBS1ksMEJBQTBCO0FBTHRDLG9DQU1ZLHlCQUF5QjtBQU5yQyxzQ0FBTjtBQUFBLEVBV0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBCVTsiLAogICJuYW1lcyI6IFtdCn0K
