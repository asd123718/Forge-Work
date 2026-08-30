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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
import { localize, localize2 } from "../../../../nls.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { CURRENT_PROFILE_CONTEXT, HAS_PROFILES_CONTEXT, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService, PROFILES_CATEGORY, PROFILES_TITLE, PROFILE_EXTENSION, isProfileURL } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { URI } from "../../../../base/common/uri.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTagsService } from "../../tags/common/workspaceTags.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { EditorExtensions } from "../../../common/editor.js";
import { UserDataProfilesEditor, UserDataProfilesEditorInput, UserDataProfilesEditorInputSerializer } from "./userDataProfilesEditor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { Extensions as DndExtensions } from "../../../../platform/dnd/browser/dnd.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ITextEditorService } from "../../../services/textfile/common/textEditorService.js";
const OpenProfileMenu = new MenuId("OpenProfile");
const ProfilesMenu = new MenuId("Profiles");
let UserDataProfilesWorkbenchContribution = class extends Disposable {
  constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, telemetryService, workspaceContextService, workspaceTagsService, contextKeyService, editorService, instantiationService, lifecycleService, urlService, environmentService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.telemetryService = telemetryService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTagsService = workspaceTagsService;
    this.editorService = editorService;
    this.instantiationService = instantiationService;
    this.lifecycleService = lifecycleService;
    this.urlService = urlService;
    this.profilesDisposable = this._register(new MutableDisposable());
    this.currentProfileContext = CURRENT_PROFILE_CONTEXT.bindTo(contextKeyService);
    this.currentProfileContext.set(this.userDataProfileService.currentProfile.id);
    this._register(this.userDataProfileService.onDidChangeCurrentProfile((e) => {
      this.currentProfileContext.set(this.userDataProfileService.currentProfile.id);
    }));
    this.hasProfilesContext = HAS_PROFILES_CONTEXT.bindTo(contextKeyService);
    this.hasProfilesContext.set(this.userDataProfilesService.profiles.filter((p) => !p.isInternal).length > 1);
    this._register(this.userDataProfilesService.onDidChangeProfiles((e) => this.hasProfilesContext.set(this.userDataProfilesService.profiles.filter((p) => !p.isInternal).length > 1)));
    this.registerEditor();
    this.registerActions();
    this._register(this.urlService.registerHandler(this));
    if (isWeb) {
      lifecycleService.when(LifecyclePhase.Eventually).then(() => userDataProfilesService.cleanUp());
    }
    this.reportWorkspaceProfileInfo();
    if (environmentService.options?.profileToPreview) {
      lifecycleService.when(LifecyclePhase.Restored).then(() => this.handleURL(URI.revive(environmentService.options.profileToPreview)));
    }
    this.registerDropHandler();
  }
  async handleURL(uri) {
    if (isProfileURL(uri)) {
      const editor = await this.openProfilesEditor();
      if (editor) {
        editor.createNewProfile(uri);
        return true;
      }
    }
    return false;
  }
  async openProfilesEditor() {
    const editor = await this.editorService.openEditor(new UserDataProfilesEditorInput(this.instantiationService));
    return editor;
  }
  registerEditor() {
    Registry.as(EditorExtensions.EditorPane).registerEditorPane(
      EditorPaneDescriptor.create(
        UserDataProfilesEditor,
        UserDataProfilesEditor.ID,
        localize("userdataprofilesEditor", "Profiles Editor")
      ),
      [
        new SyncDescriptor(UserDataProfilesEditorInput)
      ]
    );
    Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(UserDataProfilesEditorInput.ID, UserDataProfilesEditorInputSerializer);
  }
  registerDropHandler() {
    const dndRegistry = Registry.as(DndExtensions.DragAndDropContribution);
    const that = this;
    this._register(dndRegistry.registerDropHandler(new class UserDataProfileDropHandler {
      async handleDrop(resource, accessor) {
        const uriIdentityService = accessor.get(IUriIdentityService);
        const userDataProfileImportExportService = accessor.get(IUserDataProfileImportExportService);
        const editorService = accessor.get(IEditorService);
        const textEditorService = accessor.get(ITextEditorService);
        const notificationService = accessor.get(INotificationService);
        if (uriIdentityService.extUri.extname(resource) === `.${PROFILE_EXTENSION}`) {
          const template = await userDataProfileImportExportService.resolveProfileTemplate(resource);
          if (!template) {
            notificationService.warn(localize("invalid profile", "The dropped profile is invalid."));
            editorService.openEditor(textEditorService.createTextEditor({ resource }));
            return true;
          }
          const editor = await that.openProfilesEditor();
          if (editor) {
            try {
              await editor.createNewProfile(resource);
            } catch (error) {
              return false;
            }
          }
          return true;
        }
        return false;
      }
    }()));
  }
  registerActions() {
    this.registerProfileSubMenu();
    this._register(this.registerManageProfilesAction());
    this._register(this.registerSwitchProfileAction());
    this.registerOpenProfileSubMenu();
    this.registerNewWindowWithProfileAction();
    this.registerProfilesActions();
    this._register(this.userDataProfilesService.onDidChangeProfiles(() => this.registerProfilesActions()));
    this._register(this.registerExportCurrentProfileAction());
    this.registerCreateFromCurrentProfileAction();
    this.registerNewProfileAction();
    this.registerDeleteProfileAction();
    this.registerHelpAction();
  }
  registerProfileSubMenu() {
    const getProfilesTitle = () => {
      return localize("profiles", "Profile ({0})", this.userDataProfileService.currentProfile.name);
    };
    MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
      get title() {
        return getProfilesTitle();
      },
      submenu: ProfilesMenu,
      group: "2_configuration",
      order: 1,
      when: HAS_PROFILES_CONTEXT
    });
    MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      get title() {
        return getProfilesTitle();
      },
      submenu: ProfilesMenu,
      group: "2_configuration",
      order: 1,
      when: ContextKeyExpr.and(HAS_PROFILES_CONTEXT, IsSessionsWindowContext.negate())
    });
  }
  registerOpenProfileSubMenu() {
    MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
      title: localize("New Profile Window", "New Window with Profile"),
      submenu: OpenProfileMenu,
      group: "1_new",
      order: 4
    });
  }
  registerProfilesActions() {
    this.profilesDisposable.value = new DisposableStore();
    for (const profile of this.userDataProfilesService.profiles) {
      if (!profile.isInternal) {
        this.profilesDisposable.value.add(this.registerProfileEntryAction(profile));
        this.profilesDisposable.value.add(this.registerNewWindowAction(profile));
      }
    }
  }
  registerProfileEntryAction(profile) {
    const that = this;
    return registerAction2(class ProfileEntryAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.profileEntry.${profile.id}`,
          title: profile.name,
          metadata: {
            description: localize2("change profile", "Switch to {0} profile", profile.name)
          },
          toggled: ContextKeyExpr.equals(CURRENT_PROFILE_CONTEXT.key, profile.id),
          menu: [
            {
              id: ProfilesMenu,
              group: "0_profiles"
            }
          ]
        });
      }
      async run(accessor) {
        if (that.userDataProfileService.currentProfile.id !== profile.id) {
          return that.userDataProfileManagementService.switchProfile(profile);
        }
      }
    });
  }
  registerNewWindowWithProfileAction() {
    return registerAction2(class NewWindowWithProfileAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.newWindowWithProfile`,
          title: localize2("newWindowWithProfile", "New Window with Profile..."),
          category: PROFILES_CATEGORY,
          precondition: HAS_PROFILES_CONTEXT,
          f1: true
        });
      }
      async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const userDataProfilesService = accessor.get(IUserDataProfilesService);
        const hostService = accessor.get(IHostService);
        const pick = await quickInputService.pick(
          userDataProfilesService.profiles.filter((profile) => !profile.isInternal).map((profile) => ({
            label: profile.name,
            profile
          })),
          {
            title: localize("new window with profile", "New Window with Profile"),
            placeHolder: localize("pick profile", "Select Profile"),
            canPickMany: false
          }
        );
        if (pick) {
          return hostService.openWindow({ remoteAuthority: null, forceProfile: pick.profile.name });
        }
      }
    });
  }
  registerNewWindowAction(profile) {
    const disposables = new DisposableStore();
    const id = `workbench.action.openProfile.${profile.name.replace("/s+/", "_")}`;
    const precondition = HAS_PROFILES_CONTEXT;
    disposables.add(registerAction2(class NewWindowAction extends Action2 {
      constructor() {
        super({
          id,
          title: localize2("openShort", "{0}", profile.name),
          metadata: {
            description: localize2("open profile", "Open New Window with {0} Profile", profile.name)
          },
          menu: {
            id: OpenProfileMenu,
            group: "0_profiles",
            when: precondition
          }
        });
      }
      run(accessor) {
        const hostService = accessor.get(IHostService);
        return hostService.openWindow({ remoteAuthority: null, forceProfile: profile.name });
      }
    }));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: {
        id,
        category: PROFILES_CATEGORY,
        title: localize2("open", "Open {0} Profile", profile.name),
        precondition
      }
    }));
    return disposables;
  }
  registerSwitchProfileAction() {
    const that = this;
    return registerAction2(class SwitchProfileAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.switchProfile`,
          title: localize2("switchProfile", "Switch Profile..."),
          category: PROFILES_CATEGORY,
          f1: true
        });
      }
      async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const items = [];
        for (const profile of that.userDataProfilesService.profiles) {
          if (profile.isInternal) {
            continue;
          }
          items.push({
            id: profile.id,
            label: profile.id === that.userDataProfileService.currentProfile.id ? `$(check) ${profile.name}` : profile.name,
            profile
          });
        }
        const result = await quickInputService.pick(items.sort((a, b) => a.profile.name.localeCompare(b.profile.name)), {
          placeHolder: localize("selectProfile", "Select Profile")
        });
        if (result) {
          await that.userDataProfileManagementService.switchProfile(result.profile);
        }
      }
    });
  }
  registerManageProfilesAction() {
    const disposables = new DisposableStore();
    disposables.add(registerAction2(class ManageProfilesAction extends Action2 {
      constructor() {
        super({
          id: `workbench.profiles.actions.manageProfiles`,
          title: {
            ...localize2("manage profiles", "Profiles"),
            mnemonicTitle: localize({ key: "miOpenProfiles", comment: ["&& denotes a mnemonic"] }, "&&Profiles")
          },
          menu: [
            {
              id: MenuId.GlobalActivity,
              group: "2_configuration",
              order: 1,
              when: HAS_PROFILES_CONTEXT.negate()
            },
            {
              id: MenuId.MenubarPreferencesMenu,
              group: "2_configuration",
              order: 1,
              when: ContextKeyExpr.and(HAS_PROFILES_CONTEXT.negate(), IsSessionsWindowContext.negate())
            },
            {
              id: ProfilesMenu,
              group: "1_manage",
              order: 1
            }
          ]
        });
      }
      run(accessor) {
        const editorService = accessor.get(IEditorService);
        const instantiationService = accessor.get(IInstantiationService);
        return editorService.openEditor(new UserDataProfilesEditorInput(instantiationService));
      }
    }));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: {
        id: "workbench.profiles.actions.manageProfiles",
        category: Categories.Preferences,
        title: localize2("open profiles", "Open Profiles (UI)")
      }
    }));
    return disposables;
  }
  registerExportCurrentProfileAction() {
    const that = this;
    const disposables = new DisposableStore();
    const id = "workbench.profiles.actions.exportProfile";
    disposables.add(registerAction2(class ExportProfileAction extends Action2 {
      constructor() {
        super({
          id,
          title: localize2("export profile", "Export Profile..."),
          category: PROFILES_CATEGORY,
          f1: true
        });
      }
      async run() {
        const editor = await that.openProfilesEditor();
        editor?.selectProfile(that.userDataProfileService.currentProfile);
      }
    }));
    disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarShare, {
      command: {
        id,
        title: localize2("export profile in share", "Export Profile ({0})...", that.userDataProfileService.currentProfile.name)
      }
    }));
    return disposables;
  }
  registerCreateFromCurrentProfileAction() {
    const that = this;
    this._register(registerAction2(class CreateFromCurrentProfileAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.createFromCurrentProfile",
          title: localize2("save profile as", "Save Current Profile As..."),
          category: PROFILES_CATEGORY,
          f1: true
        });
      }
      async run() {
        const editor = await that.openProfilesEditor();
        editor?.createNewProfile(that.userDataProfileService.currentProfile);
      }
    }));
  }
  registerNewProfileAction() {
    const that = this;
    this._register(registerAction2(class CreateProfileAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.createProfile",
          title: localize2("create profile", "New Profile..."),
          category: PROFILES_CATEGORY,
          f1: true,
          menu: [
            {
              id: OpenProfileMenu,
              group: "1_manage_profiles",
              order: 1
            }
          ]
        });
      }
      async run(accessor) {
        const editor = await that.openProfilesEditor();
        return editor?.createNewProfile();
      }
    }));
  }
  registerDeleteProfileAction() {
    this._register(registerAction2(class DeleteProfileAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.deleteProfile",
          title: localize2("delete profile", "Delete Profile..."),
          category: PROFILES_CATEGORY,
          f1: true,
          precondition: HAS_PROFILES_CONTEXT
        });
      }
      async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        const userDataProfileService = accessor.get(IUserDataProfileService);
        const userDataProfilesService = accessor.get(IUserDataProfilesService);
        const userDataProfileManagementService = accessor.get(IUserDataProfileManagementService);
        const notificationService = accessor.get(INotificationService);
        const profiles = userDataProfilesService.profiles.filter((p) => !p.isDefault && !p.isInternal);
        if (profiles.length) {
          const picks = await quickInputService.pick(
            profiles.map((profile) => ({
              label: profile.name,
              description: profile.id === userDataProfileService.currentProfile.id ? localize("current", "Current") : void 0,
              profile
            })),
            {
              title: localize("delete specific profile", "Delete Profile..."),
              placeHolder: localize("pick profile to delete", "Select Profiles to Delete"),
              canPickMany: true
            }
          );
          if (picks) {
            try {
              await Promise.all(picks.map((pick) => userDataProfileManagementService.removeProfile(pick.profile)));
            } catch (error) {
              notificationService.error(error);
            }
          }
        }
      }
    }));
  }
  registerHelpAction() {
    this._register(registerAction2(class HelpAction extends Action2 {
      constructor() {
        super({
          id: "workbench.profiles.actions.help",
          title: PROFILES_TITLE,
          category: Categories.Help,
          menu: [{
            id: MenuId.CommandPalette
          }]
        });
      }
      run(accessor) {
        return accessor.get(IOpenerService).open(URI.parse("https://aka.ms/vscode-profiles-help"));
      }
    }));
  }
  async reportWorkspaceProfileInfo() {
    await this.lifecycleService.when(LifecyclePhase.Eventually);
    const count = this.userDataProfilesService.profiles.filter((p) => !p.isInternal).length - 1;
    if (count > 0) {
      this.telemetryService.publicLog2("profiles:count", { count });
    }
    const workspaceId = await this.workspaceTagsService.getTelemetryWorkspaceId(this.workspaceContextService.getWorkspace(), this.workspaceContextService.getWorkbenchState());
    this.telemetryService.publicLog2("workspaceProfileInfo", {
      workspaceId,
      defaultProfile: this.userDataProfileService.currentProfile.isDefault
    });
  }
};
UserDataProfilesWorkbenchContribution.ID = "workbench.contrib.userDataProfiles";
UserDataProfilesWorkbenchContribution = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IWorkspaceTagsService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ILifecycleService),
  __decorateParam(10, IURLService),
  __decorateParam(11, IBrowserWorkbenchEnvironmentService)
], UserDataProfilesWorkbenchContribution);
export {
  OpenProfileMenu,
  UserDataProfilesWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVzZXJEYXRhUHJvZmlsZVxcYnJvd3NlclxcdXNlckRhdGFQcm9maWxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENVUlJFTlRfUFJPRklMRV9DT05URVhULCBIQVNfUFJPRklMRVNfQ09OVEVYVCwgSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsIElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIFBST0ZJTEVTX0NBVEVHT1JZLCBQUk9GSUxFU19USVRMRSwgUFJPRklMRV9FWFRFTlNJT04sIGlzUHJvZmlsZVVSTCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRhZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGFncy9jb21tb24vd29ya3NwYWNlVGFncy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVByb2ZpbGVzRWRpdG9yLCBVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXQsIFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgfSBmcm9tICcuL3VzZXJEYXRhUHJvZmlsZXNFZGl0b3IuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzRWRpdG9yIH0gZnJvbSAnLi4vY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVVJMU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBEbmRFeHRlbnNpb25zLCBJRHJhZ0FuZERyb3BDb250cmlidXRpb25SZWdpc3RyeSwgSVJlc291cmNlRHJvcEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEVkaXRvclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgT3BlblByb2ZpbGVNZW51ID0gbmV3IE1lbnVJZCgnT3BlblByb2ZpbGUnKTtcbmNvbnN0IFByb2ZpbGVzTWVudSA9IG5ldyBNZW51SWQoJ1Byb2ZpbGVzJyk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVByb2ZpbGVzV29ya2JlbmNoQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi51c2VyRGF0YVByb2ZpbGVzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRQcm9maWxlQ29udGV4dDogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNQcm9maWxlc0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVGFnc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUYWdzU2VydmljZTogSVdvcmtzcGFjZVRhZ3NTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVVSTFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmxTZXJ2aWNlOiBJVVJMU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jdXJyZW50UHJvZmlsZUNvbnRleHQgPSBDVVJSRU5UX1BST0ZJTEVfQ09OVEVYVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jdXJyZW50UHJvZmlsZUNvbnRleHQuc2V0KHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoZSA9PiB7XG5cdFx0XHR0aGlzLmN1cnJlbnRQcm9maWxlQ29udGV4dC5zZXQodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmhhc1Byb2ZpbGVzQ29udGV4dCA9IEhBU19QUk9GSUxFU19DT05URVhULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNQcm9maWxlc0NvbnRleHQuc2V0KHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmlsdGVyKHAgPT4gIXAuaXNJbnRlcm5hbCkubGVuZ3RoID4gMSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGVzKGUgPT4gdGhpcy5oYXNQcm9maWxlc0NvbnRleHQuc2V0KHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmlsdGVyKHAgPT4gIXAuaXNJbnRlcm5hbCkubGVuZ3RoID4gMSkpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3IoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih0aGlzKSk7XG5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KS50aGVuKCgpID0+IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmNsZWFuVXAoKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXBvcnRXb3Jrc3BhY2VQcm9maWxlSW5mbygpO1xuXG5cdFx0aWYgKGVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy5wcm9maWxlVG9QcmV2aWV3KSB7XG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpLnRoZW4oKCkgPT4gdGhpcy5oYW5kbGVVUkwoVVJJLnJldml2ZShlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucyEucHJvZmlsZVRvUHJldmlldyEpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3RlckRyb3BIYW5kbGVyKCk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVVUkwodXJpOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoaXNQcm9maWxlVVJMKHVyaSkpIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoaXMub3BlblByb2ZpbGVzRWRpdG9yKCk7XG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdGVkaXRvci5jcmVhdGVOZXdQcm9maWxlKHVyaSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5Qcm9maWxlc0VkaXRvcigpOiBQcm9taXNlPElVc2VyRGF0YVByb2ZpbGVzRWRpdG9yIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IobmV3IFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIGVkaXRvciBhcyBJVXNlckRhdGFQcm9maWxlc0VkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFZGl0b3IoKTogdm9pZCB7XG5cdFx0UmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdFx0XHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0XHRcdFVzZXJEYXRhUHJvZmlsZXNFZGl0b3IsXG5cdFx0XHRcdFVzZXJEYXRhUHJvZmlsZXNFZGl0b3IuSUQsXG5cdFx0XHRcdGxvY2FsaXplKCd1c2VyZGF0YXByb2ZpbGVzRWRpdG9yJywgXCJQcm9maWxlcyBFZGl0b3JcIilcblx0XHRcdCksXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBTeW5jRGVzY3JpcHRvcihVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXQpXG5cdFx0XHRdXG5cdFx0KTtcblx0XHRSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXQuSUQsIFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dFNlcmlhbGl6ZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckRyb3BIYW5kbGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRuZFJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SURyYWdBbmREcm9wQ29udHJpYnV0aW9uUmVnaXN0cnk+KERuZEV4dGVuc2lvbnMuRHJhZ0FuZERyb3BDb250cmlidXRpb24pO1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRuZFJlZ2lzdHJ5LnJlZ2lzdGVyRHJvcEhhbmRsZXIobmV3IGNsYXNzIFVzZXJEYXRhUHJvZmlsZURyb3BIYW5kbGVyIGltcGxlbWVudHMgSVJlc291cmNlRHJvcEhhbmRsZXIge1xuXHRcdFx0YXN5bmMgaGFuZGxlRHJvcChyZXNvdXJjZTogVVJJLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdFx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdGV4dEVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRcdGlmICh1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmV4dG5hbWUocmVzb3VyY2UpID09PSBgLiR7UFJPRklMRV9FWFRFTlNJT059YCkge1xuXHRcdFx0XHRcdGNvbnN0IHRlbXBsYXRlID0gYXdhaXQgdXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZS5yZXNvbHZlUHJvZmlsZVRlbXBsYXRlKHJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAoIXRlbXBsYXRlKSB7XG5cdFx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ2ludmFsaWQgcHJvZmlsZScsIFwiVGhlIGRyb3BwZWQgcHJvZmlsZSBpcyBpbnZhbGlkLlwiKSk7XG5cdFx0XHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IodGV4dEVkaXRvclNlcnZpY2UuY3JlYXRlVGV4dEVkaXRvcih7IHJlc291cmNlIH0pKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGF0Lm9wZW5Qcm9maWxlc0VkaXRvcigpO1xuXHRcdFx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGVkaXRvci5jcmVhdGVOZXdQcm9maWxlKHJlc291cmNlKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMucmVnaXN0ZXJQcm9maWxlU3ViTWVudSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0ZXJNYW5hZ2VQcm9maWxlc0FjdGlvbigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyU3dpdGNoUHJvZmlsZUFjdGlvbigpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJPcGVuUHJvZmlsZVN1Yk1lbnUoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTmV3V2luZG93V2l0aFByb2ZpbGVBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyUHJvZmlsZXNBY3Rpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGVzKCgpID0+IHRoaXMucmVnaXN0ZXJQcm9maWxlc0FjdGlvbnMoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZWdpc3RlckV4cG9ydEN1cnJlbnRQcm9maWxlQWN0aW9uKCkpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckNyZWF0ZUZyb21DdXJyZW50UHJvZmlsZUFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJOZXdQcm9maWxlQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckRlbGV0ZVByb2ZpbGVBY3Rpb24oKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJIZWxwQWN0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyUHJvZmlsZVN1Yk1lbnUoKTogdm9pZCB7XG5cdFx0Y29uc3QgZ2V0UHJvZmlsZXNUaXRsZSA9ICgpID0+IHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvZmlsZXMnLCBcIlByb2ZpbGUgKHswfSlcIiwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm5hbWUpO1xuXHRcdH07XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5HbG9iYWxBY3Rpdml0eSwge1xuXHRcdFx0Z2V0IHRpdGxlKCkge1xuXHRcdFx0XHRyZXR1cm4gZ2V0UHJvZmlsZXNUaXRsZSgpO1xuXHRcdFx0fSxcblx0XHRcdHN1Ym1lbnU6IFByb2ZpbGVzTWVudSxcblx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0d2hlbjogSEFTX1BST0ZJTEVTX0NPTlRFWFRcblx0XHR9KTtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsIHtcblx0XHRcdGdldCB0aXRsZSgpIHtcblx0XHRcdFx0cmV0dXJuIGdldFByb2ZpbGVzVGl0bGUoKTtcblx0XHRcdH0sXG5cdFx0XHRzdWJtZW51OiBQcm9maWxlc01lbnUsXG5cdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRvcmRlcjogMSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChIQVNfUFJPRklMRVNfQ09OVEVYVCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyT3BlblByb2ZpbGVTdWJNZW51KCk6IHZvaWQge1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ05ldyBQcm9maWxlIFdpbmRvdycsIFwiTmV3IFdpbmRvdyB3aXRoIFByb2ZpbGVcIiksXG5cdFx0XHRzdWJtZW51OiBPcGVuUHJvZmlsZU1lbnUsXG5cdFx0XHRncm91cDogJzFfbmV3Jyxcblx0XHRcdG9yZGVyOiA0LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlc0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWdpc3RlclByb2ZpbGVzQWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLnByb2ZpbGVzRGlzcG9zYWJsZS52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0aWYgKCFwcm9maWxlLmlzSW50ZXJuYWwpIHtcblx0XHRcdFx0dGhpcy5wcm9maWxlc0Rpc3Bvc2FibGUudmFsdWUuYWRkKHRoaXMucmVnaXN0ZXJQcm9maWxlRW50cnlBY3Rpb24ocHJvZmlsZSkpO1xuXHRcdFx0XHR0aGlzLnByb2ZpbGVzRGlzcG9zYWJsZS52YWx1ZS5hZGQodGhpcy5yZWdpc3Rlck5ld1dpbmRvd0FjdGlvbihwcm9maWxlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclByb2ZpbGVFbnRyeUFjdGlvbihwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgUHJvZmlsZUVudHJ5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLnByb2ZpbGVzLmFjdGlvbnMucHJvZmlsZUVudHJ5LiR7cHJvZmlsZS5pZH1gLFxuXHRcdFx0XHRcdHRpdGxlOiBwcm9maWxlLm5hbWUsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ2NoYW5nZSBwcm9maWxlJywgXCJTd2l0Y2ggdG8gezB9IHByb2ZpbGVcIiwgcHJvZmlsZS5uYW1lKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhDVVJSRU5UX1BST0ZJTEVfQ09OVEVYVC5rZXksIHByb2ZpbGUuaWQpLFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IFByb2ZpbGVzTWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcwX3Byb2ZpbGVzJyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGlmICh0aGF0LnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQgIT09IHByb2ZpbGUuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5zd2l0Y2hQcm9maWxlKHByb2ZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTmV3V2luZG93V2l0aFByb2ZpbGVBY3Rpb24oKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3V2luZG93V2l0aFByb2ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2gucHJvZmlsZXMuYWN0aW9ucy5uZXdXaW5kb3dXaXRoUHJvZmlsZWAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmV3V2luZG93V2l0aFByb2ZpbGUnLCBcIk5ldyBXaW5kb3cgd2l0aCBQcm9maWxlLi4uXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQUk9GSUxFU19DQVRFR09SWSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IEhBU19QUk9GSUxFU19DT05URVhULFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXG5cdFx0XHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFxuXHRcdFx0XHRcdHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzXG5cdFx0XHRcdFx0XHQuZmlsdGVyKHByb2ZpbGUgPT4gIXByb2ZpbGUuaXNJbnRlcm5hbClcblx0XHRcdFx0XHRcdC5tYXAocHJvZmlsZSA9PiAoe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogcHJvZmlsZS5uYW1lLFxuXHRcdFx0XHRcdFx0XHRwcm9maWxlXG5cdFx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCduZXcgd2luZG93IHdpdGggcHJvZmlsZScsIFwiTmV3IFdpbmRvdyB3aXRoIFByb2ZpbGVcIiksXG5cdFx0XHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BpY2sgcHJvZmlsZScsIFwiU2VsZWN0IFByb2ZpbGVcIiksXG5cdFx0XHRcdFx0XHRjYW5QaWNrTWFueTogZmFsc2Vcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHBpY2spIHtcblx0XHRcdFx0XHRyZXR1cm4gaG9zdFNlcnZpY2Uub3BlbldpbmRvdyh7IHJlbW90ZUF1dGhvcml0eTogbnVsbCwgZm9yY2VQcm9maWxlOiBwaWNrLnByb2ZpbGUubmFtZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck5ld1dpbmRvd0FjdGlvbihwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgaWQgPSBgd29ya2JlbmNoLmFjdGlvbi5vcGVuUHJvZmlsZS4ke3Byb2ZpbGUubmFtZS5yZXBsYWNlKCcvXFxzKy8nLCAnXycpfWA7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCA9IEhBU19QUk9GSUxFU19DT05URVhUO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXdXaW5kb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuU2hvcnQnLCBcInswfVwiLCBwcm9maWxlLm5hbWUpLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdvcGVuIHByb2ZpbGUnLCBcIk9wZW4gTmV3IFdpbmRvdyB3aXRoIHswfSBQcm9maWxlXCIsIHByb2ZpbGUubmFtZSksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogT3BlblByb2ZpbGVNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcwX3Byb2ZpbGVzJyxcblx0XHRcdFx0XHRcdHdoZW46IHByZWNvbmRpdGlvblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdFx0XHRyZXR1cm4gaG9zdFNlcnZpY2Uub3BlbldpbmRvdyh7IHJlbW90ZUF1dGhvcml0eTogbnVsbCwgZm9yY2VQcm9maWxlOiBwcm9maWxlLm5hbWUgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGNhdGVnb3J5OiBQUk9GSUxFU19DQVRFR09SWSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbicsIFwiT3BlbiB7MH0gUHJvZmlsZVwiLCBwcm9maWxlLm5hbWUpLFxuXHRcdFx0XHRwcmVjb25kaXRpb25cblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclN3aXRjaFByb2ZpbGVBY3Rpb24oKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgU3dpdGNoUHJvZmlsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5wcm9maWxlcy5hY3Rpb25zLnN3aXRjaFByb2ZpbGVgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N3aXRjaFByb2ZpbGUnLCAnU3dpdGNoIFByb2ZpbGUuLi4nKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUFJPRklMRVNfQ0FURUdPUlksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRcdFx0Y29uc3QgaXRlbXM6IEFycmF5PElRdWlja1BpY2tJdGVtICYgeyBwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlIH0+ID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGF0LnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzKSB7XG5cdFx0XHRcdFx0aWYgKHByb2ZpbGUuaXNJbnRlcm5hbCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IHByb2ZpbGUuaWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogcHJvZmlsZS5pZCA9PT0gdGhhdC51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkID8gYCQoY2hlY2spICR7cHJvZmlsZS5uYW1lfWAgOiBwcm9maWxlLm5hbWUsXG5cdFx0XHRcdFx0XHRwcm9maWxlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcy5zb3J0KChhLCBiKSA9PiBhLnByb2ZpbGUubmFtZS5sb2NhbGVDb21wYXJlKGIucHJvZmlsZS5uYW1lKSksIHtcblx0XHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdFByb2ZpbGUnLCBcIlNlbGVjdCBQcm9maWxlXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhhdC51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5zd2l0Y2hQcm9maWxlKHJlc3VsdC5wcm9maWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1hbmFnZVByb2ZpbGVzQWN0aW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE1hbmFnZVByb2ZpbGVzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLnByb2ZpbGVzLmFjdGlvbnMubWFuYWdlUHJvZmlsZXNgLFxuXHRcdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ21hbmFnZSBwcm9maWxlcycsIFwiUHJvZmlsZXNcIiksXG5cdFx0XHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pT3BlblByb2ZpbGVzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUHJvZmlsZXNcIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuR2xvYmFsQWN0aXZpdHksXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0XHRcdHdoZW46IEhBU19QUk9GSUxFU19DT05URVhULm5lZ2F0ZSgpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChIQVNfUFJPRklMRVNfQ09OVEVYVC5uZWdhdGUoKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogUHJvZmlsZXNNZW51LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzFfbWFuYWdlJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IobmV3IFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dChpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5wcm9maWxlcy5hY3Rpb25zLm1hbmFnZVByb2ZpbGVzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuUHJlZmVyZW5jZXMsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW4gcHJvZmlsZXMnLCBcIk9wZW4gUHJvZmlsZXMgKFVJKVwiKSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckV4cG9ydEN1cnJlbnRQcm9maWxlQWN0aW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpZCA9ICd3b3JrYmVuY2gucHJvZmlsZXMuYWN0aW9ucy5leHBvcnRQcm9maWxlJztcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4cG9ydFByb2ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZXhwb3J0IHByb2ZpbGUnLCBcIkV4cG9ydCBQcm9maWxlLi4uXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQUk9GSUxFU19DQVRFR09SWSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhhdC5vcGVuUHJvZmlsZXNFZGl0b3IoKTtcblx0XHRcdFx0ZWRpdG9yPy5zZWxlY3RQcm9maWxlKHRoYXQudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTaGFyZSwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZXhwb3J0IHByb2ZpbGUgaW4gc2hhcmUnLCBcIkV4cG9ydCBQcm9maWxlICh7MH0pLi4uXCIsIHRoYXQudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5uYW1lKSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cblx0cHJpdmF0ZSByZWdpc3RlckNyZWF0ZUZyb21DdXJyZW50UHJvZmlsZUFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ3JlYXRlRnJvbUN1cnJlbnRQcm9maWxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLnByb2ZpbGVzLmFjdGlvbnMuY3JlYXRlRnJvbUN1cnJlbnRQcm9maWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzYXZlIHByb2ZpbGUgYXMnLCBcIlNhdmUgQ3VycmVudCBQcm9maWxlIEFzLi4uXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQUk9GSUxFU19DQVRFR09SWSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bigpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhhdC5vcGVuUHJvZmlsZXNFZGl0b3IoKTtcblx0XHRcdFx0ZWRpdG9yPy5jcmVhdGVOZXdQcm9maWxlKHRoYXQudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck5ld1Byb2ZpbGVBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENyZWF0ZVByb2ZpbGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gucHJvZmlsZXMuYWN0aW9ucy5jcmVhdGVQcm9maWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjcmVhdGUgcHJvZmlsZScsIFwiTmV3IFByb2ZpbGUuLi5cIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBST0ZJTEVTX0NBVEVHT1JZLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE9wZW5Qcm9maWxlTWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcxX21hbmFnZV9wcm9maWxlcycsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoYXQub3BlblByb2ZpbGVzRWRpdG9yKCk7XG5cdFx0XHRcdHJldHVybiBlZGl0b3I/LmNyZWF0ZU5ld1Byb2ZpbGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRGVsZXRlUHJvZmlsZUFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgRGVsZXRlUHJvZmlsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5wcm9maWxlcy5hY3Rpb25zLmRlbGV0ZVByb2ZpbGUnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlbGV0ZSBwcm9maWxlJywgXCJEZWxldGUgUHJvZmlsZS4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogUFJPRklMRVNfQ0FURUdPUlksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBIQVNfUFJPRklMRVNfQ09OVEVYVCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0Y29uc3QgcHJvZmlsZXMgPSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maWx0ZXIocCA9PiAhcC5pc0RlZmF1bHQgJiYgIXAuaXNJbnRlcm5hbCk7XG5cdFx0XHRcdGlmIChwcm9maWxlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBwaWNrcyA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soXG5cdFx0XHRcdFx0XHRwcm9maWxlcy5tYXAocHJvZmlsZSA9PiAoe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogcHJvZmlsZS5uYW1lLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcHJvZmlsZS5pZCA9PT0gdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pZCA/IGxvY2FsaXplKCdjdXJyZW50JywgXCJDdXJyZW50XCIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRwcm9maWxlXG5cdFx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZGVsZXRlIHNwZWNpZmljIHByb2ZpbGUnLCBcIkRlbGV0ZSBQcm9maWxlLi4uXCIpLFxuXHRcdFx0XHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BpY2sgcHJvZmlsZSB0byBkZWxldGUnLCBcIlNlbGVjdCBQcm9maWxlcyB0byBEZWxldGVcIiksXG5cdFx0XHRcdFx0XHRcdGNhblBpY2tNYW55OiB0cnVlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAocGlja3MpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHBpY2tzLm1hcChwaWNrID0+IHVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnJlbW92ZVByb2ZpbGUocGljay5wcm9maWxlKSkpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckhlbHBBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEhlbHBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gucHJvZmlsZXMuYWN0aW9ucy5oZWxwJyxcblx0XHRcdFx0XHR0aXRsZTogUFJPRklMRVNfVElUTEUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuSGVscCxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB1bmtub3duIHtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSkub3BlbihVUkkucGFyc2UoJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1wcm9maWxlcy1oZWxwJykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwb3J0V29ya3NwYWNlUHJvZmlsZUluZm8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cblx0XHR0eXBlIFVzZXJQcm9maWxlc0NvdW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgdGhlIG51bWJlciBvZiB1c2VyIHByb2ZpbGVzIGV4Y2x1ZGluZyB0aGUgZGVmYXVsdCBwcm9maWxlJztcblx0XHRcdGNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiB1c2VyIHByb2ZpbGVzIGV4Y2x1ZGluZyB0aGUgZGVmYXVsdCBwcm9maWxlJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBVc2VyUHJvZmlsZXNDb3VudEV2ZW50ID0ge1xuXHRcdFx0Y291bnQ6IG51bWJlcjtcblx0XHR9O1xuXHRcdGNvbnN0IGNvdW50ID0gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5maWx0ZXIocCA9PiAhcC5pc0ludGVybmFsKS5sZW5ndGggLSAxO1xuXHRcdGlmIChjb3VudCA+IDApIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFVzZXJQcm9maWxlc0NvdW50RXZlbnQsIFVzZXJQcm9maWxlc0NvdW50Q2xhc3NpZmljYXRpb24+KCdwcm9maWxlczpjb3VudCcsIHsgY291bnQgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlSWQgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRhZ3NTZXJ2aWNlLmdldFRlbGVtZXRyeVdvcmtzcGFjZUlkKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCksIHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSk7XG5cdFx0dHlwZSBXb3Jrc3BhY2VQcm9maWxlSW5mb0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRjb21tZW50OiAnUmVwb3J0IHByb2ZpbGUgaW5mb3JtYXRpb24gb2YgdGhlIGN1cnJlbnQgd29ya3NwYWNlJztcblx0XHRcdHdvcmtzcGFjZUlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQSBVVUlEIGdpdmVuIHRvIGEgd29ya3NwYWNlIHRvIGlkZW50aWZ5IGl0LicgfTtcblx0XHRcdGRlZmF1bHRQcm9maWxlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgcHJvZmlsZSBvZiB0aGUgd29ya3NwYWNlIGlzIGRlZmF1bHQgb3Igbm90LicgfTtcblx0XHR9O1xuXHRcdHR5cGUgV29ya3NwYWNlUHJvZmlsZUluZm9FdmVudCA9IHtcblx0XHRcdHdvcmtzcGFjZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRkZWZhdWx0UHJvZmlsZTogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVByb2ZpbGVJbmZvRXZlbnQsIFdvcmtzcGFjZVByb2ZpbGVJbmZvQ2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2VQcm9maWxlSW5mbycsIHtcblx0XHRcdHdvcmtzcGFjZUlkLFxuXHRcdFx0ZGVmYXVsdFByb2ZpbGU6IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHRcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFTLGFBQWE7QUFFdEIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQVMsUUFBUSxjQUFjLHVCQUF1QjtBQUMvRCxTQUFTLGdCQUFtRCwwQkFBMEI7QUFDdEYsU0FBMkIsZ0NBQWdDO0FBRTNELFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFTLHlCQUF5QixzQkFBc0IscUNBQXFDLG1DQUFtQyx5QkFBeUIsbUJBQW1CLGdCQUFnQixtQkFBbUIsb0JBQW9CO0FBQ25PLFNBQVMsMEJBQTBDO0FBQ25ELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUFpRDtBQUMxRCxTQUFTLHdCQUFnRDtBQUN6RCxTQUFTLHdCQUF3Qiw2QkFBNkIsNkNBQTZDO0FBQzNHLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsY0FBYyxxQkFBNkU7QUFDcEcsU0FBUywyQkFBMkI7QUFDcEMs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
