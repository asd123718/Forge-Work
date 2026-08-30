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
import { Action, Separator, toAction } from "../../../../base/common/actions.js";
import { Emitter } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isUserDataProfile, IUserDataProfilesService, ProfileResourceType, toUserDataProfile } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { isProfileURL, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import * as arrays from "../../../../base/common/arrays.js";
import { equals } from "../../../../base/common/objects.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { ExtensionsResourceExportTreeItem, ExtensionsResourceImportTreeItem } from "../../../services/userDataProfile/browser/extensionsResource.js";
import { SettingsResource, SettingsResourceTreeItem } from "../../../services/userDataProfile/browser/settingsResource.js";
import { KeybindingsResource, KeybindingsResourceTreeItem } from "../../../services/userDataProfile/browser/keybindingsResource.js";
import { TasksResource, TasksResourceTreeItem } from "../../../services/userDataProfile/browser/tasksResource.js";
import { SnippetsResource, SnippetsResourceTreeItem } from "../../../services/userDataProfile/browser/snippetsResource.js";
import { McpProfileResource, McpResourceTreeItem } from "../../../services/userDataProfile/browser/mcpProfileResource.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InMemoryFileSystemProvider } from "../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { createCancelablePromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CONFIG_NEW_WINDOW_PROFILE } from "../../../common/configuration.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IWorkspaceContextService, WORKSPACE_SUFFIX } from "../../../../platform/workspace/common/workspace.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isString } from "../../../../base/common/types.js";
import { IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
function isProfileResourceTypeElement(element) {
  return element.resourceType !== void 0;
}
function isProfileResourceChildElement(element) {
  return element.label !== void 0;
}
let AbstractUserDataProfileElement = class extends Disposable {
  constructor(name, icon, flags, workspaces, isActive, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
    super();
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfilesService = userDataProfilesService;
    this.commandService = commandService;
    this.workspaceContextService = workspaceContextService;
    this.hostService = hostService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.extensionManagementService = extensionManagementService;
    this.instantiationService = instantiationService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.saveScheduler = this._register(new RunOnceScheduler(() => this.doSave(), 500));
    this._name = "";
    this._active = false;
    this._disabled = false;
    this._name = name;
    this._icon = icon;
    this._flags = flags;
    this._workspaces = workspaces;
    this._active = isActive;
    this._register(this.onDidChange((e) => {
      if (!e.message) {
        this.validate();
      }
      this.save();
    }));
    this._register(this.extensionManagementService.onProfileAwareDidInstallExtensions((results) => {
      const profile = this.getProfileToWatch();
      if (profile && results.some((r) => !r.error && (r.applicationScoped || this.uriIdentityService.extUri.isEqual(r.profileLocation, profile.extensionsResource)))) {
        this._onDidChange.fire({ extensions: true });
      }
    }));
    this._register(this.extensionManagementService.onProfileAwareDidUninstallExtension((e) => {
      const profile = this.getProfileToWatch();
      if (profile && !e.error && (e.applicationScoped || this.uriIdentityService.extUri.isEqual(e.profileLocation, profile.extensionsResource))) {
        this._onDidChange.fire({ extensions: true });
      }
    }));
    this._register(this.extensionManagementService.onProfileAwareDidUpdateExtensionMetadata((e) => {
      const profile = this.getProfileToWatch();
      if (profile && e.local.isApplicationScoped || this.uriIdentityService.extUri.isEqual(e.profileLocation, profile?.extensionsResource)) {
        this._onDidChange.fire({ extensions: true });
      }
    }));
  }
  get name() {
    return this._name;
  }
  set name(name) {
    name = name.trim();
    if (this._name !== name) {
      this._name = name;
      this._onDidChange.fire({ name: true });
    }
  }
  get icon() {
    return this._icon;
  }
  set icon(icon) {
    if (this._icon !== icon) {
      this._icon = icon;
      this._onDidChange.fire({ icon: true });
    }
  }
  get workspaces() {
    return this._workspaces;
  }
  set workspaces(workspaces) {
    if (!arrays.equals(this._workspaces, workspaces, (a, b) => a.toString() === b.toString())) {
      this._workspaces = workspaces;
      this._onDidChange.fire({ workspaces: true });
    }
  }
  get flags() {
    return this._flags;
  }
  set flags(flags) {
    if (!equals(this._flags, flags)) {
      this._flags = flags;
      this._onDidChange.fire({ flags: true });
    }
  }
  get active() {
    return this._active;
  }
  set active(active) {
    if (this._active !== active) {
      this._active = active;
      this._onDidChange.fire({ active: true });
    }
  }
  get message() {
    return this._message;
  }
  set message(message) {
    if (this._message !== message) {
      this._message = message;
      this._onDidChange.fire({ message: true });
    }
  }
  get disabled() {
    return this._disabled;
  }
  set disabled(saving) {
    if (this._disabled !== saving) {
      this._disabled = saving;
      this._onDidChange.fire({ disabled: true });
    }
  }
  getFlag(key) {
    return this.flags?.[key] ?? false;
  }
  setFlag(key, value) {
    const flags = this.flags ? { ...this.flags } : {};
    if (value) {
      flags[key] = true;
    } else {
      delete flags[key];
    }
    this.flags = flags;
  }
  validate() {
    if (!this.name) {
      this.message = localize("name required", "Profile name is required and must be a non-empty value.");
      return;
    }
    if (this.shouldValidateName() && this.name !== this.getInitialName() && this.userDataProfilesService.profiles.some((p) => p.name === this.name)) {
      this.message = localize("profileExists", "Profile with name {0} already exists.", this.name);
      return;
    }
    if (this.flags && this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.snippets && this.flags.extensions) {
      this.message = localize("invalid configurations", "The profile should contain at least one configuration.");
      return;
    }
    this.message = void 0;
  }
  async getChildren(resourceType) {
    if (resourceType === void 0) {
      const resourceTypes = [
        ProfileResourceType.Settings,
        ProfileResourceType.Keybindings,
        ProfileResourceType.Tasks,
        ProfileResourceType.Mcp,
        ProfileResourceType.Snippets,
        ProfileResourceType.Extensions
      ];
      return Promise.all(resourceTypes.map(async (r) => {
        const children = r === ProfileResourceType.Settings || r === ProfileResourceType.Keybindings || r === ProfileResourceType.Tasks || r === ProfileResourceType.Mcp ? await this.getChildrenForResourceType(r) : [];
        return {
          handle: r,
          checkbox: void 0,
          resourceType: r,
          openAction: children.length ? toAction({
            id: "_open",
            label: localize("open", "Open to the Side"),
            class: ThemeIcon.asClassName(Codicon.goToFile),
            run: () => children[0]?.openAction?.run()
          }) : void 0
        };
      }));
    }
    return this.getChildrenForResourceType(resourceType);
  }
  async getChildrenForResourceType(resourceType) {
    return [];
  }
  async getChildrenFromProfile(profile, resourceType) {
    profile = this.getFlag(resourceType) ? this.userDataProfilesService.defaultProfile : profile;
    let children = [];
    switch (resourceType) {
      case ProfileResourceType.Settings:
        children = await this.instantiationService.createInstance(SettingsResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Keybindings:
        children = await this.instantiationService.createInstance(KeybindingsResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Snippets:
        children = await this.instantiationService.createInstance(SnippetsResourceTreeItem, profile).getChildren() ?? [];
        break;
      case ProfileResourceType.Tasks:
        children = await this.instantiationService.createInstance(TasksResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Mcp:
        children = await this.instantiationService.createInstance(McpResourceTreeItem, profile).getChildren();
        break;
      case ProfileResourceType.Extensions:
        children = await this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, profile).getChildren();
        break;
    }
    return children.map((child) => this.toUserDataProfileResourceChildElement(child));
  }
  toUserDataProfileResourceChildElement(child, primaryActions, contextMenuActions) {
    return {
      handle: child.handle,
      checkbox: child.checkbox,
      label: child.label ? isMarkdownString(child.label.label) ? child.label.label.value : child.label.label : "",
      description: isString(child.description) ? child.description : void 0,
      resource: URI.revive(child.resourceUri),
      icon: child.themeIcon,
      openAction: toAction({
        id: "_openChild",
        label: localize("open", "Open to the Side"),
        class: ThemeIcon.asClassName(Codicon.goToFile),
        run: async () => {
          if (child.parent.type === ProfileResourceType.Extensions) {
            await this.commandService.executeCommand("extension.open", child.handle, void 0, true, void 0, true);
          } else if (child.resourceUri) {
            await this.commandService.executeCommand(API_OPEN_EDITOR_COMMAND_ID, child.resourceUri, [SIDE_GROUP], void 0);
          }
        }
      }),
      actions: {
        primary: primaryActions,
        contextMenu: contextMenuActions
      }
    };
  }
  getInitialName() {
    return "";
  }
  shouldValidateName() {
    return true;
  }
  getCurrentWorkspace() {
    const workspace = this.workspaceContextService.getWorkspace();
    return workspace.configuration ?? workspace.folders[0]?.uri;
  }
  openWorkspace(workspace) {
    if (this.uriIdentityService.extUri.extname(workspace) === WORKSPACE_SUFFIX) {
      this.hostService.openWindow([{ workspaceUri: workspace }], { forceNewWindow: true });
    } else {
      this.hostService.openWindow([{ folderUri: workspace }], { forceNewWindow: true });
    }
  }
  save() {
    this.saveScheduler.schedule();
  }
  hasUnsavedChanges(profile) {
    if (this.name !== profile.name) {
      return true;
    }
    if (this.icon !== profile.icon) {
      return true;
    }
    if (!equals(this.flags ?? {}, profile.useDefaultFlags ?? {})) {
      return true;
    }
    if (!arrays.equals(this.workspaces ?? [], profile.workspaces ?? [], (a, b) => a.toString() === b.toString())) {
      return true;
    }
    return false;
  }
  async saveProfile(profile) {
    if (!this.hasUnsavedChanges(profile)) {
      return;
    }
    this.validate();
    if (this.message) {
      return;
    }
    const useDefaultFlags = this.flags ? this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.globalState && this.flags.extensions ? void 0 : this.flags : void 0;
    return await this.userDataProfileManagementService.updateProfile(profile, {
      name: this.name,
      icon: this.icon,
      useDefaultFlags: profile.useDefaultFlags && !useDefaultFlags ? {} : useDefaultFlags,
      workspaces: this.workspaces
    });
  }
};
AbstractUserDataProfileElement = __decorateClass([
  __decorateParam(5, IUserDataProfileManagementService),
  __decorateParam(6, IUserDataProfilesService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IFileService),
  __decorateParam(12, IWorkbenchExtensionManagementService),
  __decorateParam(13, IInstantiationService)
], AbstractUserDataProfileElement);
let UserDataProfileElement = class extends AbstractUserDataProfileElement {
  constructor(_profile, titleButtons, actions, userDataProfileService, configurationService, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
    super(
      _profile.name,
      _profile.icon,
      _profile.useDefaultFlags,
      _profile.workspaces,
      userDataProfileService.currentProfile.id === _profile.id,
      userDataProfileManagementService,
      userDataProfilesService,
      commandService,
      workspaceContextService,
      hostService,
      uriIdentityService,
      fileService,
      extensionManagementService,
      instantiationService
    );
    this._profile = _profile;
    this.titleButtons = titleButtons;
    this.actions = actions;
    this.userDataProfileService = userDataProfileService;
    this.configurationService = configurationService;
    this._isNewWindowProfile = false;
    this._isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
    this._register(configurationService.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration(CONFIG_NEW_WINDOW_PROFILE)) {
          this.isNewWindowProfile = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE) === this.profile.name;
        }
      }
    ));
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.active = this.userDataProfileService.currentProfile.id === this.profile.id));
    this._register(this.userDataProfilesService.onDidChangeProfiles(({ updated }) => {
      const profile = updated.find((p) => p.id === this.profile.id);
      if (profile) {
        this._profile = profile;
        this.reset();
        this._onDidChange.fire({ profile: true });
      }
    }));
    this._register(fileService.watch(this.profile.snippetsHome));
    this._register(fileService.onDidFilesChange((e) => {
      if (e.affects(this.profile.snippetsHome)) {
        this._onDidChange.fire({ snippets: true });
      }
    }));
  }
  get profile() {
    return this._profile;
  }
  getProfileToWatch() {
    return this.profile;
  }
  reset() {
    this.name = this._profile.name;
    this.icon = this._profile.icon;
    this.flags = this._profile.useDefaultFlags;
    this.workspaces = this._profile.workspaces;
  }
  updateWorkspaces(toAdd, toRemove) {
    const workspaces = new ResourceSet(this.workspaces ?? []);
    for (const workspace of toAdd) {
      workspaces.add(workspace);
    }
    for (const workspace of toRemove) {
      workspaces.delete(workspace);
    }
    this.workspaces = [...workspaces.values()];
  }
  async toggleNewWindowProfile() {
    if (this._isNewWindowProfile) {
      await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, null);
    } else {
      await this.configurationService.updateValue(CONFIG_NEW_WINDOW_PROFILE, this.profile.name);
    }
  }
  get isNewWindowProfile() {
    return this._isNewWindowProfile;
  }
  set isNewWindowProfile(isNewWindowProfile) {
    if (this._isNewWindowProfile !== isNewWindowProfile) {
      this._isNewWindowProfile = isNewWindowProfile;
      this._onDidChange.fire({ newWindowProfile: true });
    }
  }
  async toggleCurrentWindowProfile() {
    if (this.userDataProfileService.currentProfile.id === this.profile.id) {
      await this.userDataProfileManagementService.switchProfile(this.userDataProfilesService.defaultProfile);
    } else {
      await this.userDataProfileManagementService.switchProfile(this.profile);
    }
  }
  async doSave() {
    await this.saveProfile(this.profile);
  }
  async getChildrenForResourceType(resourceType) {
    if (resourceType === ProfileResourceType.Extensions) {
      const children = await this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, this.profile).getChildren();
      return children.map((child) => this.toUserDataProfileResourceChildElement(
        child,
        void 0,
        [{
          id: "applyToAllProfiles",
          label: localize("applyToAllProfiles", "Apply Extension to all Profiles"),
          checked: child.applicationScoped,
          enabled: true,
          class: "",
          tooltip: "",
          run: async () => {
            const extensions = await this.extensionManagementService.getInstalled(void 0, this.profile.extensionsResource);
            const extension = extensions.find((e) => areSameExtensions(e.identifier, child.identifier));
            if (extension) {
              await this.extensionManagementService.toggleApplicationScope(extension, this.profile.extensionsResource);
            }
          }
        }]
      ));
    }
    return this.getChildrenFromProfile(this.profile, resourceType);
  }
  getInitialName() {
    return this.profile.name;
  }
};
UserDataProfileElement = __decorateClass([
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IUserDataProfileManagementService),
  __decorateParam(6, IUserDataProfilesService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IFileService),
  __decorateParam(12, IWorkbenchExtensionManagementService),
  __decorateParam(13, IInstantiationService)
], UserDataProfileElement);
const USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME = "userdataprofiletemplatepreview";
let NewProfileElement = class extends AbstractUserDataProfileElement {
  constructor(copyFrom, titleButtons, actions, userDataProfileImportExportService, userDataProfileManagementService, userDataProfilesService, commandService, workspaceContextService, hostService, uriIdentityService, fileService, extensionManagementService, instantiationService) {
    super(
      "",
      void 0,
      void 0,
      void 0,
      false,
      userDataProfileManagementService,
      userDataProfilesService,
      commandService,
      workspaceContextService,
      hostService,
      uriIdentityService,
      fileService,
      extensionManagementService,
      instantiationService
    );
    this.titleButtons = titleButtons;
    this.actions = actions;
    this.userDataProfileImportExportService = userDataProfileImportExportService;
    this._copyFromTemplates = new ResourceMap();
    this.template = null;
    this.previewProfileWatchDisposables = this._register(new DisposableStore());
    this.name = this.defaultName = this.getNewProfileName();
    this._copyFrom = copyFrom;
    this._copyFlags = this.getCopyFlagsFrom(copyFrom);
    this.initialize();
    this._register(this.fileService.registerProvider(USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, this._register(new InMemoryFileSystemProvider())));
    this._register(toDisposable(() => {
      if (this.previewProfile) {
        this.userDataProfilesService.removeProfile(this.previewProfile);
      }
    }));
  }
  get copyFromTemplates() {
    return this._copyFromTemplates;
  }
  get copyFrom() {
    return this._copyFrom;
  }
  set copyFrom(copyFrom) {
    if (this._copyFrom !== copyFrom) {
      this._copyFrom = copyFrom;
      this._onDidChange.fire({ copyFrom: true });
      this.flags = void 0;
      this.copyFlags = this.getCopyFlagsFrom(copyFrom);
      if (copyFrom instanceof URI) {
        this.templatePromise?.cancel();
        this.templatePromise = void 0;
      }
      this.initialize();
    }
  }
  get copyFlags() {
    return this._copyFlags;
  }
  set copyFlags(flags) {
    if (!equals(this._copyFlags, flags)) {
      this._copyFlags = flags;
      this._onDidChange.fire({ copyFlags: true });
    }
  }
  get previewProfile() {
    return this._previewProfile;
  }
  set previewProfile(profile) {
    if (this._previewProfile !== profile) {
      this._previewProfile = profile;
      this._onDidChange.fire({ preview: true });
      this.previewProfileWatchDisposables.clear();
      if (this._previewProfile) {
        this.previewProfileWatchDisposables.add(this.fileService.watch(this._previewProfile.snippetsHome));
        this.previewProfileWatchDisposables.add(this.fileService.onDidFilesChange((e) => {
          if (!this._previewProfile) {
            return;
          }
          if (e.affects(this._previewProfile.snippetsHome)) {
            this._onDidChange.fire({ snippets: true });
          }
        }));
      }
    }
  }
  getProfileToWatch() {
    return this.previewProfile;
  }
  getCopyFlagsFrom(copyFrom) {
    return copyFrom ? {
      settings: true,
      keybindings: true,
      snippets: true,
      tasks: true,
      extensions: true,
      mcp: true
    } : void 0;
  }
  async initialize() {
    this.disabled = true;
    try {
      if (this.copyFrom instanceof URI) {
        await this.resolveTemplate(this.copyFrom);
        if (this.template) {
          this.copyFromTemplates.set(this.copyFrom, this.template.name);
          if (this.defaultName === this.name) {
            this.name = this.defaultName = this.template.name ?? "";
          }
          if (this.defaultIcon === this.icon) {
            this.icon = this.defaultIcon = this.template.icon;
          }
          this.setCopyFlag(ProfileResourceType.Settings, !!this.template.settings);
          this.setCopyFlag(ProfileResourceType.Keybindings, !!this.template.keybindings);
          this.setCopyFlag(ProfileResourceType.Tasks, !!this.template.tasks);
          this.setCopyFlag(ProfileResourceType.Snippets, !!this.template.snippets);
          this.setCopyFlag(ProfileResourceType.Extensions, !!this.template.extensions);
          this.setCopyFlag(ProfileResourceType.Mcp, !!this.template.mcp);
          this._onDidChange.fire({ copyFromInfo: true });
        }
        return;
      }
      if (isUserDataProfile(this.copyFrom)) {
        if (this.defaultName === this.name) {
          this.name = this.defaultName = localize("copy from", "{0} (Copy)", this.copyFrom.name);
        }
        if (this.defaultIcon === this.icon) {
          this.icon = this.defaultIcon = this.copyFrom.icon;
        }
        this.setCopyFlag(ProfileResourceType.Settings, true);
        this.setCopyFlag(ProfileResourceType.Keybindings, true);
        this.setCopyFlag(ProfileResourceType.Tasks, true);
        this.setCopyFlag(ProfileResourceType.Snippets, true);
        this.setCopyFlag(ProfileResourceType.Extensions, true);
        this.setCopyFlag(ProfileResourceType.Mcp, true);
        this._onDidChange.fire({ copyFromInfo: true });
        return;
      }
      if (this.defaultName === this.name) {
        this.name = this.defaultName = this.getNewProfileName();
      }
      if (this.defaultIcon === this.icon) {
        this.icon = this.defaultIcon = void 0;
      }
      this.setCopyFlag(ProfileResourceType.Settings, false);
      this.setCopyFlag(ProfileResourceType.Keybindings, false);
      this.setCopyFlag(ProfileResourceType.Tasks, false);
      this.setCopyFlag(ProfileResourceType.Snippets, false);
      this.setCopyFlag(ProfileResourceType.Extensions, false);
      this.setCopyFlag(ProfileResourceType.Mcp, false);
      this._onDidChange.fire({ copyFromInfo: true });
    } finally {
      this.disabled = false;
    }
  }
  getNewProfileName() {
    const name = localize("untitled", "Untitled");
    const nameRegEx = new RegExp(`${name}\\s(\\d+)`);
    let nameIndex = 0;
    for (const profile of this.userDataProfilesService.profiles) {
      const matches = nameRegEx.exec(profile.name);
      const index = matches ? parseInt(matches[1]) : 0;
      nameIndex = index > nameIndex ? index : nameIndex;
    }
    return `${name} ${nameIndex + 1}`;
  }
  async resolveTemplate(uri) {
    if (!this.templatePromise) {
      this.templatePromise = createCancelablePromise(async (token) => {
        const template = await this.userDataProfileImportExportService.resolveProfileTemplate(uri);
        if (!token.isCancellationRequested) {
          this.template = template;
        }
      });
    }
    await this.templatePromise;
    return this.template;
  }
  hasResource(resourceType) {
    if (this.template) {
      switch (resourceType) {
        case ProfileResourceType.Settings:
          return !!this.template.settings;
        case ProfileResourceType.Keybindings:
          return !!this.template.keybindings;
        case ProfileResourceType.Snippets:
          return !!this.template.snippets;
        case ProfileResourceType.Tasks:
          return !!this.template.tasks;
        case ProfileResourceType.Extensions:
          return !!this.template.extensions;
      }
    }
    return true;
  }
  getCopyFlag(key) {
    return this.copyFlags?.[key] ?? false;
  }
  setCopyFlag(key, value) {
    const flags = this.copyFlags ? { ...this.copyFlags } : {};
    flags[key] = value;
    this.copyFlags = flags;
  }
  getCopyFromName() {
    if (isUserDataProfile(this.copyFrom)) {
      return this.copyFrom.name;
    }
    if (this.copyFrom instanceof URI) {
      return this.copyFromTemplates.get(this.copyFrom);
    }
    return void 0;
  }
  async getChildrenForResourceType(resourceType) {
    if (this.getFlag(resourceType)) {
      return this.getChildrenFromProfile(this.userDataProfilesService.defaultProfile, resourceType);
    }
    if (!this.getCopyFlag(resourceType)) {
      return [];
    }
    if (this.previewProfile) {
      return this.getChildrenFromProfile(this.previewProfile, resourceType);
    }
    if (this.copyFrom instanceof URI) {
      await this.resolveTemplate(this.copyFrom);
      if (!this.template) {
        return [];
      }
      return this.getChildrenFromProfileTemplate(this.template, resourceType);
    }
    if (this.copyFrom) {
      return this.getChildrenFromProfile(this.copyFrom, resourceType);
    }
    return [];
  }
  async getChildrenFromProfileTemplate(profileTemplate, resourceType) {
    const location = URI.from({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, path: `/root/profiles/${profileTemplate.name}` });
    const cacheLocation = URI.from({ scheme: USER_DATA_PROFILE_TEMPLATE_PREVIEW_SCHEME, path: `/root/cache/${profileTemplate.name}` });
    const profile = toUserDataProfile(generateUuid(), this.name, location, cacheLocation);
    switch (resourceType) {
      case ProfileResourceType.Settings:
        if (profileTemplate.settings) {
          await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Keybindings:
        if (profileTemplate.keybindings) {
          await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Snippets:
        if (profileTemplate.snippets) {
          await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Tasks:
        if (profileTemplate.tasks) {
          await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Mcp:
        if (profileTemplate.mcp) {
          await this.instantiationService.createInstance(McpProfileResource).apply(profileTemplate.mcp, profile);
          return this.getChildrenFromProfile(profile, resourceType);
        }
        return [];
      case ProfileResourceType.Extensions:
        if (profileTemplate.extensions) {
          const children = await this.instantiationService.createInstance(ExtensionsResourceImportTreeItem, profileTemplate.extensions).getChildren();
          return children.map((child) => this.toUserDataProfileResourceChildElement(child));
        }
        return [];
    }
    return [];
  }
  shouldValidateName() {
    return !this.copyFrom;
  }
  getInitialName() {
    return this.previewProfile?.name ?? "";
  }
  async doSave() {
    if (this.previewProfile) {
      const profile = await this.saveProfile(this.previewProfile);
      if (profile) {
        this.previewProfile = profile;
      }
    }
  }
};
NewProfileElement = __decorateClass([
  __decorateParam(3, IUserDataProfileImportExportService),
  __decorateParam(4, IUserDataProfileManagementService),
  __decorateParam(5, IUserDataProfilesService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IWorkbenchExtensionManagementService),
  __decorateParam(12, IInstantiationService)
], NewProfileElement);
let UserDataProfilesEditorModel = class extends EditorModel {
  constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, userDataProfileImportExportService, dialogService, telemetryService, hostService, productService, openerService, instantiationService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfileImportExportService = userDataProfileImportExportService;
    this.dialogService = dialogService;
    this.telemetryService = telemetryService;
    this.hostService = hostService;
    this.productService = productService;
    this.openerService = openerService;
    this.instantiationService = instantiationService;
    this._profiles = [];
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    for (const profile of userDataProfilesService.profiles) {
      if (!profile.isInternal) {
        this._profiles.push(this.createProfileElement(profile));
      }
    }
    this._register(toDisposable(() => this._profiles.splice(0, this._profiles.length).map(([, disposables]) => disposables.dispose())));
    this._register(userDataProfilesService.onDidChangeProfiles((e) => this.onDidChangeProfiles(e)));
  }
  static getInstance(instantiationService) {
    if (!UserDataProfilesEditorModel.INSTANCE) {
      UserDataProfilesEditorModel.INSTANCE = instantiationService.createInstance(UserDataProfilesEditorModel);
    }
    return UserDataProfilesEditorModel.INSTANCE;
  }
  get profiles() {
    return this._profiles.map(([profile]) => profile).sort((a, b) => {
      if (a instanceof NewProfileElement) {
        return 1;
      }
      if (b instanceof NewProfileElement) {
        return -1;
      }
      if (a instanceof UserDataProfileElement && a.profile.isDefault) {
        return -1;
      }
      if (b instanceof UserDataProfileElement && b.profile.isDefault) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  onDidChangeProfiles(e) {
    let changed = false;
    for (const profile of e.added) {
      if (!profile.isInternal && profile.name !== this.newProfileElement?.name) {
        changed = true;
        this._profiles.push(this.createProfileElement(profile));
      }
    }
    for (const profile of e.removed) {
      if (profile.id === this.newProfileElement?.previewProfile?.id) {
        this.newProfileElement.previewProfile = void 0;
      }
      const index = this._profiles.findIndex(([p]) => p instanceof UserDataProfileElement && p.profile.id === profile.id);
      if (index !== -1) {
        changed = true;
        this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
      }
    }
    if (changed) {
      this._onDidChange.fire(void 0);
    }
  }
  getTemplates() {
    if (!this.templates) {
      this.templates = this.userDataProfileManagementService.getBuiltinProfileTemplates();
    }
    return this.templates;
  }
  createProfileElement(profile) {
    const disposables = new DisposableStore();
    const activateAction = disposables.add(new Action(
      "userDataProfile.activate",
      localize("active", "Use this Profile for Current Window"),
      ThemeIcon.asClassName(Codicon.check),
      true,
      () => this.userDataProfileManagementService.switchProfile(profileElement.profile)
    ));
    const copyFromProfileAction = disposables.add(new Action(
      "userDataProfile.copyFromProfile",
      localize("copyFromProfile", "Duplicate..."),
      ThemeIcon.asClassName(Codicon.copy),
      true,
      () => this.createNewProfile(profileElement.profile)
    ));
    const exportAction = disposables.add(new Action(
      "userDataProfile.export",
      localize("export", "Export..."),
      ThemeIcon.asClassName(Codicon.export),
      true,
      () => this.userDataProfileImportExportService.exportProfile(profile)
    ));
    const deleteAction = disposables.add(new Action(
      "userDataProfile.delete",
      localize("delete", "Delete"),
      ThemeIcon.asClassName(Codicon.trash),
      true,
      () => this.removeProfile(profileElement.profile)
    ));
    const newWindowAction = disposables.add(new Action(
      "userDataProfile.newWindow",
      localize("open new window", "Open New Window with this Profile"),
      ThemeIcon.asClassName(Codicon.emptyWindow),
      true,
      () => this.openWindow(profileElement.profile)
    ));
    const primaryActions = [];
    primaryActions.push(activateAction);
    primaryActions.push(newWindowAction);
    const secondaryActions = [];
    secondaryActions.push(copyFromProfileAction);
    secondaryActions.push(exportAction);
    if (!profile.isDefault) {
      secondaryActions.push(new Separator());
      secondaryActions.push(deleteAction);
    }
    const profileElement = disposables.add(this.instantiationService.createInstance(
      UserDataProfileElement,
      profile,
      [[], []],
      [primaryActions, secondaryActions]
    ));
    activateAction.enabled = this.userDataProfileService.currentProfile.id !== profileElement.profile.id;
    disposables.add(this.userDataProfileService.onDidChangeCurrentProfile(() => activateAction.enabled = this.userDataProfileService.currentProfile.id !== profileElement.profile.id));
    return [profileElement, disposables];
  }
  async createNewProfile(copyFrom) {
    if (this.newProfileElement) {
      const result = await this.dialogService.confirm({
        type: "info",
        message: localize("new profile exists", "A new profile is already being created. Do you want to discard it and create a new one?"),
        primaryButton: localize("discard", "Discard & Create"),
        cancelButton: localize("cancel", "Cancel")
      });
      if (!result.confirmed) {
        return;
      }
      this.revert();
    }
    if (copyFrom instanceof URI) {
      try {
        await this.userDataProfileImportExportService.resolveProfileTemplate(copyFrom);
      } catch (error) {
        this.dialogService.error(getErrorMessage(error));
        return;
      }
    }
    if (!this.newProfileElement) {
      const disposables = new DisposableStore();
      const cancellationTokenSource = new CancellationTokenSource();
      disposables.add(toDisposable(() => cancellationTokenSource.dispose(true)));
      const primaryActions = [];
      const secondaryActions = [];
      const createAction = disposables.add(new Action(
        "userDataProfile.create",
        localize("create", "Create"),
        void 0,
        true,
        () => this.saveNewProfile(false, cancellationTokenSource.token)
      ));
      primaryActions.push(createAction);
      if (isWeb && copyFrom instanceof URI && isProfileURL(copyFrom)) {
        primaryActions.push(disposables.add(new Action(
          "userDataProfile.createInDesktop",
          localize("import in desktop", "Create in {0}", this.productService.nameLong),
          void 0,
          true,
          () => this.openerService.open(copyFrom, { openExternal: true })
        )));
      }
      const cancelAction = disposables.add(new Action(
        "userDataProfile.cancel",
        localize("cancel", "Cancel"),
        ThemeIcon.asClassName(Codicon.trash),
        true,
        () => this.discardNewProfile()
      ));
      secondaryActions.push(cancelAction);
      const previewProfileAction = disposables.add(new Action(
        "userDataProfile.preview",
        localize("preview", "Preview"),
        ThemeIcon.asClassName(Codicon.openPreview),
        true,
        () => this.previewNewProfile(cancellationTokenSource.token)
      ));
      secondaryActions.push(previewProfileAction);
      const exportAction = disposables.add(new Action(
        "userDataProfile.export",
        localize("export", "Export..."),
        ThemeIcon.asClassName(Codicon.export),
        isUserDataProfile(copyFrom),
        () => this.exportNewProfile(cancellationTokenSource.token)
      ));
      this.newProfileElement = disposables.add(this.instantiationService.createInstance(
        NewProfileElement,
        copyFrom,
        [primaryActions, secondaryActions],
        [[cancelAction], [exportAction]]
      ));
      const updateCreateActionLabel = () => {
        if (createAction.enabled) {
          if (this.newProfileElement?.copyFrom && this.userDataProfilesService.profiles.some((p) => !p.isInternal && p.name === this.newProfileElement?.name)) {
            createAction.label = localize("replace", "Replace");
          } else {
            createAction.label = localize("create", "Create");
          }
        }
      };
      updateCreateActionLabel();
      disposables.add(this.newProfileElement.onDidChange((e) => {
        if (e.preview || e.disabled || e.message) {
          createAction.enabled = !this.newProfileElement?.disabled && !this.newProfileElement?.message;
          previewProfileAction.enabled = !this.newProfileElement?.previewProfile && !this.newProfileElement?.disabled && !this.newProfileElement?.message;
        }
        if (e.name || e.copyFrom) {
          updateCreateActionLabel();
          exportAction.enabled = isUserDataProfile(this.newProfileElement?.copyFrom);
        }
      }));
      disposables.add(this.userDataProfilesService.onDidChangeProfiles((e) => {
        updateCreateActionLabel();
        this.newProfileElement?.validate();
      }));
      this._profiles.push([this.newProfileElement, disposables]);
      this._onDidChange.fire(this.newProfileElement);
    }
    return this.newProfileElement;
  }
  revert() {
    this.removeNewProfile();
    this._onDidChange.fire(void 0);
  }
  removeNewProfile() {
    if (this.newProfileElement) {
      const index = this._profiles.findIndex(([p]) => p === this.newProfileElement);
      if (index !== -1) {
        this._profiles.splice(index, 1).map(([, disposables]) => disposables.dispose());
      }
      this.newProfileElement = void 0;
    }
  }
  async previewNewProfile(token) {
    if (!this.newProfileElement) {
      return;
    }
    if (this.newProfileElement.previewProfile) {
      return;
    }
    const profile = await this.saveNewProfile(true, token);
    if (profile) {
      this.newProfileElement.previewProfile = profile;
      if (isWeb) {
        await this.userDataProfileManagementService.switchProfile(profile);
      } else {
        await this.openWindow(profile);
      }
    }
  }
  async exportNewProfile(token) {
    if (!this.newProfileElement) {
      return;
    }
    if (!isUserDataProfile(this.newProfileElement.copyFrom)) {
      return;
    }
    const profile = toUserDataProfile(
      generateUuid(),
      this.newProfileElement.name,
      this.newProfileElement.copyFrom.location,
      this.newProfileElement.copyFrom.cacheHome,
      {
        icon: this.newProfileElement.icon,
        useDefaultFlags: this.newProfileElement.flags
      },
      this.userDataProfilesService.defaultProfile
    );
    await this.userDataProfileImportExportService.exportProfile(profile, this.newProfileElement.copyFlags);
  }
  async saveNewProfile(transient, token) {
    if (!this.newProfileElement) {
      return void 0;
    }
    this.newProfileElement.validate();
    if (this.newProfileElement.message) {
      return void 0;
    }
    this.newProfileElement.disabled = true;
    let profile;
    try {
      if (this.newProfileElement.previewProfile) {
        if (!transient) {
          profile = await this.userDataProfileManagementService.updateProfile(this.newProfileElement.previewProfile, { transient: false });
        }
      } else {
        const { flags, icon, name, copyFrom } = this.newProfileElement;
        const useDefaultFlags = flags ? flags.settings && flags.keybindings && flags.tasks && flags.globalState && flags.extensions ? void 0 : flags : void 0;
        const createProfileTelemetryData = { source: copyFrom instanceof URI ? "template" : isUserDataProfile(copyFrom) ? "profile" : copyFrom ? "external" : void 0 };
        if (copyFrom instanceof URI) {
          const template = await this.newProfileElement.resolveTemplate(copyFrom);
          if (template) {
            this.telemetryService.publicLog2("userDataProfile.createFromTemplate", createProfileTelemetryData);
            profile = await this.userDataProfileImportExportService.createProfileFromTemplate(
              template,
              {
                name,
                useDefaultFlags,
                icon,
                resourceTypeFlags: this.newProfileElement.copyFlags,
                transient
              },
              token ?? CancellationToken.None
            );
          }
        } else if (isUserDataProfile(copyFrom)) {
          profile = await this.userDataProfileImportExportService.createFromProfile(
            copyFrom,
            {
              name,
              useDefaultFlags,
              icon,
              resourceTypeFlags: this.newProfileElement.copyFlags,
              transient
            },
            token ?? CancellationToken.None
          );
        } else {
          profile = await this.userDataProfileManagementService.createProfile(name, { useDefaultFlags, icon, transient });
        }
      }
    } finally {
      if (this.newProfileElement) {
        this.newProfileElement.disabled = false;
      }
    }
    if (token?.isCancellationRequested) {
      if (profile) {
        try {
          await this.userDataProfileManagementService.removeProfile(profile);
        } catch (error) {
        }
      }
      return;
    }
    if (profile && !profile.isInternal && this.newProfileElement) {
      this.removeNewProfile();
      const existing = this._profiles.find(([p]) => p.name === profile.name);
      if (existing) {
        this._onDidChange.fire(existing[0]);
      } else {
        this.onDidChangeProfiles({ added: [profile], removed: [], updated: [], all: this.userDataProfilesService.profiles });
      }
    }
    return profile;
  }
  async discardNewProfile() {
    if (!this.newProfileElement) {
      return;
    }
    if (this.newProfileElement.previewProfile) {
      await this.userDataProfileManagementService.removeProfile(this.newProfileElement.previewProfile);
      return;
    }
    this.removeNewProfile();
    this._onDidChange.fire(void 0);
  }
  async removeProfile(profile) {
    const result = await this.dialogService.confirm({
      type: "info",
      message: localize("deleteProfile", "Are you sure you want to delete the profile '{0}'?", profile.name),
      primaryButton: localize("delete", "Delete"),
      cancelButton: localize("cancel", "Cancel")
    });
    if (result.confirmed) {
      await this.userDataProfileManagementService.removeProfile(profile);
    }
  }
  async openWindow(profile) {
    await this.hostService.openWindow({ forceProfile: profile.name });
  }
};
UserDataProfilesEditorModel = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, IUserDataProfileImportExportService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IHostService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IInstantiationService)
], UserDataProfilesEditorModel);
export {
  AbstractUserDataProfileElement,
  NewProfileElement,
  UserDataProfileElement,
  UserDataProfilesEditorModel,
  isProfileResourceChildElement,
  isProfileResourceTypeElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVzZXJEYXRhUHJvZmlsZVxcYnJvd3NlclxcdXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRGlkQ2hhbmdlUHJvZmlsZXNFdmVudCwgaXNVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSwgUHJvZmlsZVJlc291cmNlVHlwZSwgUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzLCB0b1VzZXJEYXRhUHJvZmlsZSwgVXNlRGVmYXVsdFByb2ZpbGVGbGFncyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtLCBJUHJvZmlsZVRlbXBsYXRlSW5mbywgaXNQcm9maWxlVVJMLCBJVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSwgSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFQcm9maWxlU2VydmljZSwgSVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIGFycmF5cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1Jlc291cmNlRXhwb3J0VHJlZUl0ZW0sIEV4dGVuc2lvbnNSZXNvdXJjZUltcG9ydFRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvZXh0ZW5zaW9uc1Jlc291cmNlLmpzJztcbmltcG9ydCB7IFNldHRpbmdzUmVzb3VyY2UsIFNldHRpbmdzUmVzb3VyY2VUcmVlSXRlbSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL3NldHRpbmdzUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZXNvdXJjZSwgS2V5YmluZGluZ3NSZXNvdXJjZVRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIva2V5YmluZGluZ3NSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBUYXNrc1Jlc291cmNlLCBUYXNrc1Jlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci90YXNrc1Jlc291cmNlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRzUmVzb3VyY2UsIFNuaXBwZXRzUmVzb3VyY2VUcmVlSXRlbSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL3NuaXBwZXRzUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgTWNwUHJvZmlsZVJlc291cmNlLCBNY3BSZXNvdXJjZVRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvbWNwUHJvZmlsZVJlc291cmNlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElUcmVlSXRlbUNoZWNrYm94U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENPTkZJR19ORVdfV0lORE9XX1BST0ZJTEUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdPUktTUEFDRV9TVUZGSVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcblxuZXhwb3J0IHR5cGUgQ2hhbmdlRXZlbnQgPSB7XG5cdHJlYWRvbmx5IG5hbWU/OiBib29sZWFuO1xuXHRyZWFkb25seSBpY29uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZmxhZ3M/OiBib29sZWFuO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWN0aXZlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWVzc2FnZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvcHlGcm9tPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29weUZyb21JbmZvPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29weUZsYWdzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHJldmlldz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByb2ZpbGU/OiBib29sZWFuO1xuXHRyZWFkb25seSBleHRlbnNpb25zPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc25pcHBldHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBkaXNhYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG5ld1dpbmRvd1Byb2ZpbGU/OiBib29sZWFuO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJUHJvZmlsZUNoaWxkRWxlbWVudCB7XG5cdHJlYWRvbmx5IGhhbmRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBvcGVuQWN0aW9uPzogSUFjdGlvbjtcblx0cmVhZG9ubHkgYWN0aW9ucz86IHtcblx0XHRyZWFkb25seSBwcmltYXJ5PzogSUFjdGlvbltdO1xuXHRcdHJlYWRvbmx5IGNvbnRleHRNZW51PzogSUFjdGlvbltdO1xuXHR9O1xuXHRyZWFkb25seSBjaGVja2JveD86IElUcmVlSXRlbUNoZWNrYm94U3RhdGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50IGV4dGVuZHMgSVByb2ZpbGVDaGlsZEVsZW1lbnQge1xuXHRyZWFkb25seSByZXNvdXJjZVR5cGU6IFByb2ZpbGVSZXNvdXJjZVR5cGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2ZpbGVSZXNvdXJjZVR5cGVDaGlsZEVsZW1lbnQgZXh0ZW5kcyBJUHJvZmlsZUNoaWxkRWxlbWVudCB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZT86IFVSSTtcblx0cmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQoZWxlbWVudDogSVByb2ZpbGVDaGlsZEVsZW1lbnQpOiBlbGVtZW50IGlzIElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudCB7XG5cdHJldHVybiAoZWxlbWVudCBhcyBJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQpLnJlc291cmNlVHlwZSAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9maWxlUmVzb3VyY2VDaGlsZEVsZW1lbnQoZWxlbWVudDogSVByb2ZpbGVDaGlsZEVsZW1lbnQpOiBlbGVtZW50IGlzIElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50IHtcblx0cmV0dXJuIChlbGVtZW50IGFzIElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50KS5sYWJlbCAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNhdmVTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmRvU2F2ZSgpLCA1MDApKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRuYW1lOiBzdHJpbmcsXG5cdFx0aWNvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGZsYWdzOiBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzIHwgdW5kZWZpbmVkLFxuXHRcdHdvcmtzcGFjZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkLFxuXHRcdGlzQWN0aXZlOiBib29sZWFuLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX25hbWUgPSBuYW1lO1xuXHRcdHRoaXMuX2ljb24gPSBpY29uO1xuXHRcdHRoaXMuX2ZsYWdzID0gZmxhZ3M7XG5cdFx0dGhpcy5fd29ya3NwYWNlcyA9IHdvcmtzcGFjZXM7XG5cdFx0dGhpcy5fYWN0aXZlID0gaXNBY3RpdmU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmICghZS5tZXNzYWdlKSB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2F2ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uUHJvZmlsZUF3YXJlRGlkSW5zdGFsbEV4dGVuc2lvbnMocmVzdWx0cyA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gdGhpcy5nZXRQcm9maWxlVG9XYXRjaCgpO1xuXHRcdFx0aWYgKHByb2ZpbGUgJiYgcmVzdWx0cy5zb21lKHIgPT4gIXIuZXJyb3IgJiYgKHIuYXBwbGljYXRpb25TY29wZWQgfHwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoci5wcm9maWxlTG9jYXRpb24sIHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlKSkpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBleHRlbnNpb25zOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uUHJvZmlsZUF3YXJlRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKGUgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMuZ2V0UHJvZmlsZVRvV2F0Y2goKTtcblx0XHRcdGlmIChwcm9maWxlICYmICFlLmVycm9yICYmIChlLmFwcGxpY2F0aW9uU2NvcGVkIHx8IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUucHJvZmlsZUxvY2F0aW9uLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSkpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBleHRlbnNpb25zOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uUHJvZmlsZUF3YXJlRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEoZSA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gdGhpcy5nZXRQcm9maWxlVG9XYXRjaCgpO1xuXHRcdFx0aWYgKHByb2ZpbGUgJiYgZS5sb2NhbC5pc0FwcGxpY2F0aW9uU2NvcGVkIHx8IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUucHJvZmlsZUxvY2F0aW9uLCBwcm9maWxlPy5leHRlbnNpb25zUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBleHRlbnNpb25zOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX25hbWUgPSAnJztcblx0Z2V0IG5hbWUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX25hbWU7IH1cblx0c2V0IG5hbWUobmFtZTogc3RyaW5nKSB7XG5cdFx0bmFtZSA9IG5hbWUudHJpbSgpO1xuXHRcdGlmICh0aGlzLl9uYW1lICE9PSBuYW1lKSB7XG5cdFx0XHR0aGlzLl9uYW1lID0gbmFtZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBuYW1lOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ljb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGljb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2ljb247IH1cblx0c2V0IGljb24oaWNvbjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX2ljb24gIT09IGljb24pIHtcblx0XHRcdHRoaXMuX2ljb24gPSBpY29uO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGljb246IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQ7XG5cdGdldCB3b3Jrc3BhY2VzKCk6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3dvcmtzcGFjZXM7IH1cblx0c2V0IHdvcmtzcGFjZXMod29ya3NwYWNlczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWFycmF5cy5lcXVhbHModGhpcy5fd29ya3NwYWNlcywgd29ya3NwYWNlcywgKGEsIGIpID0+IGEudG9TdHJpbmcoKSA9PT0gYi50b1N0cmluZygpKSkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlcyA9IHdvcmtzcGFjZXM7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgd29ya3NwYWNlczogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mbGFnczogVXNlRGVmYXVsdFByb2ZpbGVGbGFncyB8IHVuZGVmaW5lZDtcblx0Z2V0IGZsYWdzKCk6IFVzZURlZmF1bHRQcm9maWxlRmxhZ3MgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZmxhZ3M7IH1cblx0c2V0IGZsYWdzKGZsYWdzOiBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFlcXVhbHModGhpcy5fZmxhZ3MsIGZsYWdzKSkge1xuXHRcdFx0dGhpcy5fZmxhZ3MgPSBmbGFncztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBmbGFnczogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGFjdGl2ZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZTsgfVxuXHRzZXQgYWN0aXZlKGFjdGl2ZTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9hY3RpdmUgIT09IGFjdGl2ZSkge1xuXHRcdFx0dGhpcy5fYWN0aXZlID0gYWN0aXZlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGFjdGl2ZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBtZXNzYWdlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9tZXNzYWdlOyB9XG5cdHNldCBtZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9tZXNzYWdlICE9PSBtZXNzYWdlKSB7XG5cdFx0XHR0aGlzLl9tZXNzYWdlID0gbWVzc2FnZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBtZXNzYWdlOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Rpc2FibGVkOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBkaXNhYmxlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2Rpc2FibGVkOyB9XG5cdHNldCBkaXNhYmxlZChzYXZpbmc6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fZGlzYWJsZWQgIT09IHNhdmluZykge1xuXHRcdFx0dGhpcy5fZGlzYWJsZWQgPSBzYXZpbmc7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgZGlzYWJsZWQ6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0RmxhZyhrZXk6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5mbGFncz8uW2tleV0gPz8gZmFsc2U7XG5cdH1cblxuXHRzZXRGbGFnKGtleTogUHJvZmlsZVJlc291cmNlVHlwZSwgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBmbGFncyA9IHRoaXMuZmxhZ3MgPyB7IC4uLnRoaXMuZmxhZ3MgfSA6IHt9O1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0ZmxhZ3Nba2V5XSA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlbGV0ZSBmbGFnc1trZXldO1xuXHRcdH1cblx0XHR0aGlzLmZsYWdzID0gZmxhZ3M7XG5cdH1cblxuXHR2YWxpZGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubmFtZSkge1xuXHRcdFx0dGhpcy5tZXNzYWdlID0gbG9jYWxpemUoJ25hbWUgcmVxdWlyZWQnLCBcIlByb2ZpbGUgbmFtZSBpcyByZXF1aXJlZCBhbmQgbXVzdCBiZSBhIG5vbi1lbXB0eSB2YWx1ZS5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNob3VsZFZhbGlkYXRlTmFtZSgpICYmIHRoaXMubmFtZSAhPT0gdGhpcy5nZXRJbml0aWFsTmFtZSgpICYmIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuc29tZShwID0+IHAubmFtZSA9PT0gdGhpcy5uYW1lKSkge1xuXHRcdFx0dGhpcy5tZXNzYWdlID0gbG9jYWxpemUoJ3Byb2ZpbGVFeGlzdHMnLCBcIlByb2ZpbGUgd2l0aCBuYW1lIHswfSBhbHJlYWR5IGV4aXN0cy5cIiwgdGhpcy5uYW1lKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5mbGFncyAmJiB0aGlzLmZsYWdzLnNldHRpbmdzICYmIHRoaXMuZmxhZ3Mua2V5YmluZGluZ3MgJiYgdGhpcy5mbGFncy50YXNrcyAmJiB0aGlzLmZsYWdzLnNuaXBwZXRzICYmIHRoaXMuZmxhZ3MuZXh0ZW5zaW9uc1xuXHRcdCkge1xuXHRcdFx0dGhpcy5tZXNzYWdlID0gbG9jYWxpemUoJ2ludmFsaWQgY29uZmlndXJhdGlvbnMnLCBcIlRoZSBwcm9maWxlIHNob3VsZCBjb250YWluIGF0IGxlYXN0IG9uZSBjb25maWd1cmF0aW9uLlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5tZXNzYWdlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4ocmVzb3VyY2VUeXBlPzogUHJvZmlsZVJlc291cmNlVHlwZSk6IFByb21pc2U8SVByb2ZpbGVDaGlsZEVsZW1lbnRbXT4ge1xuXHRcdGlmIChyZXNvdXJjZVR5cGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VUeXBlcyA9IFtcblx0XHRcdFx0UHJvZmlsZVJlc291cmNlVHlwZS5TZXR0aW5ncyxcblx0XHRcdFx0UHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5ncyxcblx0XHRcdFx0UHJvZmlsZVJlc291cmNlVHlwZS5UYXNrcyxcblx0XHRcdFx0UHJvZmlsZVJlc291cmNlVHlwZS5NY3AsXG5cdFx0XHRcdFByb2ZpbGVSZXNvdXJjZVR5cGUuU25pcHBldHMsXG5cdFx0XHRcdFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uc1xuXHRcdFx0XTtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChyZXNvdXJjZVR5cGVzLm1hcDxQcm9taXNlPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD4+KGFzeW5jIHIgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGlsZHJlbiA9IChyID09PSBQcm9maWxlUmVzb3VyY2VUeXBlLlNldHRpbmdzXG5cdFx0XHRcdFx0fHwgciA9PT0gUHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5nc1xuXHRcdFx0XHRcdHx8IHIgPT09IFByb2ZpbGVSZXNvdXJjZVR5cGUuVGFza3Ncblx0XHRcdFx0XHR8fCByID09PSBQcm9maWxlUmVzb3VyY2VUeXBlLk1jcCkgPyBhd2FpdCB0aGlzLmdldENoaWxkcmVuRm9yUmVzb3VyY2VUeXBlKHIpIDogW107XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aGFuZGxlOiByLFxuXHRcdFx0XHRcdGNoZWNrYm94OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmVzb3VyY2VUeXBlOiByLFxuXHRcdFx0XHRcdG9wZW5BY3Rpb246IGNoaWxkcmVuLmxlbmd0aFxuXHRcdFx0XHRcdFx0PyB0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdGlkOiAnX29wZW4nLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ29wZW4nLCBcIk9wZW4gdG8gdGhlIFNpZGVcIiksXG5cdFx0XHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nb1RvRmlsZSksXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gY2hpbGRyZW5bMF0/Lm9wZW5BY3Rpb24/LnJ1bigpXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5Gb3JSZXNvdXJjZVR5cGUocmVzb3VyY2VUeXBlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRDaGlsZHJlbkZvclJlc291cmNlVHlwZShyZXNvdXJjZVR5cGU6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBQcm9taXNlPElQcm9maWxlQ2hpbGRFbGVtZW50W10+IHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0Q2hpbGRyZW5Gcm9tUHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCByZXNvdXJjZVR5cGU6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBQcm9taXNlPElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50W10+IHtcblx0XHRwcm9maWxlID0gdGhpcy5nZXRGbGFnKHJlc291cmNlVHlwZSkgPyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlIDogcHJvZmlsZTtcblx0XHRsZXQgY2hpbGRyZW46IElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtW10gPSBbXTtcblx0XHRzd2l0Y2ggKHJlc291cmNlVHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNldHRpbmdzOlxuXHRcdFx0XHRjaGlsZHJlbiA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3NSZXNvdXJjZVRyZWVJdGVtLCBwcm9maWxlKS5nZXRDaGlsZHJlbigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5nczpcblx0XHRcdFx0Y2hpbGRyZW4gPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzUmVzb3VyY2VUcmVlSXRlbSwgcHJvZmlsZSkuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuU25pcHBldHM6XG5cdFx0XHRcdGNoaWxkcmVuID0gKGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldHNSZXNvdXJjZVRyZWVJdGVtLCBwcm9maWxlKS5nZXRDaGlsZHJlbigpKSA/PyBbXTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuVGFza3M6XG5cdFx0XHRcdGNoaWxkcmVuID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYXNrc1Jlc291cmNlVHJlZUl0ZW0sIHByb2ZpbGUpLmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLk1jcDpcblx0XHRcdFx0Y2hpbGRyZW4gPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFJlc291cmNlVHJlZUl0ZW0sIHByb2ZpbGUpLmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnM6XG5cdFx0XHRcdGNoaWxkcmVuID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2VFeHBvcnRUcmVlSXRlbSwgcHJvZmlsZSkuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHJldHVybiBjaGlsZHJlbi5tYXA8SVByb2ZpbGVSZXNvdXJjZVR5cGVDaGlsZEVsZW1lbnQ+KGNoaWxkID0+IHRoaXMudG9Vc2VyRGF0YVByb2ZpbGVSZXNvdXJjZUNoaWxkRWxlbWVudChjaGlsZCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHRvVXNlckRhdGFQcm9maWxlUmVzb3VyY2VDaGlsZEVsZW1lbnQoY2hpbGQ6IElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtLCBwcmltYXJ5QWN0aW9ucz86IElBY3Rpb25bXSwgY29udGV4dE1lbnVBY3Rpb25zPzogSUFjdGlvbltdKTogSVByb2ZpbGVSZXNvdXJjZVR5cGVDaGlsZEVsZW1lbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRoYW5kbGU6IGNoaWxkLmhhbmRsZSxcblx0XHRcdGNoZWNrYm94OiBjaGlsZC5jaGVja2JveCxcblx0XHRcdGxhYmVsOiBjaGlsZC5sYWJlbCA/IChpc01hcmtkb3duU3RyaW5nKGNoaWxkLmxhYmVsLmxhYmVsKSA/IGNoaWxkLmxhYmVsLmxhYmVsLnZhbHVlIDogY2hpbGQubGFiZWwubGFiZWwpIDogJycsXG5cdFx0XHRkZXNjcmlwdGlvbjogaXNTdHJpbmcoY2hpbGQuZGVzY3JpcHRpb24pID8gY2hpbGQuZGVzY3JpcHRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZShjaGlsZC5yZXNvdXJjZVVyaSksXG5cdFx0XHRpY29uOiBjaGlsZC50aGVtZUljb24sXG5cdFx0XHRvcGVuQWN0aW9uOiB0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnX29wZW5DaGlsZCcsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3BlbicsIFwiT3BlbiB0byB0aGUgU2lkZVwiKSxcblx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdvVG9GaWxlKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGNoaWxkLnBhcmVudC50eXBlID09PSBQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2V4dGVuc2lvbi5vcGVuJywgY2hpbGQuaGFuZGxlLCB1bmRlZmluZWQsIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjaGlsZC5yZXNvdXJjZVVyaSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCwgY2hpbGQucmVzb3VyY2VVcmksIFtTSURFX0dST1VQXSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5OiBwcmltYXJ5QWN0aW9ucyxcblx0XHRcdFx0Y29udGV4dE1lbnU6IGNvbnRleHRNZW51QWN0aW9ucyxcblx0XHRcdH1cblx0XHR9O1xuXG5cdH1cblxuXHRnZXRJbml0aWFsTmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHNob3VsZFZhbGlkYXRlTmFtZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldEN1cnJlbnRXb3Jrc3BhY2UoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdHJldHVybiB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA/PyB3b3Jrc3BhY2UuZm9sZGVyc1swXT8udXJpO1xuXHR9XG5cblx0b3BlbldvcmtzcGFjZSh3b3Jrc3BhY2U6IFVSSSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZXh0bmFtZSh3b3Jrc3BhY2UpID09PSBXT1JLU1BBQ0VfU1VGRklYKSB7XG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgd29ya3NwYWNlVXJpOiB3b3Jrc3BhY2UgfV0sIHsgZm9yY2VOZXdXaW5kb3c6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyBmb2xkZXJVcmk6IHdvcmtzcGFjZSB9XSwgeyBmb3JjZU5ld1dpbmRvdzogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRzYXZlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2F2ZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNVbnNhdmVkQ2hhbmdlcyhwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMubmFtZSAhPT0gcHJvZmlsZS5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaWNvbiAhPT0gcHJvZmlsZS5pY29uKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFlcXVhbHModGhpcy5mbGFncyA/PyB7fSwgcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MgPz8ge30pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhcnJheXMuZXF1YWxzKHRoaXMud29ya3NwYWNlcyA/PyBbXSwgcHJvZmlsZS53b3Jrc3BhY2VzID8/IFtdLCAoYSwgYikgPT4gYS50b1N0cmluZygpID09PSBiLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNhdmVQcm9maWxlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuaGFzVW5zYXZlZENoYW5nZXMocHJvZmlsZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy52YWxpZGF0ZSgpO1xuXHRcdGlmICh0aGlzLm1lc3NhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdXNlRGVmYXVsdEZsYWdzOiBVc2VEZWZhdWx0UHJvZmlsZUZsYWdzIHwgdW5kZWZpbmVkID0gdGhpcy5mbGFnc1xuXHRcdFx0PyB0aGlzLmZsYWdzLnNldHRpbmdzICYmIHRoaXMuZmxhZ3Mua2V5YmluZGluZ3MgJiYgdGhpcy5mbGFncy50YXNrcyAmJiB0aGlzLmZsYWdzLmdsb2JhbFN0YXRlICYmIHRoaXMuZmxhZ3MuZXh0ZW5zaW9ucyA/IHVuZGVmaW5lZCA6IHRoaXMuZmxhZ3Ncblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UudXBkYXRlUHJvZmlsZShwcm9maWxlLCB7XG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRpY29uOiB0aGlzLmljb24sXG5cdFx0XHR1c2VEZWZhdWx0RmxhZ3M6IHByb2ZpbGUudXNlRGVmYXVsdEZsYWdzICYmICF1c2VEZWZhdWx0RmxhZ3MgPyB7fSA6IHVzZURlZmF1bHRGbGFncyxcblx0XHRcdHdvcmtzcGFjZXM6IHRoaXMud29ya3NwYWNlc1xuXHRcdH0pO1xuXHR9XG5cblx0YWJzdHJhY3QgcmVhZG9ubHkgdGl0bGVCdXR0b25zOiBbQWN0aW9uW10sIEFjdGlvbltdXTtcblx0YWJzdHJhY3QgcmVhZG9ubHkgYWN0aW9uczogW0lBY3Rpb25bXSwgSUFjdGlvbltdXTtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZG9TYXZlKCk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRQcm9maWxlVG9XYXRjaCgpOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlRWxlbWVudCBleHRlbmRzIEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCB7XG5cblx0Z2V0IHByb2ZpbGUoKTogSVVzZXJEYXRhUHJvZmlsZSB7IHJldHVybiB0aGlzLl9wcm9maWxlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSxcblx0XHRyZWFkb25seSB0aXRsZUJ1dHRvbnM6IFtBY3Rpb25bXSwgQWN0aW9uW11dLFxuXHRcdHJlYWRvbmx5IGFjdGlvbnM6IFtJQWN0aW9uW10sIElBY3Rpb25bXV0sXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSB1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0X3Byb2ZpbGUubmFtZSxcblx0XHRcdF9wcm9maWxlLmljb24sXG5cdFx0XHRfcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MsXG5cdFx0XHRfcHJvZmlsZS53b3Jrc3BhY2VzLFxuXHRcdFx0dXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCA9PT0gX3Byb2ZpbGUuaWQsXG5cdFx0XHR1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdFx0Y29tbWFuZFNlcnZpY2UsXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdGhvc3RTZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdCk7XG5cdFx0dGhpcy5faXNOZXdXaW5kb3dQcm9maWxlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShDT05GSUdfTkVXX1dJTkRPV19QUk9GSUxFKSA9PT0gdGhpcy5wcm9maWxlLm5hbWU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ09ORklHX05FV19XSU5ET1dfUFJPRklMRSkpIHtcblx0XHRcdFx0dGhpcy5pc05ld1dpbmRvd1Byb2ZpbGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENPTkZJR19ORVdfV0lORE9XX1BST0ZJTEUpID09PSB0aGlzLnByb2ZpbGUubmFtZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoKCkgPT4gdGhpcy5hY3RpdmUgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQgPT09IHRoaXMucHJvZmlsZS5pZCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm9maWxlcygoeyB1cGRhdGVkIH0pID0+IHtcblx0XHRcdGNvbnN0IHByb2ZpbGUgPSB1cGRhdGVkLmZpbmQocCA9PiBwLmlkID09PSB0aGlzLnByb2ZpbGUuaWQpO1xuXHRcdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdFx0dGhpcy5fcHJvZmlsZSA9IHByb2ZpbGU7XG5cdFx0XHRcdHRoaXMucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHByb2ZpbGU6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLndhdGNoKHRoaXMucHJvZmlsZS5zbmlwcGV0c0hvbWUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0cyh0aGlzLnByb2ZpbGUuc25pcHBldHNIb21lKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgc25pcHBldHM6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFByb2ZpbGVUb1dhdGNoKCk6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByb2ZpbGU7XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLm5hbWUgPSB0aGlzLl9wcm9maWxlLm5hbWU7XG5cdFx0dGhpcy5pY29uID0gdGhpcy5fcHJvZmlsZS5pY29uO1xuXHRcdHRoaXMuZmxhZ3MgPSB0aGlzLl9wcm9maWxlLnVzZURlZmF1bHRGbGFncztcblx0XHR0aGlzLndvcmtzcGFjZXMgPSB0aGlzLl9wcm9maWxlLndvcmtzcGFjZXM7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlV29ya3NwYWNlcyh0b0FkZDogVVJJW10sIHRvUmVtb3ZlOiBVUklbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHdvcmtzcGFjZXMgPSBuZXcgUmVzb3VyY2VTZXQodGhpcy53b3Jrc3BhY2VzID8/IFtdKTtcblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZSBvZiB0b0FkZCkge1xuXHRcdFx0d29ya3NwYWNlcy5hZGQod29ya3NwYWNlKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2Ugb2YgdG9SZW1vdmUpIHtcblx0XHRcdHdvcmtzcGFjZXMuZGVsZXRlKHdvcmtzcGFjZSk7XG5cdFx0fVxuXHRcdHRoaXMud29ya3NwYWNlcyA9IFsuLi53b3Jrc3BhY2VzLnZhbHVlcygpXTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0b2dnbGVOZXdXaW5kb3dQcm9maWxlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pc05ld1dpbmRvd1Byb2ZpbGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ09ORklHX05FV19XSU5ET1dfUFJPRklMRSwgbnVsbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ09ORklHX05FV19XSU5ET1dfUFJPRklMRSwgdGhpcy5wcm9maWxlLm5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzTmV3V2luZG93UHJvZmlsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgaXNOZXdXaW5kb3dQcm9maWxlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNOZXdXaW5kb3dQcm9maWxlOyB9XG5cdHNldCBpc05ld1dpbmRvd1Byb2ZpbGUoaXNOZXdXaW5kb3dQcm9maWxlOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2lzTmV3V2luZG93UHJvZmlsZSAhPT0gaXNOZXdXaW5kb3dQcm9maWxlKSB7XG5cdFx0XHR0aGlzLl9pc05ld1dpbmRvd1Byb2ZpbGUgPSBpc05ld1dpbmRvd1Byb2ZpbGU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgbmV3V2luZG93UHJvZmlsZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdG9nZ2xlQ3VycmVudFdpbmRvd1Byb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCA9PT0gdGhpcy5wcm9maWxlLmlkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnN3aXRjaFByb2ZpbGUodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZSh0aGlzLnByb2ZpbGUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBkb1NhdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlUHJvZmlsZSh0aGlzLnByb2ZpbGUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGdldENoaWxkcmVuRm9yUmVzb3VyY2VUeXBlKHJlc291cmNlVHlwZTogUHJvZmlsZVJlc291cmNlVHlwZSk6IFByb21pc2U8SVByb2ZpbGVDaGlsZEVsZW1lbnRbXT4ge1xuXHRcdGlmIChyZXNvdXJjZVR5cGUgPT09IFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9ucykge1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZUV4cG9ydFRyZWVJdGVtLCB0aGlzLnByb2ZpbGUpLmdldENoaWxkcmVuKCk7XG5cdFx0XHRyZXR1cm4gY2hpbGRyZW4ubWFwPElQcm9maWxlUmVzb3VyY2VUeXBlQ2hpbGRFbGVtZW50PihjaGlsZCA9PlxuXHRcdFx0XHR0aGlzLnRvVXNlckRhdGFQcm9maWxlUmVzb3VyY2VDaGlsZEVsZW1lbnQoXG5cdFx0XHRcdFx0Y2hpbGQsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRpZDogJ2FwcGx5VG9BbGxQcm9maWxlcycsXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FwcGx5VG9BbGxQcm9maWxlcycsIFwiQXBwbHkgRXh0ZW5zaW9uIHRvIGFsbCBQcm9maWxlc1wiKSxcblx0XHRcdFx0XHRcdGNoZWNrZWQ6IGNoaWxkLmFwcGxpY2F0aW9uU2NvcGVkLFxuXHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGNsYXNzOiAnJyxcblx0XHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh1bmRlZmluZWQsIHRoaXMucHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25zLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGNoaWxkLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudG9nZ2xlQXBwbGljYXRpb25TY29wZShleHRlbnNpb24sIHRoaXMucHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0KSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUodGhpcy5wcm9maWxlLCByZXNvdXJjZVR5cGUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SW5pdGlhbE5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5wcm9maWxlLm5hbWU7XG5cdH1cblxufVxuXG5jb25zdCBVU0VSX0RBVEFfUFJPRklMRV9URU1QTEFURV9QUkVWSUVXX1NDSEVNRSA9ICd1c2VyZGF0YXByb2ZpbGV0ZW1wbGF0ZXByZXZpZXcnO1xuXG5leHBvcnQgY2xhc3MgTmV3UHJvZmlsZUVsZW1lbnQgZXh0ZW5kcyBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQge1xuXG5cdHByaXZhdGUgX2NvcHlGcm9tVGVtcGxhdGVzID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oKTtcblx0Z2V0IGNvcHlGcm9tVGVtcGxhdGVzKCk6IFJlc291cmNlTWFwPHN0cmluZz4geyByZXR1cm4gdGhpcy5fY29weUZyb21UZW1wbGF0ZXM7IH1cblxuXHRwcml2YXRlIHRlbXBsYXRlUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGVtcGxhdGU6IElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgZGVmYXVsdE5hbWU6IHN0cmluZztcblx0cHJpdmF0ZSBkZWZhdWx0SWNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvcHlGcm9tOiBVUkkgfCBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IHRpdGxlQnV0dG9uczogW0FjdGlvbltdLCBBY3Rpb25bXV0sXG5cdFx0cmVhZG9ubHkgYWN0aW9uczogW0lBY3Rpb25bXSwgSUFjdGlvbltdXSxcblxuXHRcdEBJVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UgdXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdCcnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdFx0Y29tbWFuZFNlcnZpY2UsXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdGhvc3RTZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdCk7XG5cdFx0dGhpcy5uYW1lID0gdGhpcy5kZWZhdWx0TmFtZSA9IHRoaXMuZ2V0TmV3UHJvZmlsZU5hbWUoKTtcblx0XHR0aGlzLl9jb3B5RnJvbSA9IGNvcHlGcm9tO1xuXHRcdHRoaXMuX2NvcHlGbGFncyA9IHRoaXMuZ2V0Q29weUZsYWdzRnJvbShjb3B5RnJvbSk7XG5cdFx0dGhpcy5pbml0aWFsaXplKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFVTRVJfREFUQV9QUk9GSUxFX1RFTVBMQVRFX1BSRVZJRVdfU0NIRU1FLCB0aGlzLl9yZWdpc3RlcihuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMucHJldmlld1Byb2ZpbGUpIHtcblx0XHRcdFx0dGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5yZW1vdmVQcm9maWxlKHRoaXMucHJldmlld1Byb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvcHlGcm9tOiBJVXNlckRhdGFQcm9maWxlIHwgVVJJIHwgdW5kZWZpbmVkO1xuXHRnZXQgY29weUZyb20oKTogSVVzZXJEYXRhUHJvZmlsZSB8IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jb3B5RnJvbTsgfVxuXHRzZXQgY29weUZyb20oY29weUZyb206IElVc2VyRGF0YVByb2ZpbGUgfCBVUkkgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fY29weUZyb20gIT09IGNvcHlGcm9tKSB7XG5cdFx0XHR0aGlzLl9jb3B5RnJvbSA9IGNvcHlGcm9tO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGNvcHlGcm9tOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5mbGFncyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY29weUZsYWdzID0gdGhpcy5nZXRDb3B5RmxhZ3NGcm9tKGNvcHlGcm9tKTtcblx0XHRcdGlmIChjb3B5RnJvbSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHR0aGlzLnRlbXBsYXRlUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMudGVtcGxhdGVQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5pbml0aWFsaXplKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29weUZsYWdzOiBQcm9maWxlUmVzb3VyY2VUeXBlRmxhZ3MgfCB1bmRlZmluZWQ7XG5cdGdldCBjb3B5RmxhZ3MoKTogUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvcHlGbGFnczsgfVxuXHRzZXQgY29weUZsYWdzKGZsYWdzOiBQcm9maWxlUmVzb3VyY2VUeXBlRmxhZ3MgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWVxdWFscyh0aGlzLl9jb3B5RmxhZ3MsIGZsYWdzKSkge1xuXHRcdFx0dGhpcy5fY29weUZsYWdzID0gZmxhZ3M7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgY29weUZsYWdzOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJldmlld1Byb2ZpbGVXYXRjaERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfcHJldmlld1Byb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cdGdldCBwcmV2aWV3UHJvZmlsZSgpOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3ByZXZpZXdQcm9maWxlOyB9XG5cdHNldCBwcmV2aWV3UHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX3ByZXZpZXdQcm9maWxlICE9PSBwcm9maWxlKSB7XG5cdFx0XHR0aGlzLl9wcmV2aWV3UHJvZmlsZSA9IHByb2ZpbGU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgcHJldmlldzogdHJ1ZSB9KTtcblx0XHRcdHRoaXMucHJldmlld1Byb2ZpbGVXYXRjaERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRpZiAodGhpcy5fcHJldmlld1Byb2ZpbGUpIHtcblx0XHRcdFx0dGhpcy5wcmV2aWV3UHJvZmlsZVdhdGNoRGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5fcHJldmlld1Byb2ZpbGUuc25pcHBldHNIb21lKSk7XG5cdFx0XHRcdHRoaXMucHJldmlld1Byb2ZpbGVXYXRjaERpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9wcmV2aWV3UHJvZmlsZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzKHRoaXMuX3ByZXZpZXdQcm9maWxlLnNuaXBwZXRzSG9tZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBzbmlwcGV0czogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0UHJvZmlsZVRvV2F0Y2goKTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucHJldmlld1Byb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIGdldENvcHlGbGFnc0Zyb20oY29weUZyb206IFVSSSB8IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQpOiBQcm9maWxlUmVzb3VyY2VUeXBlRmxhZ3MgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBjb3B5RnJvbSA/IHtcblx0XHRcdHNldHRpbmdzOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZ3M6IHRydWUsXG5cdFx0XHRzbmlwcGV0czogdHJ1ZSxcblx0XHRcdHRhc2tzOiB0cnVlLFxuXHRcdFx0ZXh0ZW5zaW9uczogdHJ1ZSxcblx0XHRcdG1jcDogdHJ1ZVxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNhYmxlZCA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLmNvcHlGcm9tIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVzb2x2ZVRlbXBsYXRlKHRoaXMuY29weUZyb20pO1xuXHRcdFx0XHRpZiAodGhpcy50ZW1wbGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMuY29weUZyb21UZW1wbGF0ZXMuc2V0KHRoaXMuY29weUZyb20sIHRoaXMudGVtcGxhdGUubmFtZSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZGVmYXVsdE5hbWUgPT09IHRoaXMubmFtZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5uYW1lID0gdGhpcy5kZWZhdWx0TmFtZSA9IHRoaXMudGVtcGxhdGUubmFtZSA/PyAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuZGVmYXVsdEljb24gPT09IHRoaXMuaWNvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5pY29uID0gdGhpcy5kZWZhdWx0SWNvbiA9IHRoaXMudGVtcGxhdGUuaWNvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLlNldHRpbmdzLCAhIXRoaXMudGVtcGxhdGUuc2V0dGluZ3MpO1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5ncywgISF0aGlzLnRlbXBsYXRlLmtleWJpbmRpbmdzKTtcblx0XHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuVGFza3MsICEhdGhpcy50ZW1wbGF0ZS50YXNrcyk7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzLCAhIXRoaXMudGVtcGxhdGUuc25pcHBldHMpO1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zLCAhIXRoaXMudGVtcGxhdGUuZXh0ZW5zaW9ucyk7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLk1jcCwgISF0aGlzLnRlbXBsYXRlLm1jcCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGNvcHlGcm9tSW5mbzogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1VzZXJEYXRhUHJvZmlsZSh0aGlzLmNvcHlGcm9tKSkge1xuXHRcdFx0XHRpZiAodGhpcy5kZWZhdWx0TmFtZSA9PT0gdGhpcy5uYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5uYW1lID0gdGhpcy5kZWZhdWx0TmFtZSA9IGxvY2FsaXplKCdjb3B5IGZyb20nLCBcInswfSAoQ29weSlcIiwgdGhpcy5jb3B5RnJvbS5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5kZWZhdWx0SWNvbiA9PT0gdGhpcy5pY29uKSB7XG5cdFx0XHRcdFx0dGhpcy5pY29uID0gdGhpcy5kZWZhdWx0SWNvbiA9IHRoaXMuY29weUZyb20uaWNvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuU2V0dGluZ3MsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuS2V5YmluZGluZ3MsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuVGFza3MsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuU25pcHBldHMsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9ucywgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5NY3AsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgY29weUZyb21JbmZvOiB0cnVlIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmRlZmF1bHROYW1lID09PSB0aGlzLm5hbWUpIHtcblx0XHRcdFx0dGhpcy5uYW1lID0gdGhpcy5kZWZhdWx0TmFtZSA9IHRoaXMuZ2V0TmV3UHJvZmlsZU5hbWUoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmRlZmF1bHRJY29uID09PSB0aGlzLmljb24pIHtcblx0XHRcdFx0dGhpcy5pY29uID0gdGhpcy5kZWZhdWx0SWNvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5TZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLktleWJpbmRpbmdzLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNldENvcHlGbGFnKFByb2ZpbGVSZXNvdXJjZVR5cGUuVGFza3MsIGZhbHNlKTtcblx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5TbmlwcGV0cywgZmFsc2UpO1xuXHRcdFx0dGhpcy5zZXRDb3B5RmxhZyhQcm9maWxlUmVzb3VyY2VUeXBlLkV4dGVuc2lvbnMsIGZhbHNlKTtcblx0XHRcdHRoaXMuc2V0Q29weUZsYWcoUHJvZmlsZVJlc291cmNlVHlwZS5NY3AsIGZhbHNlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBjb3B5RnJvbUluZm86IHRydWUgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuZGlzYWJsZWQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE5ld1Byb2ZpbGVOYW1lKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbmFtZSA9IGxvY2FsaXplKCd1bnRpdGxlZCcsIFwiVW50aXRsZWRcIik7XG5cdFx0Y29uc3QgbmFtZVJlZ0V4ID0gbmV3IFJlZ0V4cChgJHtuYW1lfVxcXFxzKFxcXFxkKylgKTtcblx0XHRsZXQgbmFtZUluZGV4ID0gMDtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IG5hbWVSZWdFeC5leGVjKHByb2ZpbGUubmFtZSk7XG5cdFx0XHRjb25zdCBpbmRleCA9IG1hdGNoZXMgPyBwYXJzZUludChtYXRjaGVzWzFdKSA6IDA7XG5cdFx0XHRuYW1lSW5kZXggPSBpbmRleCA+IG5hbWVJbmRleCA/IGluZGV4IDogbmFtZUluZGV4O1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7bmFtZX0gJHtuYW1lSW5kZXggKyAxfWA7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlVGVtcGxhdGUodXJpOiBVUkkpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMudGVtcGxhdGVQcm9taXNlKSB7XG5cdFx0XHR0aGlzLnRlbXBsYXRlUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdFx0Y29uc3QgdGVtcGxhdGUgPSBhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UucmVzb2x2ZVByb2ZpbGVUZW1wbGF0ZSh1cmkpO1xuXHRcdFx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy50ZW1wbGF0ZVByb21pc2U7XG5cdFx0cmV0dXJuIHRoaXMudGVtcGxhdGU7XG5cdH1cblxuXHRoYXNSZXNvdXJjZShyZXNvdXJjZVR5cGU6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy50ZW1wbGF0ZSkge1xuXHRcdFx0c3dpdGNoIChyZXNvdXJjZVR5cGUpIHtcblx0XHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNldHRpbmdzOlxuXHRcdFx0XHRcdHJldHVybiAhIXRoaXMudGVtcGxhdGUuc2V0dGluZ3M7XG5cdFx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5nczpcblx0XHRcdFx0XHRyZXR1cm4gISF0aGlzLnRlbXBsYXRlLmtleWJpbmRpbmdzO1xuXHRcdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuU25pcHBldHM6XG5cdFx0XHRcdFx0cmV0dXJuICEhdGhpcy50ZW1wbGF0ZS5zbmlwcGV0cztcblx0XHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlRhc2tzOlxuXHRcdFx0XHRcdHJldHVybiAhIXRoaXMudGVtcGxhdGUudGFza3M7XG5cdFx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5FeHRlbnNpb25zOlxuXHRcdFx0XHRcdHJldHVybiAhIXRoaXMudGVtcGxhdGUuZXh0ZW5zaW9ucztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXRDb3B5RmxhZyhrZXk6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb3B5RmxhZ3M/LltrZXldID8/IGZhbHNlO1xuXHR9XG5cblx0c2V0Q29weUZsYWcoa2V5OiBQcm9maWxlUmVzb3VyY2VUeXBlLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGZsYWdzID0gdGhpcy5jb3B5RmxhZ3MgPyB7IC4uLnRoaXMuY29weUZsYWdzIH0gOiB7fTtcblx0XHRmbGFnc1trZXldID0gdmFsdWU7XG5cdFx0dGhpcy5jb3B5RmxhZ3MgPSBmbGFncztcblx0fVxuXG5cdGdldENvcHlGcm9tTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc1VzZXJEYXRhUHJvZmlsZSh0aGlzLmNvcHlGcm9tKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29weUZyb20ubmFtZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY29weUZyb20gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvcHlGcm9tVGVtcGxhdGVzLmdldCh0aGlzLmNvcHlGcm9tKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBnZXRDaGlsZHJlbkZvclJlc291cmNlVHlwZShyZXNvdXJjZVR5cGU6IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBQcm9taXNlPElQcm9maWxlQ2hpbGRFbGVtZW50W10+IHtcblx0XHRpZiAodGhpcy5nZXRGbGFnKHJlc291cmNlVHlwZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZSwgcmVzb3VyY2VUeXBlKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmdldENvcHlGbGFnKHJlc291cmNlVHlwZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMucHJldmlld1Byb2ZpbGUpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUodGhpcy5wcmV2aWV3UHJvZmlsZSwgcmVzb3VyY2VUeXBlKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY29weUZyb20gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVzb2x2ZVRlbXBsYXRlKHRoaXMuY29weUZyb20pO1xuXHRcdFx0aWYgKCF0aGlzLnRlbXBsYXRlKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGVUZW1wbGF0ZSh0aGlzLnRlbXBsYXRlLCByZXNvdXJjZVR5cGUpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jb3B5RnJvbSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5Gcm9tUHJvZmlsZSh0aGlzLmNvcHlGcm9tLCByZXNvdXJjZVR5cGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldENoaWxkcmVuRnJvbVByb2ZpbGVUZW1wbGF0ZShwcm9maWxlVGVtcGxhdGU6IElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSwgcmVzb3VyY2VUeXBlOiBQcm9maWxlUmVzb3VyY2VUeXBlKTogUHJvbWlzZTxJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudFtdPiB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBVUkkuZnJvbSh7IHNjaGVtZTogVVNFUl9EQVRBX1BST0ZJTEVfVEVNUExBVEVfUFJFVklFV19TQ0hFTUUsIHBhdGg6IGAvcm9vdC9wcm9maWxlcy8ke3Byb2ZpbGVUZW1wbGF0ZS5uYW1lfWAgfSk7XG5cdFx0Y29uc3QgY2FjaGVMb2NhdGlvbiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBVU0VSX0RBVEFfUFJPRklMRV9URU1QTEFURV9QUkVWSUVXX1NDSEVNRSwgcGF0aDogYC9yb290L2NhY2hlLyR7cHJvZmlsZVRlbXBsYXRlLm5hbWV9YCB9KTtcblx0XHRjb25zdCBwcm9maWxlID0gdG9Vc2VyRGF0YVByb2ZpbGUoZ2VuZXJhdGVVdWlkKCksIHRoaXMubmFtZSwgbG9jYXRpb24sIGNhY2hlTG9jYXRpb24pO1xuXHRcdHN3aXRjaCAocmVzb3VyY2VUeXBlKSB7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuU2V0dGluZ3M6XG5cdFx0XHRcdGlmIChwcm9maWxlVGVtcGxhdGUuc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5zZXR0aW5ncywgcHJvZmlsZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5Gcm9tUHJvZmlsZShwcm9maWxlLCByZXNvdXJjZVR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5nczpcblx0XHRcdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5rZXliaW5kaW5ncykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5YmluZGluZ3NSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLmtleWJpbmRpbmdzLCBwcm9maWxlKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkZyb21Qcm9maWxlKHByb2ZpbGUsIHJlc291cmNlVHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzOlxuXHRcdFx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnNuaXBwZXRzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbmlwcGV0c1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUuc25pcHBldHMsIHByb2ZpbGUpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUocHJvZmlsZSwgcmVzb3VyY2VUeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuVGFza3M6XG5cdFx0XHRcdGlmIChwcm9maWxlVGVtcGxhdGUudGFza3MpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS50YXNrcywgcHJvZmlsZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5Gcm9tUHJvZmlsZShwcm9maWxlLCByZXNvdXJjZVR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5NY3A6XG5cdFx0XHRcdGlmIChwcm9maWxlVGVtcGxhdGUubWNwKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BQcm9maWxlUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5tY3AsIHByb2ZpbGUpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldENoaWxkcmVuRnJvbVByb2ZpbGUocHJvZmlsZSwgcmVzb3VyY2VUeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uczpcblx0XHRcdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5leHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZUltcG9ydFRyZWVJdGVtLCBwcm9maWxlVGVtcGxhdGUuZXh0ZW5zaW9ucykuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdFx0XHRyZXR1cm4gY2hpbGRyZW4ubWFwKGNoaWxkID0+IHRoaXMudG9Vc2VyRGF0YVByb2ZpbGVSZXNvdXJjZUNoaWxkRWxlbWVudChjaGlsZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdWxkVmFsaWRhdGVOYW1lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5jb3B5RnJvbTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEluaXRpYWxOYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucHJldmlld1Byb2ZpbGU/Lm5hbWUgPz8gJyc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZG9TYXZlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnByZXZpZXdQcm9maWxlKSB7XG5cdFx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdGhpcy5zYXZlUHJvZmlsZSh0aGlzLnByZXZpZXdQcm9maWxlKTtcblx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdHRoaXMucHJldmlld1Byb2ZpbGUgPSBwcm9maWxlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsIGV4dGVuZHMgRWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgc3RhdGljIElOU1RBTkNFOiBVc2VyRGF0YVByb2ZpbGVzRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cdHN0YXRpYyBnZXRJbnN0YW5jZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogVXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsIHtcblx0XHRpZiAoIVVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbC5JTlNUQU5DRSkge1xuXHRcdFx0VXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsLklOU1RBTkNFID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbC5JTlNUQU5DRTtcblx0fVxuXG5cdHByaXZhdGUgX3Byb2ZpbGVzOiBbQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50LCBEaXNwb3NhYmxlU3RvcmVdW10gPSBbXTtcblx0Z2V0IHByb2ZpbGVzKCk6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZmlsZXNcblx0XHRcdC5tYXAoKFtwcm9maWxlXSkgPT4gcHJvZmlsZSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhIGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYiBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhIGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiBhLnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChiIGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiBiLnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbmV3UHJvZmlsZUVsZW1lbnQ6IE5ld1Byb2ZpbGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHRlbXBsYXRlczogUHJvbWlzZTxyZWFkb25seSBJUHJvZmlsZVRlbXBsYXRlSW5mb1tdPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdGlmICghcHJvZmlsZS5pc0ludGVybmFsKSB7XG5cdFx0XHRcdHRoaXMuX3Byb2ZpbGVzLnB1c2godGhpcy5jcmVhdGVQcm9maWxlRWxlbWVudChwcm9maWxlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9wcm9maWxlcy5zcGxpY2UoMCwgdGhpcy5fcHJvZmlsZXMubGVuZ3RoKS5tYXAoKFssIGRpc3Bvc2FibGVzXSkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZXMoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlUHJvZmlsZXMoZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VQcm9maWxlcyhlOiBEaWRDaGFuZ2VQcm9maWxlc0V2ZW50KTogdm9pZCB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgZS5hZGRlZCkge1xuXHRcdFx0aWYgKCFwcm9maWxlLmlzSW50ZXJuYWwgJiYgcHJvZmlsZS5uYW1lICE9PSB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Py5uYW1lKSB7XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9wcm9maWxlcy5wdXNoKHRoaXMuY3JlYXRlUHJvZmlsZUVsZW1lbnQocHJvZmlsZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRpZiAocHJvZmlsZS5pZCA9PT0gdGhpcy5uZXdQcm9maWxlRWxlbWVudD8ucHJldmlld1Byb2ZpbGU/LmlkKSB7XG5cdFx0XHRcdHRoaXMubmV3UHJvZmlsZUVsZW1lbnQucHJldmlld1Byb2ZpbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3Byb2ZpbGVzLmZpbmRJbmRleCgoW3BdKSA9PiBwIGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiBwLnByb2ZpbGUuaWQgPT09IHByb2ZpbGUuaWQpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fcHJvZmlsZXMuc3BsaWNlKGluZGV4LCAxKS5tYXAoKFssIGRpc3Bvc2FibGVzXSkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRnZXRUZW1wbGF0ZXMoKTogUHJvbWlzZTxyZWFkb25seSBJUHJvZmlsZVRlbXBsYXRlSW5mb1tdPiB7XG5cdFx0aWYgKCF0aGlzLnRlbXBsYXRlcykge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZXMgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLmdldEJ1aWx0aW5Qcm9maWxlVGVtcGxhdGVzKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRlbXBsYXRlcztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUHJvZmlsZUVsZW1lbnQocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFtVc2VyRGF0YVByb2ZpbGVFbGVtZW50LCBEaXNwb3NhYmxlU3RvcmVdIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGFjdGl2YXRlQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQndXNlckRhdGFQcm9maWxlLmFjdGl2YXRlJyxcblx0XHRcdGxvY2FsaXplKCdhY3RpdmUnLCBcIlVzZSB0aGlzIFByb2ZpbGUgZm9yIEN1cnJlbnQgV2luZG93XCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2hlY2spLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZShwcm9maWxlRWxlbWVudC5wcm9maWxlKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgY29weUZyb21Qcm9maWxlQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQndXNlckRhdGFQcm9maWxlLmNvcHlGcm9tUHJvZmlsZScsXG5cdFx0XHRsb2NhbGl6ZSgnY29weUZyb21Qcm9maWxlJywgXCJEdXBsaWNhdGUuLi5cIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jb3B5KSxcblx0XHRcdHRydWUsICgpID0+IHRoaXMuY3JlYXRlTmV3UHJvZmlsZShwcm9maWxlRWxlbWVudC5wcm9maWxlKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgZXhwb3J0QWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHQndXNlckRhdGFQcm9maWxlLmV4cG9ydCcsXG5cdFx0XHRsb2NhbGl6ZSgnZXhwb3J0JywgXCJFeHBvcnQuLi5cIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5leHBvcnQpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHRoaXMudXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZS5leHBvcnRQcm9maWxlKHByb2ZpbGUpXG5cdFx0KSk7XG5cblx0XHRjb25zdCBkZWxldGVBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdCd1c2VyRGF0YVByb2ZpbGUuZGVsZXRlJyxcblx0XHRcdGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRyYXNoKSxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiB0aGlzLnJlbW92ZVByb2ZpbGUocHJvZmlsZUVsZW1lbnQucHJvZmlsZSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IG5ld1dpbmRvd0FjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J3VzZXJEYXRhUHJvZmlsZS5uZXdXaW5kb3cnLFxuXHRcdFx0bG9jYWxpemUoJ29wZW4gbmV3IHdpbmRvdycsIFwiT3BlbiBOZXcgV2luZG93IHdpdGggdGhpcyBQcm9maWxlXCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZW1wdHlXaW5kb3cpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHRoaXMub3BlbldpbmRvdyhwcm9maWxlRWxlbWVudC5wcm9maWxlKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdHByaW1hcnlBY3Rpb25zLnB1c2goYWN0aXZhdGVBY3Rpb24pO1xuXHRcdHByaW1hcnlBY3Rpb25zLnB1c2gobmV3V2luZG93QWN0aW9uKTtcblx0XHRjb25zdCBzZWNvbmRhcnlBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2goY29weUZyb21Qcm9maWxlQWN0aW9uKTtcblx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2goZXhwb3J0QWN0aW9uKTtcblx0XHRpZiAoIXByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdHNlY29uZGFyeUFjdGlvbnMucHVzaChkZWxldGVBY3Rpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVFbGVtZW50ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFQcm9maWxlRWxlbWVudCxcblx0XHRcdHByb2ZpbGUsXG5cdFx0XHRbW10sIFtdXSxcblx0XHRcdFtwcmltYXJ5QWN0aW9ucywgc2Vjb25kYXJ5QWN0aW9uc11cblx0XHQpKTtcblxuXHRcdGFjdGl2YXRlQWN0aW9uLmVuYWJsZWQgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQgIT09IHByb2ZpbGVFbGVtZW50LnByb2ZpbGUuaWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKCgpID0+XG5cdFx0XHRhY3RpdmF0ZUFjdGlvbi5lbmFibGVkID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkICE9PSBwcm9maWxlRWxlbWVudC5wcm9maWxlLmlkKSk7XG5cblx0XHRyZXR1cm4gW3Byb2ZpbGVFbGVtZW50LCBkaXNwb3NhYmxlc107XG5cdH1cblxuXHRhc3luYyBjcmVhdGVOZXdQcm9maWxlKGNvcHlGcm9tPzogVVJJIHwgSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbmV3IHByb2ZpbGUgZXhpc3RzJywgXCJBIG5ldyBwcm9maWxlIGlzIGFscmVhZHkgYmVpbmcgY3JlYXRlZC4gRG8geW91IHdhbnQgdG8gZGlzY2FyZCBpdCBhbmQgY3JlYXRlIGEgbmV3IG9uZT9cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkaXNjYXJkJywgXCJEaXNjYXJkICYgQ3JlYXRlXCIpLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZXZlcnQoKTtcblx0XHR9XG5cblx0XHRpZiAoY29weUZyb20gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZS5yZXNvbHZlUHJvZmlsZVRlbXBsYXRlKGNvcHlGcm9tKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5uZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogQWN0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnM6IEFjdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBjcmVhdGVBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J3VzZXJEYXRhUHJvZmlsZS5jcmVhdGUnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY3JlYXRlJywgXCJDcmVhdGVcIiksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4gdGhpcy5zYXZlTmV3UHJvZmlsZShmYWxzZSwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pXG5cdFx0XHQpKTtcblx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goY3JlYXRlQWN0aW9uKTtcblx0XHRcdGlmIChpc1dlYiAmJiBjb3B5RnJvbSBpbnN0YW5jZW9mIFVSSSAmJiBpc1Byb2ZpbGVVUkwoY29weUZyb20pKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0J3VzZXJEYXRhUHJvZmlsZS5jcmVhdGVJbkRlc2t0b3AnLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdpbXBvcnQgaW4gZGVza3RvcCcsIFwiQ3JlYXRlIGluIHswfVwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihjb3B5RnJvbSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSlcblx0XHRcdFx0KSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2FuY2VsQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCd1c2VyRGF0YVByb2ZpbGUuY2FuY2VsJyxcblx0XHRcdFx0bG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50cmFzaCksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHRoaXMuZGlzY2FyZE5ld1Byb2ZpbGUoKVxuXHRcdFx0KSk7XG5cdFx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2goY2FuY2VsQWN0aW9uKTtcblx0XHRcdGNvbnN0IHByZXZpZXdQcm9maWxlQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCd1c2VyRGF0YVByb2ZpbGUucHJldmlldycsXG5cdFx0XHRcdGxvY2FsaXplKCdwcmV2aWV3JywgXCJQcmV2aWV3XCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5vcGVuUHJldmlldyksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHRoaXMucHJldmlld05ld1Byb2ZpbGUoY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pXG5cdFx0XHQpKTtcblx0XHRcdHNlY29uZGFyeUFjdGlvbnMucHVzaChwcmV2aWV3UHJvZmlsZUFjdGlvbik7XG5cdFx0XHRjb25zdCBleHBvcnRBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J3VzZXJEYXRhUHJvZmlsZS5leHBvcnQnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZXhwb3J0JywgXCJFeHBvcnQuLi5cIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV4cG9ydCksXG5cdFx0XHRcdGlzVXNlckRhdGFQcm9maWxlKGNvcHlGcm9tKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5leHBvcnROZXdQcm9maWxlKGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKVxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3UHJvZmlsZUVsZW1lbnQsXG5cdFx0XHRcdGNvcHlGcm9tLFxuXHRcdFx0XHRbcHJpbWFyeUFjdGlvbnMsIHNlY29uZGFyeUFjdGlvbnNdLFxuXHRcdFx0XHRbW2NhbmNlbEFjdGlvbl0sIFtleHBvcnRBY3Rpb25dXSxcblx0XHRcdCkpO1xuXHRcdFx0Y29uc3QgdXBkYXRlQ3JlYXRlQWN0aW9uTGFiZWwgPSAoKSA9PiB7XG5cdFx0XHRcdGlmIChjcmVhdGVBY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Py5jb3B5RnJvbSAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLnNvbWUocCA9PiAhcC5pc0ludGVybmFsICYmIHAubmFtZSA9PT0gdGhpcy5uZXdQcm9maWxlRWxlbWVudD8ubmFtZSkpIHtcblx0XHRcdFx0XHRcdGNyZWF0ZUFjdGlvbi5sYWJlbCA9IGxvY2FsaXplKCdyZXBsYWNlJywgXCJSZXBsYWNlXCIpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjcmVhdGVBY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgnY3JlYXRlJywgXCJDcmVhdGVcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dXBkYXRlQ3JlYXRlQWN0aW9uTGFiZWwoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5wcmV2aWV3IHx8IGUuZGlzYWJsZWQgfHwgZS5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0Y3JlYXRlQWN0aW9uLmVuYWJsZWQgPSAhdGhpcy5uZXdQcm9maWxlRWxlbWVudD8uZGlzYWJsZWQgJiYgIXRoaXMubmV3UHJvZmlsZUVsZW1lbnQ/Lm1lc3NhZ2U7XG5cdFx0XHRcdFx0cHJldmlld1Byb2ZpbGVBY3Rpb24uZW5hYmxlZCA9ICF0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Py5wcmV2aWV3UHJvZmlsZSAmJiAhdGhpcy5uZXdQcm9maWxlRWxlbWVudD8uZGlzYWJsZWQgJiYgIXRoaXMubmV3UHJvZmlsZUVsZW1lbnQ/Lm1lc3NhZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUubmFtZSB8fCBlLmNvcHlGcm9tKSB7XG5cdFx0XHRcdFx0dXBkYXRlQ3JlYXRlQWN0aW9uTGFiZWwoKTtcblx0XHRcdFx0XHRleHBvcnRBY3Rpb24uZW5hYmxlZCA9IGlzVXNlckRhdGFQcm9maWxlKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQ/LmNvcHlGcm9tKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm9maWxlcygoZSkgPT4ge1xuXHRcdFx0XHR1cGRhdGVDcmVhdGVBY3Rpb25MYWJlbCgpO1xuXHRcdFx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50Py52YWxpZGF0ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcHJvZmlsZXMucHVzaChbdGhpcy5uZXdQcm9maWxlRWxlbWVudCwgZGlzcG9zYWJsZXNdKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy5uZXdQcm9maWxlRWxlbWVudCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50O1xuXHR9XG5cblx0cmV2ZXJ0KCk6IHZvaWQge1xuXHRcdHRoaXMucmVtb3ZlTmV3UHJvZmlsZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlTmV3UHJvZmlsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5uZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9wcm9maWxlcy5maW5kSW5kZXgoKFtwXSkgPT4gcCA9PT0gdGhpcy5uZXdQcm9maWxlRWxlbWVudCk7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuX3Byb2ZpbGVzLnNwbGljZShpbmRleCwgMSkubWFwKChbLCBkaXNwb3NhYmxlc10pID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJldmlld05ld1Byb2ZpbGUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LnByZXZpZXdQcm9maWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCB0aGlzLnNhdmVOZXdQcm9maWxlKHRydWUsIHRva2VuKTtcblx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudC5wcmV2aWV3UHJvZmlsZSA9IHByb2ZpbGU7XG5cdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5zd2l0Y2hQcm9maWxlKHByb2ZpbGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuV2luZG93KHByb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXhwb3J0TmV3UHJvZmlsZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFpc1VzZXJEYXRhUHJvZmlsZSh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LmNvcHlGcm9tKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm9maWxlID0gdG9Vc2VyRGF0YVByb2ZpbGUoXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdHRoaXMubmV3UHJvZmlsZUVsZW1lbnQubmFtZSxcblx0XHRcdHRoaXMubmV3UHJvZmlsZUVsZW1lbnQuY29weUZyb20ubG9jYXRpb24sXG5cdFx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LmNvcHlGcm9tLmNhY2hlSG9tZSxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogdGhpcy5uZXdQcm9maWxlRWxlbWVudC5pY29uLFxuXHRcdFx0XHR1c2VEZWZhdWx0RmxhZ3M6IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQuZmxhZ3MsXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZVxuXHRcdCk7XG5cdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLmV4cG9ydFByb2ZpbGUocHJvZmlsZSwgdGhpcy5uZXdQcm9maWxlRWxlbWVudC5jb3B5RmxhZ3MpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZU5ld1Byb2ZpbGUodHJhbnNpZW50PzogYm9vbGVhbiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5uZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LnZhbGlkYXRlKCk7XG5cdFx0aWYgKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQubWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LmRpc2FibGVkID0gdHJ1ZTtcblx0XHRsZXQgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5uZXdQcm9maWxlRWxlbWVudC5wcmV2aWV3UHJvZmlsZSkge1xuXHRcdFx0XHRpZiAoIXRyYW5zaWVudCkge1xuXHRcdFx0XHRcdHByb2ZpbGUgPSBhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZVByb2ZpbGUodGhpcy5uZXdQcm9maWxlRWxlbWVudC5wcmV2aWV3UHJvZmlsZSwgeyB0cmFuc2llbnQ6IGZhbHNlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc3QgeyBmbGFncywgaWNvbiwgbmFtZSwgY29weUZyb20gfSA9IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQ7XG5cdFx0XHRcdGNvbnN0IHVzZURlZmF1bHRGbGFnczogVXNlRGVmYXVsdFByb2ZpbGVGbGFncyB8IHVuZGVmaW5lZCA9IGZsYWdzXG5cdFx0XHRcdFx0PyBmbGFncy5zZXR0aW5ncyAmJiBmbGFncy5rZXliaW5kaW5ncyAmJiBmbGFncy50YXNrcyAmJiBmbGFncy5nbG9iYWxTdGF0ZSAmJiBmbGFncy5leHRlbnNpb25zID8gdW5kZWZpbmVkIDogZmxhZ3Ncblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHR0eXBlIENyZWF0ZVByb2ZpbGVJbmZvQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB3aGVuIHByb2ZpbGUgaXMgYWJvdXQgdG8gYmUgY3JlYXRlZCc7XG5cdFx0XHRcdFx0c291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVHlwZSBvZiBwcm9maWxlIHNvdXJjZScgfTtcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBDcmVhdGVQcm9maWxlSW5mb0V2ZW50ID0ge1xuXHRcdFx0XHRcdHNvdXJjZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBjcmVhdGVQcm9maWxlVGVsZW1ldHJ5RGF0YTogQ3JlYXRlUHJvZmlsZUluZm9FdmVudCA9IHsgc291cmNlOiBjb3B5RnJvbSBpbnN0YW5jZW9mIFVSSSA/ICd0ZW1wbGF0ZScgOiBpc1VzZXJEYXRhUHJvZmlsZShjb3B5RnJvbSkgPyAncHJvZmlsZScgOiBjb3B5RnJvbSA/ICdleHRlcm5hbCcgOiB1bmRlZmluZWQgfTtcblxuXHRcdFx0XHRpZiAoY29weUZyb20gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdFx0XHRjb25zdCB0ZW1wbGF0ZSA9IGF3YWl0IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQucmVzb2x2ZVRlbXBsYXRlKGNvcHlGcm9tKTtcblx0XHRcdFx0XHRpZiAodGVtcGxhdGUpIHtcblx0XHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENyZWF0ZVByb2ZpbGVJbmZvRXZlbnQsIENyZWF0ZVByb2ZpbGVJbmZvQ2xhc3NpZmljYXRpb24+KCd1c2VyRGF0YVByb2ZpbGUuY3JlYXRlRnJvbVRlbXBsYXRlJywgY3JlYXRlUHJvZmlsZVRlbGVtZXRyeURhdGEpO1xuXHRcdFx0XHRcdFx0cHJvZmlsZSA9IGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZS5jcmVhdGVQcm9maWxlRnJvbVRlbXBsYXRlKFxuXHRcdFx0XHRcdFx0XHR0ZW1wbGF0ZSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0dXNlRGVmYXVsdEZsYWdzLFxuXHRcdFx0XHRcdFx0XHRcdGljb24sXG5cdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2VUeXBlRmxhZ3M6IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQuY29weUZsYWdzLFxuXHRcdFx0XHRcdFx0XHRcdHRyYW5zaWVudFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChpc1VzZXJEYXRhUHJvZmlsZShjb3B5RnJvbSkpIHtcblx0XHRcdFx0XHRwcm9maWxlID0gYXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLmNyZWF0ZUZyb21Qcm9maWxlKFxuXHRcdFx0XHRcdFx0Y29weUZyb20sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHRcdHVzZURlZmF1bHRGbGFncyxcblx0XHRcdFx0XHRcdFx0aWNvbjogaWNvbixcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2VUeXBlRmxhZ3M6IHRoaXMubmV3UHJvZmlsZUVsZW1lbnQuY29weUZsYWdzLFxuXHRcdFx0XHRcdFx0XHR0cmFuc2llbnRcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwcm9maWxlID0gYXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVQcm9maWxlKG5hbWUsIHsgdXNlRGVmYXVsdEZsYWdzLCBpY29uLCB0cmFuc2llbnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMubmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5uZXdQcm9maWxlRWxlbWVudC5kaXNhYmxlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5yZW1vdmVQcm9maWxlKHByb2ZpbGUpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHByb2ZpbGUgJiYgIXByb2ZpbGUuaXNJbnRlcm5hbCAmJiB0aGlzLm5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLnJlbW92ZU5ld1Byb2ZpbGUoKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcHJvZmlsZXMuZmluZCgoW3BdKSA9PiBwLm5hbWUgPT09IHByb2ZpbGUubmFtZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShleGlzdGluZ1swXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlUHJvZmlsZXMoeyBhZGRlZDogW3Byb2ZpbGVdLCByZW1vdmVkOiBbXSwgdXBkYXRlZDogW10sIGFsbDogdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcyB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvZmlsZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzY2FyZE5ld1Byb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLm5ld1Byb2ZpbGVFbGVtZW50LnByZXZpZXdQcm9maWxlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnJlbW92ZVByb2ZpbGUodGhpcy5uZXdQcm9maWxlRWxlbWVudC5wcmV2aWV3UHJvZmlsZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucmVtb3ZlTmV3UHJvZmlsZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVtb3ZlUHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2RlbGV0ZVByb2ZpbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgdGhlIHByb2ZpbGUgJ3swfSc/XCIsIHByb2ZpbGUubmFtZSksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGVsZXRlJywgXCJEZWxldGVcIiksXG5cdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKVxuXHRcdH0pO1xuXHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnJlbW92ZVByb2ZpbGUocHJvZmlsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuV2luZG93KHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coeyBmb3JjZVByb2ZpbGU6IHByb2ZpbGUubmFtZSB9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFFBQWlCLFdBQVcsZ0JBQWdCO0FBQ3JELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFpQyxtQkFBcUMsMEJBQTBCLHFCQUErQyx5QkFBaUQ7QUFDaE0sU0FBOEQsY0FBYyxxQ0FBcUMsbUNBQW1DLCtCQUF5RDtB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
