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
import { hash } from "../../../base/common/hash.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { basename, joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../workspace/common/workspace.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { Promises } from "../../../base/common/async.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { isString } from "../../../base/common/types.js";
const AGENTS_WINDOW_PROFILE_ID = "agents";
const AGENTS_WINDOW_PROFILE_FLAGS = {
  settings: true,
  keybindings: true,
  prompts: true,
  mcp: true,
  languageModels: true,
  snippets: true,
  tasks: true,
  extensions: true
};
var ProfileResourceType = /* @__PURE__ */ ((ProfileResourceType2) => {
  ProfileResourceType2["Settings"] = "settings";
  ProfileResourceType2["Keybindings"] = "keybindings";
  ProfileResourceType2["Snippets"] = "snippets";
  ProfileResourceType2["Prompts"] = "prompts";
  ProfileResourceType2["Tasks"] = "tasks";
  ProfileResourceType2["Extensions"] = "extensions";
  ProfileResourceType2["GlobalState"] = "globalState";
  ProfileResourceType2["Mcp"] = "mcp";
  ProfileResourceType2["LanguageModels"] = "languageModels";
  return ProfileResourceType2;
})(ProfileResourceType || {});
function isUserDataProfile(thing) {
  const candidate = thing;
  return !!(candidate && typeof candidate === "object" && typeof candidate.id === "string" && typeof candidate.isDefault === "boolean" && typeof candidate.name === "string" && URI.isUri(candidate.location) && URI.isUri(candidate.globalStorageHome) && URI.isUri(candidate.settingsResource) && URI.isUri(candidate.keybindingsResource) && URI.isUri(candidate.tasksResource) && URI.isUri(candidate.snippetsHome) && URI.isUri(candidate.promptsHome) && URI.isUri(candidate.extensionsResource) && URI.isUri(candidate.mcpResource) && URI.isUri(candidate.languageModelsResource) && URI.isUri(candidate.agentPluginsHome));
}
const IUserDataProfilesService = createDecorator("IUserDataProfilesService");
function reviveProfile(profile, scheme) {
  return {
    id: profile.id,
    isDefault: profile.isDefault,
    name: profile.name,
    icon: profile.icon,
    location: URI.revive(profile.location).with({ scheme }),
    globalStorageHome: URI.revive(profile.globalStorageHome).with({ scheme }),
    settingsResource: URI.revive(profile.settingsResource).with({ scheme }),
    keybindingsResource: URI.revive(profile.keybindingsResource).with({ scheme }),
    tasksResource: URI.revive(profile.tasksResource).with({ scheme }),
    snippetsHome: URI.revive(profile.snippetsHome).with({ scheme }),
    promptsHome: URI.revive(profile.promptsHome).with({ scheme }),
    extensionsResource: URI.revive(profile.extensionsResource).with({ scheme }),
    mcpResource: URI.revive(profile.mcpResource).with({ scheme }),
    languageModelsResource: URI.revive(profile.languageModelsResource).with({ scheme }),
    agentPluginsHome: URI.revive(profile.agentPluginsHome),
    cacheHome: URI.revive(profile.cacheHome).with({ scheme }),
    useDefaultFlags: profile.useDefaultFlags,
    isTransient: profile.isTransient,
    isInternal: profile.isInternal,
    isAgentsWindowProfile: profile.isAgentsWindowProfile,
    workspaces: profile.workspaces?.map((w) => URI.revive(w))
  };
}
function toUserDataProfile(id, name, location, profilesCacheHome, options, defaultProfile) {
  const isAgentsWindowProfile = id === AGENTS_WINDOW_PROFILE_ID;
  return {
    id,
    name,
    location,
    isDefault: false,
    icon: options?.icon,
    globalStorageHome: defaultProfile && options?.useDefaultFlags?.globalState ? defaultProfile.globalStorageHome : joinPath(location, "globalStorage"),
    settingsResource: defaultProfile && options?.useDefaultFlags?.settings ? defaultProfile.settingsResource : joinPath(location, "settings.json"),
    keybindingsResource: defaultProfile && options?.useDefaultFlags?.keybindings ? defaultProfile.keybindingsResource : joinPath(location, "keybindings.json"),
    tasksResource: defaultProfile && options?.useDefaultFlags?.tasks ? defaultProfile.tasksResource : joinPath(location, "tasks.json"),
    snippetsHome: defaultProfile && options?.useDefaultFlags?.snippets ? defaultProfile.snippetsHome : joinPath(location, "snippets"),
    promptsHome: defaultProfile && options?.useDefaultFlags?.prompts ? defaultProfile.promptsHome : joinPath(location, "prompts"),
    extensionsResource: defaultProfile && options?.useDefaultFlags?.extensions ? defaultProfile.extensionsResource : joinPath(location, "extensions.json"),
    mcpResource: defaultProfile && options?.useDefaultFlags?.mcp ? defaultProfile.mcpResource : joinPath(location, "mcp.json"),
    languageModelsResource: defaultProfile && options?.useDefaultFlags?.languageModels ? defaultProfile.languageModelsResource : joinPath(location, "chatLanguageModels.json"),
    agentPluginsHome: defaultProfile ? defaultProfile.agentPluginsHome : joinPath(location, "agent-plugins"),
    cacheHome: joinPath(profilesCacheHome, id),
    useDefaultFlags: options?.useDefaultFlags,
    isTransient: options?.transient,
    isInternal: isAgentsWindowProfile || options?.transient,
    isAgentsWindowProfile,
    workspaces: options?.workspaces
  };
}
const SYSTEM_PROFILES_HOME = "builtin";
let UserDataProfilesService = class extends Disposable {
  constructor(environmentService, fileService, uriIdentityService, logService) {
    super();
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this._onDidChangeProfiles = this._register(new Emitter());
    this.onDidChangeProfiles = this._onDidChangeProfiles.event;
    this._onWillCreateProfile = this._register(new Emitter());
    this.onWillCreateProfile = this._onWillCreateProfile.event;
    this._onWillRemoveProfile = this._register(new Emitter());
    this.onWillRemoveProfile = this._onWillRemoveProfile.event;
    this._onDidResetWorkspaces = this._register(new Emitter());
    this.onDidResetWorkspaces = this._onDidResetWorkspaces.event;
    this.profileCreationPromises = /* @__PURE__ */ new Map();
    this.transientProfilesObject = {
      profiles: [],
      emptyWindows: /* @__PURE__ */ new Map()
    };
    this.profilesHome = joinPath(this.environmentService.userRoamingDataHome, "profiles");
    this.profilesCacheHome = joinPath(this.environmentService.cacheHome, "CachedProfilesData");
  }
  get defaultProfile() {
    return this.profiles[0];
  }
  get profiles() {
    return [...this.profilesObject.profiles, ...this.transientProfilesObject.profiles];
  }
  init() {
    this._profilesObject = void 0;
  }
  get profilesObject() {
    if (!this._profilesObject) {
      const defaultProfile = this.createDefaultProfile();
      const profiles = [defaultProfile];
      try {
        for (const storedProfile of this.getStoredProfiles()) {
          if (this.isInvalidProfile(storedProfile)) {
            this.logService.warn("Skipping the invalid stored profile", storedProfile.location || storedProfile.name);
            continue;
          }
          const id = basename(storedProfile.location);
          profiles.push(toUserDataProfile(
            id,
            storedProfile.name,
            storedProfile.location,
            this.profilesCacheHome,
            {
              icon: storedProfile.icon,
              useDefaultFlags: id === AGENTS_WINDOW_PROFILE_ID ? AGENTS_WINDOW_PROFILE_FLAGS : storedProfile.useDefaultFlags
            },
            defaultProfile
          ));
        }
      } catch (error) {
        this.logService.error(error);
      }
      const emptyWindows = /* @__PURE__ */ new Map();
      if (profiles.length) {
        try {
          const profileAssociaitions = this.getStoredProfileAssociations();
          if (profileAssociaitions.workspaces) {
            for (const [workspacePath, profileId] of Object.entries(profileAssociaitions.workspaces)) {
              const workspace = URI.parse(workspacePath);
              const profile = profiles.find((p) => p.id === profileId);
              if (profile) {
                const workspaces = profile.workspaces ? profile.workspaces.slice(0) : [];
                workspaces.push(workspace);
                profile.workspaces = workspaces;
              }
            }
          }
          if (profileAssociaitions.emptyWindows) {
            for (const [windowId, profileId] of Object.entries(profileAssociaitions.emptyWindows)) {
              const profile = profiles.find((p) => p.id === profileId);
              if (profile) {
                emptyWindows.set(windowId, profile);
              }
            }
          }
        } catch (error) {
          this.logService.error(error);
        }
      }
      this._profilesObject = { profiles, emptyWindows };
    }
    return this._profilesObject;
  }
  isInvalidProfile(storedProfile) {
    if (!storedProfile.name) {
      return true;
    }
    if (!isString(storedProfile.name)) {
      return true;
    }
    if (!storedProfile.location) {
      return true;
    }
    return false;
  }
  createDefaultProfile() {
    const defaultProfile = toUserDataProfile("__default__profile__", localize("defaultProfile", "Default"), this.environmentService.userRoamingDataHome, this.profilesCacheHome);
    return { ...defaultProfile, extensionsResource: this.getDefaultProfileExtensionsLocation() ?? defaultProfile.extensionsResource, isDefault: true };
  }
  async createTransientProfile(workspaceIdentifier) {
    const namePrefix = `Temp`;
    const nameRegEx = new RegExp(`${escapeRegExpCharacters(namePrefix)}\\s(\\d+)`);
    let nameIndex = 0;
    for (const profile of this.profiles) {
      const matches = nameRegEx.exec(profile.name);
      const index = matches ? parseInt(matches[1]) : 0;
      nameIndex = index > nameIndex ? index : nameIndex;
    }
    const name = `${namePrefix} ${nameIndex + 1}`;
    return this.createProfile(hash(generateUuid()).toString(16), name, { transient: true }, workspaceIdentifier);
  }
  async createNamedProfile(name, options, workspaceIdentifier) {
    return this.createProfile(hash(generateUuid()).toString(16), name, options, workspaceIdentifier);
  }
  async createProfile(id, name, options, workspaceIdentifier) {
    const profile = await this.doCreateProfile(id, name, options, workspaceIdentifier);
    return profile;
  }
  async doCreateProfile(id, name, options, workspaceIdentifier) {
    if (!isString(name) || !name) {
      throw new Error("Name of the profile is mandatory and must be of type `string`");
    }
    let profileCreationPromise = this.profileCreationPromises.get(name);
    if (!profileCreationPromise) {
      profileCreationPromise = (async () => {
        try {
          const existing = this.profiles.find((p) => p.id === id || id !== AGENTS_WINDOW_PROFILE_ID && !p.isTransient && !options?.transient && p.name === name);
          if (existing) {
            throw new Error(`Profile with ${name} name already exists`);
          }
          const workspace = workspaceIdentifier ? this.getWorkspace(workspaceIdentifier) : void 0;
          if (URI.isUri(workspace)) {
            options = { ...options, workspaces: [workspace] };
          }
          const profile = toUserDataProfile(
            id,
            name,
            this.uriIdentityService.extUri.joinPath(this.profilesHome, ...id === AGENTS_WINDOW_PROFILE_ID ? [SYSTEM_PROFILES_HOME, id] : [id]),
            this.profilesCacheHome,
            id === AGENTS_WINDOW_PROFILE_ID ? {} : options,
            this.defaultProfile
          );
          await this.fileService.createFolder(profile.location);
          const joiners = [];
          this._onWillCreateProfile.fire({
            profile,
            join(promise) {
              joiners.push(promise);
            }
          });
          await Promises.settled(joiners);
          if (workspace && !URI.isUri(workspace)) {
            this.updateEmptyWindowAssociation(workspace, profile, !!profile.isTransient);
          }
          this.updateProfiles([profile], [], []);
          return this.profiles.find((p) => p.id === profile.id) ?? profile;
        } finally {
          this.profileCreationPromises.delete(name);
        }
      })();
      this.profileCreationPromises.set(name, profileCreationPromise);
    }
    return profileCreationPromise;
  }
  async updateProfile(profile, options) {
    if (profile.isAgentsWindowProfile) {
      throw new Error("Cannot update agents window profile");
    }
    const profilesToUpdate = [];
    for (const existing of this.profiles) {
      let profileToUpdate;
      if (profile.id === existing.id) {
        if (!existing.isDefault) {
          profileToUpdate = toUserDataProfile(existing.id, options.name ?? existing.name, existing.location, this.profilesCacheHome, {
            icon: options.icon === null ? void 0 : options.icon ?? existing.icon,
            transient: options.transient ?? existing.isTransient,
            useDefaultFlags: options.useDefaultFlags ?? existing.useDefaultFlags,
            workspaces: options.workspaces ?? existing.workspaces
          }, this.defaultProfile);
        } else if (options.workspaces) {
          profileToUpdate = existing;
          profileToUpdate.workspaces = options.workspaces;
        }
      } else if (options.workspaces) {
        const workspaces = existing.workspaces?.filter((w1) => !options.workspaces?.some((w2) => this.uriIdentityService.extUri.isEqual(w1, w2)));
        if (existing.workspaces?.length !== workspaces?.length) {
          profileToUpdate = existing;
          profileToUpdate.workspaces = workspaces;
        }
      }
      if (profileToUpdate) {
        profilesToUpdate.push(profileToUpdate);
      }
    }
    if (!profilesToUpdate.length) {
      if (profile.isDefault) {
        throw new Error("Cannot update default profile");
      }
      throw new Error(`Profile '${profile.name}' does not exist`);
    }
    this.updateProfiles([], [], profilesToUpdate);
    const updatedProfile = this.profiles.find((p) => p.id === profile.id);
    if (!updatedProfile) {
      throw new Error(`Profile '${profile.name}' was not updated`);
    }
    return updatedProfile;
  }
  async removeProfile(profileToRemove) {
    if (profileToRemove.isDefault) {
      throw new Error("Cannot remove default profile");
    }
    const profile = this.profiles.find((p) => p.id === profileToRemove.id);
    if (!profile) {
      throw new Error(`Profile '${profileToRemove.name}' does not exist`);
    }
    const joiners = [];
    this._onWillRemoveProfile.fire({
      profile,
      join(promise) {
        joiners.push(promise);
      }
    });
    try {
      await Promise.allSettled(joiners);
    } catch (error) {
      this.logService.error(error);
    }
    this.updateProfiles([], [profile], []);
    try {
      await this.fileService.del(profile.cacheHome, { recursive: true });
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
    }
  }
  async setProfileForWorkspace(workspaceIdentifier, profileToSet) {
    const profile = this.profiles.find((p) => p.id === profileToSet.id);
    if (!profile) {
      throw new Error(`Profile '${profileToSet.name}' does not exist`);
    }
    const workspace = this.getWorkspace(workspaceIdentifier);
    if (URI.isUri(workspace)) {
      const workspaces = profile.workspaces ? [...profile.workspaces] : [];
      if (!workspaces.some((w) => this.uriIdentityService.extUri.isEqual(w, workspace))) {
        workspaces.push(workspace);
        await this.updateProfile(profile, { workspaces });
      }
    } else {
      this.updateEmptyWindowAssociation(workspace, profile, false);
      this.updateStoredProfiles(this.profiles);
    }
  }
  unsetWorkspace(workspaceIdentifier, transient = false) {
    const workspace = this.getWorkspace(workspaceIdentifier);
    if (URI.isUri(workspace)) {
      const currentlyAssociatedProfile = this.getProfileForWorkspace(workspaceIdentifier);
      if (currentlyAssociatedProfile) {
        this.updateProfile(currentlyAssociatedProfile, { workspaces: currentlyAssociatedProfile.workspaces?.filter((w) => !this.uriIdentityService.extUri.isEqual(w, workspace)) });
      }
    } else {
      this.updateEmptyWindowAssociation(workspace, void 0, transient);
      this.updateStoredProfiles(this.profiles);
    }
  }
  async resetWorkspaces() {
    this.transientProfilesObject.emptyWindows.clear();
    this.profilesObject.emptyWindows.clear();
    for (const profile of this.profiles) {
      profile.workspaces = void 0;
    }
    this.updateProfiles([], [], this.profiles);
    this._onDidResetWorkspaces.fire();
  }
  async cleanUp() {
    try {
      if (await this.fileService.exists(this.profilesHome)) {
        const stat = await this.fileService.resolve(this.profilesHome);
        await Promise.all((stat.children || []).filter((child) => child.isDirectory && child.name !== SYSTEM_PROFILES_HOME && this.profiles.every((p) => !this.uriIdentityService.extUri.isEqual(p.location, child.resource))).map((child) => this.fileService.del(child.resource, { recursive: true })));
      }
    } catch (error) {
      this.logService.error("Error deleting redundant profile folders", error);
    }
    try {
      const existing = this.getStoredProfiles();
      const valid = [];
      for (const storedProfile of this.getStoredProfiles()) {
        if (this.isInvalidProfile(storedProfile)) {
          this.logService.warn(`Invalid user data profile found: ${storedProfile.name}`);
        } else {
          valid.push(storedProfile);
        }
      }
      if (existing.length !== valid.length) {
        this.saveStoredProfiles(valid);
      }
    } catch (error) {
      this.logService.error("Error removing invalid stored profiles", error);
    }
  }
  async cleanUpTransientProfiles() {
    const unAssociatedTransientProfiles = this.transientProfilesObject.profiles.filter((p) => !this.isProfileAssociatedToWorkspace(p));
    await Promise.allSettled(unAssociatedTransientProfiles.map((p) => this.removeProfile(p)));
  }
  getProfileForWorkspace(workspaceIdentifier) {
    const workspace = this.getWorkspace(workspaceIdentifier);
    if (URI.isUri(workspace) && this.uriIdentityService.extUri.isEqual(workspace, this.environmentService.agentSessionsWorkspace)) {
      return this.profiles.find((p) => p.isAgentsWindowProfile);
    }
    return URI.isUri(workspace) ? this.profiles.find((p) => p.workspaces?.some((w) => this.uriIdentityService.extUri.isEqual(w, workspace))) : this.profilesObject.emptyWindows.get(workspace) ?? this.transientProfilesObject.emptyWindows.get(workspace);
  }
  getWorkspace(workspaceIdentifier) {
    if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return workspaceIdentifier.uri;
    }
    if (isWorkspaceIdentifier(workspaceIdentifier)) {
      return workspaceIdentifier.configPath;
    }
    return workspaceIdentifier.id;
  }
  isProfileAssociatedToWorkspace(profile) {
    if (profile.workspaces?.length) {
      return true;
    }
    if ([...this.profilesObject.emptyWindows.values()].some((windowProfile) => this.uriIdentityService.extUri.isEqual(windowProfile.location, profile.location))) {
      return true;
    }
    if ([...this.transientProfilesObject.emptyWindows.values()].some((windowProfile) => this.uriIdentityService.extUri.isEqual(windowProfile.location, profile.location))) {
      return true;
    }
    return false;
  }
  updateProfiles(added, removed, updated, donotTrigger = false) {
    const allProfiles = [...this.profiles, ...added];
    const transientProfiles = this.transientProfilesObject.profiles;
    this.transientProfilesObject.profiles = [];
    const profiles = [];
    for (let profile of allProfiles) {
      if (removed.some((p) => profile.id === p.id)) {
        for (const windowId of [...this.profilesObject.emptyWindows.keys()]) {
          if (profile.id === this.profilesObject.emptyWindows.get(windowId)?.id) {
            this.profilesObject.emptyWindows.delete(windowId);
          }
        }
        continue;
      }
      if (!profile.isDefault) {
        profile = updated.find((p) => profile.id === p.id) ?? profile;
        const transientProfile = transientProfiles.find((p) => profile.id === p.id);
        if (profile.isTransient) {
          this.transientProfilesObject.profiles.push(profile);
        } else {
          if (transientProfile) {
            for (const [windowId, p] of this.transientProfilesObject.emptyWindows.entries()) {
              if (profile.id === p.id) {
                this.transientProfilesObject.emptyWindows.delete(windowId);
                this.profilesObject.emptyWindows.set(windowId, profile);
                break;
              }
            }
          }
        }
      }
      if (profile.workspaces?.length === 0) {
        profile.workspaces = void 0;
      }
      profiles.push(profile);
    }
    this.updateStoredProfiles(profiles);
    if (!donotTrigger) {
      this.triggerProfilesChanges(added, removed, updated);
    }
  }
  triggerProfilesChanges(added, removed, updated) {
    this._onDidChangeProfiles.fire({ added, removed, updated, all: this.profiles });
  }
  updateEmptyWindowAssociation(windowId, newProfile, transient) {
    transient = newProfile?.isTransient ? true : transient;
    if (transient) {
      if (newProfile) {
        this.transientProfilesObject.emptyWindows.set(windowId, newProfile);
      } else {
        this.transientProfilesObject.emptyWindows.delete(windowId);
      }
    } else {
      this.transientProfilesObject.emptyWindows.delete(windowId);
      if (newProfile) {
        this.profilesObject.emptyWindows.set(windowId, newProfile);
      } else {
        this.profilesObject.emptyWindows.delete(windowId);
      }
    }
  }
  updateStoredProfiles(profiles) {
    const storedProfiles = [];
    const workspaces = {};
    const emptyWindows = {};
    for (const profile of profiles) {
      if (profile.isTransient) {
        continue;
      }
      if (!profile.isDefault) {
        storedProfiles.push({
          location: profile.location,
          name: profile.name,
          icon: profile.icon,
          useDefaultFlags: profile.useDefaultFlags
        });
      }
      if (profile.workspaces) {
        for (const workspace of profile.workspaces) {
          workspaces[workspace.toString()] = profile.id;
        }
      }
    }
    for (const [windowId, profile] of this.profilesObject.emptyWindows.entries()) {
      emptyWindows[windowId.toString()] = profile.id;
    }
    this.saveStoredProfileAssociations({ workspaces, emptyWindows });
    this.saveStoredProfiles(storedProfiles);
    this._profilesObject = void 0;
  }
  getStoredProfiles() {
    return [];
  }
  saveStoredProfiles(storedProfiles) {
    throw new Error("not implemented");
  }
  getStoredProfileAssociations() {
    return {};
  }
  saveStoredProfileAssociations(storedProfileAssociations) {
    throw new Error("not implemented");
  }
  getDefaultProfileExtensionsLocation() {
    return void 0;
  }
};
UserDataProfilesService.PROFILES_KEY = "userDataProfiles";
UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY = "profileAssociations";
UserDataProfilesService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ILogService)
], UserDataProfilesService);
class InMemoryUserDataProfilesService extends UserDataProfilesService {
  constructor() {
    super(...arguments);
    this.storedProfiles = [];
    this.storedProfileAssociations = {};
  }
  getStoredProfiles() {
    return this.storedProfiles;
  }
  saveStoredProfiles(storedProfiles) {
    this.storedProfiles = storedProfiles;
  }
  getStoredProfileAssociations() {
    return this.storedProfileAssociations;
  }
  saveStoredProfileAssociations(storedProfileAssociations) {
    this.storedProfileAssociations = storedProfileAssociations;
  }
}
export {
  AGENTS_WINDOW_PROFILE_ID,
  IUserDataProfilesService,
  InMemoryUserDataProfilesService,
  ProfileResourceType,
  UserDataProfilesService,
  isUserDataProfile,
  reviveProfile,
  toUserDataProfile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFQcm9maWxlXFxjb21tb25cXHVzZXJEYXRhUHJvZmlsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlEdG8gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZywgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNvbnN0IEFHRU5UU19XSU5ET1dfUFJPRklMRV9JRCA9ICdhZ2VudHMnO1xuXG5jb25zdCBBR0VOVFNfV0lORE9XX1BST0ZJTEVfRkxBR1M6IFVzZURlZmF1bHRQcm9maWxlRmxhZ3MgPSB7XG5cdHNldHRpbmdzOiB0cnVlLFxuXHRrZXliaW5kaW5nczogdHJ1ZSxcblx0cHJvbXB0czogdHJ1ZSxcblx0bWNwOiB0cnVlLFxuXHRsYW5ndWFnZU1vZGVsczogdHJ1ZSxcblx0c25pcHBldHM6IHRydWUsXG5cdHRhc2tzOiB0cnVlLFxuXHRleHRlbnNpb25zOiB0cnVlLFxufTtcblxuZXhwb3J0IGNvbnN0IGVudW0gUHJvZmlsZVJlc291cmNlVHlwZSB7XG5cdFNldHRpbmdzID0gJ3NldHRpbmdzJyxcblx0S2V5YmluZGluZ3MgPSAna2V5YmluZGluZ3MnLFxuXHRTbmlwcGV0cyA9ICdzbmlwcGV0cycsXG5cdFByb21wdHMgPSAncHJvbXB0cycsXG5cdFRhc2tzID0gJ3Rhc2tzJyxcblx0RXh0ZW5zaW9ucyA9ICdleHRlbnNpb25zJyxcblx0R2xvYmFsU3RhdGUgPSAnZ2xvYmFsU3RhdGUnLFxuXHRNY3AgPSAnbWNwJyxcblx0TGFuZ3VhZ2VNb2RlbHMgPSAnbGFuZ3VhZ2VNb2RlbHMnLFxufVxuXG4vKipcbiAqIEZsYWdzIHRvIGluZGljYXRlIHdoZXRoZXIgdG8gdXNlIHRoZSBkZWZhdWx0IHByb2ZpbGUgb3Igbm90LlxuICovXG5leHBvcnQgdHlwZSBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzID0geyBba2V5IGluIFByb2ZpbGVSZXNvdXJjZVR5cGVdPzogYm9vbGVhbiB9O1xuZXhwb3J0IHR5cGUgUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzID0gVXNlRGVmYXVsdFByb2ZpbGVGbGFncztcbmV4cG9ydCB0eXBlIFNldHRpbmdWYWx1ZSA9IHN0cmluZyB8IGJvb2xlYW4gfCBudW1iZXIgfCB1bmRlZmluZWQgfCBudWxsIHwgb2JqZWN0O1xuZXhwb3J0IHR5cGUgSVNldHRpbmdzRGljdGlvbmFyeSA9IFJlY29yZDxzdHJpbmcsIFNldHRpbmdWYWx1ZT47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVzZXJEYXRhUHJvZmlsZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzRGVmYXVsdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogc3RyaW5nO1xuXHRyZWFkb25seSBsb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSBnbG9iYWxTdG9yYWdlSG9tZTogVVJJO1xuXHRyZWFkb25seSBzZXR0aW5nc1Jlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGtleWJpbmRpbmdzUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgdGFza3NSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBzbmlwcGV0c0hvbWU6IFVSSTtcblx0cmVhZG9ubHkgcHJvbXB0c0hvbWU6IFVSSTtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uc1Jlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IG1jcFJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgYWdlbnRQbHVnaW5zSG9tZTogVVJJO1xuXHRyZWFkb25seSBjYWNoZUhvbWU6IFVSSTtcblx0cmVhZG9ubHkgdXNlRGVmYXVsdEZsYWdzPzogVXNlRGVmYXVsdFByb2ZpbGVGbGFncztcblx0cmVhZG9ubHkgaXNJbnRlcm5hbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVHJhbnNpZW50PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNBZ2VudHNXaW5kb3dQcm9maWxlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd29ya3NwYWNlcz86IHJlYWRvbmx5IFVSSVtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVc2VyRGF0YVByb2ZpbGUodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBJVXNlckRhdGFQcm9maWxlIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdGhpbmcgYXMgSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gISEoY2FuZGlkYXRlICYmIHR5cGVvZiBjYW5kaWRhdGUgPT09ICdvYmplY3QnXG5cdFx0JiYgdHlwZW9mIGNhbmRpZGF0ZS5pZCA9PT0gJ3N0cmluZydcblx0XHQmJiB0eXBlb2YgY2FuZGlkYXRlLmlzRGVmYXVsdCA9PT0gJ2Jvb2xlYW4nXG5cdFx0JiYgdHlwZW9mIGNhbmRpZGF0ZS5uYW1lID09PSAnc3RyaW5nJ1xuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUubG9jYXRpb24pXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS5nbG9iYWxTdG9yYWdlSG9tZSlcblx0XHQmJiBVUkkuaXNVcmkoY2FuZGlkYXRlLnNldHRpbmdzUmVzb3VyY2UpXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS5rZXliaW5kaW5nc1Jlc291cmNlKVxuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUudGFza3NSZXNvdXJjZSlcblx0XHQmJiBVUkkuaXNVcmkoY2FuZGlkYXRlLnNuaXBwZXRzSG9tZSlcblx0XHQmJiBVUkkuaXNVcmkoY2FuZGlkYXRlLnByb21wdHNIb21lKVxuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUuZXh0ZW5zaW9uc1Jlc291cmNlKVxuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUubWNwUmVzb3VyY2UpXG5cdFx0JiYgVVJJLmlzVXJpKGNhbmRpZGF0ZS5sYW5ndWFnZU1vZGVsc1Jlc291cmNlKVxuXHRcdCYmIFVSSS5pc1VyaShjYW5kaWRhdGUuYWdlbnRQbHVnaW5zSG9tZSlcblx0KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VkVXNlckRhdGFQcm9maWxlVGVtcGxhdGUge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNldHRpbmdzPzogSVNldHRpbmdzRGljdGlvbmFyeTtcblx0cmVhZG9ubHkgZ2xvYmFsU3RhdGU/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTeXN0ZW1Qcm9maWxlVGVtcGxhdGUgZXh0ZW5kcyBJUGFyc2VkVXNlckRhdGFQcm9maWxlVGVtcGxhdGUge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBEaWRDaGFuZ2VQcm9maWxlc0V2ZW50ID0geyByZWFkb25seSBhZGRlZDogcmVhZG9ubHkgSVVzZXJEYXRhUHJvZmlsZVtdOyByZWFkb25seSByZW1vdmVkOiByZWFkb25seSBJVXNlckRhdGFQcm9maWxlW107IHJlYWRvbmx5IHVwZGF0ZWQ6IHJlYWRvbmx5IElVc2VyRGF0YVByb2ZpbGVbXTsgcmVhZG9ubHkgYWxsOiByZWFkb25seSBJVXNlckRhdGFQcm9maWxlW10gfTtcblxuZXhwb3J0IHR5cGUgV2lsbENyZWF0ZVByb2ZpbGVFdmVudCA9IHtcblx0cHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZTtcblx0am9pbihwcm9taXNlOiBQcm9taXNlPHZvaWQ+KTogdm9pZDtcbn07XG5cbmV4cG9ydCB0eXBlIFdpbGxSZW1vdmVQcm9maWxlRXZlbnQgPSB7XG5cdHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGU7XG5cdGpvaW4ocHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IHZvaWQ7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElVc2VyRGF0YVByb2ZpbGVPcHRpb25zIHtcblx0cmVhZG9ubHkgaWNvbj86IHN0cmluZztcblx0cmVhZG9ubHkgdXNlRGVmYXVsdEZsYWdzPzogVXNlRGVmYXVsdFByb2ZpbGVGbGFncztcblx0cmVhZG9ubHkgdHJhbnNpZW50PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd29ya3NwYWNlcz86IHJlYWRvbmx5IFVSSVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElVc2VyRGF0YVByb2ZpbGVVcGRhdGVPcHRpb25zIGV4dGVuZHMgT21pdDxJVXNlckRhdGFQcm9maWxlT3B0aW9ucywgJ2ljb24nPiB7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb24/OiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElVc2VyRGF0YVByb2ZpbGVzU2VydmljZT4oJ0lVc2VyRGF0YVByb2ZpbGVzU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgcHJvZmlsZXNIb21lOiBVUkk7XG5cdHJlYWRvbmx5IGRlZmF1bHRQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvZmlsZXM6IEV2ZW50PERpZENoYW5nZVByb2ZpbGVzRXZlbnQ+O1xuXHRyZWFkb25seSBwcm9maWxlczogcmVhZG9ubHkgSVVzZXJEYXRhUHJvZmlsZVtdO1xuXG5cdHJlYWRvbmx5IG9uRGlkUmVzZXRXb3Jrc3BhY2VzOiBFdmVudDx2b2lkPjtcblxuXHRjcmVhdGVOYW1lZFByb2ZpbGUobmFtZTogc3RyaW5nLCBvcHRpb25zPzogSVVzZXJEYXRhUHJvZmlsZU9wdGlvbnMsIHdvcmtzcGFjZUlkZW50aWZpZXI/OiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZT47XG5cdGNyZWF0ZVRyYW5zaWVudFByb2ZpbGUod29ya3NwYWNlSWRlbnRpZmllcj86IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPjtcblx0Y3JlYXRlUHJvZmlsZShpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIG9wdGlvbnM/OiBJVXNlckRhdGFQcm9maWxlT3B0aW9ucywgd29ya3NwYWNlSWRlbnRpZmllcj86IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPjtcblx0dXBkYXRlUHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBvcHRpb25zPzogSVVzZXJEYXRhUHJvZmlsZVVwZGF0ZU9wdGlvbnMsKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPjtcblx0cmVtb3ZlUHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPjtcblxuXHRzZXRQcm9maWxlRm9yV29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXI6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPjtcblx0cmVzZXRXb3Jrc3BhY2VzKCk6IFByb21pc2U8dm9pZD47XG5cblx0Y2xlYW5VcCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRjbGVhblVwVHJhbnNpZW50UHJvZmlsZXMoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJldml2ZVByb2ZpbGUocHJvZmlsZTogVXJpRHRvPElVc2VyRGF0YVByb2ZpbGU+LCBzY2hlbWU6IHN0cmluZyk6IElVc2VyRGF0YVByb2ZpbGUge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBwcm9maWxlLmlkLFxuXHRcdGlzRGVmYXVsdDogcHJvZmlsZS5pc0RlZmF1bHQsXG5cdFx0bmFtZTogcHJvZmlsZS5uYW1lLFxuXHRcdGljb246IHByb2ZpbGUuaWNvbixcblx0XHRsb2NhdGlvbjogVVJJLnJldml2ZShwcm9maWxlLmxvY2F0aW9uKS53aXRoKHsgc2NoZW1lIH0pLFxuXHRcdGdsb2JhbFN0b3JhZ2VIb21lOiBVUkkucmV2aXZlKHByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0c2V0dGluZ3NSZXNvdXJjZTogVVJJLnJldml2ZShwcm9maWxlLnNldHRpbmdzUmVzb3VyY2UpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0a2V5YmluZGluZ3NSZXNvdXJjZTogVVJJLnJldml2ZShwcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0dGFza3NSZXNvdXJjZTogVVJJLnJldml2ZShwcm9maWxlLnRhc2tzUmVzb3VyY2UpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0c25pcHBldHNIb21lOiBVUkkucmV2aXZlKHByb2ZpbGUuc25pcHBldHNIb21lKS53aXRoKHsgc2NoZW1lIH0pLFxuXHRcdHByb21wdHNIb21lOiBVUkkucmV2aXZlKHByb2ZpbGUucHJvbXB0c0hvbWUpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0ZXh0ZW5zaW9uc1Jlc291cmNlOiBVUkkucmV2aXZlKHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKS53aXRoKHsgc2NoZW1lIH0pLFxuXHRcdG1jcFJlc291cmNlOiBVUkkucmV2aXZlKHByb2ZpbGUubWNwUmVzb3VyY2UpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0bGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZTogVVJJLnJldml2ZShwcm9maWxlLmxhbmd1YWdlTW9kZWxzUmVzb3VyY2UpLndpdGgoeyBzY2hlbWUgfSksXG5cdFx0YWdlbnRQbHVnaW5zSG9tZTogVVJJLnJldml2ZShwcm9maWxlLmFnZW50UGx1Z2luc0hvbWUpLFxuXHRcdGNhY2hlSG9tZTogVVJJLnJldml2ZShwcm9maWxlLmNhY2hlSG9tZSkud2l0aCh7IHNjaGVtZSB9KSxcblx0XHR1c2VEZWZhdWx0RmxhZ3M6IHByb2ZpbGUudXNlRGVmYXVsdEZsYWdzLFxuXHRcdGlzVHJhbnNpZW50OiBwcm9maWxlLmlzVHJhbnNpZW50LFxuXHRcdGlzSW50ZXJuYWw6IHByb2ZpbGUuaXNJbnRlcm5hbCxcblx0XHRpc0FnZW50c1dpbmRvd1Byb2ZpbGU6IHByb2ZpbGUuaXNBZ2VudHNXaW5kb3dQcm9maWxlLFxuXHRcdHdvcmtzcGFjZXM6IHByb2ZpbGUud29ya3NwYWNlcz8ubWFwKHcgPT4gVVJJLnJldml2ZSh3KSksXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1VzZXJEYXRhUHJvZmlsZShpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGxvY2F0aW9uOiBVUkksIHByb2ZpbGVzQ2FjaGVIb21lOiBVUkksIG9wdGlvbnM/OiBJVXNlckRhdGFQcm9maWxlT3B0aW9ucywgZGVmYXVsdFByb2ZpbGU/OiBJVXNlckRhdGFQcm9maWxlKTogSVVzZXJEYXRhUHJvZmlsZSB7XG5cdGNvbnN0IGlzQWdlbnRzV2luZG93UHJvZmlsZSA9IGlkID09PSBBR0VOVFNfV0lORE9XX1BST0ZJTEVfSUQ7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0bmFtZSxcblx0XHRsb2NhdGlvbixcblx0XHRpc0RlZmF1bHQ6IGZhbHNlLFxuXHRcdGljb246IG9wdGlvbnM/Lmljb24sXG5cdFx0Z2xvYmFsU3RvcmFnZUhvbWU6IGRlZmF1bHRQcm9maWxlICYmIG9wdGlvbnM/LnVzZURlZmF1bHRGbGFncz8uZ2xvYmFsU3RhdGUgPyBkZWZhdWx0UHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAnZ2xvYmFsU3RvcmFnZScpLFxuXHRcdHNldHRpbmdzUmVzb3VyY2U6IGRlZmF1bHRQcm9maWxlICYmIG9wdGlvbnM/LnVzZURlZmF1bHRGbGFncz8uc2V0dGluZ3MgPyBkZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlIDogam9pblBhdGgobG9jYXRpb24sICdzZXR0aW5ncy5qc29uJyksXG5cdFx0a2V5YmluZGluZ3NSZXNvdXJjZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5rZXliaW5kaW5ncyA/IGRlZmF1bHRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UgOiBqb2luUGF0aChsb2NhdGlvbiwgJ2tleWJpbmRpbmdzLmpzb24nKSxcblx0XHR0YXNrc1Jlc291cmNlOiBkZWZhdWx0UHJvZmlsZSAmJiBvcHRpb25zPy51c2VEZWZhdWx0RmxhZ3M/LnRhc2tzID8gZGVmYXVsdFByb2ZpbGUudGFza3NSZXNvdXJjZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAndGFza3MuanNvbicpLFxuXHRcdHNuaXBwZXRzSG9tZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5zbmlwcGV0cyA/IGRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAnc25pcHBldHMnKSxcblx0XHRwcm9tcHRzSG9tZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5wcm9tcHRzID8gZGVmYXVsdFByb2ZpbGUucHJvbXB0c0hvbWUgOiBqb2luUGF0aChsb2NhdGlvbiwgJ3Byb21wdHMnKSxcblx0XHRleHRlbnNpb25zUmVzb3VyY2U6IGRlZmF1bHRQcm9maWxlICYmIG9wdGlvbnM/LnVzZURlZmF1bHRGbGFncz8uZXh0ZW5zaW9ucyA/IGRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSA6IGpvaW5QYXRoKGxvY2F0aW9uLCAnZXh0ZW5zaW9ucy5qc29uJyksXG5cdFx0bWNwUmVzb3VyY2U6IGRlZmF1bHRQcm9maWxlICYmIG9wdGlvbnM/LnVzZURlZmF1bHRGbGFncz8ubWNwID8gZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2UgOiBqb2luUGF0aChsb2NhdGlvbiwgJ21jcC5qc29uJyksXG5cdFx0bGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZTogZGVmYXVsdFByb2ZpbGUgJiYgb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzPy5sYW5ndWFnZU1vZGVscyA/IGRlZmF1bHRQcm9maWxlLmxhbmd1YWdlTW9kZWxzUmVzb3VyY2UgOiBqb2luUGF0aChsb2NhdGlvbiwgJ2NoYXRMYW5ndWFnZU1vZGVscy5qc29uJyksXG5cdFx0YWdlbnRQbHVnaW5zSG9tZTogZGVmYXVsdFByb2ZpbGUgPyBkZWZhdWx0UHJvZmlsZS5hZ2VudFBsdWdpbnNIb21lIDogam9pblBhdGgobG9jYXRpb24sICdhZ2VudC1wbHVnaW5zJyksXG5cdFx0Y2FjaGVIb21lOiBqb2luUGF0aChwcm9maWxlc0NhY2hlSG9tZSwgaWQpLFxuXHRcdHVzZURlZmF1bHRGbGFnczogb3B0aW9ucz8udXNlRGVmYXVsdEZsYWdzLFxuXHRcdGlzVHJhbnNpZW50OiBvcHRpb25zPy50cmFuc2llbnQsXG5cdFx0aXNJbnRlcm5hbDogaXNBZ2VudHNXaW5kb3dQcm9maWxlIHx8IG9wdGlvbnM/LnRyYW5zaWVudCxcblx0XHRpc0FnZW50c1dpbmRvd1Byb2ZpbGUsXG5cdFx0d29ya3NwYWNlczogb3B0aW9ucz8ud29ya3NwYWNlcyxcblx0fTtcbn1cblxuZXhwb3J0IHR5cGUgVXNlckRhdGFQcm9maWxlc09iamVjdCA9IHtcblx0cHJvZmlsZXM6IElVc2VyRGF0YVByb2ZpbGVbXTtcblx0ZW1wdHlXaW5kb3dzOiBNYXA8c3RyaW5nLCBJVXNlckRhdGFQcm9maWxlPjtcbn07XG5cbmV4cG9ydCB0eXBlIFN0b3JlZFVzZXJEYXRhUHJvZmlsZSA9IHtcblx0bmFtZTogc3RyaW5nO1xuXHRsb2NhdGlvbjogVVJJO1xuXHRpY29uPzogc3RyaW5nO1xuXHR1c2VEZWZhdWx0RmxhZ3M/OiBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzO1xufTtcblxuZXhwb3J0IHR5cGUgU3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucyA9IHtcblx0d29ya3NwYWNlcz86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG5cdGVtcHR5V2luZG93cz86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG59O1xuXG5jb25zdCBTWVNURU1fUFJPRklMRVNfSE9NRSA9ICdidWlsdGluJztcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBzdGF0aWMgcmVhZG9ubHkgUFJPRklMRVNfS0VZID0gJ3VzZXJEYXRhUHJvZmlsZXMnO1xuXHRwcm90ZWN0ZWQgc3RhdGljIHJlYWRvbmx5IFBST0ZJTEVfQVNTT0NJQVRJT05TX0tFWSA9ICdwcm9maWxlQXNzb2NpYXRpb25zJztcblxuXHRyZWFkb25seSBwcm9maWxlc0hvbWU6IFVSSTtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlc0NhY2hlSG9tZTogVVJJO1xuXG5cdGdldCBkZWZhdWx0UHJvZmlsZSgpOiBJVXNlckRhdGFQcm9maWxlIHsgcmV0dXJuIHRoaXMucHJvZmlsZXNbMF07IH1cblx0Z2V0IHByb2ZpbGVzKCk6IElVc2VyRGF0YVByb2ZpbGVbXSB7IHJldHVybiBbLi4udGhpcy5wcm9maWxlc09iamVjdC5wcm9maWxlcywgLi4udGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5wcm9maWxlc107IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvZmlsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRDaGFuZ2VQcm9maWxlc0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9maWxlcyA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvZmlsZXMuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbldpbGxDcmVhdGVQcm9maWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8V2lsbENyZWF0ZVByb2ZpbGVFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbENyZWF0ZVByb2ZpbGUgPSB0aGlzLl9vbldpbGxDcmVhdGVQcm9maWxlLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25XaWxsUmVtb3ZlUHJvZmlsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdpbGxSZW1vdmVQcm9maWxlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxSZW1vdmVQcm9maWxlID0gdGhpcy5fb25XaWxsUmVtb3ZlUHJvZmlsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc2V0V29ya3NwYWNlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc2V0V29ya3NwYWNlcyA9IHRoaXMuX29uRGlkUmVzZXRXb3Jrc3BhY2VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcHJvZmlsZUNyZWF0aW9uUHJvbWlzZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPj4oKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdHJhbnNpZW50UHJvZmlsZXNPYmplY3Q6IFVzZXJEYXRhUHJvZmlsZXNPYmplY3QgPSB7XG5cdFx0cHJvZmlsZXM6IFtdLFxuXHRcdGVtcHR5V2luZG93czogbmV3IE1hcCgpXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByb3RlY3RlZCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucHJvZmlsZXNIb21lID0gam9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZSwgJ3Byb2ZpbGVzJyk7XG5cdFx0dGhpcy5wcm9maWxlc0NhY2hlSG9tZSA9IGpvaW5QYXRoKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmNhY2hlSG9tZSwgJ0NhY2hlZFByb2ZpbGVzRGF0YScpO1xuXHR9XG5cblx0aW5pdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm9maWxlc09iamVjdCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBfcHJvZmlsZXNPYmplY3Q6IFVzZXJEYXRhUHJvZmlsZXNPYmplY3QgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBnZXQgcHJvZmlsZXNPYmplY3QoKTogVXNlckRhdGFQcm9maWxlc09iamVjdCB7XG5cdFx0aWYgKCF0aGlzLl9wcm9maWxlc09iamVjdCkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGUgPSB0aGlzLmNyZWF0ZURlZmF1bHRQcm9maWxlKCk7XG5cdFx0XHRjb25zdCBwcm9maWxlczogQXJyYXk8TXV0YWJsZTxJVXNlckRhdGFQcm9maWxlPj4gPSBbZGVmYXVsdFByb2ZpbGVdO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBzdG9yZWRQcm9maWxlIG9mIHRoaXMuZ2V0U3RvcmVkUHJvZmlsZXMoKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzSW52YWxpZFByb2ZpbGUoc3RvcmVkUHJvZmlsZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdTa2lwcGluZyB0aGUgaW52YWxpZCBzdG9yZWQgcHJvZmlsZScsIHN0b3JlZFByb2ZpbGUubG9jYXRpb24gfHwgc3RvcmVkUHJvZmlsZS5uYW1lKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpZCA9IGJhc2VuYW1lKHN0b3JlZFByb2ZpbGUubG9jYXRpb24pO1xuXHRcdFx0XHRcdHByb2ZpbGVzLnB1c2godG9Vc2VyRGF0YVByb2ZpbGUoXG5cdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdHN0b3JlZFByb2ZpbGUubmFtZSxcblx0XHRcdFx0XHRcdHN0b3JlZFByb2ZpbGUubG9jYXRpb24sXG5cdFx0XHRcdFx0XHR0aGlzLnByb2ZpbGVzQ2FjaGVIb21lLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpY29uOiBzdG9yZWRQcm9maWxlLmljb24sXG5cdFx0XHRcdFx0XHRcdHVzZURlZmF1bHRGbGFnczogaWQgPT09IEFHRU5UU19XSU5ET1dfUFJPRklMRV9JRCA/IEFHRU5UU19XSU5ET1dfUFJPRklMRV9GTEFHUyA6IHN0b3JlZFByb2ZpbGUudXNlRGVmYXVsdEZsYWdzLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlZmF1bHRQcm9maWxlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbXB0eVdpbmRvd3MgPSBuZXcgTWFwPHN0cmluZywgSVVzZXJEYXRhUHJvZmlsZT4oKTtcblx0XHRcdGlmIChwcm9maWxlcy5sZW5ndGgpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm9maWxlQXNzb2NpYWl0aW9ucyA9IHRoaXMuZ2V0U3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucygpO1xuXHRcdFx0XHRcdGlmIChwcm9maWxlQXNzb2NpYWl0aW9ucy53b3Jrc3BhY2VzKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IFt3b3Jrc3BhY2VQYXRoLCBwcm9maWxlSWRdIG9mIE9iamVjdC5lbnRyaWVzKHByb2ZpbGVBc3NvY2lhaXRpb25zLndvcmtzcGFjZXMpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5wYXJzZSh3b3Jrc3BhY2VQYXRoKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvZmlsZSA9IHByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlSWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZXMgPSBwcm9maWxlLndvcmtzcGFjZXMgPyBwcm9maWxlLndvcmtzcGFjZXMuc2xpY2UoMCkgOiBbXTtcblx0XHRcdFx0XHRcdFx0XHR3b3Jrc3BhY2VzLnB1c2god29ya3NwYWNlKTtcblx0XHRcdFx0XHRcdFx0XHRwcm9maWxlLndvcmtzcGFjZXMgPSB3b3Jrc3BhY2VzO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChwcm9maWxlQXNzb2NpYWl0aW9ucy5lbXB0eVdpbmRvd3MpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgW3dpbmRvd0lkLCBwcm9maWxlSWRdIG9mIE9iamVjdC5lbnRyaWVzKHByb2ZpbGVBc3NvY2lhaXRpb25zLmVtcHR5V2luZG93cykpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvZmlsZSA9IHByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlSWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0XHRcdFx0XHRcdGVtcHR5V2luZG93cy5zZXQod2luZG93SWQsIHByb2ZpbGUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb2ZpbGVzT2JqZWN0ID0geyBwcm9maWxlcywgZW1wdHlXaW5kb3dzIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm9maWxlc09iamVjdDtcblx0fVxuXG5cdHByaXZhdGUgaXNJbnZhbGlkUHJvZmlsZShzdG9yZWRQcm9maWxlOiBTdG9yZWRVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRpZiAoIXN0b3JlZFByb2ZpbGUubmFtZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghaXNTdHJpbmcoc3RvcmVkUHJvZmlsZS5uYW1lKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghc3RvcmVkUHJvZmlsZS5sb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVEZWZhdWx0UHJvZmlsZSgpIHtcblx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IHRvVXNlckRhdGFQcm9maWxlKCdfX2RlZmF1bHRfX3Byb2ZpbGVfXycsIGxvY2FsaXplKCdkZWZhdWx0UHJvZmlsZScsIFwiRGVmYXVsdFwiKSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZSwgdGhpcy5wcm9maWxlc0NhY2hlSG9tZSk7XG5cdFx0cmV0dXJuIHsgLi4uZGVmYXVsdFByb2ZpbGUsIGV4dGVuc2lvbnNSZXNvdXJjZTogdGhpcy5nZXREZWZhdWx0UHJvZmlsZUV4dGVuc2lvbnNMb2NhdGlvbigpID8/IGRlZmF1bHRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgaXNEZWZhdWx0OiB0cnVlIH07XG5cdH1cblxuXHRhc3luYyBjcmVhdGVUcmFuc2llbnRQcm9maWxlKHdvcmtzcGFjZUlkZW50aWZpZXI/OiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZT4ge1xuXHRcdGNvbnN0IG5hbWVQcmVmaXggPSBgVGVtcGA7XG5cdFx0Y29uc3QgbmFtZVJlZ0V4ID0gbmV3IFJlZ0V4cChgJHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKG5hbWVQcmVmaXgpfVxcXFxzKFxcXFxkKylgKTtcblx0XHRsZXQgbmFtZUluZGV4ID0gMDtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy5wcm9maWxlcykge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IG5hbWVSZWdFeC5leGVjKHByb2ZpbGUubmFtZSk7XG5cdFx0XHRjb25zdCBpbmRleCA9IG1hdGNoZXMgPyBwYXJzZUludChtYXRjaGVzWzFdKSA6IDA7XG5cdFx0XHRuYW1lSW5kZXggPSBpbmRleCA+IG5hbWVJbmRleCA/IGluZGV4IDogbmFtZUluZGV4O1xuXHRcdH1cblx0XHRjb25zdCBuYW1lID0gYCR7bmFtZVByZWZpeH0gJHtuYW1lSW5kZXggKyAxfWA7XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlUHJvZmlsZShoYXNoKGdlbmVyYXRlVXVpZCgpKS50b1N0cmluZygxNiksIG5hbWUsIHsgdHJhbnNpZW50OiB0cnVlIH0sIHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTmFtZWRQcm9maWxlKG5hbWU6IHN0cmluZywgb3B0aW9ucz86IElVc2VyRGF0YVByb2ZpbGVPcHRpb25zLCB3b3Jrc3BhY2VJZGVudGlmaWVyPzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+IHtcblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVQcm9maWxlKGhhc2goZ2VuZXJhdGVVdWlkKCkpLnRvU3RyaW5nKDE2KSwgbmFtZSwgb3B0aW9ucywgd29ya3NwYWNlSWRlbnRpZmllcik7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVQcm9maWxlKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgb3B0aW9ucz86IElVc2VyRGF0YVByb2ZpbGVPcHRpb25zLCB3b3Jrc3BhY2VJZGVudGlmaWVyPzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGU+IHtcblx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdGhpcy5kb0NyZWF0ZVByb2ZpbGUoaWQsIG5hbWUsIG9wdGlvbnMsIHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXG5cdFx0cmV0dXJuIHByb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQ3JlYXRlUHJvZmlsZShpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIG9wdGlvbnM/OiBJVXNlckRhdGFQcm9maWxlT3B0aW9ucywgd29ya3NwYWNlSWRlbnRpZmllcj86IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlPiB7XG5cdFx0aWYgKCFpc1N0cmluZyhuYW1lKSB8fCAhbmFtZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOYW1lIG9mIHRoZSBwcm9maWxlIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHByb2ZpbGVDcmVhdGlvblByb21pc2UgPSB0aGlzLnByb2ZpbGVDcmVhdGlvblByb21pc2VzLmdldChuYW1lKTtcblx0XHRpZiAoIXByb2ZpbGVDcmVhdGlvblByb21pc2UpIHtcblx0XHRcdHByb2ZpbGVDcmVhdGlvblByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gaWQgfHwgKGlkICE9PSBBR0VOVFNfV0lORE9XX1BST0ZJTEVfSUQgJiYgIXAuaXNUcmFuc2llbnQgJiYgIW9wdGlvbnM/LnRyYW5zaWVudCAmJiBwLm5hbWUgPT09IG5hbWUpKTtcblx0XHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvZmlsZSB3aXRoICR7bmFtZX0gbmFtZSBhbHJlYWR5IGV4aXN0c2ApO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHdvcmtzcGFjZUlkZW50aWZpZXIgPyB0aGlzLmdldFdvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoVVJJLmlzVXJpKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHdvcmtzcGFjZXM6IFt3b3Jrc3BhY2VdIH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcHJvZmlsZSA9IHRvVXNlckRhdGFQcm9maWxlKFxuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdFx0dGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMucHJvZmlsZXNIb21lLCAuLi4oaWQgPT09IEFHRU5UU19XSU5ET1dfUFJPRklMRV9JRCA/IFtTWVNURU1fUFJPRklMRVNfSE9NRSwgaWRdIDogW2lkXSkpLFxuXHRcdFx0XHRcdFx0dGhpcy5wcm9maWxlc0NhY2hlSG9tZSxcblx0XHRcdFx0XHRcdGlkID09PSBBR0VOVFNfV0lORE9XX1BST0ZJTEVfSUQgPyB7fSA6IG9wdGlvbnMsXG5cdFx0XHRcdFx0XHR0aGlzLmRlZmF1bHRQcm9maWxlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihwcm9maWxlLmxvY2F0aW9uKTtcblxuXHRcdFx0XHRcdGNvbnN0IGpvaW5lcnM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0XHRcdHRoaXMuX29uV2lsbENyZWF0ZVByb2ZpbGUuZmlyZSh7XG5cdFx0XHRcdFx0XHRwcm9maWxlLFxuXHRcdFx0XHRcdFx0am9pbihwcm9taXNlKSB7XG5cdFx0XHRcdFx0XHRcdGpvaW5lcnMucHVzaChwcm9taXNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGpvaW5lcnMpO1xuXG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZSAmJiAhVVJJLmlzVXJpKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlRW1wdHlXaW5kb3dBc3NvY2lhdGlvbih3b3Jrc3BhY2UsIHByb2ZpbGUsICEhcHJvZmlsZS5pc1RyYW5zaWVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMudXBkYXRlUHJvZmlsZXMoW3Byb2ZpbGVdLCBbXSwgW10pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlLmlkKSA/PyBwcm9maWxlO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMucHJvZmlsZUNyZWF0aW9uUHJvbWlzZXMuZGVsZXRlKG5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdFx0dGhpcy5wcm9maWxlQ3JlYXRpb25Qcm9taXNlcy5zZXQobmFtZSwgcHJvZmlsZUNyZWF0aW9uUHJvbWlzZSk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9maWxlQ3JlYXRpb25Qcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBvcHRpb25zOiBJVXNlckRhdGFQcm9maWxlVXBkYXRlT3B0aW9ucyk6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZT4ge1xuXHRcdGlmIChwcm9maWxlLmlzQWdlbnRzV2luZG93UHJvZmlsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXBkYXRlIGFnZW50cyB3aW5kb3cgcHJvZmlsZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVzVG9VcGRhdGU6IElVc2VyRGF0YVByb2ZpbGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXhpc3Rpbmcgb2YgdGhpcy5wcm9maWxlcykge1xuXHRcdFx0bGV0IHByb2ZpbGVUb1VwZGF0ZTogTXV0YWJsZTxJVXNlckRhdGFQcm9maWxlPiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHByb2ZpbGUuaWQgPT09IGV4aXN0aW5nLmlkKSB7XG5cdFx0XHRcdGlmICghZXhpc3RpbmcuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0cHJvZmlsZVRvVXBkYXRlID0gdG9Vc2VyRGF0YVByb2ZpbGUoZXhpc3RpbmcuaWQsIG9wdGlvbnMubmFtZSA/PyBleGlzdGluZy5uYW1lLCBleGlzdGluZy5sb2NhdGlvbiwgdGhpcy5wcm9maWxlc0NhY2hlSG9tZSwge1xuXHRcdFx0XHRcdFx0aWNvbjogb3B0aW9ucy5pY29uID09PSBudWxsID8gdW5kZWZpbmVkIDogb3B0aW9ucy5pY29uID8/IGV4aXN0aW5nLmljb24sXG5cdFx0XHRcdFx0XHR0cmFuc2llbnQ6IG9wdGlvbnMudHJhbnNpZW50ID8/IGV4aXN0aW5nLmlzVHJhbnNpZW50LFxuXHRcdFx0XHRcdFx0dXNlRGVmYXVsdEZsYWdzOiBvcHRpb25zLnVzZURlZmF1bHRGbGFncyA/PyBleGlzdGluZy51c2VEZWZhdWx0RmxhZ3MsXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VzOiBvcHRpb25zLndvcmtzcGFjZXMgPz8gZXhpc3Rpbmcud29ya3NwYWNlcyxcblx0XHRcdFx0XHR9LCB0aGlzLmRlZmF1bHRQcm9maWxlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChvcHRpb25zLndvcmtzcGFjZXMpIHtcblx0XHRcdFx0XHRwcm9maWxlVG9VcGRhdGUgPSBleGlzdGluZztcblx0XHRcdFx0XHRwcm9maWxlVG9VcGRhdGUud29ya3NwYWNlcyA9IG9wdGlvbnMud29ya3NwYWNlcztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRlbHNlIGlmIChvcHRpb25zLndvcmtzcGFjZXMpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlcyA9IGV4aXN0aW5nLndvcmtzcGFjZXM/LmZpbHRlcih3MSA9PiAhb3B0aW9ucy53b3Jrc3BhY2VzPy5zb21lKHcyID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHcxLCB3MikpKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nLndvcmtzcGFjZXM/Lmxlbmd0aCAhPT0gd29ya3NwYWNlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cHJvZmlsZVRvVXBkYXRlID0gZXhpc3Rpbmc7XG5cdFx0XHRcdFx0cHJvZmlsZVRvVXBkYXRlLndvcmtzcGFjZXMgPSB3b3Jrc3BhY2VzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9maWxlVG9VcGRhdGUpIHtcblx0XHRcdFx0cHJvZmlsZXNUb1VwZGF0ZS5wdXNoKHByb2ZpbGVUb1VwZGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFwcm9maWxlc1RvVXBkYXRlLmxlbmd0aCkge1xuXHRcdFx0aWYgKHByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVwZGF0ZSBkZWZhdWx0IHByb2ZpbGUnKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvZmlsZSAnJHtwcm9maWxlLm5hbWV9JyBkb2VzIG5vdCBleGlzdGApO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlUHJvZmlsZXMoW10sIFtdLCBwcm9maWxlc1RvVXBkYXRlKTtcblxuXHRcdGNvbnN0IHVwZGF0ZWRQcm9maWxlID0gdGhpcy5wcm9maWxlcy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvZmlsZS5pZCk7XG5cdFx0aWYgKCF1cGRhdGVkUHJvZmlsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm9maWxlICcke3Byb2ZpbGUubmFtZX0nIHdhcyBub3QgdXBkYXRlZGApO1xuXHRcdH1cblxuXHRcdHJldHVybiB1cGRhdGVkUHJvZmlsZTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZVByb2ZpbGUocHJvZmlsZVRvUmVtb3ZlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHByb2ZpbGVUb1JlbW92ZS5pc0RlZmF1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlbW92ZSBkZWZhdWx0IHByb2ZpbGUnKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHByb2ZpbGVUb1JlbW92ZS5pZCk7XG5cdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb2ZpbGUgJyR7cHJvZmlsZVRvUmVtb3ZlLm5hbWV9JyBkb2VzIG5vdCBleGlzdGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGpvaW5lcnM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdHRoaXMuX29uV2lsbFJlbW92ZVByb2ZpbGUuZmlyZSh7XG5cdFx0XHRwcm9maWxlLFxuXHRcdFx0am9pbihwcm9taXNlKSB7XG5cdFx0XHRcdGpvaW5lcnMucHVzaChwcm9taXNlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoam9pbmVycyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVQcm9maWxlcyhbXSwgW3Byb2ZpbGVdLCBbXSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwocHJvZmlsZS5jYWNoZUhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldFByb2ZpbGVGb3JXb3Jrc3BhY2Uod29ya3NwYWNlSWRlbnRpZmllcjogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIHByb2ZpbGVUb1NldDogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb2ZpbGUgPSB0aGlzLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlkID09PSBwcm9maWxlVG9TZXQuaWQpO1xuXHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm9maWxlICcke3Byb2ZpbGVUb1NldC5uYW1lfScgZG9lcyBub3QgZXhpc3RgKTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmdldFdvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyKTtcblx0XHRpZiAoVVJJLmlzVXJpKHdvcmtzcGFjZSkpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZXMgPSBwcm9maWxlLndvcmtzcGFjZXMgPyBbLi4ucHJvZmlsZS53b3Jrc3BhY2VzXSA6IFtdO1xuXHRcdFx0aWYgKCF3b3Jrc3BhY2VzLnNvbWUodyA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh3LCB3b3Jrc3BhY2UpKSkge1xuXHRcdFx0XHR3b3Jrc3BhY2VzLnB1c2god29ya3NwYWNlKTtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVQcm9maWxlKHByb2ZpbGUsIHsgd29ya3NwYWNlcyB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy51cGRhdGVFbXB0eVdpbmRvd0Fzc29jaWF0aW9uKHdvcmtzcGFjZSwgcHJvZmlsZSwgZmFsc2UpO1xuXHRcdFx0dGhpcy51cGRhdGVTdG9yZWRQcm9maWxlcyh0aGlzLnByb2ZpbGVzKTtcblx0XHR9XG5cdH1cblxuXHR1bnNldFdvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgdHJhbnNpZW50OiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmdldFdvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyKTtcblx0XHRpZiAoVVJJLmlzVXJpKHdvcmtzcGFjZSkpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRseUFzc29jaWF0ZWRQcm9maWxlID0gdGhpcy5nZXRQcm9maWxlRm9yV29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdFx0aWYgKGN1cnJlbnRseUFzc29jaWF0ZWRQcm9maWxlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlUHJvZmlsZShjdXJyZW50bHlBc3NvY2lhdGVkUHJvZmlsZSwgeyB3b3Jrc3BhY2VzOiBjdXJyZW50bHlBc3NvY2lhdGVkUHJvZmlsZS53b3Jrc3BhY2VzPy5maWx0ZXIodyA9PiAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodywgd29ya3NwYWNlKSkgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudXBkYXRlRW1wdHlXaW5kb3dBc3NvY2lhdGlvbih3b3Jrc3BhY2UsIHVuZGVmaW5lZCwgdHJhbnNpZW50KTtcblx0XHRcdHRoaXMudXBkYXRlU3RvcmVkUHJvZmlsZXModGhpcy5wcm9maWxlcyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzZXRXb3Jrc3BhY2VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLmNsZWFyKCk7XG5cdFx0dGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy5wcm9maWxlcykge1xuXHRcdFx0KDxNdXRhYmxlPElVc2VyRGF0YVByb2ZpbGU+PnByb2ZpbGUpLndvcmtzcGFjZXMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlUHJvZmlsZXMoW10sIFtdLCB0aGlzLnByb2ZpbGVzKTtcblx0XHR0aGlzLl9vbkRpZFJlc2V0V29ya3NwYWNlcy5maXJlKCk7XG5cdH1cblxuXHRhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModGhpcy5wcm9maWxlc0hvbWUpKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy5wcm9maWxlc0hvbWUpO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbCgoc3RhdC5jaGlsZHJlbiB8fCBbXSlcblx0XHRcdFx0XHQuZmlsdGVyKGNoaWxkID0+IGNoaWxkLmlzRGlyZWN0b3J5ICYmIGNoaWxkLm5hbWUgIT09IFNZU1RFTV9QUk9GSUxFU19IT01FICYmIHRoaXMucHJvZmlsZXMuZXZlcnkocCA9PiAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocC5sb2NhdGlvbiwgY2hpbGQucmVzb3VyY2UpKSlcblx0XHRcdFx0XHQubWFwKGNoaWxkID0+IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGNoaWxkLnJlc291cmNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KSkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIGRlbGV0aW5nIHJlZHVuZGFudCBwcm9maWxlIGZvbGRlcnMnLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5nZXRTdG9yZWRQcm9maWxlcygpO1xuXHRcdFx0Y29uc3QgdmFsaWQ6IFN0b3JlZFVzZXJEYXRhUHJvZmlsZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHN0b3JlZFByb2ZpbGUgb2YgdGhpcy5nZXRTdG9yZWRQcm9maWxlcygpKSB7XG5cdFx0XHRcdGlmICh0aGlzLmlzSW52YWxpZFByb2ZpbGUoc3RvcmVkUHJvZmlsZSkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgSW52YWxpZCB1c2VyIGRhdGEgcHJvZmlsZSBmb3VuZDogJHtzdG9yZWRQcm9maWxlLm5hbWV9YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsaWQucHVzaChzdG9yZWRQcm9maWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4aXN0aW5nLmxlbmd0aCAhPT0gdmFsaWQubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuc2F2ZVN0b3JlZFByb2ZpbGVzKHZhbGlkKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciByZW1vdmluZyBpbnZhbGlkIHN0b3JlZCBwcm9maWxlcycsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjbGVhblVwVHJhbnNpZW50UHJvZmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdW5Bc3NvY2lhdGVkVHJhbnNpZW50UHJvZmlsZXMgPSB0aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LnByb2ZpbGVzLmZpbHRlcihwID0+ICF0aGlzLmlzUHJvZmlsZUFzc29jaWF0ZWRUb1dvcmtzcGFjZShwKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHVuQXNzb2NpYXRlZFRyYW5zaWVudFByb2ZpbGVzLm1hcChwID0+IHRoaXMucmVtb3ZlUHJvZmlsZShwKSkpO1xuXHR9XG5cblx0Z2V0UHJvZmlsZUZvcldvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuZ2V0V29ya3NwYWNlKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXG5cdFx0aWYgKFVSSS5pc1VyaSh3b3Jrc3BhY2UpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHdvcmtzcGFjZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnByb2ZpbGVzLmZpbmQocCA9PiBwLmlzQWdlbnRzV2luZG93UHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFVSSS5pc1VyaSh3b3Jrc3BhY2UpXG5cdFx0XHQ/IHRoaXMucHJvZmlsZXMuZmluZChwID0+IHAud29ya3NwYWNlcz8uc29tZSh3ID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHcsIHdvcmtzcGFjZSkpKVxuXHRcdFx0OiAodGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZ2V0KHdvcmtzcGFjZSkgPz8gdGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZ2V0KHdvcmtzcGFjZSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFdvcmtzcGFjZSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IFVSSSB8IHN0cmluZyB7XG5cdFx0aWYgKGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VJZGVudGlmaWVyKSkge1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZUlkZW50aWZpZXIudXJpO1xuXHRcdH1cblx0XHRpZiAoaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlSWRlbnRpZmllci5jb25maWdQYXRoO1xuXHRcdH1cblx0XHRyZXR1cm4gd29ya3NwYWNlSWRlbnRpZmllci5pZDtcblx0fVxuXG5cdHByaXZhdGUgaXNQcm9maWxlQXNzb2NpYXRlZFRvV29ya3NwYWNlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRpZiAocHJvZmlsZS53b3Jrc3BhY2VzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoWy4uLnRoaXMucHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLnZhbHVlcygpXS5zb21lKHdpbmRvd1Byb2ZpbGUgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod2luZG93UHJvZmlsZS5sb2NhdGlvbiwgcHJvZmlsZS5sb2NhdGlvbikpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKFsuLi50aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy52YWx1ZXMoKV0uc29tZSh3aW5kb3dQcm9maWxlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHdpbmRvd1Byb2ZpbGUubG9jYXRpb24sIHByb2ZpbGUubG9jYXRpb24pKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJvZmlsZXMoYWRkZWQ6IElVc2VyRGF0YVByb2ZpbGVbXSwgcmVtb3ZlZDogSVVzZXJEYXRhUHJvZmlsZVtdLCB1cGRhdGVkOiBJVXNlckRhdGFQcm9maWxlW10sIGRvbm90VHJpZ2dlcjogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgYWxsUHJvZmlsZXM6IE11dGFibGU8SVVzZXJEYXRhUHJvZmlsZT5bXSA9IFsuLi50aGlzLnByb2ZpbGVzLCAuLi5hZGRlZF07XG5cblx0XHRjb25zdCB0cmFuc2llbnRQcm9maWxlcyA9IHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QucHJvZmlsZXM7XG5cdFx0dGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5wcm9maWxlcyA9IFtdO1xuXG5cdFx0Y29uc3QgcHJvZmlsZXM6IElVc2VyRGF0YVByb2ZpbGVbXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgcHJvZmlsZSBvZiBhbGxQcm9maWxlcykge1xuXHRcdFx0Ly8gcmVtb3ZlZFxuXHRcdFx0aWYgKHJlbW92ZWQuc29tZShwID0+IHByb2ZpbGUuaWQgPT09IHAuaWQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgd2luZG93SWQgb2YgWy4uLnRoaXMucHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLmtleXMoKV0pIHtcblx0XHRcdFx0XHRpZiAocHJvZmlsZS5pZCA9PT0gdGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZ2V0KHdpbmRvd0lkKT8uaWQpIHtcblx0XHRcdFx0XHRcdHRoaXMucHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLmRlbGV0ZSh3aW5kb3dJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHByb2ZpbGUgPSB1cGRhdGVkLmZpbmQocCA9PiBwcm9maWxlLmlkID09PSBwLmlkKSA/PyBwcm9maWxlO1xuXHRcdFx0XHRjb25zdCB0cmFuc2llbnRQcm9maWxlID0gdHJhbnNpZW50UHJvZmlsZXMuZmluZChwID0+IHByb2ZpbGUuaWQgPT09IHAuaWQpO1xuXHRcdFx0XHRpZiAocHJvZmlsZS5pc1RyYW5zaWVudCkge1xuXHRcdFx0XHRcdHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QucHJvZmlsZXMucHVzaChwcm9maWxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAodHJhbnNpZW50UHJvZmlsZSkge1xuXHRcdFx0XHRcdFx0Ly8gTW92ZSB0aGUgZW1wdHkgd2luZG93IGFzc29jaWF0aW9ucyBmcm9tIHRoZSB0cmFuc2llbnQgcHJvZmlsZSB0byB0aGUgcGVyc2lzdGVkIHByb2ZpbGVcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgW3dpbmRvd0lkLCBwXSBvZiB0aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5lbnRyaWVzKCkpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHByb2ZpbGUuaWQgPT09IHAuaWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5kZWxldGUod2luZG93SWQpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMucHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLnNldCh3aW5kb3dJZCwgcHJvZmlsZSk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb2ZpbGUud29ya3NwYWNlcz8ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHByb2ZpbGUud29ya3NwYWNlcyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cHJvZmlsZXMucHVzaChwcm9maWxlKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVN0b3JlZFByb2ZpbGVzKHByb2ZpbGVzKTtcblxuXHRcdGlmICghZG9ub3RUcmlnZ2VyKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJQcm9maWxlc0NoYW5nZXMoYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCB0cmlnZ2VyUHJvZmlsZXNDaGFuZ2VzKGFkZGVkOiBJVXNlckRhdGFQcm9maWxlW10sIHJlbW92ZWQ6IElVc2VyRGF0YVByb2ZpbGVbXSwgdXBkYXRlZDogSVVzZXJEYXRhUHJvZmlsZVtdKSB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9maWxlcy5maXJlKHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQsIGFsbDogdGhpcy5wcm9maWxlcyB9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRW1wdHlXaW5kb3dBc3NvY2lhdGlvbih3aW5kb3dJZDogc3RyaW5nLCBuZXdQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkLCB0cmFuc2llbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBGb3JjZSB0cmFuc2llbnQgaWYgdGhlIG5ldyBwcm9maWxlIHRvIGFzc29jaWF0ZSBpcyB0cmFuc2llbnRcblx0XHR0cmFuc2llbnQgPSBuZXdQcm9maWxlPy5pc1RyYW5zaWVudCA/IHRydWUgOiB0cmFuc2llbnQ7XG5cblx0XHRpZiAodHJhbnNpZW50KSB7XG5cdFx0XHRpZiAobmV3UHJvZmlsZSkge1xuXHRcdFx0XHR0aGlzLnRyYW5zaWVudFByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5zZXQod2luZG93SWQsIG5ld1Byb2ZpbGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cmFuc2llbnRQcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZGVsZXRlKHdpbmRvd0lkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdC8vIFVuc2V0IHRoZSB0cmFuc2lldCBhc3NvY2lhdGlvbiBpZiBhbnlcblx0XHRcdHRoaXMudHJhbnNpZW50UHJvZmlsZXNPYmplY3QuZW1wdHlXaW5kb3dzLmRlbGV0ZSh3aW5kb3dJZCk7XG5cdFx0XHRpZiAobmV3UHJvZmlsZSkge1xuXHRcdFx0XHR0aGlzLnByb2ZpbGVzT2JqZWN0LmVtcHR5V2luZG93cy5zZXQod2luZG93SWQsIG5ld1Byb2ZpbGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZGVsZXRlKHdpbmRvd0lkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0b3JlZFByb2ZpbGVzKHByb2ZpbGVzOiBJVXNlckRhdGFQcm9maWxlW10pOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWRQcm9maWxlczogU3RvcmVkVXNlckRhdGFQcm9maWxlW10gPSBbXTtcblx0XHRjb25zdCB3b3Jrc3BhY2VzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0ge307XG5cdFx0Y29uc3QgZW1wdHlXaW5kb3dzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0ge307XG5cblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgcHJvZmlsZXMpIHtcblx0XHRcdGlmIChwcm9maWxlLmlzVHJhbnNpZW50KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRzdG9yZWRQcm9maWxlcy5wdXNoKHtcblx0XHRcdFx0XHRsb2NhdGlvbjogcHJvZmlsZS5sb2NhdGlvbixcblx0XHRcdFx0XHRuYW1lOiBwcm9maWxlLm5hbWUsXG5cdFx0XHRcdFx0aWNvbjogcHJvZmlsZS5pY29uLFxuXHRcdFx0XHRcdHVzZURlZmF1bHRGbGFnczogcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2ZpbGUud29ya3NwYWNlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZSBvZiBwcm9maWxlLndvcmtzcGFjZXMpIHtcblx0XHRcdFx0XHR3b3Jrc3BhY2VzW3dvcmtzcGFjZS50b1N0cmluZygpXSA9IHByb2ZpbGUuaWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFt3aW5kb3dJZCwgcHJvZmlsZV0gb2YgdGhpcy5wcm9maWxlc09iamVjdC5lbXB0eVdpbmRvd3MuZW50cmllcygpKSB7XG5cdFx0XHRlbXB0eVdpbmRvd3Nbd2luZG93SWQudG9TdHJpbmcoKV0gPSBwcm9maWxlLmlkO1xuXHRcdH1cblxuXHRcdHRoaXMuc2F2ZVN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnMoeyB3b3Jrc3BhY2VzLCBlbXB0eVdpbmRvd3MgfSk7XG5cdFx0dGhpcy5zYXZlU3RvcmVkUHJvZmlsZXMoc3RvcmVkUHJvZmlsZXMpO1xuXHRcdHRoaXMuX3Byb2ZpbGVzT2JqZWN0ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFN0b3JlZFByb2ZpbGVzKCk6IFN0b3JlZFVzZXJEYXRhUHJvZmlsZVtdIHsgcmV0dXJuIFtdOyB9XG5cdHByb3RlY3RlZCBzYXZlU3RvcmVkUHJvZmlsZXMoc3RvcmVkUHJvZmlsZXM6IFN0b3JlZFVzZXJEYXRhUHJvZmlsZVtdKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblxuXHRwcm90ZWN0ZWQgZ2V0U3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucygpOiBTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zIHsgcmV0dXJuIHt9OyB9XG5cdHByb3RlY3RlZCBzYXZlU3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucyhzdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zOiBTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0cHJvdGVjdGVkIGdldERlZmF1bHRQcm9maWxlRXh0ZW5zaW9uc0xvY2F0aW9uKCk6IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEluTWVtb3J5VXNlckRhdGFQcm9maWxlc1NlcnZpY2UgZXh0ZW5kcyBVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB7XG5cdHByaXZhdGUgc3RvcmVkUHJvZmlsZXM6IFN0b3JlZFVzZXJEYXRhUHJvZmlsZVtdID0gW107XG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRTdG9yZWRQcm9maWxlcygpOiBTdG9yZWRVc2VyRGF0YVByb2ZpbGVbXSB7IHJldHVybiB0aGlzLnN0b3JlZFByb2ZpbGVzOyB9XG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RvcmVkUHJvZmlsZXMoc3RvcmVkUHJvZmlsZXM6IFN0b3JlZFVzZXJEYXRhUHJvZmlsZVtdKTogdm9pZCB7IHRoaXMuc3RvcmVkUHJvZmlsZXMgPSBzdG9yZWRQcm9maWxlczsgfVxuXG5cdHByaXZhdGUgc3RvcmVkUHJvZmlsZUFzc29jaWF0aW9uczogU3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucyA9IHt9O1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0U3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucygpOiBTdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zIHsgcmV0dXJuIHRoaXMuc3RvcmVkUHJvZmlsZUFzc29jaWF0aW9uczsgfVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnMoc3RvcmVkUHJvZmlsZUFzc29jaWF0aW9uczogU3RvcmVkUHJvZmlsZUFzc29jaWF0aW9ucyk6IHZvaWQgeyB0aGlzLnN0b3JlZFByb2ZpbGVBc3NvY2lhdGlvbnMgPSBzdG9yZWRQcm9maWxlQXNzb2NpYXRpb25zOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyxXQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQixjQUFjLDZCQUE2QjtBQUN6RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixT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
