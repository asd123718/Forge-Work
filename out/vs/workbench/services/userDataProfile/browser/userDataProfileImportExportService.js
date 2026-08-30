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
import "./media/userDataProfileView.css";
import { localize } from "../../../../nls.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter } from "../../../../base/common/event.js";
import { IUserDataProfileImportExportService, PROFILE_FILTER, PROFILE_EXTENSION, IUserDataProfileService, PROFILES_CATEGORY, IUserDataProfileManagementService, PROFILE_URL_AUTHORITY, toUserDataProfileUri, isProfileURL, PROFILE_URL_AUTHORITY_PREFIX } from "../common/userDataProfile.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { URI } from "../../../../base/common/uri.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { SettingsResource, SettingsResourceTreeItem } from "./settingsResource.js";
import { KeybindingsResource, KeybindingsResourceTreeItem } from "./keybindingsResource.js";
import { SnippetsResource, SnippetsResourceTreeItem } from "./snippetsResource.js";
import { TasksResource, TasksResourceTreeItem } from "./tasksResource.js";
import { ExtensionsResource, ExtensionsResourceExportTreeItem, ExtensionsResourceTreeItem } from "./extensionsResource.js";
import { GlobalStateResource, GlobalStateResourceExportTreeItem, GlobalStateResourceTreeItem } from "./globalStateResource.js";
import { InMemoryFileSystemProvider } from "../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { joinPath } from "../../../../base/common/resources.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { Schemas } from "../../../../base/common/network.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import Severity from "../../../../base/common/severity.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { asText, IRequestService } from "../../../../platform/request/common/request.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { isUndefined } from "../../../../base/common/types.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
function isUserDataProfileTemplate(thing) {
  const candidate = thing;
  return !!(candidate && typeof candidate === "object" && (candidate.name && typeof candidate.name === "string") && (isUndefined(candidate.icon) || typeof candidate.icon === "string") && (isUndefined(candidate.settings) || typeof candidate.settings === "string") && (isUndefined(candidate.globalState) || typeof candidate.globalState === "string") && (isUndefined(candidate.extensions) || typeof candidate.extensions === "string"));
}
let UserDataProfileImportExportService = class extends Disposable {
  constructor(instantiationService, userDataProfileService, userDataProfileManagementService, userDataProfilesService, extensionService, quickInputService, progressService, dialogService, clipboardService, openerService, requestService, productService, uriIdentityService) {
    super();
    this.instantiationService = instantiationService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfilesService = userDataProfilesService;
    this.extensionService = extensionService;
    this.quickInputService = quickInputService;
    this.progressService = progressService;
    this.dialogService = dialogService;
    this.clipboardService = clipboardService;
    this.openerService = openerService;
    this.requestService = requestService;
    this.productService = productService;
    this.uriIdentityService = uriIdentityService;
    this.profileContentHandlers = /* @__PURE__ */ new Map();
    this.registerProfileContentHandler(Schemas.file, this.fileUserDataProfileContentHandler = instantiationService.createInstance(FileUserDataProfileContentHandler));
  }
  registerProfileContentHandler(id, profileContentHandler) {
    if (this.profileContentHandlers.has(id)) {
      throw new Error(`Profile content handler with id '${id}' already registered.`);
    }
    this.profileContentHandlers.set(id, profileContentHandler);
    return toDisposable(() => this.unregisterProfileContentHandler(id));
  }
  unregisterProfileContentHandler(id) {
    this.profileContentHandlers.delete(id);
  }
  async createFromProfile(from, options, token) {
    const disposables = new DisposableStore();
    let creationPromise;
    disposables.add(token.onCancellationRequested(() => creationPromise.cancel()));
    let profile;
    return this.progressService.withProgress({
      location: ProgressLocation.Notification,
      delay: 500,
      sticky: true,
      cancellable: true
    }, async (progress) => {
      const reportProgress = (message) => progress.report({ message: localize("create from profile", "Create Profile: {0}", message) });
      creationPromise = createCancelablePromise(async (token2) => {
        const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, from, { ...options?.resourceTypeFlags, extensions: false }));
        const profileTemplate = await userDataProfilesExportState.getProfileTemplate(options.name ?? from.name, options?.icon);
        profile = await this.getProfileToImport({ ...profileTemplate, name: options.name ?? profileTemplate.name }, !!options.transient, options);
        if (!profile) {
          return;
        }
        if (token2.isCancellationRequested) {
          return;
        }
        await this.applyProfileTemplate(profileTemplate, profile, options, reportProgress, token2);
      });
      try {
        await creationPromise;
        if (profile && (options?.resourceTypeFlags?.extensions ?? true)) {
          reportProgress(localize("installing extensions", "Installing Extensions..."));
          await this.instantiationService.createInstance(ExtensionsResource).copy(from, profile, false);
        }
      } catch (error) {
        if (profile) {
          await this.userDataProfilesService.removeProfile(profile);
          profile = void 0;
        }
      }
      return profile;
    }, () => creationPromise.cancel()).finally(() => disposables.dispose());
  }
  async createProfileFromTemplate(profileTemplate, options, token) {
    const disposables = new DisposableStore();
    let creationPromise;
    disposables.add(token.onCancellationRequested(() => creationPromise.cancel()));
    let profile;
    return this.progressService.withProgress({
      location: ProgressLocation.Notification,
      delay: 500,
      sticky: true,
      cancellable: true
    }, async (progress) => {
      const reportProgress = (message) => progress.report({ message: localize("create from profile", "Create Profile: {0}", message) });
      creationPromise = createCancelablePromise(async (token2) => {
        profile = await this.getProfileToImport({ ...profileTemplate, name: options.name ?? profileTemplate.name }, !!options.transient, options);
        if (!profile) {
          return;
        }
        if (token2.isCancellationRequested) {
          return;
        }
        await this.applyProfileTemplate(profileTemplate, profile, options, reportProgress, token2);
      });
      try {
        await creationPromise;
      } catch (error) {
        if (profile) {
          await this.userDataProfilesService.removeProfile(profile);
          profile = void 0;
        }
      }
      return profile;
    }, () => creationPromise.cancel()).finally(() => disposables.dispose());
  }
  async applyProfileTemplate(profileTemplate, profile, options, reportProgress, token) {
    if (profileTemplate.settings && (options.resourceTypeFlags?.settings ?? true) && !profile.useDefaultFlags?.settings) {
      reportProgress(localize("creating settings", "Creating Settings..."));
      await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.keybindings && (options.resourceTypeFlags?.keybindings ?? true) && !profile.useDefaultFlags?.keybindings) {
      reportProgress(localize("create keybindings", "Creating Keyboard Shortcuts..."));
      await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.tasks && (options.resourceTypeFlags?.tasks ?? true) && !profile.useDefaultFlags?.tasks) {
      reportProgress(localize("create tasks", "Creating Tasks..."));
      await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.snippets && (options.resourceTypeFlags?.snippets ?? true) && !profile.useDefaultFlags?.snippets) {
      reportProgress(localize("create snippets", "Creating Snippets..."));
      await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.globalState && !profile.useDefaultFlags?.globalState) {
      reportProgress(localize("applying global state", "Applying UI State..."));
      await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (profileTemplate.extensions && (options.resourceTypeFlags?.extensions ?? true) && !profile.useDefaultFlags?.extensions) {
      reportProgress(localize("installing extensions", "Installing Extensions..."));
      await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile, reportProgress, token);
    }
  }
  async exportProfile(profile, exportFlags) {
    const disposables = new DisposableStore();
    try {
      const userDataProfilesExportState = disposables.add(this.instantiationService.createInstance(UserDataProfileExportState, profile, exportFlags));
      await this.doExportProfile(userDataProfilesExportState, ProgressLocation.Notification);
    } finally {
      disposables.dispose();
    }
  }
  async createTroubleshootProfile() {
    const userDataProfilesExportState = this.instantiationService.createInstance(UserDataProfileExportState, this.userDataProfileService.currentProfile, void 0);
    try {
      const profileTemplate = await userDataProfilesExportState.getProfileTemplate(localize("troubleshoot issue", "Troubleshoot Issue"), void 0);
      await this.progressService.withProgress({
        location: ProgressLocation.Notification,
        delay: 1e3,
        sticky: true
      }, async (progress) => {
        const reportProgress = (message) => progress.report({ message: localize("troubleshoot profile progress", "Setting up Troubleshoot Profile: {0}", message) });
        const profile = await this.doCreateProfile(profileTemplate, true, false, { useDefaultFlags: this.userDataProfileService.currentProfile.useDefaultFlags }, reportProgress);
        if (profile) {
          reportProgress(localize("progress extensions", "Applying Extensions..."));
          await this.instantiationService.createInstance(ExtensionsResource).copy(this.userDataProfileService.currentProfile, profile, true);
          reportProgress(localize("switching profile", "Switching Profile..."));
          await this.userDataProfileManagementService.switchProfile(profile);
        }
      });
    } finally {
      userDataProfilesExportState.dispose();
    }
  }
  async doExportProfile(userDataProfilesExportState, location) {
    const profile = await userDataProfilesExportState.getProfileToExport();
    if (!profile) {
      return;
    }
    const disposables = new DisposableStore();
    try {
      await this.progressService.withProgress({
        location,
        title: localize("profiles.exporting", "{0}: Exporting...", PROFILES_CATEGORY.value)
      }, async (progress) => {
        const id = await this.pickProfileContentHandler(profile.name);
        if (!id) {
          return;
        }
        const profileContentHandler = this.profileContentHandlers.get(id);
        if (!profileContentHandler) {
          return;
        }
        const saveResult = await profileContentHandler.saveProfile(profile.name.replace("/", "-"), JSON.stringify(profile), CancellationToken.None);
        if (!saveResult) {
          return;
        }
        const message = localize("export success", "Profile '{0}' was exported successfully.", profile.name);
        if (profileContentHandler.extensionId) {
          const buttons = [];
          const link = this.productService.webUrl ? `${this.productService.webUrl}/${PROFILE_URL_AUTHORITY}/${id}/${saveResult.id}` : toUserDataProfileUri(`/${id}/${saveResult.id}`, this.productService).toString();
          buttons.push({
            label: localize({ key: "copy", comment: ["&& denotes a mnemonic"] }, "&&Copy Link"),
            run: () => this.clipboardService.writeText(link)
          });
          if (this.productService.webUrl) {
            buttons.push({
              label: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open Link"),
              run: async () => {
                await this.openerService.open(link);
              }
            });
          } else {
            buttons.push({
              label: localize({ key: "open in", comment: ["&& denotes a mnemonic"] }, "&&Open in {0}", profileContentHandler.name),
              run: async () => {
                await this.openerService.open(saveResult.link.toString());
              }
            });
          }
          await this.dialogService.prompt({
            type: Severity.Info,
            message,
            buttons,
            cancelButton: localize("close", "Close")
          });
        } else {
          await this.dialogService.info(message);
        }
      });
    } finally {
      disposables.dispose();
    }
  }
  async resolveProfileTemplate(uri, options) {
    const profileContent = await this.resolveProfileContent(uri);
    if (profileContent === null) {
      return null;
    }
    let profileTemplate;
    try {
      profileTemplate = JSON.parse(profileContent);
    } catch (error) {
      throw new Error(localize("invalid profile content", "This profile is not valid."));
    }
    if (!isUserDataProfileTemplate(profileTemplate)) {
      return null;
    }
    if (options?.name) {
      profileTemplate.name = options.name;
    }
    if (options?.icon) {
      profileTemplate.icon = options.icon;
    }
    if (options?.resourceTypeFlags?.settings === false) {
      profileTemplate.settings = void 0;
    }
    if (options?.resourceTypeFlags?.keybindings === false) {
      profileTemplate.keybindings = void 0;
    }
    if (options?.resourceTypeFlags?.snippets === false) {
      profileTemplate.snippets = void 0;
    }
    if (options?.resourceTypeFlags?.tasks === false) {
      profileTemplate.tasks = void 0;
    }
    if (options?.resourceTypeFlags?.globalState === false) {
      profileTemplate.globalState = void 0;
    }
    if (options?.resourceTypeFlags?.extensions === false) {
      profileTemplate.extensions = void 0;
    }
    return profileTemplate;
  }
  async doCreateProfile(profileTemplate, temporaryProfile, extensions, options, progress) {
    const profile = await this.getProfileToImport(profileTemplate, temporaryProfile, options);
    if (!profile) {
      return void 0;
    }
    if (profileTemplate.settings && !profile.useDefaultFlags?.settings) {
      progress(localize("progress settings", "Applying Settings..."));
      await this.instantiationService.createInstance(SettingsResource).apply(profileTemplate.settings, profile);
    }
    if (profileTemplate.keybindings && !profile.useDefaultFlags?.keybindings) {
      progress(localize("progress keybindings", "Applying Keyboard Shortcuts..."));
      await this.instantiationService.createInstance(KeybindingsResource).apply(profileTemplate.keybindings, profile);
    }
    if (profileTemplate.tasks && !profile.useDefaultFlags?.tasks) {
      progress(localize("progress tasks", "Applying Tasks..."));
      await this.instantiationService.createInstance(TasksResource).apply(profileTemplate.tasks, profile);
    }
    if (profileTemplate.snippets && !profile.useDefaultFlags?.snippets) {
      progress(localize("progress snippets", "Applying Snippets..."));
      await this.instantiationService.createInstance(SnippetsResource).apply(profileTemplate.snippets, profile);
    }
    if (profileTemplate.globalState && !profile.useDefaultFlags?.globalState) {
      progress(localize("progress global state", "Applying State..."));
      await this.instantiationService.createInstance(GlobalStateResource).apply(profileTemplate.globalState, profile);
    }
    if (profileTemplate.extensions && extensions && !profile.useDefaultFlags?.extensions) {
      progress(localize("progress extensions", "Applying Extensions..."));
      await this.instantiationService.createInstance(ExtensionsResource).apply(profileTemplate.extensions, profile);
    }
    return profile;
  }
  async resolveProfileContent(resource) {
    if (await this.fileUserDataProfileContentHandler.canHandle(resource)) {
      return this.fileUserDataProfileContentHandler.readProfile(resource, CancellationToken.None);
    }
    if (isProfileURL(resource)) {
      let handlerId, idOrUri;
      if (resource.authority === PROFILE_URL_AUTHORITY) {
        idOrUri = this.uriIdentityService.extUri.basename(resource);
        handlerId = this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(resource));
      } else {
        handlerId = resource.authority.substring(PROFILE_URL_AUTHORITY_PREFIX.length);
        idOrUri = URI.parse(resource.path.substring(1));
      }
      await this.extensionService.activateByEvent(`onProfile:${handlerId}`);
      const profileContentHandler = this.profileContentHandlers.get(handlerId);
      if (profileContentHandler) {
        return profileContentHandler.readProfile(idOrUri, CancellationToken.None);
      }
    }
    await this.extensionService.activateByEvent("onProfile");
    for (const profileContentHandler of this.profileContentHandlers.values()) {
      const content = await profileContentHandler.readProfile(resource, CancellationToken.None);
      if (content !== null) {
        return content;
      }
    }
    const context = await this.requestService.request({ type: "GET", url: resource.toString(true), callSite: "userDataProfileImportExportService.resolveContent" }, CancellationToken.None);
    if (context.res.statusCode === 200) {
      return await asText(context);
    } else {
      const message = await asText(context);
      throw new Error(`Failed to get profile from URL: ${resource.toString()}. Status code: ${context.res.statusCode}. Message: ${message}`);
    }
  }
  async pickProfileContentHandler(name) {
    await this.extensionService.activateByEvent("onProfile");
    if (this.profileContentHandlers.size === 1) {
      return this.profileContentHandlers.keys().next().value;
    }
    const options = [];
    for (const [id, profileContentHandler] of this.profileContentHandlers) {
      options.push({ id, label: profileContentHandler.name, description: profileContentHandler.description });
    }
    const result = await this.quickInputService.pick(
      options.reverse(),
      {
        title: localize("select profile content handler", "Export '{0}' profile as...", name),
        hideInput: true
      }
    );
    return result?.id;
  }
  async getProfileToImport(profileTemplate, temp, options) {
    const profileName = profileTemplate.name;
    const profile = this.userDataProfilesService.profiles.find((p) => p.name === profileName);
    if (profile) {
      if (temp) {
        return this.userDataProfilesService.createNamedProfile(`${profileName} ${this.getProfileNameIndex(profileName)}`, { ...options, transient: temp });
      }
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Info,
        message: localize("profile already exists", "Profile with name '{0}' already exists. Do you want to replace its contents?", profileName),
        primaryButton: localize({ key: "overwrite", comment: ["&& denotes a mnemonic"] }, "&&Replace")
      });
      if (!confirmed) {
        return void 0;
      }
      return profile.isDefault ? profile : this.userDataProfilesService.updateProfile(profile, options);
    } else {
      return this.userDataProfilesService.createNamedProfile(profileName, { ...options, transient: temp });
    }
  }
  getProfileNameIndex(name) {
    const nameRegEx = new RegExp(`${escapeRegExpCharacters(name)}\\s(\\d+)`);
    let nameIndex = 0;
    for (const profile of this.userDataProfilesService.profiles) {
      const matches = nameRegEx.exec(profile.name);
      const index = matches ? parseInt(matches[1]) : 0;
      nameIndex = index > nameIndex ? index : nameIndex;
    }
    return nameIndex + 1;
  }
};
UserDataProfileImportExportService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IUserDataProfileService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, IUserDataProfilesService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IClipboardService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IRequestService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IUriIdentityService)
], UserDataProfileImportExportService);
let FileUserDataProfileContentHandler = class {
  constructor(fileDialogService, uriIdentityService, fileService, productService, textFileService) {
    this.fileDialogService = fileDialogService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.productService = productService;
    this.textFileService = textFileService;
    this.name = localize("local", "Local");
    this.description = localize("file", "file");
  }
  async saveProfile(name, content, token) {
    const link = await this.fileDialogService.showSaveDialog({
      title: localize("export profile dialog", "Save Profile"),
      filters: PROFILE_FILTER,
      defaultUri: this.uriIdentityService.extUri.joinPath(await this.fileDialogService.defaultFilePath(), `${name}.${PROFILE_EXTENSION}`)
    });
    if (!link) {
      return null;
    }
    await this.textFileService.create([{ resource: link, value: content, options: { overwrite: true } }]);
    return { link, id: link.toString() };
  }
  async canHandle(uri) {
    return uri.scheme !== Schemas.http && uri.scheme !== Schemas.https && uri.scheme !== this.productService.urlProtocol && await this.fileService.canHandleResource(uri);
  }
  async readProfile(uri, token) {
    if (await this.canHandle(uri)) {
      return (await this.fileService.readFile(uri, void 0, token)).value.toString();
    }
    return null;
  }
  async selectProfile() {
    const profileLocation = await this.fileDialogService.showOpenDialog({
      canSelectFolders: false,
      canSelectFiles: true,
      canSelectMany: false,
      filters: PROFILE_FILTER,
      title: localize("select profile", "Select Profile")
    });
    return profileLocation ? profileLocation[0] : null;
  }
};
FileUserDataProfileContentHandler = __decorateClass([
  __decorateParam(0, IFileDialogService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IProductService),
  __decorateParam(4, ITextFileService)
], FileUserDataProfileContentHandler);
const USER_DATA_PROFILE_EXPORT_SCHEME = "userdataprofileexport";
const USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME = "userdataprofileexportpreview";
let UserDataProfileImportExportState = class extends Disposable {
  constructor(quickInputService) {
    super();
    this.quickInputService = quickInputService;
    this._onDidChangeRoots = this._register(new Emitter());
    this.onDidChangeRoots = this._onDidChangeRoots.event;
    this.roots = [];
  }
  async getChildren(element) {
    if (element) {
      const children = await element.getChildren();
      if (children) {
        for (const child of children) {
          if (child.parent.checkbox && child.checkbox) {
            child.checkbox.isChecked = child.parent.checkbox.isChecked && child.checkbox.isChecked;
          }
        }
      }
      return children;
    } else {
      this.rootsPromise = void 0;
      this._onDidChangeRoots.fire();
      return this.getRoots();
    }
  }
  getRoots() {
    if (!this.rootsPromise) {
      this.rootsPromise = (async () => {
        this.roots = await this.fetchRoots();
        for (const root of this.roots) {
          const labelText = isMarkdownString(root.label.label) ? root.label.label.value : root.label.label;
          root.checkbox = {
            isChecked: !root.isFromDefaultProfile(),
            tooltip: localize("select", "Select {0}", labelText),
            accessibilityInformation: {
              label: localize("select", "Select {0}", labelText)
            }
          };
          if (root.isFromDefaultProfile()) {
            root.description = localize("from default", "From Default Profile");
          }
        }
        return this.roots;
      })();
    }
    return this.rootsPromise;
  }
  isEnabled(resourceType) {
    if (resourceType !== void 0) {
      return this.roots.some((root) => root.type === resourceType && this.isSelected(root));
    }
    return this.roots.some((root) => this.isSelected(root));
  }
  async getProfileTemplate(name, icon) {
    const roots = await this.getRoots();
    let settings;
    let keybindings;
    let tasks;
    let snippets;
    let extensions;
    let globalState;
    for (const root of roots) {
      if (!this.isSelected(root)) {
        continue;
      }
      if (root instanceof SettingsResourceTreeItem) {
        settings = await root.getContent();
      } else if (root instanceof KeybindingsResourceTreeItem) {
        keybindings = await root.getContent();
      } else if (root instanceof TasksResourceTreeItem) {
        tasks = await root.getContent();
      } else if (root instanceof SnippetsResourceTreeItem) {
        snippets = await root.getContent();
      } else if (root instanceof ExtensionsResourceTreeItem) {
        extensions = await root.getContent();
      } else if (root instanceof GlobalStateResourceTreeItem) {
        globalState = await root.getContent();
      }
    }
    return {
      name,
      icon,
      settings,
      keybindings,
      tasks,
      snippets,
      extensions,
      globalState
    };
  }
  isSelected(treeItem) {
    if (treeItem.checkbox) {
      return treeItem.checkbox.isChecked || !!treeItem.children?.some((child) => child.checkbox?.isChecked);
    }
    return true;
  }
};
UserDataProfileImportExportState = __decorateClass([
  __decorateParam(0, IQuickInputService)
], UserDataProfileImportExportState);
let UserDataProfileExportState = class extends UserDataProfileImportExportState {
  constructor(profile, exportFlags, quickInputService, fileService, instantiationService) {
    super(quickInputService);
    this.profile = profile;
    this.exportFlags = exportFlags;
    this.fileService = fileService;
    this.instantiationService = instantiationService;
    this.disposables = this._register(new DisposableStore());
  }
  async fetchRoots() {
    this.disposables.clear();
    this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_EXPORT_SCHEME, this._register(new InMemoryFileSystemProvider())));
    const previewFileSystemProvider = this._register(new InMemoryFileSystemProvider());
    this.disposables.add(this.fileService.registerProvider(USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME, previewFileSystemProvider));
    const roots = [];
    const exportPreviewProfle = this.createExportPreviewProfile(this.profile);
    if (this.exportFlags?.settings ?? true) {
      const settingsResource = this.instantiationService.createInstance(SettingsResource);
      const settingsContent = await settingsResource.getContent(this.profile);
      await settingsResource.apply(settingsContent, exportPreviewProfle);
      const settingsResourceTreeItem = this.instantiationService.createInstance(SettingsResourceTreeItem, exportPreviewProfle);
      if (await settingsResourceTreeItem.hasContent()) {
        roots.push(settingsResourceTreeItem);
      }
    }
    if (this.exportFlags?.keybindings ?? true) {
      const keybindingsResource = this.instantiationService.createInstance(KeybindingsResource);
      const keybindingsContent = await keybindingsResource.getContent(this.profile);
      await keybindingsResource.apply(keybindingsContent, exportPreviewProfle);
      const keybindingsResourceTreeItem = this.instantiationService.createInstance(KeybindingsResourceTreeItem, exportPreviewProfle);
      if (await keybindingsResourceTreeItem.hasContent()) {
        roots.push(keybindingsResourceTreeItem);
      }
    }
    if (this.exportFlags?.snippets ?? true) {
      const snippetsResource = this.instantiationService.createInstance(SnippetsResource);
      const snippetsContent = await snippetsResource.getContent(this.profile);
      await snippetsResource.apply(snippetsContent, exportPreviewProfle);
      const snippetsResourceTreeItem = this.instantiationService.createInstance(SnippetsResourceTreeItem, exportPreviewProfle);
      if (await snippetsResourceTreeItem.hasContent()) {
        roots.push(snippetsResourceTreeItem);
      }
    }
    if (this.exportFlags?.tasks ?? true) {
      const tasksResource = this.instantiationService.createInstance(TasksResource);
      const tasksContent = await tasksResource.getContent(this.profile);
      await tasksResource.apply(tasksContent, exportPreviewProfle);
      const tasksResourceTreeItem = this.instantiationService.createInstance(TasksResourceTreeItem, exportPreviewProfle);
      if (await tasksResourceTreeItem.hasContent()) {
        roots.push(tasksResourceTreeItem);
      }
    }
    if (this.exportFlags?.globalState ?? true) {
      const globalStateResource = joinPath(exportPreviewProfle.globalStorageHome, "globalState.json").with({ scheme: USER_DATA_PROFILE_EXPORT_PREVIEW_SCHEME });
      const globalStateResourceTreeItem = this.instantiationService.createInstance(GlobalStateResourceExportTreeItem, exportPreviewProfle, globalStateResource);
      const content = await globalStateResourceTreeItem.getContent();
      if (content) {
        await this.fileService.writeFile(globalStateResource, VSBuffer.fromString(JSON.stringify(JSON.parse(content), null, "	")));
        roots.push(globalStateResourceTreeItem);
      }
    }
    if (this.exportFlags?.extensions ?? true) {
      const extensionsResourceTreeItem = this.instantiationService.createInstance(ExtensionsResourceExportTreeItem, exportPreviewProfle);
      if (await extensionsResourceTreeItem.hasContent()) {
        roots.push(extensionsResourceTreeItem);
      }
    }
    previewFileSystemProvider.setReadOnly(true);
    return roots;
  }
  createExportPreviewProfile(profile) {
    return {
      id: profile.id,
      name: profile.name,
      location: profile.location,
      isDefault: profile.isDefault,
      icon: profile.icon,
      globalStorageHome: profile.globalStorageHome,
      settingsResource: profile.settingsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      keybindingsResource: profile.keybindingsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      tasksResource: profile.tasksResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      mcpResource: profile.mcpResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      languageModelsResource: profile.languageModelsResource.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      snippetsHome: profile.snippetsHome.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      promptsHome: profile.promptsHome.with({ scheme: USER_DATA_PROFILE_EXPORT_SCHEME }),
      extensionsResource: profile.extensionsResource,
      cacheHome: profile.cacheHome,
      agentPluginsHome: profile.agentPluginsHome,
      useDefaultFlags: profile.useDefaultFlags,
      isTransient: profile.isTransient
    };
  }
  async getProfileToExport() {
    let name = this.profile.name;
    if (this.profile.isDefault) {
      name = await this.quickInputService.input({
        placeHolder: localize("export profile name", "Name the profile"),
        title: localize("export profile title", "Export Profile"),
        async validateInput(input) {
          if (!input.trim()) {
            return localize("profile name required", "Profile name must be provided.");
          }
          return void 0;
        }
      });
      if (!name) {
        return null;
      }
    }
    return super.getProfileTemplate(name, this.profile.icon);
  }
};
UserDataProfileExportState = __decorateClass([
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService)
], UserDataProfileExportState);
registerSingleton(IUserDataProfileImportExportService, UserDataProfileImportExportService, InstantiationType.Delayed);
export {
  UserDataProfileImportExportService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx1c2VyRGF0YVByb2ZpbGVcXGJyb3dzZXJcXHVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvdXNlckRhdGFQcm9maWxlVmlldy5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsIFBST0ZJTEVfRklMVEVSLCBQUk9GSUxFX0VYVEVOU0lPTiwgSVVzZXJEYXRhUHJvZmlsZUNvbnRlbnRIYW5kbGVyLCBJVXNlckRhdGFQcm9maWxlU2VydmljZSwgSVByb2ZpbGVSZXNvdXJjZVRyZWVJdGVtLCBQUk9GSUxFU19DQVRFR09SWSwgSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLCBJU2F2ZVByb2ZpbGVSZXN1bHQsIElQcm9maWxlSW1wb3J0T3B0aW9ucywgUFJPRklMRV9VUkxfQVVUSE9SSVRZLCB0b1VzZXJEYXRhUHJvZmlsZVVyaSwgSVVzZXJEYXRhUHJvZmlsZUNyZWF0ZU9wdGlvbnMsIGlzUHJvZmlsZVVSTCwgUFJPRklMRV9VUkxfQVVUSE9SSVRZX1BSRUZJWCB9IGZyb20gJy4uL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UsIElQcm9tcHRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVHJlZUl0ZW0sIElUcmVlVmlld0RhdGFQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlT3B0aW9ucywgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBQcm9maWxlUmVzb3VyY2VUeXBlLCBQcm9maWxlUmVzb3VyY2VUeXBlRmxhZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc1Jlc291cmNlLCBTZXR0aW5nc1Jlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuL3NldHRpbmdzUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZXNvdXJjZSwgS2V5YmluZGluZ3NSZXNvdXJjZVRyZWVJdGVtIH0gZnJvbSAnLi9rZXliaW5kaW5nc1Jlc291cmNlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRzUmVzb3VyY2UsIFNuaXBwZXRzUmVzb3VyY2VUcmVlSXRlbSB9IGZyb20gJy4vc25pcHBldHNSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBUYXNrc1Jlc291cmNlLCBUYXNrc1Jlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuL3Rhc2tzUmVzb3VyY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1Jlc291cmNlLCBFeHRlbnNpb25zUmVzb3VyY2VFeHBvcnRUcmVlSXRlbSwgRXh0ZW5zaW9uc1Jlc291cmNlVHJlZUl0ZW0gfSBmcm9tICcuL2V4dGVuc2lvbnNSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBHbG9iYWxTdGF0ZVJlc291cmNlLCBHbG9iYWxTdGF0ZVJlc291cmNlRXhwb3J0VHJlZUl0ZW0sIEdsb2JhbFN0YXRlUmVzb3VyY2VUcmVlSXRlbSB9IGZyb20gJy4vZ2xvYmFsU3RhdGVSZXNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzVGV4dCwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlLCBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuaW50ZXJmYWNlIElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbj86IHN0cmluZztcblx0cmVhZG9ubHkgc2V0dGluZ3M/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGtleWJpbmRpbmdzPzogc3RyaW5nO1xuXHRyZWFkb25seSB0YXNrcz86IHN0cmluZztcblx0cmVhZG9ubHkgc25pcHBldHM/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGdsb2JhbFN0YXRlPzogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25zPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBpc1VzZXJEYXRhUHJvZmlsZVRlbXBsYXRlKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgSVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdGhpbmcgYXMgSVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiAhIShjYW5kaWRhdGUgJiYgdHlwZW9mIGNhbmRpZGF0ZSA9PT0gJ29iamVjdCdcblx0XHQmJiAoY2FuZGlkYXRlLm5hbWUgJiYgdHlwZW9mIGNhbmRpZGF0ZS5uYW1lID09PSAnc3RyaW5nJylcblx0XHQmJiAoaXNVbmRlZmluZWQoY2FuZGlkYXRlLmljb24pIHx8IHR5cGVvZiBjYW5kaWRhdGUuaWNvbiA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGlzVW5kZWZpbmVkKGNhbmRpZGF0ZS5zZXR0aW5ncykgfHwgdHlwZW9mIGNhbmRpZGF0ZS5zZXR0aW5ncyA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGlzVW5kZWZpbmVkKGNhbmRpZGF0ZS5nbG9iYWxTdGF0ZSkgfHwgdHlwZW9mIGNhbmRpZGF0ZS5nbG9iYWxTdGF0ZSA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGlzVW5kZWZpbmVkKGNhbmRpZGF0ZS5leHRlbnNpb25zKSB8fCB0eXBlb2YgY2FuZGlkYXRlLmV4dGVuc2lvbnMgPT09ICdzdHJpbmcnKSk7XG59XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBwcm9maWxlQ29udGVudEhhbmRsZXJzID0gbmV3IE1hcDxzdHJpbmcsIElVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlcj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlcjogRmlsZVVzZXJEYXRhUHJvZmlsZUNvbnRlbnRIYW5kbGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJQcm9maWxlQ29udGVudEhhbmRsZXIoU2NoZW1hcy5maWxlLCB0aGlzLmZpbGVVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlcikpO1xuXHR9XG5cblx0cmVnaXN0ZXJQcm9maWxlQ29udGVudEhhbmRsZXIoaWQ6IHN0cmluZywgcHJvZmlsZUNvbnRlbnRIYW5kbGVyOiBJVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMucHJvZmlsZUNvbnRlbnRIYW5kbGVycy5oYXMoaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb2ZpbGUgY29udGVudCBoYW5kbGVyIHdpdGggaWQgJyR7aWR9JyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXHRcdHRoaXMucHJvZmlsZUNvbnRlbnRIYW5kbGVycy5zZXQoaWQsIHByb2ZpbGVDb250ZW50SGFuZGxlcik7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnVucmVnaXN0ZXJQcm9maWxlQ29udGVudEhhbmRsZXIoaWQpKTtcblx0fVxuXG5cdHVucmVnaXN0ZXJQcm9maWxlQ29udGVudEhhbmRsZXIoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucHJvZmlsZUNvbnRlbnRIYW5kbGVycy5kZWxldGUoaWQpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlRnJvbVByb2ZpbGUoZnJvbTogSVVzZXJEYXRhUHJvZmlsZSwgb3B0aW9uczogSVVzZXJEYXRhUHJvZmlsZUNyZWF0ZU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBjcmVhdGlvblByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+O1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBjcmVhdGlvblByb21pc2UuY2FuY2VsKCkpKTtcblx0XHRsZXQgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdGRlbGF5OiA1MDAsXG5cdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHR9LCBhc3luYyBwcm9ncmVzcyA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnRQcm9ncmVzcyA9IChtZXNzYWdlOiBzdHJpbmcpID0+IHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdjcmVhdGUgZnJvbSBwcm9maWxlJywgXCJDcmVhdGUgUHJvZmlsZTogezB9XCIsIG1lc3NhZ2UpIH0pO1xuXHRcdFx0Y3JlYXRpb25Qcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVFeHBvcnRTdGF0ZSwgZnJvbSwgeyAuLi5vcHRpb25zPy5yZXNvdXJjZVR5cGVGbGFncywgZXh0ZW5zaW9uczogZmFsc2UgfSkpO1xuXHRcdFx0XHRjb25zdCBwcm9maWxlVGVtcGxhdGUgPSBhd2FpdCB1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGUuZ2V0UHJvZmlsZVRlbXBsYXRlKG9wdGlvbnMubmFtZSA/PyBmcm9tLm5hbWUsIG9wdGlvbnM/Lmljb24pO1xuXHRcdFx0XHRwcm9maWxlID0gYXdhaXQgdGhpcy5nZXRQcm9maWxlVG9JbXBvcnQoeyAuLi5wcm9maWxlVGVtcGxhdGUsIG5hbWU6IG9wdGlvbnMubmFtZSA/PyBwcm9maWxlVGVtcGxhdGUubmFtZSB9LCAhIW9wdGlvbnMudHJhbnNpZW50LCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGlzLmFwcGx5UHJvZmlsZVRlbXBsYXRlKHByb2ZpbGVUZW1wbGF0ZSwgcHJvZmlsZSwgb3B0aW9ucywgcmVwb3J0UHJvZ3Jlc3MsIHRva2VuKTtcblx0XHRcdH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY3JlYXRpb25Qcm9taXNlO1xuXHRcdFx0XHRpZiAocHJvZmlsZSAmJiAob3B0aW9ucz8ucmVzb3VyY2VUeXBlRmxhZ3M/LmV4dGVuc2lvbnMgPz8gdHJ1ZSkpIHtcblx0XHRcdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnaW5zdGFsbGluZyBleHRlbnNpb25zJywgXCJJbnN0YWxsaW5nIEV4dGVuc2lvbnMuLi5cIikpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Jlc291cmNlKS5jb3B5KGZyb20sIHByb2ZpbGUsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnJlbW92ZVByb2ZpbGUocHJvZmlsZSk7XG5cdFx0XHRcdFx0cHJvZmlsZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHByb2ZpbGU7XG5cblx0XHR9LCAoKSA9PiBjcmVhdGlvblByb21pc2UuY2FuY2VsKCkpLmZpbmFsbHkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVByb2ZpbGVGcm9tVGVtcGxhdGUocHJvZmlsZVRlbXBsYXRlOiBJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUsIG9wdGlvbnM6IElVc2VyRGF0YVByb2ZpbGVDcmVhdGVPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgY3JlYXRpb25Qcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPjtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY3JlYXRpb25Qcm9taXNlLmNhbmNlbCgpKSk7XG5cdFx0bGV0IHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRkZWxheTogNTAwLFxuXHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsXG5cdFx0fSwgYXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3J0UHJvZ3Jlc3MgPSAobWVzc2FnZTogc3RyaW5nKSA9PiBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnY3JlYXRlIGZyb20gcHJvZmlsZScsIFwiQ3JlYXRlIFByb2ZpbGU6IHswfVwiLCBtZXNzYWdlKSB9KTtcblx0XHRcdGNyZWF0aW9uUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdFx0cHJvZmlsZSA9IGF3YWl0IHRoaXMuZ2V0UHJvZmlsZVRvSW1wb3J0KHsgLi4ucHJvZmlsZVRlbXBsYXRlLCBuYW1lOiBvcHRpb25zLm5hbWUgPz8gcHJvZmlsZVRlbXBsYXRlLm5hbWUgfSwgISFvcHRpb25zLnRyYW5zaWVudCwgb3B0aW9ucyk7XG5cdFx0XHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5hcHBseVByb2ZpbGVUZW1wbGF0ZShwcm9maWxlVGVtcGxhdGUsIHByb2ZpbGUsIG9wdGlvbnMsIHJlcG9ydFByb2dyZXNzLCB0b2tlbik7XG5cdFx0XHR9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNyZWF0aW9uUHJvbWlzZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5yZW1vdmVQcm9maWxlKHByb2ZpbGUpO1xuXHRcdFx0XHRcdHByb2ZpbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBwcm9maWxlO1xuXHRcdH0sICgpID0+IGNyZWF0aW9uUHJvbWlzZS5jYW5jZWwoKSkuZmluYWxseSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcHBseVByb2ZpbGVUZW1wbGF0ZShwcm9maWxlVGVtcGxhdGU6IElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSwgcHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgb3B0aW9uczogSVVzZXJEYXRhUHJvZmlsZUNyZWF0ZU9wdGlvbnMsIHJlcG9ydFByb2dyZXNzOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnNldHRpbmdzICYmIChvcHRpb25zLnJlc291cmNlVHlwZUZsYWdzPy5zZXR0aW5ncyA/PyB0cnVlKSAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LnNldHRpbmdzKSB7XG5cdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnY3JlYXRpbmcgc2V0dGluZ3MnLCBcIkNyZWF0aW5nIFNldHRpbmdzLi4uXCIpKTtcblx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3NSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLnNldHRpbmdzLCBwcm9maWxlKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChwcm9maWxlVGVtcGxhdGUua2V5YmluZGluZ3MgJiYgKG9wdGlvbnMucmVzb3VyY2VUeXBlRmxhZ3M/LmtleWJpbmRpbmdzID8/IHRydWUpICYmICFwcm9maWxlLnVzZURlZmF1bHRGbGFncz8ua2V5YmluZGluZ3MpIHtcblx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdjcmVhdGUga2V5YmluZGluZ3MnLCBcIkNyZWF0aW5nIEtleWJvYXJkIFNob3J0Y3V0cy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5rZXliaW5kaW5ncywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnRhc2tzICYmIChvcHRpb25zLnJlc291cmNlVHlwZUZsYWdzPy50YXNrcyA/PyB0cnVlKSAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LnRhc2tzKSB7XG5cdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnY3JlYXRlIHRhc2tzJywgXCJDcmVhdGluZyBUYXNrcy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS50YXNrcywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLnNuaXBwZXRzICYmIChvcHRpb25zLnJlc291cmNlVHlwZUZsYWdzPy5zbmlwcGV0cyA/PyB0cnVlKSAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LnNuaXBwZXRzKSB7XG5cdFx0XHRyZXBvcnRQcm9ncmVzcyhsb2NhbGl6ZSgnY3JlYXRlIHNuaXBwZXRzJywgXCJDcmVhdGluZyBTbmlwcGV0cy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5zbmlwcGV0cywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLmdsb2JhbFN0YXRlICYmICFwcm9maWxlLnVzZURlZmF1bHRGbGFncz8uZ2xvYmFsU3RhdGUpIHtcblx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdhcHBseWluZyBnbG9iYWwgc3RhdGUnLCBcIkFwcGx5aW5nIFVJIFN0YXRlLi4uXCIpKTtcblx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2xvYmFsU3RhdGVSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLmdsb2JhbFN0YXRlLCBwcm9maWxlKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChwcm9maWxlVGVtcGxhdGUuZXh0ZW5zaW9ucyAmJiAob3B0aW9ucy5yZXNvdXJjZVR5cGVGbGFncz8uZXh0ZW5zaW9ucyA/PyB0cnVlKSAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LmV4dGVuc2lvbnMpIHtcblx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdpbnN0YWxsaW5nIGV4dGVuc2lvbnMnLCBcIkluc3RhbGxpbmcgRXh0ZW5zaW9ucy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLmV4dGVuc2lvbnMsIHByb2ZpbGUsIHJlcG9ydFByb2dyZXNzLCB0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZXhwb3J0UHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBleHBvcnRGbGFncz86IFByb2ZpbGVSZXNvdXJjZVR5cGVGbGFncyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVFeHBvcnRTdGF0ZSwgcHJvZmlsZSwgZXhwb3J0RmxhZ3MpKTtcblx0XHRcdGF3YWl0IHRoaXMuZG9FeHBvcnRQcm9maWxlKHVzZXJEYXRhUHJvZmlsZXNFeHBvcnRTdGF0ZSwgUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY3JlYXRlVHJvdWJsZXNob290UHJvZmlsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhUHJvZmlsZUV4cG9ydFN0YXRlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUsIHVuZGVmaW5lZCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb2ZpbGVUZW1wbGF0ZSA9IGF3YWl0IHVzZXJEYXRhUHJvZmlsZXNFeHBvcnRTdGF0ZS5nZXRQcm9maWxlVGVtcGxhdGUobG9jYWxpemUoJ3Ryb3VibGVzaG9vdCBpc3N1ZScsIFwiVHJvdWJsZXNob290IElzc3VlXCIpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRkZWxheTogMTAwMCxcblx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0fSwgYXN5bmMgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHRjb25zdCByZXBvcnRQcm9ncmVzcyA9IChtZXNzYWdlOiBzdHJpbmcpID0+IHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCd0cm91Ymxlc2hvb3QgcHJvZmlsZSBwcm9ncmVzcycsIFwiU2V0dGluZyB1cCBUcm91Ymxlc2hvb3QgUHJvZmlsZTogezB9XCIsIG1lc3NhZ2UpIH0pO1xuXHRcdFx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdGhpcy5kb0NyZWF0ZVByb2ZpbGUocHJvZmlsZVRlbXBsYXRlLCB0cnVlLCBmYWxzZSwgeyB1c2VEZWZhdWx0RmxhZ3M6IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MgfSwgcmVwb3J0UHJvZ3Jlc3MpO1xuXHRcdFx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0XHRcdHJlcG9ydFByb2dyZXNzKGxvY2FsaXplKCdwcm9ncmVzcyBleHRlbnNpb25zJywgXCJBcHBseWluZyBFeHRlbnNpb25zLi4uXCIpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNSZXNvdXJjZSkuY29weSh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUsIHByb2ZpbGUsIHRydWUpO1xuXG5cdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MobG9jYWxpemUoJ3N3aXRjaGluZyBwcm9maWxlJywgXCJTd2l0Y2hpbmcgUHJvZmlsZS4uLlwiKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5zd2l0Y2hQcm9maWxlKHByb2ZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dXNlckRhdGFQcm9maWxlc0V4cG9ydFN0YXRlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRXhwb3J0UHJvZmlsZSh1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGU6IFVzZXJEYXRhUHJvZmlsZUV4cG9ydFN0YXRlLCBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbiB8IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCB1c2VyRGF0YVByb2ZpbGVzRXhwb3J0U3RhdGUuZ2V0UHJvZmlsZVRvRXhwb3J0KCk7XG5cdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0bG9jYXRpb24sXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncHJvZmlsZXMuZXhwb3J0aW5nJywgXCJ7MH06IEV4cG9ydGluZy4uLlwiLCBQUk9GSUxFU19DQVRFR09SWS52YWx1ZSksXG5cdFx0XHR9LCBhc3luYyBwcm9ncmVzcyA9PiB7XG5cdFx0XHRcdGNvbnN0IGlkID0gYXdhaXQgdGhpcy5waWNrUHJvZmlsZUNvbnRlbnRIYW5kbGVyKHByb2ZpbGUubmFtZSk7XG5cdFx0XHRcdGlmICghaWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcHJvZmlsZUNvbnRlbnRIYW5kbGVyID0gdGhpcy5wcm9maWxlQ29udGVudEhhbmRsZXJzLmdldChpZCk7XG5cdFx0XHRcdGlmICghcHJvZmlsZUNvbnRlbnRIYW5kbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNhdmVSZXN1bHQgPSBhd2FpdCBwcm9maWxlQ29udGVudEhhbmRsZXIuc2F2ZVByb2ZpbGUocHJvZmlsZS5uYW1lLnJlcGxhY2UoJy8nLCAnLScpLCBKU09OLnN0cmluZ2lmeShwcm9maWxlKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGlmICghc2F2ZVJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ2V4cG9ydCBzdWNjZXNzJywgXCJQcm9maWxlICd7MH0nIHdhcyBleHBvcnRlZCBzdWNjZXNzZnVsbHkuXCIsIHByb2ZpbGUubmFtZSk7XG5cdFx0XHRcdGlmIChwcm9maWxlQ29udGVudEhhbmRsZXIuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0QnV0dG9uPHZvaWQ+W10gPSBbXTtcblx0XHRcdFx0XHRjb25zdCBsaW5rID0gdGhpcy5wcm9kdWN0U2VydmljZS53ZWJVcmwgPyBgJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLndlYlVybH0vJHtQUk9GSUxFX1VSTF9BVVRIT1JJVFl9LyR7aWR9LyR7c2F2ZVJlc3VsdC5pZH1gIDogdG9Vc2VyRGF0YVByb2ZpbGVVcmkoYC8ke2lkfS8ke3NhdmVSZXN1bHQuaWR9YCwgdGhpcy5wcm9kdWN0U2VydmljZSkudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnY29weScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvcHkgTGlua1wiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChsaW5rKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLndlYlVybCkge1xuXHRcdFx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnb3BlbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9wZW4gTGlua1wiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obGluayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdvcGVuIGluJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3BlbiBpbiB7MH1cIiwgcHJvZmlsZUNvbnRlbnRIYW5kbGVyLm5hbWUpLFxuXHRcdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihzYXZlUmVzdWx0LmxpbmsudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0XHRcdGNhbmNlbEJ1dHRvbjogbG9jYWxpemUoJ2Nsb3NlJywgXCJDbG9zZVwiKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5pbmZvKG1lc3NhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc29sdmVQcm9maWxlVGVtcGxhdGUodXJpOiBVUkksIG9wdGlvbnM/OiBJUHJvZmlsZUltcG9ydE9wdGlvbnMpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZSB8IG51bGw+IHtcblx0XHRjb25zdCBwcm9maWxlQ29udGVudCA9IGF3YWl0IHRoaXMucmVzb2x2ZVByb2ZpbGVDb250ZW50KHVyaSk7XG5cdFx0aWYgKHByb2ZpbGVDb250ZW50ID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgcHJvZmlsZVRlbXBsYXRlOiBNdXRhYmxlPElVc2VyRGF0YVByb2ZpbGVUZW1wbGF0ZT47XG5cblx0XHR0cnkge1xuXHRcdFx0cHJvZmlsZVRlbXBsYXRlID0gSlNPTi5wYXJzZShwcm9maWxlQ29udGVudCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnaW52YWxpZCBwcm9maWxlIGNvbnRlbnQnLCBcIlRoaXMgcHJvZmlsZSBpcyBub3QgdmFsaWQuXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoIWlzVXNlckRhdGFQcm9maWxlVGVtcGxhdGUocHJvZmlsZVRlbXBsYXRlKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/Lm5hbWUpIHtcblx0XHRcdHByb2ZpbGVUZW1wbGF0ZS5uYW1lID0gb3B0aW9ucy5uYW1lO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5pY29uKSB7XG5cdFx0XHRwcm9maWxlVGVtcGxhdGUuaWNvbiA9IG9wdGlvbnMuaWNvbjtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8ucmVzb3VyY2VUeXBlRmxhZ3M/LnNldHRpbmdzID09PSBmYWxzZSkge1xuXHRcdFx0cHJvZmlsZVRlbXBsYXRlLnNldHRpbmdzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5yZXNvdXJjZVR5cGVGbGFncz8ua2V5YmluZGluZ3MgPT09IGZhbHNlKSB7XG5cdFx0XHRwcm9maWxlVGVtcGxhdGUua2V5YmluZGluZ3MgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnJlc291cmNlVHlwZUZsYWdzPy5zbmlwcGV0cyA9PT0gZmFsc2UpIHtcblx0XHRcdHByb2ZpbGVUZW1wbGF0ZS5zbmlwcGV0cyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8ucmVzb3VyY2VUeXBlRmxhZ3M/LnRhc2tzID09PSBmYWxzZSkge1xuXHRcdFx0cHJvZmlsZVRlbXBsYXRlLnRhc2tzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5yZXNvdXJjZVR5cGVGbGFncz8uZ2xvYmFsU3RhdGUgPT09IGZhbHNlKSB7XG5cdFx0XHRwcm9maWxlVGVtcGxhdGUuZ2xvYmFsU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnJlc291cmNlVHlwZUZsYWdzPy5leHRlbnNpb25zID09PSBmYWxzZSkge1xuXHRcdFx0cHJvZmlsZVRlbXBsYXRlLmV4dGVuc2lvbnMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb2ZpbGVUZW1wbGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9DcmVhdGVQcm9maWxlKHByb2ZpbGVUZW1wbGF0ZTogSVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlLCB0ZW1wb3JhcnlQcm9maWxlOiBib29sZWFuLCBleHRlbnNpb25zOiBib29sZWFuLCBvcHRpb25zOiBJVXNlckRhdGFQcm9maWxlT3B0aW9ucyB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgdGhpcy5nZXRQcm9maWxlVG9JbXBvcnQocHJvZmlsZVRlbXBsYXRlLCB0ZW1wb3JhcnlQcm9maWxlLCBvcHRpb25zKTtcblx0XHRpZiAoIXByb2ZpbGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5zZXR0aW5ncyAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LnNldHRpbmdzKSB7XG5cdFx0XHRwcm9ncmVzcyhsb2NhbGl6ZSgncHJvZ3Jlc3Mgc2V0dGluZ3MnLCBcIkFwcGx5aW5nIFNldHRpbmdzLi4uXCIpKTtcblx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3NSZXNvdXJjZSkuYXBwbHkocHJvZmlsZVRlbXBsYXRlLnNldHRpbmdzLCBwcm9maWxlKTtcblx0XHR9XG5cdFx0aWYgKHByb2ZpbGVUZW1wbGF0ZS5rZXliaW5kaW5ncyAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LmtleWJpbmRpbmdzKSB7XG5cdFx0XHRwcm9ncmVzcyhsb2NhbGl6ZSgncHJvZ3Jlc3Mga2V5YmluZGluZ3MnLCBcIkFwcGx5aW5nIEtleWJvYXJkIFNob3J0Y3V0cy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5rZXliaW5kaW5ncywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmIChwcm9maWxlVGVtcGxhdGUudGFza3MgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy50YXNrcykge1xuXHRcdFx0cHJvZ3Jlc3MobG9jYWxpemUoJ3Byb2dyZXNzIHRhc2tzJywgXCJBcHBseWluZyBUYXNrcy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS50YXNrcywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmIChwcm9maWxlVGVtcGxhdGUuc25pcHBldHMgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5zbmlwcGV0cykge1xuXHRcdFx0cHJvZ3Jlc3MobG9jYWxpemUoJ3Byb2dyZXNzIHNuaXBwZXRzJywgXCJBcHBseWluZyBTbmlwcGV0cy4uLlwiKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRzUmVzb3VyY2UpLmFwcGx5KHByb2ZpbGVUZW1wbGF0ZS5zbmlwcGV0cywgcHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmIChwcm9maWxlVGVtcGxhdGUuZ2xvYmFsU3RhdGUgJiYgIXByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5nbG9iYWxTdGF0ZSkge1xuXHRcdFx0cHJvZ3Jlc3MobG9jYWxpemUoJ3Byb2dyZXNzIGdsb2JhbCBzdGF0ZScsIFwiQXBwbHlpbmcgU3RhdGUuLi5cIikpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHbG9iYWxTdGF0ZVJlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUuZ2xvYmFsU3RhdGUsIHByb2ZpbGUpO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZVRlbXBsYXRlLmV4dGVuc2lvbnMgJiYgZXh0ZW5zaW9ucyAmJiAhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LmV4dGVuc2lvbnMpIHtcblx0XHRcdHByb2dyZXNzKGxvY2FsaXplKCdwcm9ncmVzcyBleHRlbnNpb25zJywgXCJBcHBseWluZyBFeHRlbnNpb25zLi4uXCIpKTtcblx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Jlc291cmNlKS5hcHBseShwcm9maWxlVGVtcGxhdGUuZXh0ZW5zaW9ucywgcHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVQcm9maWxlQ29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKGF3YWl0IHRoaXMuZmlsZVVzZXJEYXRhUHJvZmlsZUNvbnRlbnRIYW5kbGVyLmNhbkhhbmRsZShyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmZpbGVVc2VyRGF0YVByb2ZpbGVDb250ZW50SGFuZGxlci5yZWFkUHJvZmlsZShyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUHJvZmlsZVVSTChyZXNvdXJjZSkpIHtcblx0XHRcdGxldCBoYW5kbGVySWQ6IHN0cmluZywgaWRPclVyaTogc3RyaW5nIHwgVVJJO1xuXHRcdFx0aWYgKHJlc291cmNlLmF1dGhvcml0eSA9PT0gUFJPRklMRV9VUkxfQVVUSE9SSVRZKSB7XG5cdFx0XHRcdGlkT3JVcmkgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpO1xuXHRcdFx0XHRoYW5kbGVySWQgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuYmFzZW5hbWUodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmRpcm5hbWUocmVzb3VyY2UpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhhbmRsZXJJZCA9IHJlc291cmNlLmF1dGhvcml0eS5zdWJzdHJpbmcoUFJPRklMRV9VUkxfQVVUSE9SSVRZX1BSRUZJWC5sZW5ndGgpO1xuXHRcdFx0XHRpZE9yVXJpID0gVVJJLnBhcnNlKHJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uUHJvZmlsZToke2hhbmRsZXJJZH1gKTtcblx0XHRcdGNvbnN0IHByb2ZpbGVDb250ZW50SGFuZGxlciA9IHRoaXMucHJvZmlsZUNvbnRlbnRIYW5kbGVycy5nZXQoaGFuZGxlcklkKTtcblx0XHRcdGlmIChwcm9maWxlQ29udGVudEhhbmRsZXIpIHtcblx0XHRcdFx0cmV0dXJuIHByb2ZpbGVDb250ZW50SGFuZGxlci5yZWFkUHJvZmlsZShpZE9yVXJpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KCdvblByb2ZpbGUnKTtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGVDb250ZW50SGFuZGxlciBvZiB0aGlzLnByb2ZpbGVDb250ZW50SGFuZGxlcnMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBwcm9maWxlQ29udGVudEhhbmRsZXIucmVhZFByb2ZpbGUocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKGNvbnRlbnQgIT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7IHR5cGU6ICdHRVQnLCB1cmw6IHJlc291cmNlLnRvU3RyaW5nKHRydWUpLCBjYWxsU2l0ZTogJ3VzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UucmVzb2x2ZUNvbnRlbnQnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSAyMDApIHtcblx0XHRcdHJldHVybiBhd2FpdCBhc1RleHQoY29udGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCBhc1RleHQoY29udGV4dCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBnZXQgcHJvZmlsZSBmcm9tIFVSTDogJHtyZXNvdXJjZS50b1N0cmluZygpfS4gU3RhdHVzIGNvZGU6ICR7Y29udGV4dC5yZXMuc3RhdHVzQ29kZX0uIE1lc3NhZ2U6ICR7bWVzc2FnZX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBpY2tQcm9maWxlQ29udGVudEhhbmRsZXIobmFtZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KCdvblByb2ZpbGUnKTtcblx0XHRpZiAodGhpcy5wcm9maWxlQ29udGVudEhhbmRsZXJzLnNpemUgPT09IDEpIHtcblx0XHRcdHJldHVybiB0aGlzLnByb2ZpbGVDb250ZW50SGFuZGxlcnMua2V5cygpLm5leHQoKS52YWx1ZTtcblx0XHR9XG5cdFx0Y29uc3Qgb3B0aW9uczogUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbaWQsIHByb2ZpbGVDb250ZW50SGFuZGxlcl0gb2YgdGhpcy5wcm9maWxlQ29udGVudEhhbmRsZXJzKSB7XG5cdFx0XHRvcHRpb25zLnB1c2goeyBpZCwgbGFiZWw6IHByb2ZpbGVDb250ZW50SGFuZGxlci5uYW1lLCBkZXNjcmlwdGlvbjogcHJvZmlsZUNvbnRlbnRIYW5kbGVyLmRlc2NyaXB0aW9uIH0pO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2sob3B0aW9ucy5yZXZlcnNlKCksXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0IHByb2ZpbGUgY29udGVudCBoYW5kbGVyJywgXCJFeHBvcnQgJ3swfScgcHJvZmlsZSBhcy4uLlwiLCBuYW1lKSxcblx0XHRcdFx0aGlkZUlucHV0OiB0cnVlXG5cdFx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0Py5pZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UHJvZmlsZVRvSW1wb3J0KHByb2ZpbGVUZW1wbGF0ZTogSVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlLCB0ZW1wOiBib29sZWFuLCBvcHRpb25zOiBJVXNlckRhdGFQcm9maWxlT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb2ZpbGVOYW1lID0gcHJvZmlsZVRlbXBsYXRlLm5hbWU7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAubmFtZSA9PT0gcHJvZmlsZU5hbWUpO1xuXHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRpZiAodGVtcCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5jcmVhdGVOYW1lZFByb2ZpbGUoYCR7cHJvZmlsZU5hbWV9ICR7dGhpcy5nZXRQcm9maWxlTmFtZUluZGV4KHByb2ZpbGVOYW1lKX1gLCB7IC4uLm9wdGlvbnMsIHRyYW5zaWVudDogdGVtcCB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwcm9maWxlIGFscmVhZHkgZXhpc3RzJywgXCJQcm9maWxlIHdpdGggbmFtZSAnezB9JyBhbHJlYWR5IGV4aXN0cy4gRG8geW91IHdhbnQgdG8gcmVwbGFjZSBpdHMgY29udGVudHM/XCIsIHByb2ZpbGVOYW1lKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdvdmVyd3JpdGUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBsYWNlXCIpXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJvZmlsZS5pc0RlZmF1bHQgPyBwcm9maWxlIDogdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS51cGRhdGVQcm9maWxlKHByb2ZpbGUsIG9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5jcmVhdGVOYW1lZFByb2ZpbGUocHJvZmlsZU5hbWUsIHsgLi4ub3B0aW9ucywgdHJhbnNpZW50OiB0ZW1wIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZmlsZU5hbWVJbmRleChuYW1lOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGNvbnN0IG5hbWVSZWdFeCA9IG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhuYW1lKX1cXFxccyhcXFxcZCspYCk7XG5cdFx0bGV0IG5hbWVJbmRleCA9IDA7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSBuYW1lUmVnRXguZXhlYyhwcm9maWxlLm5hbWUpO1xuXHRcdFx0Y29uc3QgaW5kZXggPSBtYXRjaGVzID8gcGFyc2VJbnQobWF0Y2hlc1sxXSkgOiAwO1xuXHRcdFx0bmFtZUluZGV4ID0gaW5kZXggPiBuYW1lSW5kZXggPyBpbmRleCA6IG5hbWVJbmRleDtcblx0XHR9XG5cdFx0cmV0dXJuIG5hbWVJbmRleCArIDE7XG5cdH1cblxufVxuXG5jbGFzcyBGaWxlVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXIgaW1wbGVtZW50cyBJVXNlckRhdGFQcm9maWxlQ29udGVudEhhbmRsZXIge1xuXG5cdHJlYWRvbmx5IG5hbWUgPSBsb2NhbGl6ZSgnbG9jYWwnLCBcIkxvY2FsXCIpO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdmaWxlJywgXCJmaWxlXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHNhdmVQcm9maWxlKG5hbWU6IHN0cmluZywgY29udGVudDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTYXZlUHJvZmlsZVJlc3VsdCB8IG51bGw+IHtcblx0XHRjb25zdCBsaW5rID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2V4cG9ydCBwcm9maWxlIGRpYWxvZycsIFwiU2F2ZSBQcm9maWxlXCIpLFxuXHRcdFx0ZmlsdGVyczogUFJPRklMRV9GSUxURVIsXG5cdFx0XHRkZWZhdWx0VXJpOiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgoYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKSwgYCR7bmFtZX0uJHtQUk9GSUxFX0VYVEVOU0lPTn1gKSxcblx0XHR9KTtcblx0XHRpZiAoIWxpbmspIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2U6IGxpbmssIHZhbHVlOiBjb250ZW50LCBvcHRpb25zOiB7IG92ZXJ3cml0ZTogdHJ1ZSB9IH1dKTtcblx0XHRyZXR1cm4geyBsaW5rLCBpZDogbGluay50b1N0cmluZygpIH07XG5cdH1cblxuXHRhc3luYyBjYW5IYW5kbGUodXJpOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5odHRwICYmIHVyaS5zY2hlbWUgIT09IFNjaGVtYXMuaHR0cHMgJiYgdXJpLnNjaGVtZSAhPT0gdGhpcy5wcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCAmJiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKHVyaSk7XG5cdH1cblxuXHRhc3luYyByZWFkUHJvZmlsZSh1cmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKGF3YWl0IHRoaXMuY2FuSGFuZGxlKHVyaSkpIHtcblx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh1cmksIHVuZGVmaW5lZCwgdG9rZW4pKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIHNlbGVjdFByb2ZpbGUoKTogUHJvbWlzZTxVUkkgfCBudWxsPiB7XG5cdFx0Y29uc3QgcHJvZmlsZUxvY2F0aW9uID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiBmYWxzZSxcblx0XHRcdGNhblNlbGVjdEZpbGVzOiB0cnVlLFxuXHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRmaWx0ZXJzOiBQUk9GSUxFX0ZJTFRFUixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0IHByb2ZpbGUnLCBcIlNlbGVjdCBQcm9maWxlXCIpLFxuXHRcdH0pO1xuXHRcdHJldHVybiBwcm9maWxlTG9jYXRpb24gPyBwcm9maWxlTG9jYXRpb25bMF0gOiBudWxsO1xuXHR9XG5cbn1cblxuY29uc3QgVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1NDSEVNRSA9ICd1c2VyZGF0YXByb2ZpbGVleHBvcnQnO1xuY29uc3QgVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1BSRVZJRVdfU0NIRU1FID0gJ3VzZXJkYXRhcHJvZmlsZWV4cG9ydHByZXZpZXcnO1xuXG5hYnN0cmFjdCBjbGFzcyBVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTdGF0ZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZVZpZXdEYXRhUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUm9vdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSb290cyA9IHRoaXMuX29uRGlkQ2hhbmdlUm9vdHMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgKDxJUHJvZmlsZVJlc291cmNlVHJlZUl0ZW0+ZWxlbWVudCkuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdGlmIChjaGlsZHJlbikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0aWYgKGNoaWxkLnBhcmVudC5jaGVja2JveCAmJiBjaGlsZC5jaGVja2JveCkge1xuXHRcdFx0XHRcdFx0Y2hpbGQuY2hlY2tib3guaXNDaGVja2VkID0gY2hpbGQucGFyZW50LmNoZWNrYm94LmlzQ2hlY2tlZCAmJiBjaGlsZC5jaGVja2JveC5pc0NoZWNrZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucm9vdHNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSb290cy5maXJlKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRSb290cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcm9vdHM6IElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbVtdID0gW107XG5cdHByaXZhdGUgcm9vdHNQcm9taXNlOiBQcm9taXNlPElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbVtdPiB8IHVuZGVmaW5lZDtcblx0Z2V0Um9vdHMoKTogUHJvbWlzZTxJUHJvZmlsZVJlc291cmNlVHJlZUl0ZW1bXT4ge1xuXHRcdGlmICghdGhpcy5yb290c1Byb21pc2UpIHtcblx0XHRcdHRoaXMucm9vdHNQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5yb290cyA9IGF3YWl0IHRoaXMuZmV0Y2hSb290cygpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJvb3Qgb2YgdGhpcy5yb290cykge1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsVGV4dCA9IGlzTWFya2Rvd25TdHJpbmcocm9vdC5sYWJlbC5sYWJlbCkgPyByb290LmxhYmVsLmxhYmVsLnZhbHVlIDogcm9vdC5sYWJlbC5sYWJlbDtcblx0XHRcdFx0XHRyb290LmNoZWNrYm94ID0ge1xuXHRcdFx0XHRcdFx0aXNDaGVja2VkOiAhcm9vdC5pc0Zyb21EZWZhdWx0UHJvZmlsZSgpLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NlbGVjdCcsIFwiU2VsZWN0IHswfVwiLCBsYWJlbFRleHQpLFxuXHRcdFx0XHRcdFx0YWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0JywgXCJTZWxlY3QgezB9XCIsIGxhYmVsVGV4dCksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAocm9vdC5pc0Zyb21EZWZhdWx0UHJvZmlsZSgpKSB7XG5cdFx0XHRcdFx0XHRyb290LmRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2Zyb20gZGVmYXVsdCcsIFwiRnJvbSBEZWZhdWx0IFByb2ZpbGVcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLnJvb3RzO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucm9vdHNQcm9taXNlO1xuXHR9XG5cblx0aXNFbmFibGVkKHJlc291cmNlVHlwZT86IFByb2ZpbGVSZXNvdXJjZVR5cGUpOiBib29sZWFuIHtcblx0XHRpZiAocmVzb3VyY2VUeXBlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLnJvb3RzLnNvbWUocm9vdCA9PiByb290LnR5cGUgPT09IHJlc291cmNlVHlwZSAmJiB0aGlzLmlzU2VsZWN0ZWQocm9vdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yb290cy5zb21lKHJvb3QgPT4gdGhpcy5pc1NlbGVjdGVkKHJvb3QpKTtcblx0fVxuXG5cdGFzeW5jIGdldFByb2ZpbGVUZW1wbGF0ZShuYW1lOiBzdHJpbmcsIGljb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVVzZXJEYXRhUHJvZmlsZVRlbXBsYXRlPiB7XG5cdFx0Y29uc3Qgcm9vdHMgPSBhd2FpdCB0aGlzLmdldFJvb3RzKCk7XG5cdFx0bGV0IHNldHRpbmdzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGtleWJpbmRpbmdzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHRhc2tzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNuaXBwZXRzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGV4dGVuc2lvbnM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZ2xvYmFsU3RhdGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHJvb3Qgb2Ygcm9vdHMpIHtcblx0XHRcdGlmICghdGhpcy5pc1NlbGVjdGVkKHJvb3QpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJvb3QgaW5zdGFuY2VvZiBTZXR0aW5nc1Jlc291cmNlVHJlZUl0ZW0pIHtcblx0XHRcdFx0c2V0dGluZ3MgPSBhd2FpdCByb290LmdldENvbnRlbnQoKTtcblx0XHRcdH0gZWxzZSBpZiAocm9vdCBpbnN0YW5jZW9mIEtleWJpbmRpbmdzUmVzb3VyY2VUcmVlSXRlbSkge1xuXHRcdFx0XHRrZXliaW5kaW5ncyA9IGF3YWl0IHJvb3QuZ2V0Q29udGVudCgpO1xuXHRcdFx0fSBlbHNlIGlmIChyb290IGluc3RhbmNlb2YgVGFza3NSZXNvdXJjZVRyZWVJdGVtKSB7XG5cdFx0XHRcdHRhc2tzID0gYXdhaXQgcm9vdC5nZXRDb250ZW50KCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJvb3QgaW5zdGFuY2VvZiBTbmlwcGV0c1Jlc291cmNlVHJlZUl0ZW0pIHtcblx0XHRcdFx0c25pcHBldHMgPSBhd2FpdCByb290LmdldENvbnRlbnQoKTtcblx0XHRcdH0gZWxzZSBpZiAocm9vdCBpbnN0YW5jZW9mIEV4dGVuc2lvbnNSZXNvdXJjZVRyZWVJdGVtKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnMgPSBhd2FpdCByb290LmdldENvbnRlbnQoKTtcblx0XHRcdH0gZWxzZSBpZiAocm9vdCBpbnN0YW5jZW9mIEdsb2JhbFN0YXRlUmVzb3VyY2VUcmVlSXRlbSkge1xuXHRcdFx0XHRnbG9iYWxTdGF0ZSA9IGF3YWl0IHJvb3QuZ2V0Q29udGVudCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lLFxuXHRcdFx0aWNvbixcblx0XHRcdHNldHRpbmdzLFxuXHRcdFx0a2V5YmluZGluZ3MsXG5cdFx0XHR0YXNrcyxcblx0XHRcdHNuaXBwZXRzLFxuXHRcdFx0ZXh0ZW5zaW9ucyxcblx0XHRcdGdsb2JhbFN0YXRlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgaXNTZWxlY3RlZCh0cmVlSXRlbTogSVByb2ZpbGVSZXNvdXJjZVRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRyZWVJdGVtLmNoZWNrYm94KSB7XG5cdFx0XHRyZXR1cm4gdHJlZUl0ZW0uY2hlY2tib3guaXNDaGVja2VkIHx8ICEhdHJlZUl0ZW0uY2hpbGRyZW4/LnNvbWUoY2hpbGQgPT4gY2hpbGQuY2hlY2tib3g/LmlzQ2hlY2tlZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGZldGNoUm9vdHMoKTogUHJvbWlzZTxJUHJvZmlsZVJlc291cmNlVHJlZUl0ZW1bXT47XG59XG5cbmNsYXNzIFVzZXJEYXRhUHJvZmlsZUV4cG9ydFN0YXRlIGV4dGVuZHMgVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U3RhdGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHBvcnRGbGFnczogUHJvZmlsZVJlc291cmNlVHlwZUZsYWdzIHwgdW5kZWZpbmVkLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihxdWlja0lucHV0U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZmV0Y2hSb290cygpOiBQcm9taXNlPElQcm9maWxlUmVzb3VyY2VUcmVlSXRlbVtdPiB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihVU0VSX0RBVEFfUFJPRklMRV9FWFBPUlRfU0NIRU1FLCB0aGlzLl9yZWdpc3RlcihuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCBwcmV2aWV3RmlsZVN5c3RlbVByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihVU0VSX0RBVEFfUFJPRklMRV9FWFBPUlRfUFJFVklFV19TQ0hFTUUsIHByZXZpZXdGaWxlU3lzdGVtUHJvdmlkZXIpKTtcblx0XHRjb25zdCByb290czogSVByb2ZpbGVSZXNvdXJjZVRyZWVJdGVtW10gPSBbXTtcblx0XHRjb25zdCBleHBvcnRQcmV2aWV3UHJvZmxlID0gdGhpcy5jcmVhdGVFeHBvcnRQcmV2aWV3UHJvZmlsZSh0aGlzLnByb2ZpbGUpO1xuXG5cdFx0aWYgKHRoaXMuZXhwb3J0RmxhZ3M/LnNldHRpbmdzID8/IHRydWUpIHtcblx0XHRcdGNvbnN0IHNldHRpbmdzUmVzb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3NDb250ZW50ID0gYXdhaXQgc2V0dGluZ3NSZXNvdXJjZS5nZXRDb250ZW50KHRoaXMucHJvZmlsZSk7XG5cdFx0XHRhd2FpdCBzZXR0aW5nc1Jlc291cmNlLmFwcGx5KHNldHRpbmdzQ29udGVudCwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRjb25zdCBzZXR0aW5nc1Jlc291cmNlVHJlZUl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzUmVzb3VyY2VUcmVlSXRlbSwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRpZiAoYXdhaXQgc2V0dGluZ3NSZXNvdXJjZVRyZWVJdGVtLmhhc0NvbnRlbnQoKSkge1xuXHRcdFx0XHRyb290cy5wdXNoKHNldHRpbmdzUmVzb3VyY2VUcmVlSXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXhwb3J0RmxhZ3M/LmtleWJpbmRpbmdzID8/IHRydWUpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdzUmVzb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ3NDb250ZW50ID0gYXdhaXQga2V5YmluZGluZ3NSZXNvdXJjZS5nZXRDb250ZW50KHRoaXMucHJvZmlsZSk7XG5cdFx0XHRhd2FpdCBrZXliaW5kaW5nc1Jlc291cmNlLmFwcGx5KGtleWJpbmRpbmdzQ29udGVudCwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nc1Jlc291cmNlVHJlZUl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzUmVzb3VyY2VUcmVlSXRlbSwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRpZiAoYXdhaXQga2V5YmluZGluZ3NSZXNvdXJjZVRyZWVJdGVtLmhhc0NvbnRlbnQoKSkge1xuXHRcdFx0XHRyb290cy5wdXNoKGtleWJpbmRpbmdzUmVzb3VyY2VUcmVlSXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXhwb3J0RmxhZ3M/LnNuaXBwZXRzID8/IHRydWUpIHtcblx0XHRcdGNvbnN0IHNuaXBwZXRzUmVzb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRzUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc25pcHBldHNDb250ZW50ID0gYXdhaXQgc25pcHBldHNSZXNvdXJjZS5nZXRDb250ZW50KHRoaXMucHJvZmlsZSk7XG5cdFx0XHRhd2FpdCBzbmlwcGV0c1Jlc291cmNlLmFwcGx5KHNuaXBwZXRzQ29udGVudCwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRjb25zdCBzbmlwcGV0c1Jlc291cmNlVHJlZUl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRzUmVzb3VyY2VUcmVlSXRlbSwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRpZiAoYXdhaXQgc25pcHBldHNSZXNvdXJjZVRyZWVJdGVtLmhhc0NvbnRlbnQoKSkge1xuXHRcdFx0XHRyb290cy5wdXNoKHNuaXBwZXRzUmVzb3VyY2VUcmVlSXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXhwb3J0RmxhZ3M/LnRhc2tzID8/IHRydWUpIHtcblx0XHRcdGNvbnN0IHRhc2tzUmVzb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tzUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgdGFza3NDb250ZW50ID0gYXdhaXQgdGFza3NSZXNvdXJjZS5nZXRDb250ZW50KHRoaXMucHJvZmlsZSk7XG5cdFx0XHRhd2FpdCB0YXNrc1Jlc291cmNlLmFwcGx5KHRhc2tzQ29udGVudCwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRjb25zdCB0YXNrc1Jlc291cmNlVHJlZUl0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tzUmVzb3VyY2VUcmVlSXRlbSwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRpZiAoYXdhaXQgdGFza3NSZXNvdXJjZVRyZWVJdGVtLmhhc0NvbnRlbnQoKSkge1xuXHRcdFx0XHRyb290cy5wdXNoKHRhc2tzUmVzb3VyY2VUcmVlSXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXhwb3J0RmxhZ3M/Lmdsb2JhbFN0YXRlID8/IHRydWUpIHtcblx0XHRcdGNvbnN0IGdsb2JhbFN0YXRlUmVzb3VyY2UgPSBqb2luUGF0aChleHBvcnRQcmV2aWV3UHJvZmxlLmdsb2JhbFN0b3JhZ2VIb21lLCAnZ2xvYmFsU3RhdGUuanNvbicpLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9QUkVWSUVXX1NDSEVNRSB9KTtcblx0XHRcdGNvbnN0IGdsb2JhbFN0YXRlUmVzb3VyY2VUcmVlSXRlbSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2xvYmFsU3RhdGVSZXNvdXJjZUV4cG9ydFRyZWVJdGVtLCBleHBvcnRQcmV2aWV3UHJvZmxlLCBnbG9iYWxTdGF0ZVJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBnbG9iYWxTdGF0ZVJlc291cmNlVHJlZUl0ZW0uZ2V0Q29udGVudCgpO1xuXHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoZ2xvYmFsU3RhdGVSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShKU09OLnBhcnNlKGNvbnRlbnQpLCBudWxsLCAnXFx0JykpKTtcblx0XHRcdFx0cm9vdHMucHVzaChnbG9iYWxTdGF0ZVJlc291cmNlVHJlZUl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4cG9ydEZsYWdzPy5leHRlbnNpb25zID8/IHRydWUpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNSZXNvdXJjZVRyZWVJdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zUmVzb3VyY2VFeHBvcnRUcmVlSXRlbSwgZXhwb3J0UHJldmlld1Byb2ZsZSk7XG5cdFx0XHRpZiAoYXdhaXQgZXh0ZW5zaW9uc1Jlc291cmNlVHJlZUl0ZW0uaGFzQ29udGVudCgpKSB7XG5cdFx0XHRcdHJvb3RzLnB1c2goZXh0ZW5zaW9uc1Jlc291cmNlVHJlZUl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHByZXZpZXdGaWxlU3lzdGVtUHJvdmlkZXIuc2V0UmVhZE9ubHkodHJ1ZSk7XG5cblx0XHRyZXR1cm4gcm9vdHM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUV4cG9ydFByZXZpZXdQcm9maWxlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBJVXNlckRhdGFQcm9maWxlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHByb2ZpbGUuaWQsXG5cdFx0XHRuYW1lOiBwcm9maWxlLm5hbWUsXG5cdFx0XHRsb2NhdGlvbjogcHJvZmlsZS5sb2NhdGlvbixcblx0XHRcdGlzRGVmYXVsdDogcHJvZmlsZS5pc0RlZmF1bHQsXG5cdFx0XHRpY29uOiBwcm9maWxlLmljb24sXG5cdFx0XHRnbG9iYWxTdG9yYWdlSG9tZTogcHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSxcblx0XHRcdHNldHRpbmdzUmVzb3VyY2U6IHByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBVU0VSX0RBVEFfUFJPRklMRV9FWFBPUlRfU0NIRU1FIH0pLFxuXHRcdFx0a2V5YmluZGluZ3NSZXNvdXJjZTogcHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9TQ0hFTUUgfSksXG5cdFx0XHR0YXNrc1Jlc291cmNlOiBwcm9maWxlLnRhc2tzUmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1NDSEVNRSB9KSxcblx0XHRcdG1jcFJlc291cmNlOiBwcm9maWxlLm1jcFJlc291cmNlLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9TQ0hFTUUgfSksXG5cdFx0XHRsYW5ndWFnZU1vZGVsc1Jlc291cmNlOiBwcm9maWxlLmxhbmd1YWdlTW9kZWxzUmVzb3VyY2Uud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1NDSEVNRSB9KSxcblx0XHRcdHNuaXBwZXRzSG9tZTogcHJvZmlsZS5zbmlwcGV0c0hvbWUud2l0aCh7IHNjaGVtZTogVVNFUl9EQVRBX1BST0ZJTEVfRVhQT1JUX1NDSEVNRSB9KSxcblx0XHRcdHByb21wdHNIb21lOiBwcm9maWxlLnByb21wdHNIb21lLndpdGgoeyBzY2hlbWU6IFVTRVJfREFUQV9QUk9GSUxFX0VYUE9SVF9TQ0hFTUUgfSksXG5cdFx0XHRleHRlbnNpb25zUmVzb3VyY2U6IHByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLFxuXHRcdFx0Y2FjaGVIb21lOiBwcm9maWxlLmNhY2hlSG9tZSxcblx0XHRcdGFnZW50UGx1Z2luc0hvbWU6IHByb2ZpbGUuYWdlbnRQbHVnaW5zSG9tZSxcblx0XHRcdHVzZURlZmF1bHRGbGFnczogcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3MsXG5cdFx0XHRpc1RyYW5zaWVudDogcHJvZmlsZS5pc1RyYW5zaWVudFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBnZXRQcm9maWxlVG9FeHBvcnQoKTogUHJvbWlzZTxJVXNlckRhdGFQcm9maWxlVGVtcGxhdGUgfCBudWxsPiB7XG5cdFx0bGV0IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRoaXMucHJvZmlsZS5uYW1lO1xuXHRcdGlmICh0aGlzLnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRuYW1lID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnZXhwb3J0IHByb2ZpbGUgbmFtZScsIFwiTmFtZSB0aGUgcHJvZmlsZVwiKSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdleHBvcnQgcHJvZmlsZSB0aXRsZScsIFwiRXhwb3J0IFByb2ZpbGVcIiksXG5cdFx0XHRcdGFzeW5jIHZhbGlkYXRlSW5wdXQoaW5wdXQpIHtcblx0XHRcdFx0XHRpZiAoIWlucHV0LnRyaW0oKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9maWxlIG5hbWUgcmVxdWlyZWQnLCBcIlByb2ZpbGUgbmFtZSBtdXN0IGJlIHByb3ZpZGVkLlwiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5nZXRQcm9maWxlVGVtcGxhdGUobmFtZSwgdGhpcy5wcm9maWxlLmljb24pO1xuXHR9XG5cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsIFVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFDQUFxQyxnQkFBZ0IsbUJBQW1ELHlCQUFtRCxtQkFBbUIsbUNBQThFLHVCQUF1QixzQkFBcUQsY0FBYyxvQ0FBb0M7QUFDblksU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxnQkFBZ0IsMEJBQXlDO0FBQ2xFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUVwQixTQUFvRCxnQ0FBK0U7QUFDbkksU0FBUyxrQkFBa0IsZ0NBQWdDO0FBQzNELFNBQVMscUJBQXFCLG1DQUFtQztBQUNqRSxTQUFTLGtCQUFrQixnQ0FBZ0M7QUFDM0QsU0FB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
