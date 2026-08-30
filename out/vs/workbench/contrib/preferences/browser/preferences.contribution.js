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
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isBoolean, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { Context as SuggestContext } from "../../../../editor/contrib/suggest/browser/suggest.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext, IsMacNativeContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight, KeybindingsRegistry } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { resolveCommandsContext } from "../../../browser/parts/editor/editorCommandsContext.js";
import { RemoteNameContext, ResourceContextKey, WorkbenchStateContext } from "../../../common/contextkeys.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { KeybindingsEditorInput } from "../../../services/preferences/browser/keybindingsEditorInput.js";
import { DEFINE_KEYBINDING_EDITOR_CONTRIB_ID, IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { PreferencesEditorInput, SettingsEditor2Input } from "../../../services/preferences/common/preferencesEditorInput.js";
import { SettingsEditorModel } from "../../../services/preferences/common/preferencesModels.js";
import { CURRENT_PROFILE_CONTEXT, IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { ExplorerFolderContext, ExplorerRootContext } from "../../files/common/files.js";
import { CONTEXT_AI_SETTING_RESULTS_AVAILABLE, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE, CONTEXT_KEYBINDING_FOCUS, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_FIRST_ROW_FOCUS, CONTEXT_SETTINGS_JSON_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, CONTEXT_WHEN_FOCUS, KEYBINDINGS_EDITOR_COMMAND_ACCEPT_WHEN, KEYBINDINGS_EDITOR_COMMAND_ADD, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_HISTORY, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_REJECT_WHEN, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_SEARCH, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS, KEYBINDINGS_EDITOR_SHOW_EXTENSION_KEYBINDINGS, KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU, SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH } from "../common/preferences.js";
import { PreferencesContribution } from "../common/preferencesContribution.js";
import { KeybindingsEditor } from "./keybindingsEditor.js";
import { ConfigureLanguageBasedSettingsAction } from "./preferencesActions.js";
import { PreferencesEditor } from "./preferencesEditor.js";
import { preferencesOpenSettingsIcon } from "./preferencesIcons.js";
import { UserSettingsRenderer, WorkspaceSettingsRenderer } from "./preferencesRenderers.js";
import { SettingsEditor2, SettingsFocusContext } from "./settingsEditor2.js";
const SETTINGS_EDITOR_COMMAND_SEARCH = "settings.action.search";
const SETTINGS_EDITOR_COMMAND_FOCUS_FILE = "settings.action.focusSettingsFile";
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH = "settings.action.focusSettingsFromSearch";
const SETTINGS_EDITOR_COMMAND_SHOW_PREVIOUS_SEARCH = "settings.action.showPreviousSearch";
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH_ON_ENTER = "settings.action.focusSettingsFromSearchOnEnter";
const SETTINGS_EDITOR_COMMAND_FOCUS_SEARCH_FROM_SETTINGS = "settings.action.focusSearchFromSettings";
const SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST = "settings.action.focusSettingsList";
const SETTINGS_EDITOR_COMMAND_FOCUS_TOC = "settings.action.focusTOC";
const SETTINGS_EDITOR_COMMAND_FOCUS_CONTROL = "settings.action.focusSettingControl";
const SETTINGS_EDITOR_COMMAND_FOCUS_UP = "settings.action.focusLevelUp";
const SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON = "settings.switchToJSON";
const SETTINGS_EDITOR_COMMAND_FILTER_ONLINE = "settings.filterByOnline";
const SETTINGS_EDITOR_COMMAND_FILTER_UNTRUSTED = "settings.filterUntrusted";
const SETTINGS_COMMAND_OPEN_SETTINGS = "workbench.action.openSettings";
const SETTINGS_COMMAND_FILTER_TELEMETRY = "settings.filterByTelemetry";
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    SettingsEditor2,
    SettingsEditor2.ID,
    nls.localize("settingsEditor2", "Settings Editor 2")
  ),
  [
    new SyncDescriptor(SettingsEditor2Input)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    PreferencesEditor,
    PreferencesEditor.ID,
    nls.localize("preferencesEditor", "Preferences Editor")
  ),
  [
    new SyncDescriptor(PreferencesEditorInput)
  ]
);
class PreferencesEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(PreferencesEditorInput);
  }
}
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    KeybindingsEditor,
    KeybindingsEditor.ID,
    nls.localize("keybindingsEditor", "Keybindings Editor")
  ),
  [
    new SyncDescriptor(KeybindingsEditorInput)
  ]
);
class KeybindingsEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(KeybindingsEditorInput);
  }
}
class SettingsEditor2InputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(input) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(SettingsEditor2Input);
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(PreferencesEditorInput.ID, PreferencesEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(KeybindingsEditorInput.ID, KeybindingsEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(SettingsEditor2Input.ID, SettingsEditor2InputSerializer);
const OPEN_USER_SETTINGS_UI_TITLE = nls.localize2("openSettings2", "Open Settings (UI)");
const OPEN_USER_SETTINGS_JSON_TITLE = nls.localize2("openUserSettingsJson", "Open User Settings (JSON)");
const OPEN_APPLICATION_SETTINGS_JSON_TITLE = nls.localize2("openApplicationSettingsJson", "Open Application Settings (JSON)");
const category = Categories.Preferences;
function sanitizeBoolean(arg) {
  return isBoolean(arg) ? arg : void 0;
}
function sanitizeString(arg) {
  return isString(arg) ? arg : void 0;
}
function sanitizeOpenSettingsArgs(args) {
  if (!isObject(args)) {
    args = {};
  }
  let sanitizedObject = {
    focusSearch: sanitizeBoolean(args?.focusSearch),
    openToSide: sanitizeBoolean(args?.openToSide),
    query: sanitizeString(args?.query)
  };
  if (isString(args?.revealSetting?.key)) {
    sanitizedObject = {
      ...sanitizedObject,
      revealSetting: {
        key: args.revealSetting.key,
        edit: sanitizeBoolean(args.revealSetting?.edit)
      }
    };
  }
  return sanitizedObject;
}
let PreferencesActionsContribution = class extends Disposable {
  constructor(environmentService, userDataProfileService, preferencesService, workspaceContextService, labelService, extensionService, userDataProfilesService) {
    super();
    this.environmentService = environmentService;
    this.userDataProfileService = userDataProfileService;
    this.preferencesService = preferencesService;
    this.workspaceContextService = workspaceContextService;
    this.labelService = labelService;
    this.extensionService = extensionService;
    this.userDataProfilesService = userDataProfilesService;
    this.registerSettingsActions();
    this.registerKeybindingsActions();
    this.updatePreferencesEditorMenuItem();
    this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.updatePreferencesEditorMenuItem()));
    this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.updatePreferencesEditorMenuItemForWorkspaceFolders()));
  }
  registerSettingsActions() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_COMMAND_OPEN_SETTINGS,
          title: {
            ...nls.localize2("settings", "Settings"),
            mnemonicTitle: nls.localize({ key: "miOpenSettings", comment: ["&& denotes a mnemonic"] }, "&&Settings")
          },
          keybinding: {
            weight: KeybindingWeight.WorkbenchContrib,
            when: null,
            primary: KeyMod.CtrlCmd | KeyCode.Comma
          },
          menu: [{
            id: MenuId.GlobalActivity,
            group: "2_configuration",
            order: 2
          }, {
            id: MenuId.MenubarPreferencesMenu,
            group: "2_configuration",
            order: 2
          }]
        });
      }
      run(accessor, args) {
        const opts = typeof args === "string" ? { query: args } : sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openSettings({ ...opts });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openSettings2",
          title: nls.localize2("openSettings2", "Open Settings (UI)"),
          category,
          f1: true
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openSettings({ jsonEditor: false, ...args });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openSettingsJson",
          title: OPEN_USER_SETTINGS_JSON_TITLE,
          metadata: {
            description: nls.localize2("workbench.action.openSettingsJson.description", "Opens the JSON file containing the current user profile settings")
          },
          category,
          f1: true
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openSettings({ jsonEditor: true, ...args });
      }
    }));
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openApplicationSettingsJson",
          title: OPEN_APPLICATION_SETTINGS_JSON_TITLE,
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.notEquals(CURRENT_PROFILE_CONTEXT.key, that.userDataProfilesService.defaultProfile.id)
          }
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openApplicationSettings({ jsonEditor: true, ...args });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openGlobalSettings",
          title: nls.localize2("openGlobalSettings", "Open User Settings"),
          category,
          f1: true
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openUserSettings(args);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openRawDefaultSettings",
          title: nls.localize2("openRawDefaultSettings", "Open Default Settings (JSON)"),
          category,
          f1: true
        });
      }
      run(accessor) {
        return accessor.get(IPreferencesService).openRawDefaultSettings();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: ConfigureLanguageBasedSettingsAction.ID,
          title: ConfigureLanguageBasedSettingsAction.LABEL,
          category,
          f1: true
        });
      }
      run(accessor) {
        return accessor.get(IInstantiationService).createInstance(ConfigureLanguageBasedSettingsAction, ConfigureLanguageBasedSettingsAction.ID, ConfigureLanguageBasedSettingsAction.LABEL.value).run();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openWorkspaceSettings",
          title: nls.localize2("openWorkspaceSettings", "Open Workspace Settings"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.notEqualsTo("empty")
          }
        });
      }
      run(accessor, args) {
        args = typeof args === "string" ? { query: args } : sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openWorkspaceSettings(args);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openAccessibilitySettings",
          title: nls.localize2("openAccessibilitySettings", "Open Accessibility Settings"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.notEqualsTo("empty")
          }
        });
      }
      async run(accessor) {
        await accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:accessibility" });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openWorkspaceSettingsFile",
          title: nls.localize2("openWorkspaceSettingsFile", "Open Workspace Settings (JSON)"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.notEqualsTo("empty")
          }
        });
      }
      run(accessor, args) {
        args = sanitizeOpenSettingsArgs(args);
        return accessor.get(IPreferencesService).openWorkspaceSettings({ jsonEditor: true, ...args });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openFolderSettings",
          title: nls.localize2("openFolderSettings", "Open Folder Settings"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.isEqualTo("workspace")
          }
        });
      }
      async run(accessor, args) {
        const commandService = accessor.get(ICommandService);
        const preferencesService = accessor.get(IPreferencesService);
        const workspaceFolder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
        if (workspaceFolder) {
          args = sanitizeOpenSettingsArgs(args);
          await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, ...args });
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openFolderSettingsFile",
          title: nls.localize2("openFolderSettingsFile", "Open Folder Settings (JSON)"),
          category,
          menu: {
            id: MenuId.CommandPalette,
            when: WorkbenchStateContext.isEqualTo("workspace")
          }
        });
      }
      async run(accessor, args) {
        const commandService = accessor.get(ICommandService);
        const preferencesService = accessor.get(IPreferencesService);
        const workspaceFolder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
        if (workspaceFolder) {
          args = sanitizeOpenSettingsArgs(args);
          await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, jsonEditor: true, ...args });
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "_workbench.action.openFolderSettings",
          title: nls.localize("openFolderSettings", "Open Folder Settings"),
          category,
          menu: {
            id: MenuId.ExplorerContext,
            group: "2_workspace",
            order: 20,
            when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext)
          }
        });
      }
      async run(accessor, resource) {
        if (URI.isUri(resource)) {
          await accessor.get(IPreferencesService).openFolderSettings({ folderUri: resource });
        } else {
          const commandService = accessor.get(ICommandService);
          const preferencesService = accessor.get(IPreferencesService);
          const workspaceFolder = await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
          if (workspaceFolder) {
            await preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri });
          }
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FILTER_ONLINE,
          title: nls.localize({ key: "miOpenOnlineSettings", comment: ["&& denotes a mnemonic"] }, "&&Online Services Settings"),
          menu: {
            id: MenuId.MenubarPreferencesMenu,
            group: "3_settings",
            order: 1
          }
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          editorPane.focusSearch(`@tag:usesOnlineServices`);
        } else {
          accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:usesOnlineServices" });
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyMod.CtrlCmd | KeyCode.KeyI,
            weight: KeybindingWeight.EditorContrib,
            when: CONTEXT_AI_SETTING_RESULTS_AVAILABLE
          },
          category,
          f1: true,
          title: nls.localize2("settings.toggleAiSearch", "Toggle AI Settings Search")
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          editorPane.toggleAiSearch();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FILTER_UNTRUSTED,
          title: nls.localize2("filterUntrusted", "Show untrusted workspace settings")
        });
      }
      run(accessor) {
        accessor.get(IPreferencesService).openWorkspaceSettings({ jsonEditor: false, query: `@tag:${REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG}` });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_COMMAND_FILTER_TELEMETRY,
          title: nls.localize({ key: "miOpenTelemetrySettings", comment: ["&& denotes a mnemonic"] }, "&&Telemetry Settings")
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          editorPane.focusSearch(`@tag:telemetry`);
        } else {
          accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: "@tag:telemetry" });
        }
      }
    }));
    this.registerSettingsEditorActions();
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      const remoteAuthority = this.environmentService.remoteAuthority;
      const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority) || remoteAuthority;
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: "workbench.action.openRemoteSettings",
            title: nls.localize2("openRemoteSettings", "Open Remote Settings ({0})", hostLabel),
            category,
            menu: {
              id: MenuId.CommandPalette,
              when: RemoteNameContext.notEqualsTo("")
            }
          });
        }
        run(accessor, args) {
          args = sanitizeOpenSettingsArgs(args);
          return accessor.get(IPreferencesService).openRemoteSettings(args);
        }
      }));
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: "workbench.action.openRemoteSettingsFile",
            title: nls.localize2("openRemoteSettingsJSON", "Open Remote Settings (JSON) ({0})", hostLabel),
            category,
            menu: {
              id: MenuId.CommandPalette,
              when: RemoteNameContext.notEqualsTo("")
            }
          });
        }
        run(accessor, args) {
          args = sanitizeOpenSettingsArgs(args);
          return accessor.get(IPreferencesService).openRemoteSettings({ jsonEditor: true, ...args });
        }
      }));
    });
  }
  registerSettingsEditorActions() {
    function getPreferencesEditor(accessor) {
      const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
      if (activeEditorPane instanceof SettingsEditor2) {
        return activeEditorPane;
      }
      return null;
    }
    function settingsEditorFocusSearch(accessor) {
      const preferencesEditor = getPreferencesEditor(accessor);
      preferencesEditor?.focusSearch();
    }
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SEARCH,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyMod.CtrlCmd | KeyCode.KeyF,
            weight: KeybindingWeight.EditorContrib,
            when: null
          },
          category,
          f1: true,
          title: nls.localize2("settings.focusSearch", "Focus Settings Search")
        });
      }
      run(accessor) {
        settingsEditorFocusSearch(accessor);
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyCode.Escape,
            weight: KeybindingWeight.EditorContrib,
            when: CONTEXT_SETTINGS_SEARCH_FOCUS
          },
          category,
          f1: true,
          title: nls.localize2("settings.clearResults", "Clear Settings Search Results")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.clearSearchResults();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_FILE,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          title: nls.localize("settings.focusFile", "Focus settings file")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.navigateSearchHistoryNextOrFocusSettings();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          keybinding: {
            primary: KeyCode.DownArrow,
            weight: KeybindingWeight.WorkbenchContrib + 1,
            when: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated())
          },
          title: nls.localize("settings.focusFile", "Focus settings file")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.navigateSearchHistoryNextOrFocusSettings();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SHOW_PREVIOUS_SEARCH,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          keybinding: {
            primary: KeyCode.UpArrow,
            weight: KeybindingWeight.WorkbenchContrib + 1,
            when: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated())
          },
          title: nls.localize("settings.showPreviousSearch", "Show Previous Search in Settings")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.navigateSearchHistoryPrevious();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_FROM_SEARCH_ON_ENTER,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated()),
          keybinding: {
            primary: KeyCode.Enter,
            weight: KeybindingWeight.WorkbenchContrib,
            when: ContextKeyExpr.and(CONTEXT_SETTINGS_SEARCH_FOCUS, SuggestContext.Visible.toNegated())
          },
          title: nls.localize("settings.focusSettingsFromSearchOnEnter", "Focus First Setting from Search")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.focusFirstSettingFromSearch();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SEARCH_FROM_SETTINGS,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_FIRST_ROW_FOCUS),
          keybinding: {
            primary: KeyCode.UpArrow,
            // Win over the list's own `list.focusUp` command so the first row moves focus back to search.
            weight: KeybindingWeight.WorkbenchContrib + 1,
            when: null
          },
          title: nls.localize("settings.focusSearchFromSettings", "Focus Settings Search from Settings")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        preferencesEditor?.focusSearch();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_SETTINGS_LIST,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_TOC_ROW_FOCUS),
          keybinding: {
            primary: KeyCode.Enter,
            weight: KeybindingWeight.WorkbenchContrib,
            when: null
          },
          title: nls.localize("settings.focusSettingsList", "Focus settings list")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (preferencesEditor instanceof SettingsEditor2) {
          preferencesEditor.focusSettings();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_TOC,
          precondition: CONTEXT_SETTINGS_EDITOR,
          f1: true,
          keybinding: [
            {
              primary: KeyCode.LeftArrow,
              weight: KeybindingWeight.WorkbenchContrib,
              when: CONTEXT_SETTINGS_ROW_FOCUS
            }
          ],
          category,
          title: nls.localize2("settings.focusSettingsTOC", "Focus Settings Table of Contents")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (!(preferencesEditor instanceof SettingsEditor2)) {
          return;
        }
        preferencesEditor.focusTOC();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_CONTROL,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_ROW_FOCUS),
          keybinding: {
            primary: KeyCode.Enter,
            weight: KeybindingWeight.WorkbenchContrib
          },
          title: nls.localize("settings.focusSettingControl", "Focus Setting Control")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (!(preferencesEditor instanceof SettingsEditor2)) {
          return;
        }
        const activeElement = preferencesEditor.getContainer()?.ownerDocument.activeElement;
        if (activeElement?.classList.contains("monaco-list")) {
          preferencesEditor.focusSettings(true);
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU,
          precondition: CONTEXT_SETTINGS_EDITOR,
          keybinding: {
            primary: KeyMod.Shift | KeyCode.F9,
            weight: KeybindingWeight.WorkbenchContrib,
            when: null
          },
          f1: true,
          category,
          title: nls.localize2("settings.showContextMenu", "Show Setting Context Menu")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (preferencesEditor instanceof SettingsEditor2) {
          preferencesEditor.showContextMenu();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_FOCUS_UP,
          precondition: ContextKeyExpr.and(CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_SEARCH_FOCUS.toNegated(), CONTEXT_SETTINGS_JSON_EDITOR.toNegated()),
          keybinding: {
            primary: KeyCode.Escape,
            weight: KeybindingWeight.WorkbenchContrib,
            when: null
          },
          f1: true,
          category,
          title: nls.localize2("settings.focusLevelUp", "Move Focus Up One Level")
        });
      }
      run(accessor) {
        const preferencesEditor = getPreferencesEditor(accessor);
        if (!(preferencesEditor instanceof SettingsEditor2)) {
          return;
        }
        if (preferencesEditor.currentFocusContext === SettingsFocusContext.SettingControl) {
          preferencesEditor.focusSettings();
        } else if (preferencesEditor.currentFocusContext === SettingsFocusContext.SettingTree) {
          preferencesEditor.focusTOC();
        } else if (preferencesEditor.currentFocusContext === SettingsFocusContext.TableOfContents) {
          preferencesEditor.focusSearch();
        }
      }
    }));
  }
  registerKeybindingsActions() {
    const that = this;
    const category2 = nls.localize2("preferences", "Preferences");
    const id = "workbench.action.openGlobalKeybindings";
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id,
          title: nls.localize2("openGlobalKeybindings", "Open Keyboard Shortcuts"),
          shortTitle: nls.localize("keyboardShortcuts", "Keyboard Shortcuts"),
          category: category2,
          icon: preferencesOpenSettingsIcon,
          keybinding: {
            when: null,
            weight: KeybindingWeight.WorkbenchContrib,
            primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyS)
          },
          menu: [
            { id: MenuId.CommandPalette },
            {
              id: MenuId.EditorTitle,
              when: ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString()),
              group: "navigation",
              order: 1
            },
            {
              id: MenuId.ModalEditorEditorTitle,
              when: ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString()),
              group: "navigation",
              order: 1
            },
            {
              id: MenuId.GlobalActivity,
              group: "2_configuration",
              order: 4
            }
          ]
        });
      }
      run(accessor, ...args) {
        const query = typeof args[0] === "string" ? args[0] : void 0;
        const groupId = getEditorGroupFromArguments(accessor, args)?.id;
        return accessor.get(IPreferencesService).openGlobalKeybindingSettings(false, { query, groupId });
      }
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      command: {
        id,
        title: nls.localize("keyboardShortcuts", "Keyboard Shortcuts")
      },
      group: "2_configuration",
      order: 4
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openDefaultKeybindingsFile",
          title: nls.localize2("openDefaultKeybindingsFile", "Open Default Keyboard Shortcuts (JSON)"),
          category: category2,
          menu: { id: MenuId.CommandPalette }
        });
      }
      run(accessor) {
        return accessor.get(IPreferencesService).openDefaultKeybindingsFile();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openGlobalKeybindingsFile",
          title: nls.localize2("openGlobalKeybindingsFile", "Open Keyboard Shortcuts (JSON)"),
          category: category2,
          icon: preferencesOpenSettingsIcon,
          menu: [
            { id: MenuId.CommandPalette },
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "navigation"
            },
            {
              id: MenuId.ModalEditorEditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "navigation"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const groupId = getEditorGroupFromArguments(accessor, args)?.id;
        return accessor.get(IPreferencesService).openGlobalKeybindingSettings(true, { groupId });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS,
          title: nls.localize2("showDefaultKeybindings", "Show System Keybindings"),
          menu: [
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "1_keyboard_preferences_actions"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.search("@source:system");
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_SHOW_EXTENSION_KEYBINDINGS,
          title: nls.localize2("showExtensionKeybindings", "Show Extension Keybindings"),
          menu: [
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "1_keyboard_preferences_actions"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.search("@source:extension");
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS,
          title: nls.localize2("showUserKeybindings", "Show User Keybindings"),
          menu: [
            {
              id: MenuId.EditorTitle,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
              group: "1_keyboard_preferences_actions"
            }
          ]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.search("@source:user");
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
          title: nls.localize("clear", "Clear Search Results"),
          keybinding: {
            weight: KeybindingWeight.WorkbenchContrib,
            when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE),
            primary: KeyCode.Escape
          }
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.clearSearchResults();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_HISTORY,
          title: nls.localize("clearHistory", "Clear Keyboard Shortcuts Search History"),
          category: category2,
          menu: [
            {
              id: MenuId.CommandPalette,
              when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR)
            }
          ]
        });
      }
      run(accessor) {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.clearKeyboardShortcutSearchHistory();
        }
      }
    }));
    this.registerKeybindingEditorActions();
  }
  registerKeybindingEditorActions() {
    const that = this;
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, CONTEXT_WHEN_FOCUS.toNegated()),
      primary: KeyCode.Enter,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.defineKeybinding(editorPane.activeKeybindingEntry, false);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_ADD,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyA),
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.defineKeybinding(editorPane.activeKeybindingEntry, true);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyE),
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor && editorPane.activeKeybindingEntry.keybindingItem.keybinding) {
          editorPane.defineWhenExpression(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, InputFocusedContext.toNegated()),
      primary: KeyCode.Delete,
      mac: {
        primary: KeyMod.CtrlCmd | KeyCode.Backspace
      },
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.removeKeybinding(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_RESET,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.resetKeybinding(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_SEARCH,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
      primary: KeyMod.CtrlCmd | KeyCode.KeyF,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.focusSearch();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
      primary: KeyMod.Alt | KeyCode.KeyK,
      mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyK },
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.recordSearchKeys();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR),
      primary: KeyMod.Alt | KeyCode.KeyP,
      mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP },
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.toggleSortByPrecedence();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.showSimilarKeybindings(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_COPY,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS, CONTEXT_WHEN_FOCUS.negate()),
      primary: KeyMod.CtrlCmd | KeyCode.KeyC,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          await editorPane.copyKeybinding(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          await editorPane.copyKeybindingCommand(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
      primary: 0,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          await editorPane.copyKeybindingCommandTitle(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
      primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
      handler: (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.focusKeybindings();
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_REJECT_WHEN,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_WHEN_FOCUS, SuggestContext.Visible.toNegated()),
      primary: KeyCode.Escape,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.rejectWhenExpression(editorPane.activeKeybindingEntry);
        }
      }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: KEYBINDINGS_EDITOR_COMMAND_ACCEPT_WHEN,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_WHEN_FOCUS, SuggestContext.Visible.toNegated()),
      primary: KeyCode.Enter,
      handler: async (accessor, args) => {
        const editorPane = accessor.get(IEditorService).activeEditorPane;
        if (editorPane instanceof KeybindingsEditor) {
          editorPane.acceptWhenExpression(editorPane.activeKeybindingEntry);
        }
      }
    });
    const profileScopedActionDisposables = this._register(new DisposableStore());
    const registerProfileScopedActions = () => {
      profileScopedActionDisposables.clear();
      profileScopedActionDisposables.add(registerAction2(class DefineKeybindingAction extends Action2 {
        constructor() {
          const when = ResourceContextKey.Resource.isEqualTo(that.userDataProfileService.currentProfile.keybindingsResource.toString());
          super({
            id: "editor.action.defineKeybinding",
            title: nls.localize2("defineKeybinding.start", "Define Keybinding"),
            f1: true,
            precondition: when,
            keybinding: {
              weight: KeybindingWeight.WorkbenchContrib,
              when,
              primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK)
            },
            menu: {
              id: MenuId.EditorContent,
              when
            }
          });
        }
        async run(accessor) {
          const codeEditor = accessor.get(IEditorService).activeTextEditorControl;
          if (isCodeEditor(codeEditor)) {
            codeEditor.getContribution(DEFINE_KEYBINDING_EDITOR_CONTRIB_ID)?.showDefineKeybindingWidget();
          }
        }
      }));
    };
    registerProfileScopedActions();
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => registerProfileScopedActions()));
  }
  updatePreferencesEditorMenuItem() {
    const commandId = "_workbench.openWorkspaceSettingsEditor";
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && !CommandsRegistry.getCommand(commandId)) {
      CommandsRegistry.registerCommand(commandId, () => this.preferencesService.openWorkspaceSettings({ jsonEditor: false }));
      const when = ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.workspaceSettingsResource.toString()), WorkbenchStateContext.isEqualTo("workspace"), ContextKeyExpr.not("isInDiffEditor"));
      MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
        command: {
          id: commandId,
          title: OPEN_USER_SETTINGS_UI_TITLE,
          icon: preferencesOpenSettingsIcon
        },
        when,
        group: "navigation",
        order: 1
      });
      MenuRegistry.appendMenuItem(MenuId.ModalEditorEditorTitle, {
        command: {
          id: commandId,
          title: OPEN_USER_SETTINGS_UI_TITLE,
          icon: preferencesOpenSettingsIcon
        },
        when,
        group: "navigation",
        order: 1
      });
    }
    this.updatePreferencesEditorMenuItemForWorkspaceFolders();
  }
  updatePreferencesEditorMenuItemForWorkspaceFolders() {
    for (const folder of this.workspaceContextService.getWorkspace().folders) {
      const commandId = `_workbench.openFolderSettings.${folder.uri.toString()}`;
      if (!CommandsRegistry.getCommand(commandId)) {
        CommandsRegistry.registerCommand(commandId, (accessor, ...args) => {
          const groupId = getEditorGroupFromArguments(accessor, args)?.id;
          if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.FOLDER) {
            return this.preferencesService.openWorkspaceSettings({ jsonEditor: false, groupId });
          } else {
            return this.preferencesService.openFolderSettings({ folderUri: folder.uri, jsonEditor: false, groupId });
          }
        });
        const when = ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(this.preferencesService.getFolderSettingsResource(folder.uri).toString()), ContextKeyExpr.not("isInDiffEditor"));
        MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
          command: {
            id: commandId,
            title: OPEN_USER_SETTINGS_UI_TITLE,
            icon: preferencesOpenSettingsIcon
          },
          when,
          group: "navigation",
          order: 1
        });
        MenuRegistry.appendMenuItem(MenuId.ModalEditorEditorTitle, {
          command: {
            id: commandId,
            title: OPEN_USER_SETTINGS_UI_TITLE,
            icon: preferencesOpenSettingsIcon
          },
          when,
          group: "navigation",
          order: 1
        });
      }
    }
  }
};
PreferencesActionsContribution.ID = "workbench.contrib.preferencesActions";
PreferencesActionsContribution = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IUserDataProfileService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IUserDataProfilesService)
], PreferencesActionsContribution);
let SettingsEditorTitleContribution = class extends Disposable {
  constructor(userDataProfileService, userDataProfilesService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.registerSettingsEditorTitleActions();
  }
  registerSettingsEditorTitleActions() {
    const registerOpenUserSettingsEditorFromJsonActionDisposables = this._register(new MutableDisposable());
    const registerOpenUserSettingsEditorFromJsonAction = () => {
      const openUserSettingsEditorWhen = ContextKeyExpr.and(
        CONTEXT_SETTINGS_EDITOR.toNegated(),
        ContextKeyExpr.or(
          ResourceContextKey.Resource.isEqualTo(this.userDataProfileService.currentProfile.settingsResource.toString()),
          ResourceContextKey.Resource.isEqualTo(this.userDataProfilesService.defaultProfile.settingsResource.toString())
        ),
        ContextKeyExpr.not("isInDiffEditor")
      );
      registerOpenUserSettingsEditorFromJsonActionDisposables.clear();
      registerOpenUserSettingsEditorFromJsonActionDisposables.value = registerAction2(class extends Action2 {
        constructor() {
          super({
            id: "_workbench.openUserSettingsEditor",
            title: OPEN_USER_SETTINGS_UI_TITLE,
            icon: preferencesOpenSettingsIcon,
            menu: [{
              id: MenuId.EditorTitle,
              when: openUserSettingsEditorWhen,
              group: "navigation",
              order: 1
            }, {
              id: MenuId.ModalEditorEditorTitle,
              when: openUserSettingsEditorWhen,
              group: "navigation",
              order: 1
            }]
          });
        }
        run(accessor, ...args) {
          const sanitizedArgs = sanitizeOpenSettingsArgs(args[0]);
          const groupId = getEditorGroupFromArguments(accessor, args)?.id;
          return accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, ...sanitizedArgs, groupId });
        }
      });
    };
    registerOpenUserSettingsEditorFromJsonAction();
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => {
      registerOpenUserSettingsEditorFromJsonAction();
    }));
    const openSettingsJsonWhen = ContextKeyExpr.and(CONTEXT_SETTINGS_JSON_EDITOR.toNegated(), CONTEXT_SETTINGS_EDITOR);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: SETTINGS_EDITOR_COMMAND_SWITCH_TO_JSON,
          title: nls.localize2("openSettingsJson", "Open Settings (JSON)"),
          icon: preferencesOpenSettingsIcon,
          menu: [{
            id: MenuId.EditorTitle,
            when: openSettingsJsonWhen,
            group: "navigation",
            order: 1
          }, {
            id: MenuId.ModalEditorEditorTitle,
            when: openSettingsJsonWhen,
            group: "navigation",
            order: 1
          }]
        });
      }
      run(accessor, ...args) {
        const group = getEditorGroupFromArguments(accessor, args);
        const editorPane = group?.activeEditorPane;
        if (editorPane instanceof SettingsEditor2) {
          return editorPane.switchToSettingsFile();
        }
        return null;
      }
    }));
  }
};
SettingsEditorTitleContribution.ID = "workbench.contrib.settingsEditorTitleBarActions";
SettingsEditorTitleContribution = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService)
], SettingsEditorTitleContribution);
let SettingsEditorContribution = class extends Disposable {
  constructor(editor, instantiationService, preferencesService, workspaceContextService) {
    super();
    this.editor = editor;
    this.instantiationService = instantiationService;
    this.preferencesService = preferencesService;
    this.workspaceContextService = workspaceContextService;
    this.disposables = this._register(new DisposableStore());
    this._createPreferencesRenderer();
    this._register(this.editor.onDidChangeModel((e) => this._createPreferencesRenderer()));
    this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => this._createPreferencesRenderer()));
  }
  async _createPreferencesRenderer() {
    this.disposables.clear();
    this.currentRenderer = void 0;
    const model = this.editor.getModel();
    if (model && /\.(json|code-workspace)$/.test(model.uri.path)) {
      const settingsModel = await this.preferencesService.createPreferencesEditorModel(model.uri);
      if (settingsModel instanceof SettingsEditorModel && this.editor.getModel()) {
        this.disposables.add(settingsModel);
        switch (settingsModel.configurationTarget) {
          case ConfigurationTarget.WORKSPACE:
            this.currentRenderer = this.disposables.add(this.instantiationService.createInstance(WorkspaceSettingsRenderer, this.editor, settingsModel));
            break;
          default:
            this.currentRenderer = this.disposables.add(this.instantiationService.createInstance(UserSettingsRenderer, this.editor, settingsModel));
            break;
        }
      }
      this.currentRenderer?.render();
    }
  }
};
SettingsEditorContribution.ID = "editor.contrib.settings";
SettingsEditorContribution = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IWorkspaceContextService)
], SettingsEditorContribution);
function getEditorGroupFromArguments(accessor, args) {
  const context = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
  return context.groupedEditors[0]?.group;
}
registerWorkbenchContribution2(PreferencesActionsContribution.ID, PreferencesActionsContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(PreferencesContribution.ID, PreferencesContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(SettingsEditorTitleContribution.ID, SettingsEditorTitleContribution, WorkbenchPhase.AfterRestored);
registerEditorContribution(SettingsEditorContribution.ID, SettingsEditorContribution, EditorContributionInstantiation.AfterFirstRender);
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  title: nls.localize({ key: "miPreferences", comment: ["&& denotes a mnemonic"] }, "&&Preferences"),
  submenu: MenuId.MenubarPreferencesMenu,
  group: "5_autosave",
  order: 2,
  when: IsMacNativeContext.toNegated()
  // on macOS native the preferences menu is separate under the application menu
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxwcmVmZXJlbmNlcy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0Jvb2xlYW4sIGlzT2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dCBhcyBTdWdnZXN0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElucHV0Rm9jdXNlZENvbnRleHQsIElzTWFjTmF0aXZlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0LCBLZXliaW5kaW5nc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQ29tbWFuZHNDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHNDb250ZXh0LmpzJztcbmltcG9ydCB7IFJlbW90ZU5hbWVDb250ZXh0LCBSZXNvdXJjZUNvbnRleHRLZXksIFdvcmtiZW5jaFN0YXRlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgSUVkaXRvclNlcmlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvYnJvd3Nlci9rZXliaW5kaW5nc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IERFRklORV9LRVlCSU5ESU5HX0VESVRPUl9DT05UUklCX0lELCBJRGVmaW5lS2V5YmluZGluZ0VkaXRvckNvbnRyaWJ1dGlvbiwgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBQcmVmZXJlbmNlc0VkaXRvcklucHV0LCBTZXR0aW5nc0VkaXRvcjJJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNldHRpbmdzRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ1VSUkVOVF9QUk9GSUxFX0NPTlRFWFQsIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJGb2xkZXJDb250ZXh0LCBFeHBsb3JlclJvb3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUlfU0VUVElOR19SRVNVTFRTX0FWQUlMQUJMRSwgQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR1NfU0VBUkNIX0ZPQ1VTLCBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9IQVNfVkFMVUUsIENPTlRFWFRfS0VZQklORElOR19GT0NVUywgQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsIENPTlRFWFRfU0VUVElOR1NfRklSU1RfUk9XX0ZPQ1VTLCBDT05URVhUX1NFVFRJTkdTX0pTT05fRURJVE9SLCBDT05URVhUX1NFVFRJTkdTX1JPV19GT0NVUywgQ09OVEVYVF9TRVRUSU5HU19TRUFSQ0hfRk9DVVMsIENPTlRFWFRfVE9DX1JPV19GT0NVUywgQ09OVEVYVF9XSEVOX0ZPQ1VTLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9BQ0NFUFRfV0hFTiwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQURELCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfSElTVE9SWSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ0xFQVJfU0VBUkNIX1JFU1VMVFMsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFksIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFlfQ09NTUFORCwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWV9DT01NQU5EX1RJVExFLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9ERUZJTkUsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORV9XSEVOLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19LRVlCSU5ESU5HUywgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVDT1JEX1NFQVJDSF9LRVlTLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9SRUpFQ1RfV0hFTiwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVNT1ZFLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9SRVNFVCwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfU0VBUkNILCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9TSE9XX1NJTUlMQVIsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NPUlRCWV9QUkVDRURFTkNFLCBLRVlCSU5ESU5HU19FRElUT1JfU0hPV19ERUZBVUxUX0tFWUJJTkRJTkdTLCBLRVlCSU5ESU5HU19FRElUT1JfU0hPV19FWFRFTlNJT05fS0VZQklORElOR1MsIEtFWUJJTkRJTkdTX0VESVRPUl9TSE9XX1VTRVJfS0VZQklORElOR1MsIFJFUVVJUkVfVFJVU1RFRF9XT1JLU1BBQ0VfU0VUVElOR19UQUcsIFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0NMRUFSX1NFQVJDSF9SRVNVTFRTLCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TSE9XX0NPTlRFWFRfTUVOVSwgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfVE9HR0xFX0FJX1NFQVJDSCB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBQcmVmZXJlbmNlc0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlc0NvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc0VkaXRvciB9IGZyb20gJy4va2V5YmluZGluZ3NFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlTGFuZ3VhZ2VCYXNlZFNldHRpbmdzQWN0aW9uIH0gZnJvbSAnLi9wcmVmZXJlbmNlc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJlZmVyZW5jZXNFZGl0b3IgfSBmcm9tICcuL3ByZWZlcmVuY2VzRWRpdG9yLmpzJztcbmltcG9ydCB7IHByZWZlcmVuY2VzT3BlblNldHRpbmdzSWNvbiB9IGZyb20gJy4vcHJlZmVyZW5jZXNJY29ucy5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNSZW5kZXJlciwgVXNlclNldHRpbmdzUmVuZGVyZXIsIFdvcmtzcGFjZVNldHRpbmdzUmVuZGVyZXIgfSBmcm9tICcuL3ByZWZlcmVuY2VzUmVuZGVyZXJzLmpzJztcbmltcG9ydCB7IFNldHRpbmdzRWRpdG9yMiwgU2V0dGluZ3NGb2N1c0NvbnRleHQgfSBmcm9tICcuL3NldHRpbmdzRWRpdG9yMi5qcyc7XG5cbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NFQVJDSCA9ICdzZXR0aW5ncy5hY3Rpb24uc2VhcmNoJztcblxuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfRklMRSA9ICdzZXR0aW5ncy5hY3Rpb24uZm9jdXNTZXR0aW5nc0ZpbGUnO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfU0VUVElOR1NfRlJPTV9TRUFSQ0ggPSAnc2V0dGluZ3MuYWN0aW9uLmZvY3VzU2V0dGluZ3NGcm9tU2VhcmNoJztcbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NIT1dfUFJFVklPVVNfU0VBUkNIID0gJ3NldHRpbmdzLmFjdGlvbi5zaG93UHJldmlvdXNTZWFyY2gnO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfU0VUVElOR1NfRlJPTV9TRUFSQ0hfT05fRU5URVIgPSAnc2V0dGluZ3MuYWN0aW9uLmZvY3VzU2V0dGluZ3NGcm9tU2VhcmNoT25FbnRlcic7XG5jb25zdCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19TRUFSQ0hfRlJPTV9TRVRUSU5HUyA9ICdzZXR0aW5ncy5hY3Rpb24uZm9jdXNTZWFyY2hGcm9tU2V0dGluZ3MnO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfU0VUVElOR1NfTElTVCA9ICdzZXR0aW5ncy5hY3Rpb24uZm9jdXNTZXR0aW5nc0xpc3QnO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfVE9DID0gJ3NldHRpbmdzLmFjdGlvbi5mb2N1c1RPQyc7XG5jb25zdCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19DT05UUk9MID0gJ3NldHRpbmdzLmFjdGlvbi5mb2N1c1NldHRpbmdDb250cm9sJztcbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1VQID0gJ3NldHRpbmdzLmFjdGlvbi5mb2N1c0xldmVsVXAnO1xuXG5jb25zdCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TV0lUQ0hfVE9fSlNPTiA9ICdzZXR0aW5ncy5zd2l0Y2hUb0pTT04nO1xuY29uc3QgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRklMVEVSX09OTElORSA9ICdzZXR0aW5ncy5maWx0ZXJCeU9ubGluZSc7XG5jb25zdCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GSUxURVJfVU5UUlVTVEVEID0gJ3NldHRpbmdzLmZpbHRlclVudHJ1c3RlZCc7XG5cbmNvbnN0IFNFVFRJTkdTX0NPTU1BTkRfT1BFTl9TRVRUSU5HUyA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyc7XG5jb25zdCBTRVRUSU5HU19DT01NQU5EX0ZJTFRFUl9URUxFTUVUUlkgPSAnc2V0dGluZ3MuZmlsdGVyQnlUZWxlbWV0cnknO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdFNldHRpbmdzRWRpdG9yMixcblx0XHRTZXR0aW5nc0VkaXRvcjIuSUQsXG5cdFx0bmxzLmxvY2FsaXplKCdzZXR0aW5nc0VkaXRvcjInLCBcIlNldHRpbmdzIEVkaXRvciAyXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoU2V0dGluZ3NFZGl0b3IySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0UHJlZmVyZW5jZXNFZGl0b3IsXG5cdFx0UHJlZmVyZW5jZXNFZGl0b3IuSUQsXG5cdFx0bmxzLmxvY2FsaXplKCdwcmVmZXJlbmNlc0VkaXRvcicsIFwiUHJlZmVyZW5jZXMgRWRpdG9yXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoUHJlZmVyZW5jZXNFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuY2xhc3MgUHJlZmVyZW5jZXNFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cblx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJlZmVyZW5jZXNFZGl0b3JJbnB1dCk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRLZXliaW5kaW5nc0VkaXRvcixcblx0XHRLZXliaW5kaW5nc0VkaXRvci5JRCxcblx0XHRubHMubG9jYWxpemUoJ2tleWJpbmRpbmdzRWRpdG9yJywgXCJLZXliaW5kaW5ncyBFZGl0b3JcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihLZXliaW5kaW5nc0VkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5jbGFzcyBLZXliaW5kaW5nc0VkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblxuXHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShLZXliaW5kaW5nc0VkaXRvcklucHV0KTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nc0VkaXRvcjJJbnB1dFNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cblx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VyaWFsaXplKGlucHV0OiBTZXR0aW5nc0VkaXRvcjJJbnB1dCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFNldHRpbmdzRWRpdG9yMklucHV0IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3NFZGl0b3IySW5wdXQpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFByZWZlcmVuY2VzRWRpdG9ySW5wdXQuSUQsIFByZWZlcmVuY2VzRWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKEtleWJpbmRpbmdzRWRpdG9ySW5wdXQuSUQsIEtleWJpbmRpbmdzRWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFNldHRpbmdzRWRpdG9yMklucHV0LklELCBTZXR0aW5nc0VkaXRvcjJJbnB1dFNlcmlhbGl6ZXIpO1xuXG5jb25zdCBPUEVOX1VTRVJfU0VUVElOR1NfVUlfVElUTEUgPSBubHMubG9jYWxpemUyKCdvcGVuU2V0dGluZ3MyJywgXCJPcGVuIFNldHRpbmdzIChVSSlcIik7XG5jb25zdCBPUEVOX1VTRVJfU0VUVElOR1NfSlNPTl9USVRMRSA9IG5scy5sb2NhbGl6ZTIoJ29wZW5Vc2VyU2V0dGluZ3NKc29uJywgXCJPcGVuIFVzZXIgU2V0dGluZ3MgKEpTT04pXCIpO1xuY29uc3QgT1BFTl9BUFBMSUNBVElPTl9TRVRUSU5HU19KU09OX1RJVExFID0gbmxzLmxvY2FsaXplMignb3BlbkFwcGxpY2F0aW9uU2V0dGluZ3NKc29uJywgXCJPcGVuIEFwcGxpY2F0aW9uIFNldHRpbmdzIChKU09OKVwiKTtcbmNvbnN0IGNhdGVnb3J5ID0gQ2F0ZWdvcmllcy5QcmVmZXJlbmNlcztcblxuaW50ZXJmYWNlIElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zIHtcblx0b3BlblRvU2lkZT86IGJvb2xlYW47XG5cdHF1ZXJ5Pzogc3RyaW5nO1xuXHRyZXZlYWxTZXR0aW5nPzoge1xuXHRcdGtleTogc3RyaW5nO1xuXHRcdGVkaXQ/OiBib29sZWFuO1xuXHR9O1xuXHRmb2N1c1NlYXJjaD86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplQm9vbGVhbihhcmc6IHVua25vd24pOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGlzQm9vbGVhbihhcmcpID8gYXJnIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzYW5pdGl6ZVN0cmluZyhhcmc6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gaXNTdHJpbmcoYXJnKSA/IGFyZyA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3M6IGFueSk6IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zIHtcblx0aWYgKCFpc09iamVjdChhcmdzKSkge1xuXHRcdGFyZ3MgPSB7fTtcblx0fVxuXG5cdGxldCBzYW5pdGl6ZWRPYmplY3Q6IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zID0ge1xuXHRcdGZvY3VzU2VhcmNoOiBzYW5pdGl6ZUJvb2xlYW4oYXJncz8uZm9jdXNTZWFyY2gpLFxuXHRcdG9wZW5Ub1NpZGU6IHNhbml0aXplQm9vbGVhbihhcmdzPy5vcGVuVG9TaWRlKSxcblx0XHRxdWVyeTogc2FuaXRpemVTdHJpbmcoYXJncz8ucXVlcnkpXG5cdH07XG5cblx0aWYgKGlzU3RyaW5nKGFyZ3M/LnJldmVhbFNldHRpbmc/LmtleSkpIHtcblx0XHRzYW5pdGl6ZWRPYmplY3QgPSB7XG5cdFx0XHQuLi5zYW5pdGl6ZWRPYmplY3QsXG5cdFx0XHRyZXZlYWxTZXR0aW5nOiB7XG5cdFx0XHRcdGtleTogYXJncy5yZXZlYWxTZXR0aW5nLmtleSxcblx0XHRcdFx0ZWRpdDogc2FuaXRpemVCb29sZWFuKGFyZ3MucmV2ZWFsU2V0dGluZz8uZWRpdClcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHNhbml0aXplZE9iamVjdDtcbn1cblxuY2xhc3MgUHJlZmVyZW5jZXNBY3Rpb25zQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5wcmVmZXJlbmNlc0FjdGlvbnMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3RlclNldHRpbmdzQWN0aW9ucygpO1xuXHRcdHRoaXMucmVnaXN0ZXJLZXliaW5kaW5nc0FjdGlvbnMoKTtcblxuXHRcdHRoaXMudXBkYXRlUHJlZmVyZW5jZXNFZGl0b3JNZW51SXRlbSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy51cGRhdGVQcmVmZXJlbmNlc0VkaXRvck1lbnVJdGVtKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy51cGRhdGVQcmVmZXJlbmNlc0VkaXRvck1lbnVJdGVtRm9yV29ya3NwYWNlRm9sZGVycygpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2V0dGluZ3NBY3Rpb25zKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfQ09NTUFORF9PUEVOX1NFVFRJTkdTLFxuXHRcdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdzZXR0aW5ncycsIFwiU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0XHRtbmVtb25pY1RpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaU9wZW5TZXR0aW5ncycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0XHR3aGVuOiBudWxsLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkNvbW1hLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuR2xvYmFsQWN0aXZpdHksXG5cdFx0XHRcdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclByZWZlcmVuY2VzTWVudSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBzdHJpbmcgfCBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucykge1xuXHRcdFx0XHQvLyBhcmdzIHRha2VzIGEgc3RyaW5nIGZvciBiYWNrY29tcGF0XG5cdFx0XHRcdGNvbnN0IG9wdHMgPSB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyB7IHF1ZXJ5OiBhcmdzIH0gOiBzYW5pdGl6ZU9wZW5TZXR0aW5nc0FyZ3MoYXJncyk7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsgLi4ub3B0cyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MyJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlblNldHRpbmdzMicsIFwiT3BlbiBTZXR0aW5ncyAoVUkpXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgLi4uYXJncyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5nc0pzb24nLFxuXHRcdFx0XHRcdHRpdGxlOiBPUEVOX1VTRVJfU0VUVElOR1NfSlNPTl9USVRMRSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzSnNvbi5kZXNjcmlwdGlvbicsIFwiT3BlbnMgdGhlIEpTT04gZmlsZSBjb250YWluaW5nIHRoZSBjdXJyZW50IHVzZXIgcHJvZmlsZSBzZXR0aW5nc1wiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucykge1xuXHRcdFx0XHRhcmdzID0gc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3MpO1xuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IHRydWUsIC4uLmFyZ3MgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuQXBwbGljYXRpb25TZXR0aW5nc0pzb24nLFxuXHRcdFx0XHRcdHRpdGxlOiBPUEVOX0FQUExJQ0FUSU9OX1NFVFRJTkdTX0pTT05fVElUTEUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhDVVJSRU5UX1BST0ZJTEVfQ09OVEVYVC5rZXksIHRoYXQudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuaWQpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuQXBwbGljYXRpb25TZXR0aW5ncyh7IGpzb25FZGl0b3I6IHRydWUsIC4uLmFyZ3MgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT3BlbnMgdGhlIFVzZXIgdGFiIG9mIHRoZSBTZXR0aW5ncyBlZGl0b3Jcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxTZXR0aW5ncycsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5HbG9iYWxTZXR0aW5ncycsIFwiT3BlbiBVc2VyIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuVXNlclNldHRpbmdzKGFyZ3MpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5SYXdEZWZhdWx0U2V0dGluZ3MnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuUmF3RGVmYXVsdFNldHRpbmdzJywgXCJPcGVuIERlZmF1bHQgU2V0dGluZ3MgKEpTT04pXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5SYXdEZWZhdWx0U2V0dGluZ3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IENvbmZpZ3VyZUxhbmd1YWdlQmFzZWRTZXR0aW5nc0FjdGlvbi5JRCxcblx0XHRcdFx0XHR0aXRsZTogQ29uZmlndXJlTGFuZ3VhZ2VCYXNlZFNldHRpbmdzQWN0aW9uLkxBQkVMLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoQ29uZmlndXJlTGFuZ3VhZ2VCYXNlZFNldHRpbmdzQWN0aW9uLCBDb25maWd1cmVMYW5ndWFnZUJhc2VkU2V0dGluZ3NBY3Rpb24uSUQsIENvbmZpZ3VyZUxhbmd1YWdlQmFzZWRTZXR0aW5nc0FjdGlvbi5MQUJFTC52YWx1ZSkucnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZVNldHRpbmdzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbldvcmtzcGFjZVNldHRpbmdzJywgXCJPcGVuIFdvcmtzcGFjZSBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogV29ya2JlbmNoU3RhdGVDb250ZXh0Lm5vdEVxdWFsc1RvKCdlbXB0eScpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHN0cmluZyB8IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRcdC8vIE1hdGNoIHRoZSBiZWhhdmlvdXIgb2Ygd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3Ncblx0XHRcdFx0YXJncyA9IHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJyA/IHsgcXVlcnk6IGFyZ3MgfSA6IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuV29ya3NwYWNlU2V0dGluZ3MoYXJncyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuQWNjZXNzaWJpbGl0eVNldHRpbmdzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbkFjY2Vzc2liaWxpdHlTZXR0aW5ncycsIFwiT3BlbiBBY2Nlc3NpYmlsaXR5IFNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5Jylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGF3YWl0IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgcXVlcnk6ICdAdGFnOmFjY2Vzc2liaWxpdHknIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Xb3Jrc3BhY2VTZXR0aW5nc0ZpbGUnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuV29ya3NwYWNlU2V0dGluZ3NGaWxlJywgXCJPcGVuIFdvcmtzcGFjZSBTZXR0aW5ncyAoSlNPTilcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnZW1wdHknKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucykge1xuXHRcdFx0XHRhcmdzID0gc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3MpO1xuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyh7IGpzb25FZGl0b3I6IHRydWUsIC4uLmFyZ3MgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkZvbGRlclNldHRpbmdzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbkZvbGRlclNldHRpbmdzJywgXCJPcGVuIEZvbGRlciBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogSU9wZW5TZXR0aW5nc0FjdGlvbk9wdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxJV29ya3NwYWNlRm9sZGVyPihQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCk7XG5cdFx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRhcmdzID0gc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3MpO1xuXHRcdFx0XHRcdGF3YWl0IHByZWZlcmVuY2VzU2VydmljZS5vcGVuRm9sZGVyU2V0dGluZ3MoeyBmb2xkZXJVcmk6IHdvcmtzcGFjZUZvbGRlci51cmksIC4uLmFyZ3MgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuRm9sZGVyU2V0dGluZ3NGaWxlJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbkZvbGRlclNldHRpbmdzRmlsZScsIFwiT3BlbiBGb2xkZXIgU2V0dGluZ3MgKEpTT04pXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucykge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElXb3Jrc3BhY2VGb2xkZXI+KFBJQ0tfV09SS1NQQUNFX0ZPTERFUl9DT01NQU5EX0lEKTtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdGFyZ3MgPSBzYW5pdGl6ZU9wZW5TZXR0aW5nc0FyZ3MoYXJncyk7XG5cdFx0XHRcdFx0YXdhaXQgcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Gb2xkZXJTZXR0aW5ncyh7IGZvbGRlclVyaTogd29ya3NwYWNlRm9sZGVyLnVyaSwganNvbkVkaXRvcjogdHJ1ZSwgLi4uYXJncyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICdfd29ya2JlbmNoLmFjdGlvbi5vcGVuRm9sZGVyU2V0dGluZ3MnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ29wZW5Gb2xkZXJTZXR0aW5ncycsIFwiT3BlbiBGb2xkZXIgU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHQsXG5cdFx0XHRcdFx0XHRncm91cDogJzJfd29ya3NwYWNlJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlclJvb3RDb250ZXh0LCBFeHBsb3JlckZvbGRlckNvbnRleHQpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U/OiBVUkkpIHtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlbkZvbGRlclNldHRpbmdzKHsgZm9sZGVyVXJpOiByZXNvdXJjZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxJV29ya3NwYWNlRm9sZGVyPihQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCk7XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdFx0YXdhaXQgcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Gb2xkZXJTZXR0aW5ncyh7IGZvbGRlclVyaTogd29ya3NwYWNlRm9sZGVyLnVyaSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GSUxURVJfT05MSU5FLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaU9wZW5PbmxpbmVTZXR0aW5ncycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk9ubGluZSBTZXJ2aWNlcyBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsXG5cdFx0XHRcdFx0XHRncm91cDogJzNfc2V0dGluZ3MnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNldHRpbmdzRWRpdG9yMikge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUuZm9jdXNTZWFyY2goYEB0YWc6dXNlc09ubGluZVNlcnZpY2VzYCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogJ0B0YWc6dXNlc09ubGluZVNlcnZpY2VzJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1RPR0dMRV9BSV9TRUFSQ0gsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX1NFVFRJTkdTX0VESVRPUixcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogQ09OVEVYVF9BSV9TRVRUSU5HX1JFU1VMVFNfQVZBSUxBQkxFXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2V0dGluZ3MudG9nZ2xlQWlTZWFyY2gnLCBcIlRvZ2dsZSBBSSBTZXR0aW5ncyBTZWFyY2hcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnRvZ2dsZUFpU2VhcmNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GSUxURVJfVU5UUlVTVEVELFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdmaWx0ZXJVbnRydXN0ZWQnLCBcIlNob3cgdW50cnVzdGVkIHdvcmtzcGFjZSBzZXR0aW5nc1wiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogYEB0YWc6JHtSRVFVSVJFX1RSVVNURURfV09SS1NQQUNFX1NFVFRJTkdfVEFHfWAgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19DT01NQU5EX0ZJTFRFUl9URUxFTUVUUlksXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pT3BlblRlbGVtZXRyeVNldHRpbmdzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVGVsZW1ldHJ5IFNldHRpbmdzXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3IyKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5mb2N1c1NlYXJjaChgQHRhZzp0ZWxlbWV0cnlgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiAnQHRhZzp0ZWxlbWV0cnknIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZWdpc3RlclNldHRpbmdzRWRpdG9yQWN0aW9ucygpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRcdFx0Y29uc3QgaG9zdExhYmVsID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKFNjaGVtYXMudnNjb2RlUmVtb3RlLCByZW1vdGVBdXRob3JpdHkpIHx8IHJlbW90ZUF1dGhvcml0eTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuUmVtb3RlU2V0dGluZ3MnLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlblJlbW90ZVNldHRpbmdzJywgXCJPcGVuIFJlbW90ZSBTZXR0aW5ncyAoezB9KVwiLCBob3N0TGFiZWwpLFxuXHRcdFx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHRcdFx0d2hlbjogUmVtb3RlTmFtZUNvbnRleHQubm90RXF1YWxzVG8oJycpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiBJT3BlblNldHRpbmdzQWN0aW9uT3B0aW9ucykge1xuXHRcdFx0XHRcdFx0YXJncyA9IHNhbml0aXplT3BlblNldHRpbmdzQXJncyhhcmdzKTtcblx0XHRcdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblJlbW90ZVNldHRpbmdzKGFyZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5SZW1vdGVTZXR0aW5nc0ZpbGUnLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlblJlbW90ZVNldHRpbmdzSlNPTicsIFwiT3BlbiBSZW1vdGUgU2V0dGluZ3MgKEpTT04pICh7MH0pXCIsIGhvc3RMYWJlbCksXG5cdFx0XHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdFx0XHR3aGVuOiBSZW1vdGVOYW1lQ29udGV4dC5ub3RFcXVhbHNUbygnJylcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IElPcGVuU2V0dGluZ3NBY3Rpb25PcHRpb25zKSB7XG5cdFx0XHRcdFx0XHRhcmdzID0gc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3MpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuUmVtb3RlU2V0dGluZ3MoeyBqc29uRWRpdG9yOiB0cnVlLCAuLi5hcmdzIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2V0dGluZ3NFZGl0b3JBY3Rpb25zKCkge1xuXHRcdGZ1bmN0aW9uIGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogU2V0dGluZ3NFZGl0b3IyIHwgbnVsbCB7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzZXR0aW5nc0VkaXRvckZvY3VzU2VhcmNoKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdHByZWZlcmVuY2VzRWRpdG9yPy5mb2N1c1NlYXJjaCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU0VBUkNILFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUYsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IG51bGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdzZXR0aW5ncy5mb2N1c1NlYXJjaCcsIFwiRm9jdXMgU2V0dGluZ3MgU2VhcmNoXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHsgc2V0dGluZ3NFZGl0b3JGb2N1c1NlYXJjaChhY2Nlc3Nvcik7IH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0NMRUFSX1NFQVJDSF9SRVNVTFRTLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2V0dGluZ3MuY2xlYXJSZXN1bHRzJywgXCJDbGVhciBTZXR0aW5ncyBTZWFyY2ggUmVzdWx0c1wiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9yID0gZ2V0UHJlZmVyZW5jZXNFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvcj8uY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19GSUxFLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzZXR0aW5ncy5mb2N1c0ZpbGUnLCBcIkZvY3VzIHNldHRpbmdzIGZpbGVcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3I/Lm5hdmlnYXRlU2VhcmNoSGlzdG9yeU5leHRPckZvY3VzU2V0dGluZ3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1NFVFRJTkdTX0ZST01fU0VBUkNILFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSlcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldHRpbmdzLmZvY3VzRmlsZScsIFwiRm9jdXMgc2V0dGluZ3MgZmlsZVwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9yID0gZ2V0UHJlZmVyZW5jZXNFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvcj8ubmF2aWdhdGVTZWFyY2hIaXN0b3J5TmV4dE9yRm9jdXNTZXR0aW5ncygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU0hPV19QUkVWSU9VU19TRUFSQ0gsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19TRUFSQ0hfRk9DVVMsIFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSlcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldHRpbmdzLnNob3dQcmV2aW91c1NlYXJjaCcsIFwiU2hvdyBQcmV2aW91cyBTZWFyY2ggaW4gU2V0dGluZ3NcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3I/Lm5hdmlnYXRlU2VhcmNoSGlzdG9yeVByZXZpb3VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19TRVRUSU5HU19GUk9NX1NFQVJDSF9PTl9FTlRFUixcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2V0dGluZ3MuZm9jdXNTZXR0aW5nc0Zyb21TZWFyY2hPbkVudGVyJywgXCJGb2N1cyBGaXJzdCBTZXR0aW5nIGZyb20gU2VhcmNoXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3QgcHJlZmVyZW5jZXNFZGl0b3IgPSBnZXRQcmVmZXJlbmNlc0VkaXRvcihhY2Nlc3Nvcik7XG5cdFx0XHRcdHByZWZlcmVuY2VzRWRpdG9yPy5mb2N1c0ZpcnN0U2V0dGluZ0Zyb21TZWFyY2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1NFQVJDSF9GUk9NX1NFVFRJTkdTLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU0VUVElOR1NfRURJVE9SLCBDT05URVhUX1NFVFRJTkdTX1JPV19GT0NVUywgQ09OVEVYVF9TRVRUSU5HU19GSVJTVF9ST1dfRk9DVVMpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHRcdC8vIFdpbiBvdmVyIHRoZSBsaXN0J3Mgb3duIGBsaXN0LmZvY3VzVXBgIGNvbW1hbmQgc28gdGhlIGZpcnN0IHJvdyBtb3ZlcyBmb2N1cyBiYWNrIHRvIHNlYXJjaC5cblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHRcdHdoZW46IG51bGxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldHRpbmdzLmZvY3VzU2VhcmNoRnJvbVNldHRpbmdzJywgXCJGb2N1cyBTZXR0aW5ncyBTZWFyY2ggZnJvbSBTZXR0aW5nc1wiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9yID0gZ2V0UHJlZmVyZW5jZXNFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvcj8uZm9jdXNTZWFyY2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0ZPQ1VTX1NFVFRJTkdTX0xJU1QsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsIENPTlRFWFRfVE9DX1JPV19GT0NVUyksXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogbnVsbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2V0dGluZ3MuZm9jdXNTZXR0aW5nc0xpc3QnLCBcIkZvY3VzIHNldHRpbmdzIGxpc3RcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0aWYgKHByZWZlcmVuY2VzRWRpdG9yIGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3IyKSB7XG5cdFx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3IuZm9jdXNTZXR0aW5ncygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19UT0MsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX1NFVFRJTkdTX0VESVRPUixcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdFx0d2hlbjogQ09OVEVYVF9TRVRUSU5HU19ST1dfRk9DVVNcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdzZXR0aW5ncy5mb2N1c1NldHRpbmdzVE9DJywgXCJGb2N1cyBTZXR0aW5ncyBUYWJsZSBvZiBDb250ZW50c1wiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9yID0gZ2V0UHJlZmVyZW5jZXNFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdFx0XHRpZiAoIShwcmVmZXJlbmNlc0VkaXRvciBpbnN0YW5jZW9mIFNldHRpbmdzRWRpdG9yMikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvci5mb2N1c1RPQygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfQ09OVFJPTCxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NFVFRJTkdTX0VESVRPUiwgQ09OVEVYVF9TRVRUSU5HU19ST1dfRk9DVVMpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldHRpbmdzLmZvY3VzU2V0dGluZ0NvbnRyb2wnLCBcIkZvY3VzIFNldHRpbmcgQ29udHJvbFwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9yID0gZ2V0UHJlZmVyZW5jZXNFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdFx0XHRpZiAoIShwcmVmZXJlbmNlc0VkaXRvciBpbnN0YW5jZW9mIFNldHRpbmdzRWRpdG9yMikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gcHJlZmVyZW5jZXNFZGl0b3IuZ2V0Q29udGFpbmVyKCk/Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHRcdFx0aWYgKGFjdGl2ZUVsZW1lbnQ/LmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWxpc3QnKSkge1xuXHRcdFx0XHRcdHByZWZlcmVuY2VzRWRpdG9yLmZvY3VzU2V0dGluZ3ModHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NIT1dfQ09OVEVYVF9NRU5VLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GOSxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogbnVsbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3NldHRpbmdzLnNob3dDb250ZXh0TWVudScsIFwiU2hvdyBTZXR0aW5nIENvbnRleHQgTWVudVwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9yID0gZ2V0UHJlZmVyZW5jZXNFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdFx0XHRpZiAocHJlZmVyZW5jZXNFZGl0b3IgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpIHtcblx0XHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvci5zaG93Q29udGV4dE1lbnUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfRk9DVVNfVVAsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19FRElUT1IsIENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTLnRvTmVnYXRlZCgpLCBDT05URVhUX1NFVFRJTkdTX0pTT05fRURJVE9SLnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogbnVsbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3NldHRpbmdzLmZvY3VzTGV2ZWxVcCcsIFwiTW92ZSBGb2N1cyBVcCBPbmUgTGV2ZWxcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvciA9IGdldFByZWZlcmVuY2VzRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRcdFx0aWYgKCEocHJlZmVyZW5jZXNFZGl0b3IgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHByZWZlcmVuY2VzRWRpdG9yLmN1cnJlbnRGb2N1c0NvbnRleHQgPT09IFNldHRpbmdzRm9jdXNDb250ZXh0LlNldHRpbmdDb250cm9sKSB7XG5cdFx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3IuZm9jdXNTZXR0aW5ncygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByZWZlcmVuY2VzRWRpdG9yLmN1cnJlbnRGb2N1c0NvbnRleHQgPT09IFNldHRpbmdzRm9jdXNDb250ZXh0LlNldHRpbmdUcmVlKSB7XG5cdFx0XHRcdFx0cHJlZmVyZW5jZXNFZGl0b3IuZm9jdXNUT0MoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwcmVmZXJlbmNlc0VkaXRvci5jdXJyZW50Rm9jdXNDb250ZXh0ID09PSBTZXR0aW5nc0ZvY3VzQ29udGV4dC5UYWJsZU9mQ29udGVudHMpIHtcblx0XHRcdFx0XHRwcmVmZXJlbmNlc0VkaXRvci5mb2N1c1NlYXJjaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlcktleWJpbmRpbmdzQWN0aW9ucygpIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBjYXRlZ29yeSA9IG5scy5sb2NhbGl6ZTIoJ3ByZWZlcmVuY2VzJywgXCJQcmVmZXJlbmNlc1wiKTtcblx0XHRjb25zdCBpZCA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxLZXliaW5kaW5ncyc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuR2xvYmFsS2V5YmluZGluZ3MnLCBcIk9wZW4gS2V5Ym9hcmQgU2hvcnRjdXRzXCIpLFxuXHRcdFx0XHRcdHNob3J0VGl0bGU6IG5scy5sb2NhbGl6ZSgna2V5Ym9hcmRTaG9ydGN1dHMnLCBcIktleWJvYXJkIFNob3J0Y3V0c1wiKSxcblx0XHRcdFx0XHRjYXRlZ29yeSxcblx0XHRcdFx0XHRpY29uOiBwcmVmZXJlbmNlc09wZW5TZXR0aW5nc0ljb24sXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0d2hlbjogbnVsbCxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlTKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdFx0eyBpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlIH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0XHRcdHdoZW46IFJlc291cmNlQ29udGV4dEtleS5SZXNvdXJjZS5pc0VxdWFsVG8odGhhdC51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvckVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBSZXNvdXJjZUNvbnRleHRLZXkuUmVzb3VyY2UuaXNFcXVhbFRvKHRoYXQudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuR2xvYmFsQWN0aXZpdHksXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0Y29uc3QgcXVlcnkgPSB0eXBlb2YgYXJnc1swXSA9PT0gJ3N0cmluZycgPyBhcmdzWzBdIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBncm91cElkID0gZ2V0RWRpdG9yR3JvdXBGcm9tQXJndW1lbnRzKGFjY2Vzc29yLCBhcmdzKT8uaWQ7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3Blbkdsb2JhbEtleWJpbmRpbmdTZXR0aW5ncyhmYWxzZSwgeyBxdWVyeSwgZ3JvdXBJZCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdrZXlib2FyZFNob3J0Y3V0cycsIFwiS2V5Ym9hcmQgU2hvcnRjdXRzXCIpLFxuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0XHRcdG9yZGVyOiA0XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkRlZmF1bHRLZXliaW5kaW5nc0ZpbGUnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuRGVmYXVsdEtleWJpbmRpbmdzRmlsZScsIFwiT3BlbiBEZWZhdWx0IEtleWJvYXJkIFNob3J0Y3V0cyAoSlNPTilcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0bWVudTogeyBpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKS5vcGVuRGVmYXVsdEtleWJpbmRpbmdzRmlsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxLZXliaW5kaW5nc0ZpbGUnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuR2xvYmFsS2V5YmluZGluZ3NGaWxlJywgXCJPcGVuIEtleWJvYXJkIFNob3J0Y3V0cyAoSlNPTilcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdFx0aWNvbjogcHJlZmVyZW5jZXNPcGVuU2V0dGluZ3NJY29uLFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSB9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IpLFxuXHRcdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvckVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IpLFxuXHRcdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0XHRjb25zdCBncm91cElkID0gZ2V0RWRpdG9yR3JvdXBGcm9tQXJndW1lbnRzKGFjY2Vzc29yLCBhcmdzKT8uaWQ7XG5cdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3Blbkdsb2JhbEtleWJpbmRpbmdTZXR0aW5ncyh0cnVlLCB7IGdyb3VwSWQgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX1NIT1dfREVGQVVMVF9LRVlCSU5ESU5HUyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2hvd0RlZmF1bHRLZXliaW5kaW5ncycsIFwiU2hvdyBTeXN0ZW0gS2V5YmluZGluZ3NcIiksXG5cdFx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IpLFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzFfa2V5Ym9hcmRfcHJlZmVyZW5jZXNfYWN0aW9ucydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBnZXRFZGl0b3JHcm91cEZyb21Bcmd1bWVudHMoYWNjZXNzb3IsIGFyZ3MpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gZ3JvdXA/LmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnNlYXJjaCgnQHNvdXJjZTpzeXN0ZW0nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9TSE9XX0VYVEVOU0lPTl9LRVlCSU5ESU5HUyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2hvd0V4dGVuc2lvbktleWJpbmRpbmdzJywgXCJTaG93IEV4dGVuc2lvbiBLZXliaW5kaW5nc1wiKSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiksXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMV9rZXlib2FyZF9wcmVmZXJlbmNlc19hY3Rpb25zJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGdldEVkaXRvckdyb3VwRnJvbUFyZ3VtZW50cyhhY2Nlc3NvciwgYXJncyk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBncm91cD8uYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUuc2VhcmNoKCdAc291cmNlOmV4dGVuc2lvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX1NIT1dfVVNFUl9LRVlCSU5ESU5HUyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2hvd1VzZXJLZXliaW5kaW5ncycsIFwiU2hvdyBVc2VyIEtleWJpbmRpbmdzXCIpLFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SKSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2tleWJvYXJkX3ByZWZlcmVuY2VzX2FjdGlvbnMnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gZ2V0RWRpdG9yR3JvdXBGcm9tQXJndW1lbnRzKGFjY2Vzc29yLCBhcmdzKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGdyb3VwPy5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUGFuZS5zZWFyY2goJ0Bzb3VyY2U6dXNlcicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ0xFQVJfU0VBUkNIX1JFU1VMVFMsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2xlYXInLCBcIkNsZWFyIFNlYXJjaCBSZXN1bHRzXCIpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9GT0NVUywgQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfSEFTX1ZBTFVFKSxcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUuY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NMRUFSX1NFQVJDSF9ISVNUT1JZLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NsZWFySGlzdG9yeScsIFwiQ2xlYXIgS2V5Ym9hcmQgU2hvcnRjdXRzIFNlYXJjaCBIaXN0b3J5XCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmNsZWFyS2V5Ym9hcmRTaG9ydGN1dFNlYXJjaEhpc3RvcnkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJLZXliaW5kaW5nRWRpdG9yQWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlcktleWJpbmRpbmdFZGl0b3JBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR19GT0NVUywgQ09OVEVYVF9XSEVOX0ZPQ1VTLnRvTmVnYXRlZCgpKSxcblx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUuZGVmaW5lS2V5YmluZGluZyhlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQURELFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR19GT0NVUyksXG5cdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEpLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmRlZmluZUtleWJpbmRpbmcoZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FX1dIRU4sXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HX0ZPQ1VTKSxcblx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RSksXG5cdFx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvciAmJiBlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZykge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUuZGVmaW5lV2hlbkV4cHJlc3Npb24oZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVNT1ZFLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR19GT0NVUywgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0XHRcdG1hYzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlXG5cdFx0XHR9LFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnJlbW92ZUtleWJpbmRpbmcoZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVTRVQsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HX0ZPQ1VTKSxcblx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvclBhbmUucmVzZXRLZXliaW5kaW5nKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NFQVJDSCxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SKSxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlGLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmZvY3VzU2VhcmNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFQ09SRF9TRUFSQ0hfS0VZUyxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9GT0NVUyksXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlLLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5SyB9LFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnJlY29yZFNlYXJjaEtleXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfU09SVEJZX1BSRUNFREVOQ0UsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiksXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlQLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5UCB9LFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnRvZ2dsZVNvcnRCeVByZWNlZGVuY2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfU0hPV19TSU1JTEFSLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR19GT0NVUyksXG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnNob3dTaW1pbGFyS2V5YmluZGluZ3MoZWRpdG9yUGFuZS5hY3RpdmVLZXliaW5kaW5nRW50cnkhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMsIENPTlRFWFRfV0hFTl9GT0NVUy5uZWdhdGUoKSksXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qyxcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0YXdhaXQgZWRpdG9yUGFuZS5jb3B5S2V5YmluZGluZyhlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DT1BZX0NPTU1BTkQsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9LRVlCSU5ESU5HX0ZPQ1VTKSxcblx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGFyZ3M6IHVua25vd24pID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcikge1xuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclBhbmUuY29weUtleWJpbmRpbmdDb21tYW5kKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFlfQ09NTUFORF9USVRMRSxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMpLFxuXHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9yKSB7XG5cdFx0XHRcdFx0YXdhaXQgZWRpdG9yUGFuZS5jb3B5S2V5YmluZGluZ0NvbW1hbmRUaXRsZShlZGl0b3JQYW5lLmFjdGl2ZUtleWJpbmRpbmdFbnRyeSEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9GT0NVU19LRVlCSU5ESU5HUyxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9GT0NVUyksXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmZvY3VzS2V5YmluZGluZ3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVKRUNUX1dIRU4sXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiwgQ09OVEVYVF9XSEVOX0ZPQ1VTLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKSxcblx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLnJlamVjdFdoZW5FeHByZXNzaW9uKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0FDQ0VQVF9XSEVOLFxuXHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfV0hFTl9GT0NVUywgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSksXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRcdGlmIChlZGl0b3JQYW5lIGluc3RhbmNlb2YgS2V5YmluZGluZ3NFZGl0b3IpIHtcblx0XHRcdFx0XHRlZGl0b3JQYW5lLmFjY2VwdFdoZW5FeHByZXNzaW9uKGVkaXRvclBhbmUuYWN0aXZlS2V5YmluZGluZ0VudHJ5ISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHByb2ZpbGVTY29wZWRBY3Rpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJQcm9maWxlU2NvcGVkQWN0aW9ucyA9ICgpID0+IHtcblx0XHRcdHByb2ZpbGVTY29wZWRBY3Rpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cHJvZmlsZVNjb3BlZEFjdGlvbkRpc3Bvc2FibGVzLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgRGVmaW5lS2V5YmluZGluZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRjb25zdCB3aGVuID0gUmVzb3VyY2VDb250ZXh0S2V5LlJlc291cmNlLmlzRXF1YWxUbyh0aGF0LnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZGVmaW5lS2V5YmluZGluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignZGVmaW5lS2V5YmluZGluZy5zdGFydCcsIFwiRGVmaW5lIEtleWJpbmRpbmdcIiksXG5cdFx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogd2hlbixcblx0XHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Sylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGVudCxcblx0XHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdFx0XHRcdGlmIChpc0NvZGVFZGl0b3IoY29kZUVkaXRvcikpIHtcblx0XHRcdFx0XHRcdGNvZGVFZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElEZWZpbmVLZXliaW5kaW5nRWRpdG9yQ29udHJpYnV0aW9uPihERUZJTkVfS0VZQklORElOR19FRElUT1JfQ09OVFJJQl9JRCk/LnNob3dEZWZpbmVLZXliaW5kaW5nV2lkZ2V0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdHJlZ2lzdGVyUHJvZmlsZVNjb3BlZEFjdGlvbnMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZSgoKSA9PiByZWdpc3RlclByb2ZpbGVTY29wZWRBY3Rpb25zKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJlZmVyZW5jZXNFZGl0b3JNZW51SXRlbSgpIHtcblx0XHRjb25zdCBjb21tYW5kSWQgPSAnX3dvcmtiZW5jaC5vcGVuV29ya3NwYWNlU2V0dGluZ3NFZGl0b3InO1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSAmJiAhQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmRJZCkpIHtcblx0XHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGNvbW1hbmRJZCwgKCkgPT4gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlbldvcmtzcGFjZVNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UgfSkpO1xuXHRcdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuUmVzb3VyY2UuaXNFcXVhbFRvKHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLndvcmtzcGFjZVNldHRpbmdzUmVzb3VyY2UhLnRvU3RyaW5nKCkpLCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSwgQ29udGV4dEtleUV4cHIubm90KCdpc0luRGlmZkVkaXRvcicpKTtcblx0XHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHtcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdFx0dGl0bGU6IE9QRU5fVVNFUl9TRVRUSU5HU19VSV9USVRMRSxcblx0XHRcdFx0XHRpY29uOiBwcmVmZXJlbmNlc09wZW5TZXR0aW5nc0ljb25cblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH0pO1xuXHRcdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Nb2RhbEVkaXRvckVkaXRvclRpdGxlLCB7XG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHRcdHRpdGxlOiBPUEVOX1VTRVJfU0VUVElOR1NfVUlfVElUTEUsXG5cdFx0XHRcdFx0aWNvbjogcHJlZmVyZW5jZXNPcGVuU2V0dGluZ3NJY29uXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW4sXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVQcmVmZXJlbmNlc0VkaXRvck1lbnVJdGVtRm9yV29ya3NwYWNlRm9sZGVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcmVmZXJlbmNlc0VkaXRvck1lbnVJdGVtRm9yV29ya3NwYWNlRm9sZGVycygpIHtcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGBfd29ya2JlbmNoLm9wZW5Gb2xkZXJTZXR0aW5ncy4ke2ZvbGRlci51cmkudG9TdHJpbmcoKX1gO1xuXHRcdFx0aWYgKCFDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZElkKSkge1xuXHRcdFx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChjb21tYW5kSWQsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZ3JvdXBJZCA9IGdldEVkaXRvckdyb3VwRnJvbUFyZ3VtZW50cyhhY2Nlc3NvciwgYXJncyk/LmlkO1xuXHRcdFx0XHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBncm91cElkIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlbkZvbGRlclNldHRpbmdzKHsgZm9sZGVyVXJpOiBmb2xkZXIudXJpLCBqc29uRWRpdG9yOiBmYWxzZSwgZ3JvdXBJZCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKFJlc291cmNlQ29udGV4dEtleS5SZXNvdXJjZS5pc0VxdWFsVG8odGhpcy5wcmVmZXJlbmNlc1NlcnZpY2UuZ2V0Rm9sZGVyU2V0dGluZ3NSZXNvdXJjZShmb2xkZXIudXJpKSEudG9TdHJpbmcoKSksIENvbnRleHRLZXlFeHByLm5vdCgnaXNJbkRpZmZFZGl0b3InKSk7XG5cdFx0XHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHRcdFx0dGl0bGU6IE9QRU5fVVNFUl9TRVRUSU5HU19VSV9USVRMRSxcblx0XHRcdFx0XHRcdGljb246IHByZWZlcmVuY2VzT3BlblNldHRpbmdzSWNvblxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1vZGFsRWRpdG9yRWRpdG9yVGl0bGUsIHtcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHRcdFx0dGl0bGU6IE9QRU5fVVNFUl9TRVRUSU5HU19VSV9USVRMRSxcblx0XHRcdFx0XHRcdGljb246IHByZWZlcmVuY2VzT3BlblNldHRpbmdzSWNvblxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nc0VkaXRvclRpdGxlQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXR0aW5nc0VkaXRvclRpdGxlQmFyQWN0aW9ucyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWdpc3RlclNldHRpbmdzRWRpdG9yVGl0bGVBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2V0dGluZ3NFZGl0b3JUaXRsZUFjdGlvbnMoKSB7XG5cdFx0Y29uc3QgcmVnaXN0ZXJPcGVuVXNlclNldHRpbmdzRWRpdG9yRnJvbUpzb25BY3Rpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCByZWdpc3Rlck9wZW5Vc2VyU2V0dGluZ3NFZGl0b3JGcm9tSnNvbkFjdGlvbiA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG9wZW5Vc2VyU2V0dGluZ3NFZGl0b3JXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDT05URVhUX1NFVFRJTkdTX0VESVRPUi50b05lZ2F0ZWQoKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlJlc291cmNlLmlzRXF1YWxUbyh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuUmVzb3VyY2UuaXNFcXVhbFRvKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZS50b1N0cmluZygpKSksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdCgnaXNJbkRpZmZFZGl0b3InKSk7XG5cdFx0XHRyZWdpc3Rlck9wZW5Vc2VyU2V0dGluZ3NFZGl0b3JGcm9tSnNvbkFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRyZWdpc3Rlck9wZW5Vc2VyU2V0dGluZ3NFZGl0b3JGcm9tSnNvbkFjdGlvbkRpc3Bvc2FibGVzLnZhbHVlID0gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiAnX3dvcmtiZW5jaC5vcGVuVXNlclNldHRpbmdzRWRpdG9yJyxcblx0XHRcdFx0XHRcdHRpdGxlOiBPUEVOX1VTRVJfU0VUVElOR1NfVUlfVElUTEUsXG5cdFx0XHRcdFx0XHRpY29uOiBwcmVmZXJlbmNlc09wZW5TZXR0aW5nc0ljb24sXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBvcGVuVXNlclNldHRpbmdzRWRpdG9yV2hlbixcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvckVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0XHR3aGVuOiBvcGVuVXNlclNldHRpbmdzRWRpdG9yV2hlbixcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0XHRjb25zdCBzYW5pdGl6ZWRBcmdzID0gc2FuaXRpemVPcGVuU2V0dGluZ3NBcmdzKGFyZ3NbMF0pO1xuXHRcdFx0XHRcdGNvbnN0IGdyb3VwSWQgPSBnZXRFZGl0b3JHcm91cEZyb21Bcmd1bWVudHMoYWNjZXNzb3IsIGFyZ3MpPy5pZDtcblx0XHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5Vc2VyU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgLi4uc2FuaXRpemVkQXJncywgZ3JvdXBJZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdHJlZ2lzdGVyT3BlblVzZXJTZXR0aW5nc0VkaXRvckZyb21Kc29uQWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoKCkgPT4ge1xuXHRcdFx0Ly8gRm9yY2UgdGhlIGFjdGlvbiB0byBjaGVjayB0aGUgY29udGV4dCBhZ2Fpbi5cblx0XHRcdHJlZ2lzdGVyT3BlblVzZXJTZXR0aW5nc0VkaXRvckZyb21Kc29uQWN0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb3BlblNldHRpbmdzSnNvbldoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TRVRUSU5HU19KU09OX0VESVRPUi50b05lZ2F0ZWQoKSwgQ09OVEVYVF9TRVRUSU5HU19FRElUT1IpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU1dJVENIX1RPX0pTT04sXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5TZXR0aW5nc0pzb24nLCBcIk9wZW4gU2V0dGluZ3MgKEpTT04pXCIpLFxuXHRcdFx0XHRcdGljb246IHByZWZlcmVuY2VzT3BlblNldHRpbmdzSWNvbixcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IG9wZW5TZXR0aW5nc0pzb25XaGVuLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvckVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogb3BlblNldHRpbmdzSnNvbldoZW4sXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gZ2V0RWRpdG9yR3JvdXBGcm9tQXJndW1lbnRzKGFjY2Vzc29yLCBhcmdzKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGdyb3VwPy5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNldHRpbmdzRWRpdG9yMikge1xuXHRcdFx0XHRcdHJldHVybiBlZGl0b3JQYW5lLnN3aXRjaFRvU2V0dGluZ3NGaWxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdzRWRpdG9yQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ2VkaXRvci5jb250cmliLnNldHRpbmdzJztcblxuXHRwcml2YXRlIGN1cnJlbnRSZW5kZXJlcjogSVByZWZlcmVuY2VzUmVuZGVyZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NyZWF0ZVByZWZlcmVuY2VzUmVuZGVyZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsKGUgPT4gdGhpcy5fY3JlYXRlUHJlZmVyZW5jZXNSZW5kZXJlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMuX2NyZWF0ZVByZWZlcmVuY2VzUmVuZGVyZXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlUHJlZmVyZW5jZXNSZW5kZXJlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5jdXJyZW50UmVuZGVyZXIgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsICYmIC9cXC4oanNvbnxjb2RlLXdvcmtzcGFjZSkkLy50ZXN0KG1vZGVsLnVyaS5wYXRoKSkge1xuXHRcdFx0Ly8gRmFzdCBjaGVjazogdGhlIHByZWZlcmVuY2VzIHJlbmRlcmVyIGNhbiBvbmx5IGFwcGVhclxuXHRcdFx0Ly8gaW4gc2V0dGluZ3MgZmlsZXMgb3Igd29ya3NwYWNlIGZpbGVzXG5cdFx0XHRjb25zdCBzZXR0aW5nc01vZGVsID0gYXdhaXQgdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2UuY3JlYXRlUHJlZmVyZW5jZXNFZGl0b3JNb2RlbChtb2RlbC51cmkpO1xuXHRcdFx0aWYgKHNldHRpbmdzTW9kZWwgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvck1vZGVsICYmIHRoaXMuZWRpdG9yLmdldE1vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoc2V0dGluZ3NNb2RlbCk7XG5cdFx0XHRcdHN3aXRjaCAoc2V0dGluZ3NNb2RlbC5jb25maWd1cmF0aW9uVGFyZ2V0KSB7XG5cdFx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0XHRcdHRoaXMuY3VycmVudFJlbmRlcmVyID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VTZXR0aW5nc1JlbmRlcmVyLCB0aGlzLmVkaXRvciwgc2V0dGluZ3NNb2RlbCkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRoaXMuY3VycmVudFJlbmRlcmVyID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyU2V0dGluZ3NSZW5kZXJlciwgdGhpcy5lZGl0b3IsIHNldHRpbmdzTW9kZWwpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY3VycmVudFJlbmRlcmVyPy5yZW5kZXIoKTtcblx0XHR9XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBnZXRFZGl0b3JHcm91cEZyb21Bcmd1bWVudHMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IHVua25vd25bXSk6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0cmV0dXJuIGNvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF0/Lmdyb3VwO1xufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUHJlZmVyZW5jZXNBY3Rpb25zQ29udHJpYnV0aW9uLklELCBQcmVmZXJlbmNlc0FjdGlvbnNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUHJlZmVyZW5jZXNDb250cmlidXRpb24uSUQsIFByZWZlcmVuY2VzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFNldHRpbmdzRWRpdG9yVGl0bGVDb250cmlidXRpb24uSUQsIFNldHRpbmdzRWRpdG9yVGl0bGVDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihTZXR0aW5nc0VkaXRvckNvbnRyaWJ1dGlvbi5JRCwgU2V0dGluZ3NFZGl0b3JDb250cmlidXRpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQWZ0ZXJGaXJzdFJlbmRlcik7XG5cbi8vIFByZWZlcmVuY2VzIG1lbnVcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsIHtcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pUHJlZmVyZW5jZXMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZQcmVmZXJlbmNlc1wiKSxcblx0c3VibWVudTogTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsXG5cdGdyb3VwOiAnNV9hdXRvc2F2ZScsXG5cdG9yZGVyOiAyLFxuXHR3aGVuOiBJc01hY05hdGl2ZUNvbnRleHQudG9OZWdhdGVkKCkgLy8gb24gbWFjT1MgbmF0aXZlIHRoZSBwcmVmZXJlbmNlcyBtZW51IGlzIHNlcGFyYXRlIHVuZGVyIHRoZSBhcHBsaWNhdGlvbiBtZW51XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0Es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
