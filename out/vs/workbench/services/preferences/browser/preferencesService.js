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
import { getErrorMessage } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { parse } from "../../../../base/common/json.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import * as network from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { CoreEditingCommands } from "../../../../editor/browser/coreCommands.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions, getDefaultValue, OVERRIDE_PROPERTY_REGEX } from "../../../../platform/configuration/common/configurationRegistry.js";
import { FileOperationResult } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { IJSONEditingService } from "../../configuration/common/jsonEditing.js";
import { GroupDirection, IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP, SIDE_GROUP } from "../../editor/common/editorService.js";
import { KeybindingsEditorInput } from "./keybindingsEditorInput.js";
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IPreferencesService, SETTINGS_AUTHORITY, USE_SPLIT_JSON_SETTING, validateSettingsEditorOptions } from "../common/preferences.js";
import { PreferencesEditorInput, SettingsEditor2Input } from "../common/preferencesEditorInput.js";
import { defaultKeybindingsContents, DefaultKeybindingsEditorModel, DefaultRawSettingsEditorModel, DefaultSettings, DefaultSettingsEditorModel, Settings2EditorModel, SettingsEditorModel, WorkspaceConfigurationEditorModel } from "../common/preferencesModels.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { ITextEditorService } from "../../textfile/common/textEditorService.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { isObject } from "../../../../base/common/types.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { compareIgnoreCase } from "../../../../base/common/strings.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
const emptyEditableSettingsContent = "{\n}";
let PreferencesService = class extends Disposable {
  constructor(editorService, editorGroupService, textFileService, configurationService, notificationService, contextService, instantiationService, userDataProfileService, userDataProfilesService, textModelResolverService, keybindingService, modelService, jsonEditingService, labelService, remoteAgentService, textEditorService, urlService, extensionService, progressService, environmentService) {
    super();
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.textFileService = textFileService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.contextService = contextService;
    this.instantiationService = instantiationService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.textModelResolverService = textModelResolverService;
    this.jsonEditingService = jsonEditingService;
    this.labelService = labelService;
    this.remoteAgentService = remoteAgentService;
    this.textEditorService = textEditorService;
    this.extensionService = extensionService;
    this.progressService = progressService;
    this.environmentService = environmentService;
    this._onDispose = this._register(new Emitter());
    this._onDidDefaultSettingsContentChanged = this._register(new Emitter());
    this.onDidDefaultSettingsContentChanged = this._onDidDefaultSettingsContentChanged.event;
    this._requestedDefaultSettings = new ResourceSet();
    this._settingsGroups = void 0;
    this._cachedSettingsEditor2Input = void 0;
    this.defaultKeybindingsResource = URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: "/keybindings.json" });
    this.defaultSettingsRawResource = URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: "/defaultSettings.jsonc" });
    this._register(keybindingService.onDidUpdateKeybindings(() => {
      const model = modelService.getModel(this.defaultKeybindingsResource);
      if (!model) {
        return;
      }
      modelService.updateModel(model, defaultKeybindingsContents(keybindingService));
    }));
    this._register(urlService.registerHandler(this));
  }
  get userSettingsResource() {
    return this.userDataProfileService.currentProfile.settingsResource;
  }
  get workspaceSettingsResource() {
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return null;
    }
    const workspace = this.contextService.getWorkspace();
    return workspace.configuration || workspace.folders[0].toResource(FOLDER_SETTINGS_PATH);
  }
  createOrGetCachedSettingsEditor2Input() {
    if (!this._cachedSettingsEditor2Input || this._cachedSettingsEditor2Input.isDisposed()) {
      this._cachedSettingsEditor2Input = new SettingsEditor2Input(this);
    }
    return this._cachedSettingsEditor2Input;
  }
  getFolderSettingsResource(resource) {
    const folder = this.contextService.getWorkspaceFolder(resource);
    return folder ? folder.toResource(FOLDER_SETTINGS_PATH) : null;
  }
  hasDefaultSettingsContent(uri) {
    return this.isDefaultSettingsResource(uri) || isEqual(uri, this.defaultSettingsRawResource) || isEqual(uri, this.defaultKeybindingsResource);
  }
  getDefaultSettingsContent(uri) {
    if (this.isDefaultSettingsResource(uri)) {
      const target = this.getConfigurationTargetFromDefaultSettingsResource(uri);
      const defaultSettings = this.getDefaultSettings(target);
      if (!this._requestedDefaultSettings.has(uri)) {
        this._register(defaultSettings.onDidChange(() => this._onDidDefaultSettingsContentChanged.fire(uri)));
        this._requestedDefaultSettings.add(uri);
      }
      return defaultSettings.getContentWithoutMostCommonlyUsed(true);
    }
    if (isEqual(uri, this.defaultSettingsRawResource)) {
      if (!this._defaultRawSettingsEditorModel) {
        this._defaultRawSettingsEditorModel = this._register(this.instantiationService.createInstance(DefaultRawSettingsEditorModel, this.getDefaultSettings(ConfigurationTarget.USER_LOCAL)));
        this._register(this._defaultRawSettingsEditorModel.onDidContentChanged(() => this._onDidDefaultSettingsContentChanged.fire(uri)));
      }
      return this._defaultRawSettingsEditorModel.content;
    }
    if (isEqual(uri, this.defaultKeybindingsResource)) {
      const defaultKeybindingsEditorModel = this.instantiationService.createInstance(DefaultKeybindingsEditorModel, uri);
      return defaultKeybindingsEditorModel.content;
    }
    return void 0;
  }
  async createPreferencesEditorModel(uri) {
    if (this.isDefaultSettingsResource(uri)) {
      return this.createDefaultSettingsEditorModel(uri);
    }
    if (this.userSettingsResource.toString() === uri.toString() || this.userDataProfilesService.defaultProfile.settingsResource.toString() === uri.toString()) {
      return this.createEditableSettingsEditorModel(ConfigurationTarget.USER_LOCAL, uri);
    }
    const workspaceSettingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
    if (workspaceSettingsUri && workspaceSettingsUri.toString() === uri.toString()) {
      return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE, workspaceSettingsUri);
    }
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      const settingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, uri);
      if (settingsUri && settingsUri.toString() === uri.toString()) {
        return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE_FOLDER, uri);
      }
    }
    const remoteEnvironment = await this.remoteAgentService.getEnvironment();
    const remoteSettingsUri = remoteEnvironment ? remoteEnvironment.settingsPath : null;
    if (remoteSettingsUri && remoteSettingsUri.toString() === uri.toString()) {
      return this.createEditableSettingsEditorModel(ConfigurationTarget.USER_REMOTE, uri);
    }
    return null;
  }
  openRawDefaultSettings() {
    return this.editorService.openEditor({ resource: this.defaultSettingsRawResource });
  }
  openRawUserSettings() {
    return this.editorService.openEditor({ resource: this.userSettingsResource });
  }
  shouldOpenJsonByDefault() {
    return this.configurationService.getValue("workbench.settings.editor") === "json";
  }
  async openPreferences() {
    await this.editorService.openEditor(this.instantiationService.createInstance(PreferencesEditorInput), void 0, MODAL_GROUP);
  }
  openSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.USER_LOCAL
    };
    if (options.query) {
      options.jsonEditor = false;
    }
    return this.open(this.userSettingsResource, options);
  }
  openLanguageSpecificSettings(languageId, options = {}) {
    if (this.shouldOpenJsonByDefault()) {
      options.query = void 0;
      options.revealSetting = { key: `[${languageId}]`, edit: true };
    } else {
      options.query = `@lang:${languageId}${options.query ? ` ${options.query}` : ""}`;
    }
    options.target = options.target ?? ConfigurationTarget.USER_LOCAL;
    return this.open(this.userSettingsResource, options);
  }
  open(settingsResource, options) {
    options = {
      ...options,
      jsonEditor: options.jsonEditor ?? this.shouldOpenJsonByDefault()
    };
    if (options.jsonEditor && options.query && !options.revealSetting) {
      const query = options.query.trim();
      const idMatch = query.match(/^@id:(.+)$/);
      let key;
      if (idMatch) {
        key = idMatch[1].trim();
      } else if (Registry.as(Extensions.Configuration).getConfigurationProperties()[query.trim()]) {
        key = query.trim();
      }
      options.query = void 0;
      if (key) {
        options.revealSetting = { key };
      }
    }
    return options.jsonEditor ? this.openSettingsJson(settingsResource, options) : this.openSettings2(options);
  }
  async openSettings2(options) {
    const input = this.createOrGetCachedSettingsEditor2Input();
    options = {
      ...options,
      focusSearch: true
    };
    const group = this.getEditorGroupFromOptions(options);
    return this.editorService.openEditor(input, validateSettingsEditorOptions(options), group);
  }
  openApplicationSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.USER_LOCAL
    };
    return this.open(this.userDataProfilesService.defaultProfile.settingsResource, options);
  }
  openUserSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.USER_LOCAL
    };
    return this.open(this.userSettingsResource, options);
  }
  async openRemoteSettings(options = {}) {
    const environment = await this.remoteAgentService.getEnvironment();
    if (environment) {
      options = {
        ...options,
        target: ConfigurationTarget.USER_REMOTE
      };
      this.open(environment.settingsPath, options);
    }
    return void 0;
  }
  openWorkspaceSettings(options = {}) {
    if (!this.workspaceSettingsResource) {
      this.notificationService.info(nls.localize("openFolderFirst", "Open a folder or workspace first to create workspace or folder settings."));
      return Promise.reject(null);
    }
    options = {
      ...options,
      target: ConfigurationTarget.WORKSPACE
    };
    return this.open(this.workspaceSettingsResource, options);
  }
  async openFolderSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.WORKSPACE_FOLDER
    };
    if (!options.folderUri) {
      throw new Error(`Missing folder URI`);
    }
    const folderSettingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, options.folderUri);
    if (!folderSettingsUri) {
      throw new Error(`Invalid folder URI - ${options.folderUri.toString()}`);
    }
    return this.open(folderSettingsUri, options);
  }
  async openGlobalKeybindingSettings(textual, options) {
    options = { pinned: true, revealIfOpened: true, ...options };
    if (textual) {
      const emptyContents = "// " + nls.localize("emptyKeybindingsHeader", "Place your key bindings in this file to override the defaults") + "\n[\n]";
      const editableKeybindings = this.userDataProfileService.currentProfile.keybindingsResource;
      const openDefaultKeybindings = !!this.configurationService.getValue("workbench.settings.openDefaultKeybindings");
      await this.createIfNotExists(editableKeybindings, emptyContents);
      if (openDefaultKeybindings) {
        const sourceGroupId = options.groupId ?? this.editorGroupService.activeGroup.id;
        const sideEditorGroup = this.editorGroupService.addGroup(sourceGroupId, GroupDirection.RIGHT);
        await Promise.all([
          this.editorService.openEditor({ resource: this.defaultKeybindingsResource, options: { pinned: true, preserveFocus: true, revealIfOpened: true, override: DEFAULT_EDITOR_ASSOCIATION.id }, label: nls.localize("defaultKeybindings", "Default Keybindings"), description: "" }, sourceGroupId),
          this.editorService.openEditor({ resource: editableKeybindings, options }, sideEditorGroup.id)
        ]);
      } else {
        await this.editorService.openEditor({ resource: editableKeybindings, options }, this.getEditorGroupFromOptions(options));
      }
    } else {
      const group = this.getEditorGroupFromOptions(options);
      const editor = await this.editorService.openEditor(this.instantiationService.createInstance(KeybindingsEditorInput), { ...options }, group);
      if (options.query) {
        editor.search(options.query);
      }
    }
  }
  openDefaultKeybindingsFile() {
    return this.editorService.openEditor({ resource: this.defaultKeybindingsResource, label: nls.localize("defaultKeybindings", "Default Keybindings") });
  }
  getEditorGroupFromOptions(options) {
    if (options?.groupId !== void 0 && !options.openToSide) {
      const group = this.editorGroupService.getGroup(options.groupId);
      if (group) {
        const modalEditorPart = this.editorGroupService.activeModalEditorPart;
        if (modalEditorPart?.groups.some((modalGroup) => modalGroup.id === group.id)) {
          return MODAL_GROUP;
        }
        return group;
      }
    }
    if (this.configurationService.getValue("workbench.editor.useModal") !== "off" && // modal editors enabled in settings
    !this.environmentService.enableSmokeTestDriver && !this.environmentService.extensionTestsLocationURI) {
      return MODAL_GROUP;
    }
    if (options.openToSide) {
      return SIDE_GROUP;
    }
    if (options?.groupId !== void 0) {
      return this.editorGroupService.getGroup(options.groupId) ?? this.editorGroupService.activeGroup;
    }
    return ACTIVE_GROUP;
  }
  async openSettingsJson(resource, options) {
    const group = this.getEditorGroupFromOptions(options);
    const editor = await this.doOpenSettingsJson(resource, options, group);
    if (editor && options?.revealSetting) {
      await this.revealSetting(options.revealSetting.key, !!options.revealSetting.edit, editor, resource);
    }
    return editor;
  }
  async doOpenSettingsJson(resource, options, group) {
    const openSplitJSON = !!this.configurationService.getValue(USE_SPLIT_JSON_SETTING);
    const openDefaultSettings = !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING);
    if (openSplitJSON || openDefaultSettings) {
      return this.doOpenSplitJSON(resource, options, group);
    }
    const configurationTarget = options?.target ?? ConfigurationTarget.USER;
    const editableSettingsEditorInput = await this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource);
    options = { ...options, pinned: true };
    return await this.editorService.openEditor(editableSettingsEditorInput, { ...validateSettingsEditorOptions(options) }, group);
  }
  async doOpenSplitJSON(resource, options = {}, group) {
    const configurationTarget = options.target ?? ConfigurationTarget.USER;
    await this.createSettingsIfNotExists(configurationTarget, resource);
    const preferencesEditorInput = this.createSplitJsonEditorInput(configurationTarget, resource);
    options = { ...options, pinned: true };
    return this.editorService.openEditor(preferencesEditorInput, validateSettingsEditorOptions(options), group);
  }
  createSplitJsonEditorInput(configurationTarget, resource) {
    const editableSettingsEditorInput = this.textEditorService.createTextEditor({ resource });
    const defaultPreferencesEditorInput = this.textEditorService.createTextEditor({ resource: this.getDefaultSettingsResource(configurationTarget) });
    return this.instantiationService.createInstance(SideBySideEditorInput, editableSettingsEditorInput.getName(), void 0, defaultPreferencesEditorInput, editableSettingsEditorInput);
  }
  createSettings2EditorModel() {
    return this.instantiationService.createInstance(Settings2EditorModel, this.getDefaultSettings(ConfigurationTarget.USER_LOCAL));
  }
  getConfigurationTargetFromDefaultSettingsResource(uri) {
    return this.isDefaultWorkspaceSettingsResource(uri) ? ConfigurationTarget.WORKSPACE : this.isDefaultFolderSettingsResource(uri) ? ConfigurationTarget.WORKSPACE_FOLDER : ConfigurationTarget.USER_LOCAL;
  }
  isDefaultSettingsResource(uri) {
    return this.isDefaultUserSettingsResource(uri) || this.isDefaultWorkspaceSettingsResource(uri) || this.isDefaultFolderSettingsResource(uri);
  }
  isDefaultUserSettingsResource(uri) {
    return uri.authority === "defaultsettings" && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?settings\.json$/);
  }
  isDefaultWorkspaceSettingsResource(uri) {
    return uri.authority === "defaultsettings" && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?workspaceSettings\.json$/);
  }
  isDefaultFolderSettingsResource(uri) {
    return uri.authority === "defaultsettings" && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?resourceSettings\.json$/);
  }
  getDefaultSettingsResource(configurationTarget) {
    switch (configurationTarget) {
      case ConfigurationTarget.WORKSPACE:
        return URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: `/workspaceSettings.json` });
      case ConfigurationTarget.WORKSPACE_FOLDER:
        return URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: `/resourceSettings.json` });
    }
    return URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: `/settings.json` });
  }
  async getOrCreateEditableSettingsEditorInput(target, resource) {
    await this.createSettingsIfNotExists(target, resource);
    return this.textEditorService.createTextEditor({ resource });
  }
  async createEditableSettingsEditorModel(configurationTarget, settingsUri) {
    const workspace = this.contextService.getWorkspace();
    if (workspace.configuration && workspace.configuration.toString() === settingsUri.toString()) {
      const reference2 = await this.textModelResolverService.createModelReference(settingsUri);
      return this.instantiationService.createInstance(WorkspaceConfigurationEditorModel, reference2, configurationTarget);
    }
    const reference = await this.textModelResolverService.createModelReference(settingsUri);
    return this.instantiationService.createInstance(SettingsEditorModel, reference, configurationTarget);
  }
  async createDefaultSettingsEditorModel(defaultSettingsUri) {
    const reference = await this.textModelResolverService.createModelReference(defaultSettingsUri);
    const target = this.getConfigurationTargetFromDefaultSettingsResource(defaultSettingsUri);
    return this.instantiationService.createInstance(DefaultSettingsEditorModel, defaultSettingsUri, reference, this.getDefaultSettings(target));
  }
  getDefaultSettings(target) {
    if (target === ConfigurationTarget.WORKSPACE) {
      this._defaultWorkspaceSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
      return this._defaultWorkspaceSettingsContentModel;
    }
    if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
      this._defaultFolderSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
      return this._defaultFolderSettingsContentModel;
    }
    this._defaultUserSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
    return this._defaultUserSettingsContentModel;
  }
  async getEditableSettingsURI(configurationTarget, resource) {
    switch (configurationTarget) {
      case ConfigurationTarget.APPLICATION:
        return this.userDataProfilesService.defaultProfile.settingsResource;
      case ConfigurationTarget.USER:
      case ConfigurationTarget.USER_LOCAL:
        return this.userSettingsResource;
      case ConfigurationTarget.USER_REMOTE: {
        const remoteEnvironment = await this.remoteAgentService.getEnvironment();
        return remoteEnvironment ? remoteEnvironment.settingsPath : null;
      }
      case ConfigurationTarget.WORKSPACE:
        return this.workspaceSettingsResource;
      case ConfigurationTarget.WORKSPACE_FOLDER:
        if (resource) {
          return this.getFolderSettingsResource(resource);
        }
    }
    return null;
  }
  async createSettingsIfNotExists(target, resource) {
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && target === ConfigurationTarget.WORKSPACE) {
      const workspaceConfig = this.contextService.getWorkspace().configuration;
      if (!workspaceConfig) {
        return;
      }
      const content = await this.textFileService.read(workspaceConfig);
      if (Object.keys(parse(content.value)).indexOf("settings") === -1) {
        await this.jsonEditingService.write(resource, [{ path: ["settings"], value: {} }], true);
      }
      return void 0;
    }
    await this.createIfNotExists(resource, emptyEditableSettingsContent);
  }
  async createIfNotExists(resource, contents) {
    try {
      await this.textFileService.read(resource, { acceptTextOnly: true });
    } catch (error) {
      if (error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        try {
          await this.textFileService.write(resource, contents);
          return;
        } catch (error2) {
          throw new Error(nls.localize("fail.createSettings", "Unable to create '{0}' ({1}).", this.labelService.getUriLabel(resource, { relative: true }), getErrorMessage(error2)));
        }
      } else {
        throw error;
      }
    }
  }
  getMostCommonlyUsedSettings() {
    return [
      "editor.fontSize",
      "editor.formatOnSave",
      "files.autoSave",
      "editor.defaultFormatter",
      "editor.fontFamily",
      "editor.wordWrap",
      "chat.agent.maxRequests",
      "files.exclude",
      "workbench.colorTheme",
      "editor.tabSize",
      "editor.mouseWheelZoom",
      "editor.formatOnPaste"
    ];
  }
  async revealSetting(settingKey, edit, editor, settingsResource) {
    const codeEditor = editor ? getCodeEditor(editor.getControl()) : null;
    if (!codeEditor) {
      return;
    }
    const settingsModel = await this.createPreferencesEditorModel(settingsResource);
    if (!settingsModel) {
      return;
    }
    const position = await this.getPositionToReveal(settingKey, edit, settingsModel, codeEditor);
    if (position) {
      codeEditor.setPosition(position);
      codeEditor.revealPositionNearTop(position);
      codeEditor.focus();
      if (edit) {
        SuggestController.get(codeEditor)?.triggerSuggest();
      }
    }
  }
  async getPositionToReveal(settingKey, edit, settingsModel, codeEditor) {
    const model = codeEditor.getModel();
    if (!model) {
      return null;
    }
    const schema = Registry.as(Extensions.Configuration).getConfigurationProperties()[settingKey];
    const isOverrideProperty = OVERRIDE_PROPERTY_REGEX.test(settingKey);
    if (!schema && !isOverrideProperty) {
      return null;
    }
    let position = null;
    const type = schema?.type ?? "object";
    let setting = settingsModel.getPreference(settingKey);
    if (!setting && edit) {
      let defaultValue = type === "object" || type === "array" ? this.configurationService.inspect(settingKey).defaultValue : getDefaultValue(type);
      defaultValue = defaultValue === void 0 && isOverrideProperty ? {} : defaultValue;
      if (defaultValue !== void 0) {
        const key = settingsModel instanceof WorkspaceConfigurationEditorModel ? ["settings", settingKey] : [settingKey];
        await this.jsonEditingService.write(settingsModel.uri, [{ path: key, value: defaultValue }], false);
        setting = settingsModel.getPreference(settingKey);
      }
    }
    if (setting) {
      if (edit) {
        if (isObject(setting.value) || Array.isArray(setting.value)) {
          position = { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.startColumn + 1 };
          codeEditor.setPosition(position);
          await this.instantiationService.invokeFunction((accessor) => {
            return CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, codeEditor, null);
          });
          position = { lineNumber: position.lineNumber + 1, column: model.getLineMaxColumn(position.lineNumber + 1) };
          const firstNonWhiteSpaceColumn = model.getLineFirstNonWhitespaceColumn(position.lineNumber);
          if (firstNonWhiteSpaceColumn) {
            codeEditor.setPosition({ lineNumber: position.lineNumber, column: firstNonWhiteSpaceColumn });
            await this.instantiationService.invokeFunction((accessor) => {
              return CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, codeEditor, null);
            });
            position = { lineNumber: position.lineNumber, column: model.getLineMaxColumn(position.lineNumber) };
          }
        } else {
          position = { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.endColumn };
        }
      } else {
        position = { lineNumber: setting.keyRange.startLineNumber, column: setting.keyRange.startColumn };
      }
    }
    return position;
  }
  getSetting(settingId) {
    if (!this._settingsGroups) {
      const defaultSettings = this.getDefaultSettings(ConfigurationTarget.USER);
      const defaultsChangedDisposable = this._register(new MutableDisposable());
      defaultsChangedDisposable.value = defaultSettings.onDidChange(() => {
        this._settingsGroups = void 0;
        defaultsChangedDisposable.clear();
      });
      this._settingsGroups = defaultSettings.getSettingsGroups();
    }
    for (const group of this._settingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          if (compareIgnoreCase(setting.key, settingId) === 0) {
            return setting;
          }
        }
      }
    }
    return void 0;
  }
  /**
   * Should be of the format:
   * 	code://settings/settingName
   * Examples:
   * 	code://settings/files.autoSave
   *
   */
  async handleURL(uri) {
    if (compareIgnoreCase(uri.authority, SETTINGS_AUTHORITY) !== 0) {
      return false;
    }
    const settingInfo = uri.path.split("/").filter((part) => !!part);
    const settingId = settingInfo.length > 0 ? settingInfo[0] : void 0;
    if (!settingId) {
      this.openSettings();
      return true;
    }
    let setting = this.getSetting(settingId);
    if (!setting && this.extensionService.extensions.length === 0) {
      await this.progressService.withProgress({ location: ProgressLocation.Window }, () => Event.toPromise(this.extensionService.onDidRegisterExtensions));
      setting = this.getSetting(settingId);
    }
    const openSettingsOptions = {};
    if (setting) {
      openSettingsOptions.query = settingId;
    }
    this.openSettings(openSettingsOptions);
    return true;
  }
  dispose() {
    if (this._cachedSettingsEditor2Input && !this._cachedSettingsEditor2Input.isDisposed()) {
      this._cachedSettingsEditor2Input.dispose();
    }
    this._onDispose.fire();
    super.dispose();
  }
};
PreferencesService = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, ITextFileService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IUserDataProfileService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, ITextModelService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IModelService),
  __decorateParam(12, IJSONEditingService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, IRemoteAgentService),
  __decorateParam(15, ITextEditorService),
  __decorateParam(16, IURLService),
  __decorateParam(17, IExtensionService),
  __decorateParam(18, IProgressService),
  __decorateParam(19, IWorkbenchEnvironmentService)
], PreferencesService);
registerSingleton(IPreferencesService, PreferencesService, InstantiationType.Delayed);
export {
  PreferencesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcmVmZXJlbmNlc1xcYnJvd3NlclxccHJlZmVyZW5jZXNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBuZXR3b3JrIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvcmVFZGl0aW5nQ29tbWFuZHMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBnZXREZWZhdWx0VmFsdWUsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIE9WRVJSSURFX1BST1BFUlRZX1JFR0VYIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLCBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElKU09ORWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9qc29uRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBHcm91cERpcmVjdGlvbiwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSwgTU9EQUxfR1JPVVAsIFByZWZlcnJlZEdyb3VwLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzRWRpdG9ySW5wdXQgfSBmcm9tICcuL2tleWJpbmRpbmdzRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9TRVRUSU5HU19FRElUT1JfU0VUVElORywgRk9MREVSX1NFVFRJTkdTX1BBVEgsIElLZXliaW5kaW5nc0VkaXRvclBhbmUsIElPcGVuS2V5YmluZGluZ3NFZGl0b3JPcHRpb25zLCBJT3BlblNldHRpbmdzT3B0aW9ucywgSVByZWZlcmVuY2VzRWRpdG9yTW9kZWwsIElQcmVmZXJlbmNlc1NlcnZpY2UsIElTZXR0aW5nLCBJU2V0dGluZ3NFZGl0b3JPcHRpb25zLCBJU2V0dGluZ3NHcm91cCwgU0VUVElOR1NfQVVUSE9SSVRZLCBVU0VfU1BMSVRfSlNPTl9TRVRUSU5HLCB2YWxpZGF0ZVNldHRpbmdzRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBQcmVmZXJlbmNlc0VkaXRvcklucHV0LCBTZXR0aW5nc0VkaXRvcjJJbnB1dCB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGRlZmF1bHRLZXliaW5kaW5nc0NvbnRlbnRzLCBEZWZhdWx0S2V5YmluZGluZ3NFZGl0b3JNb2RlbCwgRGVmYXVsdFJhd1NldHRpbmdzRWRpdG9yTW9kZWwsIERlZmF1bHRTZXR0aW5ncywgRGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwsIFNldHRpbmdzMkVkaXRvck1vZGVsLCBTZXR0aW5nc0VkaXRvck1vZGVsLCBXb3Jrc3BhY2VDb25maWd1cmF0aW9uRWRpdG9yTW9kZWwgfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXNNb2RlbHMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3RleHRmaWxlL2NvbW1vbi90ZXh0RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJVVJMU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IGNvbXBhcmVJZ25vcmVDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmNvbnN0IGVtcHR5RWRpdGFibGVTZXR0aW5nc0NvbnRlbnQgPSAne1xcbn0nO1xuXG5leHBvcnQgY2xhc3MgUHJlZmVyZW5jZXNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQcmVmZXJlbmNlc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGVmYXVsdFNldHRpbmdzQ29udGVudENoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlZmF1bHRTZXR0aW5nc0NvbnRlbnRDaGFuZ2VkID0gdGhpcy5fb25EaWREZWZhdWx0U2V0dGluZ3NDb250ZW50Q2hhbmdlZC5ldmVudDtcblxuXHRwcml2YXRlIF9kZWZhdWx0VXNlclNldHRpbmdzQ29udGVudE1vZGVsOiBEZWZhdWx0U2V0dGluZ3MgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RlZmF1bHRXb3Jrc3BhY2VTZXR0aW5nc0NvbnRlbnRNb2RlbDogRGVmYXVsdFNldHRpbmdzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZWZhdWx0Rm9sZGVyU2V0dGluZ3NDb250ZW50TW9kZWw6IERlZmF1bHRTZXR0aW5ncyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9kZWZhdWx0UmF3U2V0dGluZ3NFZGl0b3JNb2RlbDogRGVmYXVsdFJhd1NldHRpbmdzRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdGVkRGVmYXVsdFNldHRpbmdzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0cHJpdmF0ZSBfc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NhY2hlZFNldHRpbmdzRWRpdG9yMklucHV0OiBTZXR0aW5nc0VkaXRvcjJJbnB1dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUpTT05FZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGpzb25FZGl0aW5nU2VydmljZTogSUpTT05FZGl0aW5nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVRleHRFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEVkaXRvclNlcnZpY2U6IElUZXh0RWRpdG9yU2VydmljZSxcblx0XHRASVVSTFNlcnZpY2UgdXJsU2VydmljZTogSVVSTFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Ly8gVGhlIGRlZmF1bHQga2V5YmluZGluZ3MuanNvbiB1cGRhdGVzIGJhc2VkIG9uIGtleWJvYXJkIGxheW91dHMsIHNvIGhlcmUgd2UgbWFrZSBzdXJlXG5cdFx0Ly8gaWYgYSBtb2RlbCBoYXMgYmVlbiBnaXZlbiBvdXQgd2UgdXBkYXRlIGl0IGFjY29yZGluZ2x5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwodGhpcy5kZWZhdWx0S2V5YmluZGluZ3NSZXNvdXJjZSk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdC8vIG1vZGVsIGhhcyBub3QgYmVlbiBnaXZlbiBvdXQgPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRtb2RlbFNlcnZpY2UudXBkYXRlTW9kZWwobW9kZWwsIGRlZmF1bHRLZXliaW5kaW5nc0NvbnRlbnRzKGtleWJpbmRpbmdTZXJ2aWNlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodXJsU2VydmljZS5yZWdpc3RlckhhbmRsZXIodGhpcykpO1xuXHR9XG5cblx0cmVhZG9ubHkgZGVmYXVsdEtleWJpbmRpbmdzUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogbmV0d29yay5TY2hlbWFzLnZzY29kZSwgYXV0aG9yaXR5OiAnZGVmYXVsdHNldHRpbmdzJywgcGF0aDogJy9rZXliaW5kaW5ncy5qc29uJyB9KTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0U2V0dGluZ3NSYXdSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBuZXR3b3JrLlNjaGVtYXMudnNjb2RlLCBhdXRob3JpdHk6ICdkZWZhdWx0c2V0dGluZ3MnLCBwYXRoOiAnL2RlZmF1bHRTZXR0aW5ncy5qc29uYycgfSk7XG5cblx0Z2V0IHVzZXJTZXR0aW5nc1Jlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZVNldHRpbmdzUmVzb3VyY2UoKTogVVJJIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdHJldHVybiB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiB8fCB3b3Jrc3BhY2UuZm9sZGVyc1swXS50b1Jlc291cmNlKEZPTERFUl9TRVRUSU5HU19QQVRIKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3JHZXRDYWNoZWRTZXR0aW5nc0VkaXRvcjJJbnB1dCgpOiBTZXR0aW5nc0VkaXRvcjJJbnB1dCB7XG5cdFx0aWYgKCF0aGlzLl9jYWNoZWRTZXR0aW5nc0VkaXRvcjJJbnB1dCB8fCB0aGlzLl9jYWNoZWRTZXR0aW5nc0VkaXRvcjJJbnB1dC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdC8vIFJlY3JlYXRlIHRoZSBpbnB1dCBpZiB0aGUgdXNlciBuZXZlciBvcGVuZWQgdGhlIFNldHRpbmdzIGVkaXRvcixcblx0XHRcdC8vIG9yIGlmIHRoZXkgY2xvc2VkIGl0IGFuZCB3YW50IHRvIHJlb3BlbiBpdC5cblx0XHRcdHRoaXMuX2NhY2hlZFNldHRpbmdzRWRpdG9yMklucHV0ID0gbmV3IFNldHRpbmdzRWRpdG9yMklucHV0KHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkU2V0dGluZ3NFZGl0b3IySW5wdXQ7XG5cdH1cblxuXHRnZXRGb2xkZXJTZXR0aW5nc1Jlc291cmNlKHJlc291cmNlOiBVUkkpOiBVUkkgfCBudWxsIHtcblx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIGZvbGRlciA/IGZvbGRlci50b1Jlc291cmNlKEZPTERFUl9TRVRUSU5HU19QQVRIKSA6IG51bGw7XG5cdH1cblxuXHRoYXNEZWZhdWx0U2V0dGluZ3NDb250ZW50KHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNEZWZhdWx0U2V0dGluZ3NSZXNvdXJjZSh1cmkpIHx8IGlzRXF1YWwodXJpLCB0aGlzLmRlZmF1bHRTZXR0aW5nc1Jhd1Jlc291cmNlKSB8fCBpc0VxdWFsKHVyaSwgdGhpcy5kZWZhdWx0S2V5YmluZGluZ3NSZXNvdXJjZSk7XG5cdH1cblxuXHRnZXREZWZhdWx0U2V0dGluZ3NDb250ZW50KHVyaTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5pc0RlZmF1bHRTZXR0aW5nc1Jlc291cmNlKHVyaSkpIHtcblx0XHRcdC8vIFdlIG9wZW5lZCBhIHNwbGl0IGpzb24gZWRpdG9yIGluIHRoaXMgY2FzZSxcblx0XHRcdC8vIGFuZCB0aGlzIGhhbGYgc2hvd3MgdGhlIGRlZmF1bHQgc2V0dGluZ3MuXG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuZ2V0Q29uZmlndXJhdGlvblRhcmdldEZyb21EZWZhdWx0U2V0dGluZ3NSZXNvdXJjZSh1cmkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFNldHRpbmdzID0gdGhpcy5nZXREZWZhdWx0U2V0dGluZ3ModGFyZ2V0KTtcblxuXHRcdFx0aWYgKCF0aGlzLl9yZXF1ZXN0ZWREZWZhdWx0U2V0dGluZ3MuaGFzKHVyaSkpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZGVmYXVsdFNldHRpbmdzLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkRGVmYXVsdFNldHRpbmdzQ29udGVudENoYW5nZWQuZmlyZSh1cmkpKSk7XG5cdFx0XHRcdHRoaXMuX3JlcXVlc3RlZERlZmF1bHRTZXR0aW5ncy5hZGQodXJpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkZWZhdWx0U2V0dGluZ3MuZ2V0Q29udGVudFdpdGhvdXRNb3N0Q29tbW9ubHlVc2VkKHRydWUpO1xuXHRcdH1cblxuXHRcdGlmIChpc0VxdWFsKHVyaSwgdGhpcy5kZWZhdWx0U2V0dGluZ3NSYXdSZXNvdXJjZSkpIHtcblx0XHRcdGlmICghdGhpcy5fZGVmYXVsdFJhd1NldHRpbmdzRWRpdG9yTW9kZWwpIHtcblx0XHRcdFx0dGhpcy5fZGVmYXVsdFJhd1NldHRpbmdzRWRpdG9yTW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlZmF1bHRSYXdTZXR0aW5nc0VkaXRvck1vZGVsLCB0aGlzLmdldERlZmF1bHRTZXR0aW5ncyhDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlZmF1bHRSYXdTZXR0aW5nc0VkaXRvck1vZGVsLm9uRGlkQ29udGVudENoYW5nZWQoKCkgPT4gdGhpcy5fb25EaWREZWZhdWx0U2V0dGluZ3NDb250ZW50Q2hhbmdlZC5maXJlKHVyaSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9kZWZhdWx0UmF3U2V0dGluZ3NFZGl0b3JNb2RlbC5jb250ZW50O1xuXHRcdH1cblxuXHRcdGlmIChpc0VxdWFsKHVyaSwgdGhpcy5kZWZhdWx0S2V5YmluZGluZ3NSZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRLZXliaW5kaW5nc0VkaXRvck1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWZhdWx0S2V5YmluZGluZ3NFZGl0b3JNb2RlbCwgdXJpKTtcblx0XHRcdHJldHVybiBkZWZhdWx0S2V5YmluZGluZ3NFZGl0b3JNb2RlbC5jb250ZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY3JlYXRlUHJlZmVyZW5jZXNFZGl0b3JNb2RlbCh1cmk6IFVSSSk6IFByb21pc2U8SVByZWZlcmVuY2VzRWRpdG9yTW9kZWw8SVNldHRpbmc+IHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmlzRGVmYXVsdFNldHRpbmdzUmVzb3VyY2UodXJpKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlRGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwodXJpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy51c2VyU2V0dGluZ3NSZXNvdXJjZS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSB8fCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUVkaXRhYmxlU2V0dGluZ3NFZGl0b3JNb2RlbChDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwsIHVyaSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlU2V0dGluZ3NVcmkgPSBhd2FpdCB0aGlzLmdldEVkaXRhYmxlU2V0dGluZ3NVUkkoQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdGlmICh3b3Jrc3BhY2VTZXR0aW5nc1VyaSAmJiB3b3Jrc3BhY2VTZXR0aW5nc1VyaS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlRWRpdGFibGVTZXR0aW5nc0VkaXRvck1vZGVsKENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFLCB3b3Jrc3BhY2VTZXR0aW5nc1VyaSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nc1VyaSA9IGF3YWl0IHRoaXMuZ2V0RWRpdGFibGVTZXR0aW5nc1VSSShDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIsIHVyaSk7XG5cdFx0XHRpZiAoc2V0dGluZ3NVcmkgJiYgc2V0dGluZ3NVcmkudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlRWRpdGFibGVTZXR0aW5nc0VkaXRvck1vZGVsKENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiwgdXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVFbnZpcm9ubWVudCA9IGF3YWl0IHRoaXMucmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cdFx0Y29uc3QgcmVtb3RlU2V0dGluZ3NVcmkgPSByZW1vdGVFbnZpcm9ubWVudCA/IHJlbW90ZUVudmlyb25tZW50LnNldHRpbmdzUGF0aCA6IG51bGw7XG5cdFx0aWYgKHJlbW90ZVNldHRpbmdzVXJpICYmIHJlbW90ZVNldHRpbmdzVXJpLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVFZGl0YWJsZVNldHRpbmdzRWRpdG9yTW9kZWwoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSwgdXJpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdG9wZW5SYXdEZWZhdWx0U2V0dGluZ3MoKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB0aGlzLmRlZmF1bHRTZXR0aW5nc1Jhd1Jlc291cmNlIH0pO1xuXHR9XG5cblx0b3BlblJhd1VzZXJTZXR0aW5ncygpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZE9wZW5Kc29uQnlEZWZhdWx0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guc2V0dGluZ3MuZWRpdG9yJykgPT09ICdqc29uJztcblx0fVxuXG5cdGFzeW5jIG9wZW5QcmVmZXJlbmNlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByZWZlcmVuY2VzRWRpdG9ySW5wdXQpLCB1bmRlZmluZWQsIE1PREFMX0dST1VQKTtcblx0fVxuXG5cdG9wZW5TZXR0aW5ncyhvcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdG9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwsXG5cdFx0fTtcblx0XHRpZiAob3B0aW9ucy5xdWVyeSkge1xuXHRcdFx0b3B0aW9ucy5qc29uRWRpdG9yID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3Blbih0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdG9wZW5MYW5ndWFnZVNwZWNpZmljU2V0dGluZ3MobGFuZ3VhZ2VJZDogc3RyaW5nLCBvcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLnNob3VsZE9wZW5Kc29uQnlEZWZhdWx0KCkpIHtcblx0XHRcdG9wdGlvbnMucXVlcnkgPSB1bmRlZmluZWQ7XG5cdFx0XHRvcHRpb25zLnJldmVhbFNldHRpbmcgPSB7IGtleTogYFske2xhbmd1YWdlSWR9XWAsIGVkaXQ6IHRydWUgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3B0aW9ucy5xdWVyeSA9IGBAbGFuZzoke2xhbmd1YWdlSWR9JHtvcHRpb25zLnF1ZXJ5ID8gYCAke29wdGlvbnMucXVlcnl9YCA6ICcnfWA7XG5cdFx0fVxuXHRcdG9wdGlvbnMudGFyZ2V0ID0gb3B0aW9ucy50YXJnZXQgPz8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMO1xuXG5cdFx0cmV0dXJuIHRoaXMub3Blbih0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbihzZXR0aW5nc1Jlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdG9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0anNvbkVkaXRvcjogb3B0aW9ucy5qc29uRWRpdG9yID8/IHRoaXMuc2hvdWxkT3Blbkpzb25CeURlZmF1bHQoKVxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5qc29uRWRpdG9yICYmIG9wdGlvbnMucXVlcnkgJiYgIW9wdGlvbnMucmV2ZWFsU2V0dGluZykge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBvcHRpb25zLnF1ZXJ5LnRyaW0oKTtcblx0XHRcdGNvbnN0IGlkTWF0Y2ggPSBxdWVyeS5tYXRjaCgvXkBpZDooLispJC8pO1xuXHRcdFx0bGV0IGtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlkTWF0Y2gpIHtcblx0XHRcdFx0a2V5ID0gaWRNYXRjaFsxXS50cmltKCk7XG5cdFx0XHR9IGVsc2UgaWYgKFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVtxdWVyeS50cmltKCldKSB7XG5cdFx0XHRcdGtleSA9IHF1ZXJ5LnRyaW0oKTtcblx0XHRcdH1cblx0XHRcdG9wdGlvbnMucXVlcnkgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdG9wdGlvbnMucmV2ZWFsU2V0dGluZyA9IHsga2V5IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9wdGlvbnMuanNvbkVkaXRvciA/XG5cdFx0XHR0aGlzLm9wZW5TZXR0aW5nc0pzb24oc2V0dGluZ3NSZXNvdXJjZSwgb3B0aW9ucykgOlxuXHRcdFx0dGhpcy5vcGVuU2V0dGluZ3MyKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuU2V0dGluZ3MyKG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5jcmVhdGVPckdldENhY2hlZFNldHRpbmdzRWRpdG9yMklucHV0KCk7XG5cdFx0b3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRmb2N1c1NlYXJjaDogdHJ1ZVxuXHRcdH07XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmdldEVkaXRvckdyb3VwRnJvbU9wdGlvbnMob3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB2YWxpZGF0ZVNldHRpbmdzRWRpdG9yT3B0aW9ucyhvcHRpb25zKSwgZ3JvdXApO1xuXHR9XG5cblx0b3BlbkFwcGxpY2F0aW9uU2V0dGluZ3Mob3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMgPSB7fSk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRvcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLFxuXHRcdH07XG5cdFx0cmV0dXJuIHRoaXMub3Blbih0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIG9wdGlvbnMpO1xuXHR9XG5cblx0b3BlblVzZXJTZXR0aW5ncyhvcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdG9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwsXG5cdFx0fTtcblx0XHRyZXR1cm4gdGhpcy5vcGVuKHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2UsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgb3BlblJlbW90ZVNldHRpbmdzKG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zID0ge30pOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdGlmIChlbnZpcm9ubWVudCkge1xuXHRcdFx0b3B0aW9ucyA9IHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFLFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5vcGVuKGVudmlyb25tZW50LnNldHRpbmdzUGF0aCwgb3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvcGVuV29ya3NwYWNlU2V0dGluZ3Mob3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMgPSB7fSk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMud29ya3NwYWNlU2V0dGluZ3NSZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obmxzLmxvY2FsaXplKCdvcGVuRm9sZGVyRmlyc3QnLCBcIk9wZW4gYSBmb2xkZXIgb3Igd29ya3NwYWNlIGZpcnN0IHRvIGNyZWF0ZSB3b3Jrc3BhY2Ugb3IgZm9sZGVyIHNldHRpbmdzLlwiKSk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobnVsbCk7XG5cdFx0fVxuXG5cdFx0b3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHR0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFXG5cdFx0fTtcblx0XHRyZXR1cm4gdGhpcy5vcGVuKHRoaXMud29ya3NwYWNlU2V0dGluZ3NSZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBvcGVuRm9sZGVyU2V0dGluZ3Mob3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMgPSB7fSk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRvcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSXG5cdFx0fTtcblxuXHRcdGlmICghb3B0aW9ucy5mb2xkZXJVcmkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBmb2xkZXIgVVJJYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9sZGVyU2V0dGluZ3NVcmkgPSBhd2FpdCB0aGlzLmdldEVkaXRhYmxlU2V0dGluZ3NVUkkoQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSLCBvcHRpb25zLmZvbGRlclVyaSk7XG5cdFx0aWYgKCFmb2xkZXJTZXR0aW5nc1VyaSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGZvbGRlciBVUkkgLSAke29wdGlvbnMuZm9sZGVyVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3Blbihmb2xkZXJTZXR0aW5nc1VyaSwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBvcGVuR2xvYmFsS2V5YmluZGluZ1NldHRpbmdzKHRleHR1YWw6IGJvb2xlYW4sIG9wdGlvbnM/OiBJT3BlbktleWJpbmRpbmdzRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdG9wdGlvbnMgPSB7IHBpbm5lZDogdHJ1ZSwgcmV2ZWFsSWZPcGVuZWQ6IHRydWUsIC4uLm9wdGlvbnMgfTtcblx0XHRpZiAodGV4dHVhbCkge1xuXHRcdFx0Y29uc3QgZW1wdHlDb250ZW50cyA9ICcvLyAnICsgbmxzLmxvY2FsaXplKCdlbXB0eUtleWJpbmRpbmdzSGVhZGVyJywgXCJQbGFjZSB5b3VyIGtleSBiaW5kaW5ncyBpbiB0aGlzIGZpbGUgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHRzXCIpICsgJ1xcbltcXG5dJztcblx0XHRcdGNvbnN0IGVkaXRhYmxlS2V5YmluZGluZ3MgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZTtcblx0XHRcdGNvbnN0IG9wZW5EZWZhdWx0S2V5YmluZGluZ3MgPSAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dvcmtiZW5jaC5zZXR0aW5ncy5vcGVuRGVmYXVsdEtleWJpbmRpbmdzJyk7XG5cblx0XHRcdC8vIENyZWF0ZSBhcyBuZWVkZWQgYW5kIG9wZW4gaW4gZWRpdG9yXG5cdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZUlmTm90RXhpc3RzKGVkaXRhYmxlS2V5YmluZGluZ3MsIGVtcHR5Q29udGVudHMpO1xuXHRcdFx0aWYgKG9wZW5EZWZhdWx0S2V5YmluZGluZ3MpIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlR3JvdXBJZCA9IG9wdGlvbnMuZ3JvdXBJZCA/PyB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5pZDtcblx0XHRcdFx0Y29uc3Qgc2lkZUVkaXRvckdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWRkR3JvdXAoc291cmNlR3JvdXBJZCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGhpcy5kZWZhdWx0S2V5YmluZGluZ3NSZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIHJldmVhbElmT3BlbmVkOiB0cnVlLCBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQgfSwgbGFiZWw6IG5scy5sb2NhbGl6ZSgnZGVmYXVsdEtleWJpbmRpbmdzJywgXCJEZWZhdWx0IEtleWJpbmRpbmdzXCIpLCBkZXNjcmlwdGlvbjogJycgfSwgc291cmNlR3JvdXBJZCksXG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZWRpdGFibGVLZXliaW5kaW5ncywgb3B0aW9ucyB9LCBzaWRlRWRpdG9yR3JvdXAuaWQpXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZWRpdGFibGVLZXliaW5kaW5ncywgb3B0aW9ucyB9LCB0aGlzLmdldEVkaXRvckdyb3VwRnJvbU9wdGlvbnMob3B0aW9ucykpO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5nZXRFZGl0b3JHcm91cEZyb21PcHRpb25zKG9wdGlvbnMpO1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gKGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5YmluZGluZ3NFZGl0b3JJbnB1dCksIHsgLi4ub3B0aW9ucyB9LCBncm91cCkpIGFzIElLZXliaW5kaW5nc0VkaXRvclBhbmU7XG5cdFx0XHRpZiAob3B0aW9ucy5xdWVyeSkge1xuXHRcdFx0XHRlZGl0b3Iuc2VhcmNoKG9wdGlvbnMucXVlcnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHR9XG5cblx0b3BlbkRlZmF1bHRLZXliaW5kaW5nc0ZpbGUoKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB0aGlzLmRlZmF1bHRLZXliaW5kaW5nc1Jlc291cmNlLCBsYWJlbDogbmxzLmxvY2FsaXplKCdkZWZhdWx0S2V5YmluZGluZ3MnLCBcIkRlZmF1bHQgS2V5YmluZGluZ3NcIikgfSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXRvckdyb3VwRnJvbU9wdGlvbnMob3B0aW9uczogeyBncm91cElkPzogbnVtYmVyOyBvcGVuVG9TaWRlPzogYm9vbGVhbiB9KTogUHJlZmVycmVkR3JvdXAge1xuXG5cdFx0Ly8gV2hlbiB0aGUgY2FsbGVyIGtub3dzIHRoZSBzb3VyY2UgZWRpdG9yIGdyb3VwIChlLmcuIHRoZSBlZGl0b3IgdGl0bGUgYWN0aW9uc1xuXHRcdC8vIGFuZCB0aGVpciBrZXlib2FyZCBzaG9ydGN1dHMgdGhhdCBzd2l0Y2ggYmV0d2VlbiB0aGUgc2V0dGluZ3MgVUkgYW5kIEpTT04gZWRpdG9yKSxcblx0XHQvLyBvcGVuIGluIHRoYXQgc2FtZSBncm91cCBzbyB0aGUgZWRpdG9yIHN0YXlzIGluIHRoZSBlZGl0b3IgcGFydCAobWFpbiwgbW9kYWwgb3Jcblx0XHQvLyBhdXhpbGlhcnkgd2luZG93KSBpdCB3YXMgaW52b2tlZCBmcm9tLiBJZiB0aGF0IGdyb3VwIGxpdmVzIGluIHRoZSBtb2RhbCBlZGl0b3IgcGFydCxcblx0XHQvLyByZXF1ZXN0IHRoZSBtb2RhbCBncm91cCBzbyBpdCBzdGF5cyBtb2RhbDsgb3RoZXJ3aXNlIG9wZW4gaW4gdGhhdCBleGFjdCBncm91cC4gVGhpc1xuXHRcdC8vIGlzIHNraXBwZWQgd2hlbiBvcGVuaW5nIHRvIHRoZSBzaWRlLCB3aGVyZSBhIG5ldyBzaWRlIGdyb3VwIGlzIHByZWZlcnJlZCBpbnN0ZWFkLlxuXHRcdGlmIChvcHRpb25zPy5ncm91cElkICE9PSB1bmRlZmluZWQgJiYgIW9wdGlvbnMub3BlblRvU2lkZSkge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChvcHRpb25zLmdyb3VwSWQpO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGFsRWRpdG9yUGFydCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydDtcblx0XHRcdFx0aWYgKG1vZGFsRWRpdG9yUGFydD8uZ3JvdXBzLnNvbWUobW9kYWxHcm91cCA9PiBtb2RhbEdyb3VwLmlkID09PSBncm91cC5pZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gTU9EQUxfR1JPVVA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd29ya2JlbmNoLmVkaXRvci51c2VNb2RhbCcpICE9PSAnb2ZmJyAmJlx0XHRcdFx0XHQvLyBtb2RhbCBlZGl0b3JzIGVuYWJsZWQgaW4gc2V0dGluZ3Ncblx0XHRcdCF0aGlzLmVudmlyb25tZW50U2VydmljZS5lbmFibGVTbW9rZVRlc3REcml2ZXIgJiYgIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUklcdC8vIGJ1dCBub3QgaW4gc21va2UgdGVzdCBvciBleHRlbnNpb24gdGVzdCBlbnZpcm9ubWVudHMgdG8gcmVkdWNlIGZsYWtpbmVzc1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIE1PREFMX0dST1VQO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5vcGVuVG9TaWRlKSB7XG5cdFx0XHRyZXR1cm4gU0lERV9HUk9VUDtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnM/Lmdyb3VwSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKG9wdGlvbnMuZ3JvdXBJZCkgPz8gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0fVxuXHRcdHJldHVybiBBQ1RJVkVfR1JPVVA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5TZXR0aW5nc0pzb24ocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmdldEVkaXRvckdyb3VwRnJvbU9wdGlvbnMob3B0aW9ucyk7XG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5kb09wZW5TZXR0aW5nc0pzb24ocmVzb3VyY2UsIG9wdGlvbnMsIGdyb3VwKTtcblx0XHRpZiAoZWRpdG9yICYmIG9wdGlvbnM/LnJldmVhbFNldHRpbmcpIHtcblx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsU2V0dGluZyhvcHRpb25zLnJldmVhbFNldHRpbmcua2V5LCAhIW9wdGlvbnMucmV2ZWFsU2V0dGluZy5lZGl0LCBlZGl0b3IsIHJlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuU2V0dGluZ3NKc29uKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZXR0aW5nc0VkaXRvck9wdGlvbnMsIGdyb3VwOiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBvcGVuU3BsaXRKU09OID0gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFVTRV9TUExJVF9KU09OX1NFVFRJTkcpO1xuXHRcdGNvbnN0IG9wZW5EZWZhdWx0U2V0dGluZ3MgPSAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoREVGQVVMVF9TRVRUSU5HU19FRElUT1JfU0VUVElORyk7XG5cdFx0aWYgKG9wZW5TcGxpdEpTT04gfHwgb3BlbkRlZmF1bHRTZXR0aW5ncykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9PcGVuU3BsaXRKU09OKHJlc291cmNlLCBvcHRpb25zLCBncm91cCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblRhcmdldCA9IG9wdGlvbnM/LnRhcmdldCA/PyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI7XG5cdFx0Y29uc3QgZWRpdGFibGVTZXR0aW5nc0VkaXRvcklucHV0ID0gYXdhaXQgdGhpcy5nZXRPckNyZWF0ZUVkaXRhYmxlU2V0dGluZ3NFZGl0b3JJbnB1dChjb25maWd1cmF0aW9uVGFyZ2V0LCByZXNvdXJjZSk7XG5cdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgcGlubmVkOiB0cnVlIH07XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGVkaXRhYmxlU2V0dGluZ3NFZGl0b3JJbnB1dCwgeyAuLi52YWxpZGF0ZVNldHRpbmdzRWRpdG9yT3B0aW9ucyhvcHRpb25zKSB9LCBncm91cCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvT3BlblNwbGl0SlNPTihyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJU2V0dGluZ3NFZGl0b3JPcHRpb25zID0ge30sIGdyb3VwOiBQcmVmZXJyZWRHcm91cCwpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjtcblx0XHRhd2FpdCB0aGlzLmNyZWF0ZVNldHRpbmdzSWZOb3RFeGlzdHMoY29uZmlndXJhdGlvblRhcmdldCwgcmVzb3VyY2UpO1xuXHRcdGNvbnN0IHByZWZlcmVuY2VzRWRpdG9ySW5wdXQgPSB0aGlzLmNyZWF0ZVNwbGl0SnNvbkVkaXRvcklucHV0KGNvbmZpZ3VyYXRpb25UYXJnZXQsIHJlc291cmNlKTtcblx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBwaW5uZWQ6IHRydWUgfTtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IocHJlZmVyZW5jZXNFZGl0b3JJbnB1dCwgdmFsaWRhdGVTZXR0aW5nc0VkaXRvck9wdGlvbnMob3B0aW9ucyksIGdyb3VwKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVTcGxpdEpzb25FZGl0b3JJbnB1dChjb25maWd1cmF0aW9uVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCByZXNvdXJjZTogVVJJKTogRWRpdG9ySW5wdXQge1xuXHRcdGNvbnN0IGVkaXRhYmxlU2V0dGluZ3NFZGl0b3JJbnB1dCA9IHRoaXMudGV4dEVkaXRvclNlcnZpY2UuY3JlYXRlVGV4dEVkaXRvcih7IHJlc291cmNlIH0pO1xuXHRcdGNvbnN0IGRlZmF1bHRQcmVmZXJlbmNlc0VkaXRvcklucHV0ID0gdGhpcy50ZXh0RWRpdG9yU2VydmljZS5jcmVhdGVUZXh0RWRpdG9yKHsgcmVzb3VyY2U6IHRoaXMuZ2V0RGVmYXVsdFNldHRpbmdzUmVzb3VyY2UoY29uZmlndXJhdGlvblRhcmdldCkgfSk7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2lkZUJ5U2lkZUVkaXRvcklucHV0LCBlZGl0YWJsZVNldHRpbmdzRWRpdG9ySW5wdXQuZ2V0TmFtZSgpLCB1bmRlZmluZWQsIGRlZmF1bHRQcmVmZXJlbmNlc0VkaXRvcklucHV0LCBlZGl0YWJsZVNldHRpbmdzRWRpdG9ySW5wdXQpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVNldHRpbmdzMkVkaXRvck1vZGVsKCk6IFNldHRpbmdzMkVkaXRvck1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nczJFZGl0b3JNb2RlbCwgdGhpcy5nZXREZWZhdWx0U2V0dGluZ3MoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyYXRpb25UYXJnZXRGcm9tRGVmYXVsdFNldHRpbmdzUmVzb3VyY2UodXJpOiBVUkkpIHtcblx0XHRyZXR1cm4gdGhpcy5pc0RlZmF1bHRXb3Jrc3BhY2VTZXR0aW5nc1Jlc291cmNlKHVyaSkgP1xuXHRcdFx0Q29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgOlxuXHRcdFx0dGhpcy5pc0RlZmF1bHRGb2xkZXJTZXR0aW5nc1Jlc291cmNlKHVyaSkgP1xuXHRcdFx0XHRDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIgOlxuXHRcdFx0XHRDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw7XG5cdH1cblxuXHRwcml2YXRlIGlzRGVmYXVsdFNldHRpbmdzUmVzb3VyY2UodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc0RlZmF1bHRVc2VyU2V0dGluZ3NSZXNvdXJjZSh1cmkpIHx8IHRoaXMuaXNEZWZhdWx0V29ya3NwYWNlU2V0dGluZ3NSZXNvdXJjZSh1cmkpIHx8IHRoaXMuaXNEZWZhdWx0Rm9sZGVyU2V0dGluZ3NSZXNvdXJjZSh1cmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0RlZmF1bHRVc2VyU2V0dGluZ3NSZXNvdXJjZSh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB1cmkuYXV0aG9yaXR5ID09PSAnZGVmYXVsdHNldHRpbmdzJyAmJiB1cmkuc2NoZW1lID09PSBuZXR3b3JrLlNjaGVtYXMudnNjb2RlICYmICEhdXJpLnBhdGgubWF0Y2goL1xcLyhcXGQrXFwvKT9zZXR0aW5nc1xcLmpzb24kLyk7XG5cdH1cblxuXHRwcml2YXRlIGlzRGVmYXVsdFdvcmtzcGFjZVNldHRpbmdzUmVzb3VyY2UodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdXJpLmF1dGhvcml0eSA9PT0gJ2RlZmF1bHRzZXR0aW5ncycgJiYgdXJpLnNjaGVtZSA9PT0gbmV0d29yay5TY2hlbWFzLnZzY29kZSAmJiAhIXVyaS5wYXRoLm1hdGNoKC9cXC8oXFxkK1xcLyk/d29ya3NwYWNlU2V0dGluZ3NcXC5qc29uJC8pO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0RlZmF1bHRGb2xkZXJTZXR0aW5nc1Jlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHVyaS5hdXRob3JpdHkgPT09ICdkZWZhdWx0c2V0dGluZ3MnICYmIHVyaS5zY2hlbWUgPT09IG5ldHdvcmsuU2NoZW1hcy52c2NvZGUgJiYgISF1cmkucGF0aC5tYXRjaCgvXFwvKFxcZCtcXC8pP3Jlc291cmNlU2V0dGluZ3NcXC5qc29uJC8pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0U2V0dGluZ3NSZXNvdXJjZShjb25maWd1cmF0aW9uVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogVVJJIHtcblx0XHRzd2l0Y2ggKGNvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogbmV0d29yay5TY2hlbWFzLnZzY29kZSwgYXV0aG9yaXR5OiAnZGVmYXVsdHNldHRpbmdzJywgcGF0aDogYC93b3Jrc3BhY2VTZXR0aW5ncy5qc29uYCB9KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IG5ldHdvcmsuU2NoZW1hcy52c2NvZGUsIGF1dGhvcml0eTogJ2RlZmF1bHRzZXR0aW5ncycsIHBhdGg6IGAvcmVzb3VyY2VTZXR0aW5ncy5qc29uYCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBuZXR3b3JrLlNjaGVtYXMudnNjb2RlLCBhdXRob3JpdHk6ICdkZWZhdWx0c2V0dGluZ3MnLCBwYXRoOiBgL3NldHRpbmdzLmpzb25gIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRPckNyZWF0ZUVkaXRhYmxlU2V0dGluZ3NFZGl0b3JJbnB1dCh0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHJlc291cmNlOiBVUkkpOiBQcm9taXNlPEVkaXRvcklucHV0PiB7XG5cdFx0YXdhaXQgdGhpcy5jcmVhdGVTZXR0aW5nc0lmTm90RXhpc3RzKHRhcmdldCwgcmVzb3VyY2UpO1xuXHRcdHJldHVybiB0aGlzLnRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZVRleHRFZGl0b3IoeyByZXNvdXJjZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlRWRpdGFibGVTZXR0aW5nc0VkaXRvck1vZGVsKGNvbmZpZ3VyYXRpb25UYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHNldHRpbmdzVXJpOiBVUkkpOiBQcm9taXNlPFNldHRpbmdzRWRpdG9yTW9kZWw+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGlmICh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiAmJiB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbi50b1N0cmluZygpID09PSBzZXR0aW5nc1VyaS50b1N0cmluZygpKSB7XG5cdFx0XHRjb25zdCByZWZlcmVuY2UgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShzZXR0aW5nc1VyaSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VDb25maWd1cmF0aW9uRWRpdG9yTW9kZWwsIHJlZmVyZW5jZSwgY29uZmlndXJhdGlvblRhcmdldCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2Uoc2V0dGluZ3NVcmkpO1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzRWRpdG9yTW9kZWwsIHJlZmVyZW5jZSwgY29uZmlndXJhdGlvblRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZURlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsKGRlZmF1bHRTZXR0aW5nc1VyaTogVVJJKTogUHJvbWlzZTxEZWZhdWx0U2V0dGluZ3NFZGl0b3JNb2RlbD4ge1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IGF3YWl0IHRoaXMudGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGRlZmF1bHRTZXR0aW5nc1VyaSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5nZXRDb25maWd1cmF0aW9uVGFyZ2V0RnJvbURlZmF1bHRTZXR0aW5nc1Jlc291cmNlKGRlZmF1bHRTZXR0aW5nc1VyaSk7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwsIGRlZmF1bHRTZXR0aW5nc1VyaSwgcmVmZXJlbmNlLCB0aGlzLmdldERlZmF1bHRTZXR0aW5ncyh0YXJnZXQpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdFNldHRpbmdzKHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IERlZmF1bHRTZXR0aW5ncyB7XG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpIHtcblx0XHRcdHRoaXMuX2RlZmF1bHRXb3Jrc3BhY2VTZXR0aW5nc0NvbnRlbnRNb2RlbCA/Pz0gdGhpcy5fcmVnaXN0ZXIobmV3IERlZmF1bHRTZXR0aW5ncyh0aGlzLmdldE1vc3RDb21tb25seVVzZWRTZXR0aW5ncygpLCB0YXJnZXQsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRcdHJldHVybiB0aGlzLl9kZWZhdWx0V29ya3NwYWNlU2V0dGluZ3NDb250ZW50TW9kZWw7XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUikge1xuXHRcdFx0dGhpcy5fZGVmYXVsdEZvbGRlclNldHRpbmdzQ29udGVudE1vZGVsID8/PSB0aGlzLl9yZWdpc3RlcihuZXcgRGVmYXVsdFNldHRpbmdzKHRoaXMuZ2V0TW9zdENvbW1vbmx5VXNlZFNldHRpbmdzKCksIHRhcmdldCwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRGb2xkZXJTZXR0aW5nc0NvbnRlbnRNb2RlbDtcblx0XHR9XG5cdFx0dGhpcy5fZGVmYXVsdFVzZXJTZXR0aW5nc0NvbnRlbnRNb2RlbCA/Pz0gdGhpcy5fcmVnaXN0ZXIobmV3IERlZmF1bHRTZXR0aW5ncyh0aGlzLmdldE1vc3RDb21tb25seVVzZWRTZXR0aW5ncygpLCB0YXJnZXQsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdFVzZXJTZXR0aW5nc0NvbnRlbnRNb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRFZGl0YWJsZVNldHRpbmdzVVJJKGNvbmZpZ3VyYXRpb25UYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHJlc291cmNlPzogVVJJKTogUHJvbWlzZTxVUkkgfCBudWxsPiB7XG5cdFx0c3dpdGNoIChjb25maWd1cmF0aW9uVGFyZ2V0KSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT046XG5cdFx0XHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjpcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy51c2VyU2V0dGluZ3NSZXNvdXJjZTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URToge1xuXHRcdFx0XHRjb25zdCByZW1vdGVFbnZpcm9ubWVudCA9IGF3YWl0IHRoaXMucmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cdFx0XHRcdHJldHVybiByZW1vdGVFbnZpcm9ubWVudCA/IHJlbW90ZUVudmlyb25tZW50LnNldHRpbmdzUGF0aCA6IG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VTZXR0aW5nc1Jlc291cmNlO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldEZvbGRlclNldHRpbmdzUmVzb3VyY2UocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVTZXR0aW5nc0lmTm90RXhpc3RzKHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSAmJiB0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWcgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb247XG5cdFx0XHRpZiAoIXdvcmtzcGFjZUNvbmZpZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5yZWFkKHdvcmtzcGFjZUNvbmZpZyk7XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMocGFyc2UoY29udGVudC52YWx1ZSkpLmluZGV4T2YoJ3NldHRpbmdzJykgPT09IC0xKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHJlc291cmNlLCBbeyBwYXRoOiBbJ3NldHRpbmdzJ10sIHZhbHVlOiB7fSB9XSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuY3JlYXRlSWZOb3RFeGlzdHMocmVzb3VyY2UsIGVtcHR5RWRpdGFibGVTZXR0aW5nc0NvbnRlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVJZk5vdEV4aXN0cyhyZXNvdXJjZTogVVJJLCBjb250ZW50czogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLnJlYWQocmVzb3VyY2UsIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLndyaXRlKHJlc291cmNlLCBjb250ZW50cyk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcjIpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdmYWlsLmNyZWF0ZVNldHRpbmdzJywgXCJVbmFibGUgdG8gY3JlYXRlICd7MH0nICh7MX0pLlwiLCB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yMikpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE1vc3RDb21tb25seVVzZWRTZXR0aW5ncygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdCdlZGl0b3IuZm9udFNpemUnLFxuXHRcdFx0J2VkaXRvci5mb3JtYXRPblNhdmUnLFxuXHRcdFx0J2ZpbGVzLmF1dG9TYXZlJyxcblx0XHRcdCdlZGl0b3IuZGVmYXVsdEZvcm1hdHRlcicsXG5cdFx0XHQnZWRpdG9yLmZvbnRGYW1pbHknLFxuXHRcdFx0J2VkaXRvci53b3JkV3JhcCcsXG5cdFx0XHQnY2hhdC5hZ2VudC5tYXhSZXF1ZXN0cycsXG5cdFx0XHQnZmlsZXMuZXhjbHVkZScsXG5cdFx0XHQnd29ya2JlbmNoLmNvbG9yVGhlbWUnLFxuXHRcdFx0J2VkaXRvci50YWJTaXplJyxcblx0XHRcdCdlZGl0b3IubW91c2VXaGVlbFpvb20nLFxuXHRcdFx0J2VkaXRvci5mb3JtYXRPblBhc3RlJ1xuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJldmVhbFNldHRpbmcoc2V0dGluZ0tleTogc3RyaW5nLCBlZGl0OiBib29sZWFuLCBlZGl0b3I6IElFZGl0b3JQYW5lLCBzZXR0aW5nc1Jlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb2RlRWRpdG9yID0gZWRpdG9yID8gZ2V0Q29kZUVkaXRvcihlZGl0b3IuZ2V0Q29udHJvbCgpKSA6IG51bGw7XG5cdFx0aWYgKCFjb2RlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNldHRpbmdzTW9kZWwgPSBhd2FpdCB0aGlzLmNyZWF0ZVByZWZlcmVuY2VzRWRpdG9yTW9kZWwoc2V0dGluZ3NSZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXR0aW5nc01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gYXdhaXQgdGhpcy5nZXRQb3NpdGlvblRvUmV2ZWFsKHNldHRpbmdLZXksIGVkaXQsIHNldHRpbmdzTW9kZWwsIGNvZGVFZGl0b3IpO1xuXHRcdGlmIChwb3NpdGlvbikge1xuXHRcdFx0Y29kZUVkaXRvci5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRjb2RlRWRpdG9yLnJldmVhbFBvc2l0aW9uTmVhclRvcChwb3NpdGlvbik7XG5cdFx0XHRjb2RlRWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRpZiAoZWRpdCkge1xuXHRcdFx0XHRTdWdnZXN0Q29udHJvbGxlci5nZXQoY29kZUVkaXRvcik/LnRyaWdnZXJTdWdnZXN0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRQb3NpdGlvblRvUmV2ZWFsKHNldHRpbmdLZXk6IHN0cmluZywgZWRpdDogYm9vbGVhbiwgc2V0dGluZ3NNb2RlbDogSVByZWZlcmVuY2VzRWRpdG9yTW9kZWw8SVNldHRpbmc+LCBjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8SVBvc2l0aW9uIHwgbnVsbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBzY2hlbWEgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbc2V0dGluZ0tleV07XG5cdFx0Y29uc3QgaXNPdmVycmlkZVByb3BlcnR5ID0gT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChzZXR0aW5nS2V5KTtcblx0XHRpZiAoIXNjaGVtYSAmJiAhaXNPdmVycmlkZVByb3BlcnR5KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgcG9zaXRpb24gPSBudWxsO1xuXHRcdGNvbnN0IHR5cGUgPSBzY2hlbWE/LnR5cGUgPz8gJ29iamVjdCcgLyogVHlwZSBub3QgZGVmaW5lZCBvciBpcyBhbiBPdmVycmlkZSBJZGVudGlmaWVyICovO1xuXHRcdGxldCBzZXR0aW5nID0gc2V0dGluZ3NNb2RlbC5nZXRQcmVmZXJlbmNlKHNldHRpbmdLZXkpO1xuXHRcdGlmICghc2V0dGluZyAmJiBlZGl0KSB7XG5cdFx0XHRsZXQgZGVmYXVsdFZhbHVlID0gKHR5cGUgPT09ICdvYmplY3QnIHx8IHR5cGUgPT09ICdhcnJheScpID8gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KHNldHRpbmdLZXkpLmRlZmF1bHRWYWx1ZSA6IGdldERlZmF1bHRWYWx1ZSh0eXBlKTtcblx0XHRcdGRlZmF1bHRWYWx1ZSA9IGRlZmF1bHRWYWx1ZSA9PT0gdW5kZWZpbmVkICYmIGlzT3ZlcnJpZGVQcm9wZXJ0eSA/IHt9IDogZGVmYXVsdFZhbHVlO1xuXHRcdFx0aWYgKGRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IHNldHRpbmdzTW9kZWwgaW5zdGFuY2VvZiBXb3Jrc3BhY2VDb25maWd1cmF0aW9uRWRpdG9yTW9kZWwgPyBbJ3NldHRpbmdzJywgc2V0dGluZ0tleV0gOiBbc2V0dGluZ0tleV07XG5cdFx0XHRcdGF3YWl0IHRoaXMuanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHNldHRpbmdzTW9kZWwudXJpISwgW3sgcGF0aDoga2V5LCB2YWx1ZTogZGVmYXVsdFZhbHVlIH1dLCBmYWxzZSk7XG5cdFx0XHRcdHNldHRpbmcgPSBzZXR0aW5nc01vZGVsLmdldFByZWZlcmVuY2Uoc2V0dGluZ0tleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNldHRpbmcpIHtcblx0XHRcdGlmIChlZGl0KSB7XG5cdFx0XHRcdGlmIChpc09iamVjdChzZXR0aW5nLnZhbHVlKSB8fCBBcnJheS5pc0FycmF5KHNldHRpbmcudmFsdWUpKSB7XG5cdFx0XHRcdFx0cG9zaXRpb24gPSB7IGxpbmVOdW1iZXI6IHNldHRpbmcudmFsdWVSYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogc2V0dGluZy52YWx1ZVJhbmdlLnN0YXJ0Q29sdW1uICsgMSB9O1xuXHRcdFx0XHRcdGNvZGVFZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIENvcmVFZGl0aW5nQ29tbWFuZHMuTGluZUJyZWFrSW5zZXJ0LnJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3IsIGNvZGVFZGl0b3IsIG51bGwpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHBvc2l0aW9uID0geyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyICsgMSwgY29sdW1uOiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIgKyAxKSB9O1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0Tm9uV2hpdGVTcGFjZUNvbHVtbiA9IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdFx0aWYgKGZpcnN0Tm9uV2hpdGVTcGFjZUNvbHVtbikge1xuXHRcdFx0XHRcdFx0Ly8gTGluZSBoYXMgc29tZSB0ZXh0LiBJbnNlcnQgYW5vdGhlciBuZXcgbGluZS5cblx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2x1bW46IGZpcnN0Tm9uV2hpdGVTcGFjZUNvbHVtbiB9KTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29yZUVkaXRpbmdDb21tYW5kcy5MaW5lQnJlYWtJbnNlcnQucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgY29kZUVkaXRvciwgbnVsbCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHBvc2l0aW9uID0geyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2x1bW46IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cG9zaXRpb24gPSB7IGxpbmVOdW1iZXI6IHNldHRpbmcudmFsdWVSYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogc2V0dGluZy52YWx1ZVJhbmdlLmVuZENvbHVtbiB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwb3NpdGlvbiA9IHsgbGluZU51bWJlcjogc2V0dGluZy5rZXlSYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogc2V0dGluZy5rZXlSYW5nZS5zdGFydENvbHVtbiB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwb3NpdGlvbjtcblx0fVxuXG5cdGdldFNldHRpbmcoc2V0dGluZ0lkOiBzdHJpbmcpOiBJU2V0dGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9zZXR0aW5nc0dyb3Vwcykge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFNldHRpbmdzID0gdGhpcy5nZXREZWZhdWx0U2V0dGluZ3MoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRzQ2hhbmdlZERpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRcdGRlZmF1bHRzQ2hhbmdlZERpc3Bvc2FibGUudmFsdWUgPSBkZWZhdWx0U2V0dGluZ3Mub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZXR0aW5nc0dyb3VwcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0ZGVmYXVsdHNDaGFuZ2VkRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9zZXR0aW5nc0dyb3VwcyA9IGRlZmF1bHRTZXR0aW5ncy5nZXRTZXR0aW5nc0dyb3VwcygpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBncm91cC5zZWN0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdGlmIChjb21wYXJlSWdub3JlQ2FzZShzZXR0aW5nLmtleSwgc2V0dGluZ0lkKSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNldHRpbmc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogU2hvdWxkIGJlIG9mIHRoZSBmb3JtYXQ6XG5cdCAqIFx0Y29kZTovL3NldHRpbmdzL3NldHRpbmdOYW1lXG5cdCAqIEV4YW1wbGVzOlxuXHQgKiBcdGNvZGU6Ly9zZXR0aW5ncy9maWxlcy5hdXRvU2F2ZVxuXHQgKlxuXHQgKi9cblx0YXN5bmMgaGFuZGxlVVJMKHVyaTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGNvbXBhcmVJZ25vcmVDYXNlKHVyaS5hdXRob3JpdHksIFNFVFRJTkdTX0FVVEhPUklUWSkgIT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXR0aW5nSW5mbyA9IHVyaS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKHBhcnQgPT4gISFwYXJ0KTtcblx0XHRjb25zdCBzZXR0aW5nSWQgPSAoKHNldHRpbmdJbmZvLmxlbmd0aCA+IDApID8gc2V0dGluZ0luZm9bMF0gOiB1bmRlZmluZWQpO1xuXHRcdGlmICghc2V0dGluZ0lkKSB7XG5cdFx0XHR0aGlzLm9wZW5TZXR0aW5ncygpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0bGV0IHNldHRpbmcgPSB0aGlzLmdldFNldHRpbmcoc2V0dGluZ0lkKTtcblxuXHRcdGlmICghc2V0dGluZyAmJiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIHdhaXQgZm9yIGV4dGVuc2lvbiBwb2ludHMgdG8gYmUgcHJvY2Vzc2VkXG5cdFx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3cgfSwgKCkgPT4gRXZlbnQudG9Qcm9taXNlKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyRXh0ZW5zaW9ucykpO1xuXHRcdFx0c2V0dGluZyA9IHRoaXMuZ2V0U2V0dGluZyhzZXR0aW5nSWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wZW5TZXR0aW5nc09wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zID0ge307XG5cdFx0aWYgKHNldHRpbmcpIHtcblx0XHRcdG9wZW5TZXR0aW5nc09wdGlvbnMucXVlcnkgPSBzZXR0aW5nSWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5vcGVuU2V0dGluZ3Mob3BlblNldHRpbmdzT3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY2FjaGVkU2V0dGluZ3NFZGl0b3IySW5wdXQgJiYgIXRoaXMuX2NhY2hlZFNldHRpbmdzRWRpdG9yMklucHV0LmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0dGhpcy5fY2FjaGVkU2V0dGluZ3NFZGl0b3IySW5wdXQuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpc3Bvc2UuZmlyZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJUHJlZmVyZW5jZXNTZXJ2aWNlLCBQcmVmZXJlbmNlc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUF5Qix5QkFBeUI7QUFDM0QsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFrQztBQUUzQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLFNBQVM7QUFDckIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsWUFBWSxpQkFBeUMsK0JBQStCO0FBQzdGLFNBQTZCLDJCQUEyQjtBQUN4RCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsa0NBQStDO0FBRXhELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCLDRCQUE0QjtBQUNyRCxTQUFTLGNBQWMsZ0JBQWdCLGFBQTZCLGtCQUFrQjtBQUN0RixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGlDQUFpQyxzQkFBNEgscUJBQXVFLG9CQUFvQix3QkFBd0IscUNBQXFDO0FBQzlULFNBQVMsd0JBQXdCLDRCQUE0QjtBQUM3RCxTQUFTLDRCQUE0QiwrQkFBK0IsK0JBQStCLGlCQUFpQiw0QkFBNEIsc0JBQXNCLHFCQUFxQix5Q0FBeUM7QUFDcE8sU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLG9DQUFvQztBQUU3QyxNQUFNLCtCQUErQjtBQUU5QixJQUFNLHFCQUFOLGNBQWlDLFdBQTBDO0FBQUEsRUFvQmpGLFlBQ2tDLGVBQ00sb0JBQ0osaUJBQ0ssc0JBQ0QscUJBQ0ksZ0JBQ0gsc0JBQ0Usd0JBQ0MseUJBQ1AsMEJBQ2hCLG1CQUNMLGNBQ3VCLG9CQUNOLGNBQ00sb0JBQ0QsbUJBQ3hCLFlBQ3VCLGtCQUNELGlCQUNZLG9CQUM5QztBQUNELFVBQU07QUFyQjJCO0FBQ007QUFDSjtBQUNLO0FBQ0Q7QUFDSTtBQUNIO0FBQ0U7QUFDQztBQUNQO0FBR0U7QUFDTjtBQUNNO0FBQ0Q7QUFFRDtBQUNEO0FBQ1k7QUFwQ2hELFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBRWhFLFNBQWlCLHNDQUFzQyxLQUFLLFVBQVUsSUFBSSxRQUFhLENBQUM7QUFDeEYsU0FBUyxxQ0FBcUMsS0FBSyxvQ0FBb0M7QUFRdkYsU0FBaUIsNEJBQTRCLElBQUksWUFBWTtBQUU3RCxTQUFRLGtCQUFnRDtBQUN4RCxTQUFRLDhCQUFnRTtBQXVDeEUsU0FBUyw2QkFBNkIsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFFBQVEsUUFBUSxXQUFXLG1CQUFtQixNQUFNLG9CQUFvQixDQUFDO0FBQzFJLFNBQWlCLDZCQUE2QixJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsUUFBUSxRQUFRLFdBQVcsbUJBQW1CLE1BQU0seUJBQXlCLENBQUM7QUFidEosU0FBSyxVQUFVLGtCQUFrQix1QkFBdUIsTUFBTTtBQUM3RCxZQUFNLFFBQVEsYUFBYSxTQUFTLEtBQUssMEJBQTBCO0FBQ25FLFVBQUksQ0FBQyxPQUFPO0FBRVg7QUFBQSxNQUNEO0FBQ0EsbUJBQWEsWUFBWSxPQUFPLDJCQUEyQixpQkFBaUIsQ0FBQztBQUFBLElBQzlFLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxXQUFXLGdCQUFnQixJQUFJLENBQUM7QUFBQSxFQUNoRDtBQUFBLEVBS0EsSUFBSSx1QkFBNEI7QUFDL0IsV0FBTyxLQUFLLHVCQUF1QixlQUFlO0FBQUEsRUFDbkQ7QUFBQSxFQUVBLElBQUksNEJBQXdDO0FBQzNDLFFBQUksS0FBSyxlQUFlLGtCQUFrQixNQUFNLGVBQWUsT0FBTztBQUNyRSxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sWUFBWSxLQUFLLGVBQWUsYUFBYTtBQUNuRCxXQUFPLFVBQVUsaUJBQWlCLFVBQVUsUUFBUSxDQUFDLEVBQUUsV0FBVyxvQkFBb0I7QUFBQSxFQUN2RjtBQUFBLEVBRVEsd0NBQThEO0FBQ3JFLFFBQUksQ0FBQyxLQUFLLCtCQUErQixLQUFLLDRCQUE0QixXQUFXLEdBQUc7QUFHdkYsV0FBSyw4QkFBOEIsSUFBSSxxQkFBcUIsSUFBSTtBQUFBLElBQ2pFO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsMEJBQTBCLFVBQTJCO0FBQ3BELFVBQU0sU0FBUyxLQUFLLGVBQWUsbUJBQW1CLFFBQVE7QUFDOUQsV0FBTyxTQUFTLE9BQU8sV0FBVyxvQkFBb0IsSUFBSTtBQUFBLEVBQzNEO0FBQUEsRUFFQSwwQkFBMEIsS0FBbUI7QUFDNUMsV0FBTyxLQUFLLDBCQUEwQixHQUFHLEtBQUssUUFBUSxLQUFLLEtBQUssMEJBQTBCLEtBQUssUUFBUSxLQUFLLEtBQUssMEJBQTBCO0FBQUEsRUFDNUk7QUFBQSxFQUVBLDBCQUEwQixLQUE4QjtBQUN2RCxRQUFJLEtBQUssMEJBQTBCLEdBQUcsR0FBRztBQUl4QyxZQUFNLFNBQVMsS0FBSyxrREFBa0QsR0FBRztBQUN6RSxZQUFNLGtCQUFrQixLQUFLLG1CQUFtQixNQUFNO0FBRXRELFVBQUksQ0FBQyxLQUFLLDBCQUEwQixJQUFJLEdBQUcsR0FBRztBQUM3QyxhQUFLLFVBQVUsZ0JBQWdCLFlBQVksTUFBTSxLQUFLLG9DQUFvQyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0FBQ3BHLGFBQUssMEJBQTBCLElBQUksR0FBRztBQUFBLE1BQ3ZDO0FBQ0EsYUFBTyxnQkFBZ0Isa0NBQWtDLElBQUk7QUFBQSxJQUM5RDtBQUVBLFFBQUksUUFBUSxLQUFLLEtBQUssMEJBQTBCLEdBQUc7QUFDbEQsVUFBSSxDQUFDLEtBQUssZ0NBQWdDO0FBQ3pDLGFBQUssaUNBQWlDLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLCtCQUErQixLQUFLLG1CQUFtQixvQkFBb0IsVUFBVSxDQUFDLENBQUM7QUFDckwsYUFBSyxVQUFVLEtBQUssK0JBQStCLG9CQUFvQixNQUFNLEtBQUssb0NBQW9DLEtBQUssR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNqSTtBQUNBLGFBQU8sS0FBSywrQkFBK0I7QUFBQSxJQUM1QztBQUVBLFFBQUksUUFBUSxLQUFLLEtBQUssMEJBQTBCLEdBQUc7QUFDbEQsWUFBTSxnQ0FBZ0MsS0FBSyxxQkFBcUIsZUFBZSwrQkFBK0IsR0FBRztBQUNqSCxhQUFPLDhCQUE4QjtBQUFBLElBQ3RDO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWEsNkJBQTZCLEtBQTZEO0FBQ3RHLFFBQUksS0FBSywwQkFBMEIsR0FBRyxHQUFHO0FBQ3hDLGFBQU8sS0FBSyxpQ0FBaUMsR0FBRztBQUFBLElBQ2pEO0FBRUEsUUFBSSxLQUFLLHFCQUFxQixTQUFTLE1BQU0sSUFBSSxTQUFTLEtBQUssS0FBSyx3QkFBd0IsZUFBZSxpQkFBaUIsU0FBUyxNQUFNLElBQUksU0FBUyxHQUFHO0FBQzFKLGFBQU8sS0FBSyxrQ0FBa0Msb0JBQW9CLFlBQVksR0FBRztBQUFBLElBQ2xGO0FBRUEsVUFBTSx1QkFBdUIsTUFBTSxLQUFLLHVCQUF1QixvQkFBb0IsU0FBUztBQUM1RixRQUFJLHdCQUF3QixxQkFBcUIsU0FBUyxNQUFNLElBQUksU0FBUyxHQUFHO0FBQy9FLGFBQU8sS0FBSyxrQ0FBa0Msb0JBQW9CLFdBQVcsb0JBQW9CO0FBQUEsSUFDbEc7QUFFQSxRQUFJLEtBQUssZUFBZSxrQkFBa0IsTUFBTSxlQUFlLFdBQVc7QUFDekUsWUFBTSxjQUFjLE1BQU0sS0FBSyx1QkFBdUIsb0JBQW9CLGtCQUFrQixHQUFHO0FBQy9GLFVBQUksZUFBZSxZQUFZLFNBQVMsTUFBTSxJQUFJLFNBQVMsR0FBRztBQUM3RCxlQUFPLEtBQUssa0NBQWtDLG9CQUFvQixrQkFBa0IsR0FBRztBQUFBLE1BQ3hGO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQW9CLE1BQU0sS0FBSyxtQkFBbUIsZUFBZTtBQUN2RSxVQUFNLG9CQUFvQixvQkFBb0Isa0JBQWtCLGVBQWU7QUFDL0UsUUFBSSxxQkFBcUIsa0JBQWtCLFNBQVMsTUFBTSxJQUFJLFNBQVMsR0FBRztBQUN6RSxhQUFPLEtBQUssa0NBQWtDLG9CQUFvQixhQUFhLEdBQUc7QUFBQSxJQUNuRjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSx5QkFBMkQ7QUFDMUQsV0FBTyxLQUFLLGNBQWMsV0FBVyxFQUFFLFVBQVUsS0FBSywyQkFBMkIsQ0FBQztBQUFBLEVBQ25GO0FBQUEsRUFFQSxzQkFBd0Q7QUFDdkQsV0FBTyxLQUFLLGNBQWMsV0FBVyxFQUFFLFVBQVUsS0FBSyxxQkFBcUIsQ0FBQztBQUFBLEVBQzdFO0FBQUEsRUFFUSwwQkFBbUM7QUFDMUMsV0FBTyxLQUFLLHFCQUFxQixTQUFTLDJCQUEyQixNQUFNO0FBQUEsRUFDNUU7QUFBQSxFQUVBLE1BQU0sa0JBQWlDO0FBQ3RDLFVBQU0sS0FBSyxjQUFjLFdBQVcsS0FBSyxxQkFBcUIsZUFBZSxzQkFBc0IsR0FBRyxRQUFXLFdBQVc7QUFBQSxFQUM3SDtBQUFBLEVBRUEsYUFBYSxVQUFnQyxDQUFDLEdBQXFDO0FBQ2xGLGNBQVU7QUFBQSxNQUNULEdBQUc7QUFBQSxNQUNILFFBQVEsb0JBQW9CO0FBQUEsSUFDN0I7QUFDQSxRQUFJLFFBQVEsT0FBTztBQUNsQixjQUFRLGFBQWE7QUFBQSxJQUN0QjtBQUVBLFdBQU8sS0FBSyxLQUFLLEtBQUssc0JBQXNCLE9BQU87QUFBQSxFQUNwRDtBQUFBLEVBRUEsNkJBQTZCLFlBQW9CLFVBQWdDLENBQUMsR0FBcUM7QUFDdEgsUUFBSSxLQUFLLHdCQUF3QixHQUFHO0FBQ25DLGNBQVEsUUFBUTtBQUNoQixjQUFRLGdCQUFnQixFQUFFLEtBQUssSUFBSSxVQUFVLEtBQUssTUFBTSxLQUFLO0FBQUEsSUFDOUQsT0FBTztBQUNOLGNBQVEsUUFBUSxTQUFTLFVBQVUsR0FBRyxRQUFRLFFBQVEsSUFBSSxRQUFRLEtBQUssS0FBSyxFQUFFO0FBQUEsSUFDL0U7QUFDQSxZQUFRLFNBQVMsUUFBUSxVQUFVLG9CQUFvQjtBQUV2RCxXQUFPLEtBQUssS0FBSyxLQUFLLHNCQUFzQixPQUFPO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLEtBQUssa0JBQXVCLFNBQWlFO0FBQ3BHLGNBQVU7QUFBQSxNQUNULEdBQUc7QUFBQSxNQUNILFlBQVksUUFBUSxjQUFjLEtBQUssd0JBQXdCO0FBQUEsSUFDaEU7QUFFQSxRQUFJLFFBQVEsY0FBYyxRQUFRLFNBQVMsQ0FBQyxRQUFRLGVBQWU7QUFDbEUsWUFBTSxRQUFRLFFBQVEsTUFBTSxLQUFLO0FBQ2pDLFlBQU0sVUFBVSxNQUFNLE1BQU0sWUFBWTtBQUN4QyxVQUFJO0FBQ0osVUFBSSxTQUFTO0FBQ1osY0FBTSxRQUFRLENBQUMsRUFBRSxLQUFLO0FBQUEsTUFDdkIsV0FBVyxTQUFTLEdBQTJCLFdBQVcsYUFBYSxFQUFFLDJCQUEyQixFQUFFLE1BQU0sS0FBSyxDQUFDLEdBQUc7QUFDcEgsY0FBTSxNQUFNLEtBQUs7QUFBQSxNQUNsQjtBQUNBLGNBQVEsUUFBUTtBQUNoQixVQUFJLEtBQUs7QUFDUixnQkFBUSxnQkFBZ0IsRUFBRSxJQUFJO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBRUEsV0FBTyxRQUFRLGFBQ2QsS0FBSyxpQkFBaUIsa0JBQWtCLE9BQU8sSUFDL0MsS0FBSyxjQUFjLE9BQU87QUFBQSxFQUM1QjtBQUFBLEVBRUEsTUFBYyxjQUFjLFNBQWlFO0FBQzVGLFVBQU0sUUFBUSxLQUFLLHNDQUFzQztBQUN6RCxjQUFVO0FBQUEsTUFDVCxHQUFHO0FBQUEsTUFDSCxhQUFhO0FBQUEsSUFDZDtBQUNBLFVBQU0sUUFBUSxLQUFLLDBCQUEwQixPQUFPO0FBQ3BELFdBQU8sS0FBSyxjQUFjLFdBQVcsT0FBTyw4QkFBOEIsT0FBTyxHQUFHLEtBQUs7QUFBQSxFQUMxRjtBQUFBLEVBRUEsd0JBQXdCLFVBQWdDLENBQUMsR0FBcUM7QUFDN0YsY0FBVTtBQUFBLE1BQ1QsR0FBRztBQUFBLE1BQ0gsUUFBUSxvQkFBb0I7QUFBQSxJQUM3QjtBQUNBLFdBQU8sS0FBSyxLQUFLLEtBQUssd0JBQXdCLGVBQWUsa0JBQWtCLE9BQU87QUFBQSxFQUN2RjtBQUFBLEVBRUEsaUJBQWlCLFVBQWdDLENBQUMsR0FBcUM7QUFDdEYsY0FBVTtBQUFBLE1BQ1QsR0FBRztBQUFBLE1BQ0gsUUFBUSxvQkFBb0I7QUFBQSxJQUM3QjtBQUNBLFdBQU8sS0FBSyxLQUFLLEtBQUssc0JBQXNCLE9BQU87QUFBQSxFQUNwRDtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsVUFBZ0MsQ0FBQyxHQUFxQztBQUM5RixVQUFNLGNBQWMsTUFBTSxLQUFLLG1CQUFtQixlQUFlO0FBQ2pFLFFBQUksYUFBYTtBQUNoQixnQkFBVTtBQUFBLFFBQ1QsR0FBRztBQUFBLFFBQ0gsUUFBUSxvQkFBb0I7QUFBQSxNQUM3QjtBQUVBLFdBQUssS0FBSyxZQUFZLGNBQWMsT0FBTztBQUFBLElBQzVDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLHNCQUFzQixVQUFnQyxDQUFDLEdBQXFDO0FBQzNGLFFBQUksQ0FBQyxLQUFLLDJCQUEyQjtBQUNwQyxXQUFLLG9CQUFvQixLQUFLLElBQUksU0FBUyxtQkFBbUIsMEVBQTBFLENBQUM7QUFDekksYUFBTyxRQUFRLE9BQU8sSUFBSTtBQUFBLElBQzNCO0FBRUEsY0FBVTtBQUFBLE1BQ1QsR0FBRztBQUFBLE1BQ0gsUUFBUSxvQkFBb0I7QUFBQSxJQUM3QjtBQUNBLFdBQU8sS0FBSyxLQUFLLEtBQUssMkJBQTJCLE9BQU87QUFBQSxFQUN6RDtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsVUFBZ0MsQ0FBQyxHQUFxQztBQUM5RixjQUFVO0FBQUEsTUFDVCxHQUFHO0FBQUEsTUFDSCxRQUFRLG9CQUFvQjtBQUFBLElBQzdCO0FBRUEsUUFBSSxDQUFDLFFBQVEsV0FBVztBQUN2QixZQUFNLElBQUksTUFBTSxvQkFBb0I7QUFBQSxJQUNyQztBQUVBLFVBQU0sb0JBQW9CLE1BQU0sS0FBSyx1QkFBdUIsb0JBQW9CLGtCQUFrQixRQUFRLFNBQVM7QUFDbkgsUUFBSSxDQUFDLG1CQUFtQjtBQUN2QixZQUFNLElBQUksTUFBTSx3QkFBd0IsUUFBUSxVQUFVLFNBQVMsQ0FBQyxFQUFFO0FBQUEsSUFDdkU7QUFFQSxXQUFPLEtBQUssS0FBSyxtQkFBbUIsT0FBTztBQUFBLEVBQzVDO0FBQUEsRUFFQSxNQUFNLDZCQUE2QixTQUFrQixTQUF3RDtBQUM1RyxjQUFVLEVBQUUsUUFBUSxNQUFNLGdCQUFnQixNQUFNLEdBQUcsUUFBUTtBQUMzRCxRQUFJLFNBQVM7QUFDWixZQUFNLGdCQUFnQixRQUFRLElBQUksU0FBUywwQkFBMEIsK0RBQStELElBQUk7QUFDeEksWUFBTSxzQkFBc0IsS0FBSyx1QkFBdUIsZUFBZTtBQUN2RSxZQUFNLHlCQUF5QixDQUFDLENBQUMsS0FBSyxxQkFBcUIsU0FBUywyQ0FBMkM7QUFHL0csWUFBTSxLQUFLLGtCQUFrQixxQkFBcUIsYUFBYTtBQUMvRCxVQUFJLHdCQUF3QjtBQUMzQixjQUFNLGdCQUFnQixRQUFRLFdBQVcsS0FBSyxtQkFBbUIsWUFBWTtBQUM3RSxjQUFNLGtCQUFrQixLQUFLLG1CQUFtQixTQUFTLGVBQWUsZUFBZSxLQUFLO0FBQzVGLGNBQU0sUUFBUSxJQUFJO0FBQUEsVUFDakIsS0FBSyxjQUFjLFdBQVcsRUFBRSxVQUFVLEtBQUssNEJBQTRCLFNBQVMsRUFBRSxRQUFRLE1BQU0sZUFBZSxNQUFNLGdCQUFnQixNQUFNLFVBQVUsMkJBQTJCLEdBQUcsR0FBRyxPQUFPLElBQUksU0FBUyxzQkFBc0IscUJBQXFCLEdBQUcsYUFBYSxHQUFHLEdBQUcsYUFBYTtBQUFBLFVBQzVSLEtBQUssY0FBYyxXQUFXLEVBQUUsVUFBVSxxQkFBcUIsUUFBUSxHQUFHLGdCQUFnQixFQUFFO0FBQUEsUUFDN0YsQ0FBQztBQUFBLE1BQ0YsT0FBTztBQUNOLGNBQU0sS0FBSyxjQUFjLFdBQVcsRUFBRSxVQUFVLHFCQUFxQixRQUFRLEdBQUcsS0FBSywwQkFBMEIsT0FBTyxDQUFDO0FBQUEsTUFDeEg7QUFBQSxJQUVELE9BQU87QUFDTixZQUFNLFFBQVEsS0FBSywwQkFBMEIsT0FBTztBQUNwRCxZQUFNLFNBQVUsTUFBTSxLQUFLLGNBQWMsV0FBVyxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixHQUFHLEVBQUUsR0FBRyxRQUFRLEdBQUcsS0FBSztBQUMzSSxVQUFJLFFBQVEsT0FBTztBQUNsQixlQUFPLE9BQU8sUUFBUSxLQUFLO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBQUEsRUFFRDtBQUFBLEVBRUEsNkJBQStEO0FBQzlELFdBQU8sS0FBSyxjQUFjLFdBQVcsRUFBRSxVQUFVLEtBQUssNEJBQTRCLE9BQU8sSUFBSSxTQUFTLHNCQUFzQixxQkFBcUIsRUFBRSxDQUFDO0FBQUEsRUFDcko7QUFBQSxFQUVRLDBCQUEwQixTQUFxRTtBQVF0RyxRQUFJLFNBQVMsWUFBWSxVQUFhLENBQUMsUUFBUSxZQUFZO0FBQzFELFlBQU0sUUFBUSxLQUFLLG1CQUFtQixTQUFTLFFBQVEsT0FBTztBQUM5RCxVQUFJLE9BQU87QUFDVixjQUFNLGtCQUFrQixLQUFLLG1CQUFtQjtBQUNoRCxZQUFJLGlCQUFpQixPQUFPLEtBQUssZ0JBQWMsV0FBVyxPQUFPLE1BQU0sRUFBRSxHQUFHO0FBQzNFLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFFBQ0MsS0FBSyxxQkFBcUIsU0FBaUIsMkJBQTJCLE1BQU07QUFBQSxJQUM1RSxDQUFDLEtBQUssbUJBQW1CLHlCQUF5QixDQUFDLEtBQUssbUJBQW1CLDJCQUMxRTtBQUNELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxRQUFRLFlBQVk7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFNBQVMsWUFBWSxRQUFXO0FBQ25DLGFBQU8sS0FBSyxtQkFBbUIsU0FBUyxRQUFRLE9BQU8sS0FBSyxLQUFLLG1CQUFtQjtBQUFBLElBQ3JGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLFVBQWUsU0FBaUU7QUFDOUcsVUFBTSxRQUFRLEtBQUssMEJBQTBCLE9BQU87QUFDcEQsVUFBTSxTQUFTLE1BQU0sS0FBSyxtQkFBbUIsVUFBVSxTQUFTLEtBQUs7QUFDckUsUUFBSSxVQUFVLFNBQVMsZUFBZTtBQUNyQyxZQUFNLEtBQUssY0FBYyxRQUFRLGNBQWMsS0FBSyxDQUFDLENBQUMsUUFBUSxjQUFjLE1BQU0sUUFBUSxRQUFRO0FBQUEsSUFDbkc7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxtQkFBbUIsVUFBZSxTQUFpQyxPQUF5RDtBQUN6SSxVQUFNLGdCQUFnQixDQUFDLENBQUMsS0FBSyxxQkFBcUIsU0FBUyxzQkFBc0I7QUFDakYsVUFBTSxzQkFBc0IsQ0FBQyxDQUFDLEtBQUsscUJBQXFCLFNBQVMsK0JBQStCO0FBQ2hHLFFBQUksaUJBQWlCLHFCQUFxQjtBQUN6QyxhQUFPLEtBQUssZ0JBQWdCLFVBQVUsU0FBUyxLQUFLO0FBQUEsSUFDckQ7QUFFQSxVQUFNLHNCQUFzQixTQUFTLFVBQVUsb0JBQW9CO0FBQ25FLFVBQU0sOEJBQThCLE1BQU0sS0FBSyx1Q0FBdUMscUJBQXFCLFFBQVE7QUFDbkgsY0FBVSxFQUFFLEdBQUcsU0FBUyxRQUFRLEtBQUs7QUFDckMsV0FBTyxNQUFNLEtBQUssY0FBYyxXQUFXLDZCQUE2QixFQUFFLEdBQUcsOEJBQThCLE9BQU8sRUFBRSxHQUFHLEtBQUs7QUFBQSxFQUM3SDtBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsVUFBZSxVQUFrQyxDQUFDLEdBQUcsT0FBMEQ7QUFDNUksVUFBTSxzQkFBc0IsUUFBUSxVQUFVLG9CQUFvQjtBQUNsRSxVQUFNLEtBQUssMEJBQTBCLHFCQUFxQixRQUFRO0FBQ2xFLFVBQU0seUJBQXlCLEtBQUssMkJBQTJCLHFCQUFxQixRQUFRO0FBQzVGLGNBQVUsRUFBRSxHQUFHLFNBQVMsUUFBUSxLQUFLO0FBQ3JDLFdBQU8sS0FBSyxjQUFjLFdBQVcsd0JBQXdCLDhCQUE4QixPQUFPLEdBQUcsS0FBSztBQUFBLEVBQzNHO0FBQUEsRUFFTywyQkFBMkIscUJBQTBDLFVBQTRCO0FBQ3ZHLFVBQU0sOEJBQThCLEtBQUssa0JBQWtCLGlCQUFpQixFQUFFLFNBQVMsQ0FBQztBQUN4RixVQUFNLGdDQUFnQyxLQUFLLGtCQUFrQixpQkFBaUIsRUFBRSxVQUFVLEtBQUssMkJBQTJCLG1CQUFtQixFQUFFLENBQUM7QUFDaEosV0FBTyxLQUFLLHFCQUFxQixlQUFlLHVCQUF1Qiw0QkFBNEIsUUFBUSxHQUFHLFFBQVcsK0JBQStCLDJCQUEyQjtBQUFBLEVBQ3BMO0FBQUEsRUFFTyw2QkFBbUQ7QUFDekQsV0FBTyxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixLQUFLLG1CQUFtQixvQkFBb0IsVUFBVSxDQUFDO0FBQUEsRUFDOUg7QUFBQSxFQUVRLGtEQUFrRCxLQUFVO0FBQ25FLFdBQU8sS0FBSyxtQ0FBbUMsR0FBRyxJQUNqRCxvQkFBb0IsWUFDcEIsS0FBSyxnQ0FBZ0MsR0FBRyxJQUN2QyxvQkFBb0IsbUJBQ3BCLG9CQUFvQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSwwQkFBMEIsS0FBbUI7QUFDcEQsV0FBTyxLQUFLLDhCQUE4QixHQUFHLEtBQUssS0FBSyxtQ0FBbUMsR0FBRyxLQUFLLEtBQUssZ0NBQWdDLEdBQUc7QUFBQSxFQUMzSTtBQUFBLEVBRVEsOEJBQThCLEtBQW1CO0FBQ3hELFdBQU8sSUFBSSxjQUFjLHFCQUFxQixJQUFJLFdBQVcsUUFBUSxRQUFRLFVBQVUsQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLDJCQUEyQjtBQUFBLEVBQ3BJO0FBQUEsRUFFUSxtQ0FBbUMsS0FBbUI7QUFDN0QsV0FBTyxJQUFJLGNBQWMscUJBQXFCLElBQUksV0FBVyxRQUFRLFFBQVEsVUFBVSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sb0NBQW9DO0FBQUEsRUFDN0k7QUFBQSxFQUVRLGdDQUFnQyxLQUFtQjtBQUMxRCxXQUFPLElBQUksY0FBYyxxQkFBcUIsSUFBSSxXQUFXLFFBQVEsUUFBUSxVQUFVLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxtQ0FBbUM7QUFBQSxFQUM1STtBQUFBLEVBRVEsMkJBQTJCLHFCQUErQztBQUNqRixZQUFRLHFCQUFxQjtBQUFBLE1BQzVCLEtBQUssb0JBQW9CO0FBQ3hCLGVBQU8sSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFFBQVEsUUFBUSxXQUFXLG1CQUFtQixNQUFNLDBCQUEwQixDQUFDO0FBQUEsTUFDbEgsS0FBSyxvQkFBb0I7QUFDeEIsZUFBTyxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsUUFBUSxRQUFRLFdBQVcsbUJBQW1CLE1BQU0seUJBQXlCLENBQUM7QUFBQSxJQUNsSDtBQUNBLFdBQU8sSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFFBQVEsUUFBUSxXQUFXLG1CQUFtQixNQUFNLGlCQUFpQixDQUFDO0FBQUEsRUFDekc7QUFBQSxFQUVBLE1BQWMsdUNBQXVDLFFBQTZCLFVBQXFDO0FBQ3RILFVBQU0sS0FBSywwQkFBMEIsUUFBUSxRQUFRO0FBQ3JELFdBQU8sS0FBSyxrQkFBa0IsaUJBQWlCLEVBQUUsU0FBUyxDQUFDO0FBQUEsRUFDNUQ7QUFBQSxFQUVBLE1BQWMsa0NBQWtDLHFCQUEwQyxhQUFnRDtBQUN6SSxVQUFNLFlBQVksS0FBSyxlQUFlLGFBQWE7QUFDbkQsUUFBSSxVQUFVLGlCQUFpQixVQUFVLGNBQWMsU0FBUyxNQUFNLFlBQVksU0FBUyxHQUFHO0FBQzdGLFlBQU1BLGFBQVksTUFBTSxLQUFLLHlCQUF5QixxQkFBcUIsV0FBVztBQUN0RixhQUFPLEtBQUsscUJBQXFCLGVBQWUsbUNBQW1DQSxZQUFXLG1CQUFtQjtBQUFBLElBQ2xIO0FBRUEsVUFBTSxZQUFZLE1BQU0sS0FBSyx5QkFBeUIscUJBQXFCLFdBQVc7QUFDdEYsV0FBTyxLQUFLLHFCQUFxQixlQUFlLHFCQUFxQixXQUFXLG1CQUFtQjtBQUFBLEVBQ3BHO0FBQUEsRUFFQSxNQUFjLGlDQUFpQyxvQkFBOEQ7QUFDNUcsVUFBTSxZQUFZLE1BQU0sS0FBSyx5QkFBeUIscUJBQXFCLGtCQUFrQjtBQUM3RixVQUFNLFNBQVMsS0FBSyxrREFBa0Qsa0JBQWtCO0FBQ3hGLFdBQU8sS0FBSyxxQkFBcUIsZUFBZSw0QkFBNEIsb0JBQW9CLFdBQVcsS0FBSyxtQkFBbUIsTUFBTSxDQUFDO0FBQUEsRUFDM0k7QUFBQSxFQUVRLG1CQUFtQixRQUE4QztBQUN4RSxRQUFJLFdBQVcsb0JBQW9CLFdBQVc7QUFDN0MsV0FBSywwQ0FBMEMsS0FBSyxVQUFVLElBQUksZ0JBQWdCLEtBQUssNEJBQTRCLEdBQUcsUUFBUSxLQUFLLG9CQUFvQixDQUFDO0FBQ3hKLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxRQUFJLFdBQVcsb0JBQW9CLGtCQUFrQjtBQUNwRCxXQUFLLHVDQUF1QyxLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsS0FBSyw0QkFBNEIsR0FBRyxRQUFRLEtBQUssb0JBQW9CLENBQUM7QUFDckosYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFNBQUsscUNBQXFDLEtBQUssVUFBVSxJQUFJLGdCQUFnQixLQUFLLDRCQUE0QixHQUFHLFFBQVEsS0FBSyxvQkFBb0IsQ0FBQztBQUNuSixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFhLHVCQUF1QixxQkFBMEMsVUFBcUM7QUFDbEgsWUFBUSxxQkFBcUI7QUFBQSxNQUM1QixLQUFLLG9CQUFvQjtBQUN4QixlQUFPLEtBQUssd0JBQXdCLGVBQWU7QUFBQSxNQUNwRCxLQUFLLG9CQUFvQjtBQUFBLE1BQ3pCLEtBQUssb0JBQW9CO0FBQ3hCLGVBQU8sS0FBSztBQUFBLE1BQ2IsS0FBSyxvQkFBb0IsYUFBYTtBQUNyQyxjQUFNLG9CQUFvQixNQUFNLEtBQUssbUJBQW1CLGVBQWU7QUFDdkUsZUFBTyxvQkFBb0Isa0JBQWtCLGVBQWU7QUFBQSxNQUM3RDtBQUFBLE1BQ0EsS0FBSyxvQkFBb0I7QUFDeEIsZUFBTyxLQUFLO0FBQUEsTUFDYixLQUFLLG9CQUFvQjtBQUN4QixZQUFJLFVBQVU7QUFDYixpQkFBTyxLQUFLLDBCQUEwQixRQUFRO0FBQUEsUUFDL0M7QUFBQSxJQUNGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsMEJBQTBCLFFBQTZCLFVBQThCO0FBQ2xHLFFBQUksS0FBSyxlQUFlLGtCQUFrQixNQUFNLGVBQWUsYUFBYSxXQUFXLG9CQUFvQixXQUFXO0FBQ3JILFlBQU0sa0JBQWtCLEtBQUssZUFBZSxhQUFhLEVBQUU7QUFDM0QsVUFBSSxDQUFDLGlCQUFpQjtBQUNyQjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFVBQVUsTUFBTSxLQUFLLGdCQUFnQixLQUFLLGVBQWU7QUFDL0QsVUFBSSxPQUFPLEtBQUssTUFBTSxRQUFRLEtBQUssQ0FBQyxFQUFFLFFBQVEsVUFBVSxNQUFNLElBQUk7QUFDakUsY0FBTSxLQUFLLG1CQUFtQixNQUFNLFVBQVUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUk7QUFBQSxNQUN4RjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxLQUFLLGtCQUFrQixVQUFVLDRCQUE0QjtBQUFBLEVBQ3BFO0FBQUEsRUFFQSxNQUFjLGtCQUFrQixVQUFlLFVBQWlDO0FBQy9FLFFBQUk7QUFDSCxZQUFNLEtBQUssZ0JBQWdCLEtBQUssVUFBVSxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFBQSxJQUNuRSxTQUFTLE9BQU87QUFDZixVQUF5QixNQUFPLHdCQUF3QixvQkFBb0IsZ0JBQWdCO0FBQzNGLFlBQUk7QUFDSCxnQkFBTSxLQUFLLGdCQUFnQixNQUFNLFVBQVUsUUFBUTtBQUNuRDtBQUFBLFFBQ0QsU0FBUyxRQUFRO0FBQ2hCLGdCQUFNLElBQUksTUFBTSxJQUFJLFNBQVMsdUJBQXVCLGlDQUFpQyxLQUFLLGFBQWEsWUFBWSxVQUFVLEVBQUUsVUFBVSxLQUFLLENBQUMsR0FBRyxnQkFBZ0IsTUFBTSxDQUFDLENBQUM7QUFBQSxRQUMzSztBQUFBLE1BQ0QsT0FBTztBQUNOLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFFRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDhCQUF3QztBQUMvQyxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsY0FBYyxZQUFvQixNQUFlLFFBQXFCLGtCQUFzQztBQUN6SCxVQUFNLGFBQWEsU0FBUyxjQUFjLE9BQU8sV0FBVyxDQUFDLElBQUk7QUFDakUsUUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxnQkFBZ0IsTUFBTSxLQUFLLDZCQUE2QixnQkFBZ0I7QUFDOUUsUUFBSSxDQUFDLGVBQWU7QUFDbkI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLE1BQU0sS0FBSyxvQkFBb0IsWUFBWSxNQUFNLGVBQWUsVUFBVTtBQUMzRixRQUFJLFVBQVU7QUFDYixpQkFBVyxZQUFZLFFBQVE7QUFDL0IsaUJBQVcsc0JBQXNCLFFBQVE7QUFDekMsaUJBQVcsTUFBTTtBQUNqQixVQUFJLE1BQU07QUFDVCwwQkFBa0IsSUFBSSxVQUFVLEdBQUcsZUFBZTtBQUFBLE1BQ25EO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsb0JBQW9CLFlBQW9CLE1BQWUsZUFBa0QsWUFBb0Q7QUFDMUssVUFBTSxRQUFRLFdBQVcsU0FBUztBQUNsQyxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLFNBQVMsR0FBMkIsV0FBVyxhQUFhLEVBQUUsMkJBQTJCLEVBQUUsVUFBVTtBQUNwSCxVQUFNLHFCQUFxQix3QkFBd0IsS0FBSyxVQUFVO0FBQ2xFLFFBQUksQ0FBQyxVQUFVLENBQUMsb0JBQW9CO0FBQ25DLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxXQUFXO0FBQ2YsVUFBTSxPQUFPLFFBQVEsUUFBUTtBQUM3QixRQUFJLFVBQVUsY0FBYyxjQUFjLFVBQVU7QUFDcEQsUUFBSSxDQUFDLFdBQVcsTUFBTTtBQUNyQixVQUFJLGVBQWdCLFNBQVMsWUFBWSxTQUFTLFVBQVcsS0FBSyxxQkFBcUIsUUFBUSxVQUFVLEVBQUUsZUFBZSxnQkFBZ0IsSUFBSTtBQUM5SSxxQkFBZSxpQkFBaUIsVUFBYSxxQkFBcUIsQ0FBQyxJQUFJO0FBQ3ZFLFVBQUksaUJBQWlCLFFBQVc7QUFDL0IsY0FBTSxNQUFNLHlCQUF5QixvQ0FBb0MsQ0FBQyxZQUFZLFVBQVUsSUFBSSxDQUFDLFVBQVU7QUFDL0csY0FBTSxLQUFLLG1CQUFtQixNQUFNLGNBQWMsS0FBTSxDQUFDLEVBQUUsTUFBTSxLQUFLLE9BQU8sYUFBYSxDQUFDLEdBQUcsS0FBSztBQUNuRyxrQkFBVSxjQUFjLGNBQWMsVUFBVTtBQUFBLE1BQ2pEO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUztBQUNaLFVBQUksTUFBTTtBQUNULFlBQUksU0FBUyxRQUFRLEtBQUssS0FBSyxNQUFNLFFBQVEsUUFBUSxLQUFLLEdBQUc7QUFDNUQscUJBQVcsRUFBRSxZQUFZLFFBQVEsV0FBVyxpQkFBaUIsUUFBUSxRQUFRLFdBQVcsY0FBYyxFQUFFO0FBQ3hHLHFCQUFXLFlBQVksUUFBUTtBQUMvQixnQkFBTSxLQUFLLHFCQUFxQixlQUFlLGNBQVk7QUFDMUQsbUJBQU8sb0JBQW9CLGdCQUFnQixpQkFBaUIsVUFBVSxZQUFZLElBQUk7QUFBQSxVQUN2RixDQUFDO0FBQ0QscUJBQVcsRUFBRSxZQUFZLFNBQVMsYUFBYSxHQUFHLFFBQVEsTUFBTSxpQkFBaUIsU0FBUyxhQUFhLENBQUMsRUFBRTtBQUMxRyxnQkFBTSwyQkFBMkIsTUFBTSxnQ0FBZ0MsU0FBUyxVQUFVO0FBQzFGLGNBQUksMEJBQTBCO0FBRTdCLHVCQUFXLFlBQVksRUFBRSxZQUFZLFNBQVMsWUFBWSxRQUFRLHlCQUF5QixDQUFDO0FBQzVGLGtCQUFNLEtBQUsscUJBQXFCLGVBQWUsY0FBWTtBQUMxRCxxQkFBTyxvQkFBb0IsZ0JBQWdCLGlCQUFpQixVQUFVLFlBQVksSUFBSTtBQUFBLFlBQ3ZGLENBQUM7QUFDRCx1QkFBVyxFQUFFLFlBQVksU0FBUyxZQUFZLFFBQVEsTUFBTSxpQkFBaUIsU0FBUyxVQUFVLEVBQUU7QUFBQSxVQUNuRztBQUFBLFFBQ0QsT0FBTztBQUNOLHFCQUFXLEVBQUUsWUFBWSxRQUFRLFdBQVcsaUJBQWlCLFFBQVEsUUFBUSxXQUFXLFVBQVU7QUFBQSxRQUNuRztBQUFBLE1BQ0QsT0FBTztBQUNOLG1CQUFXLEVBQUUsWUFBWSxRQUFRLFNBQVMsaUJBQWlCLFFBQVEsUUFBUSxTQUFTLFlBQVk7QUFBQSxNQUNqRztBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBVyxXQUF5QztBQUNuRCxRQUFJLENBQUMsS0FBSyxpQkFBaUI7QUFDMUIsWUFBTSxrQkFBa0IsS0FBSyxtQkFBbUIsb0JBQW9CLElBQUk7QUFDeEUsWUFBTSw0QkFBNEQsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDeEcsZ0NBQTBCLFFBQVEsZ0JBQWdCLFlBQVksTUFBTTtBQUNuRSxhQUFLLGtCQUFrQjtBQUN2QixrQ0FBMEIsTUFBTTtBQUFBLE1BQ2pDLENBQUM7QUFDRCxXQUFLLGtCQUFrQixnQkFBZ0Isa0JBQWtCO0FBQUEsSUFDMUQ7QUFFQSxlQUFXLFNBQVMsS0FBSyxpQkFBaUI7QUFDekMsaUJBQVcsV0FBVyxNQUFNLFVBQVU7QUFDckMsbUJBQVcsV0FBVyxRQUFRLFVBQVU7QUFDdkMsY0FBSSxrQkFBa0IsUUFBUSxLQUFLLFNBQVMsTUFBTSxHQUFHO0FBQ3BELG1CQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLE1BQU0sVUFBVSxLQUE0QjtBQUMzQyxRQUFJLGtCQUFrQixJQUFJLFdBQVcsa0JBQWtCLE1BQU0sR0FBRztBQUMvRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sY0FBYyxJQUFJLEtBQUssTUFBTSxHQUFHLEVBQUUsT0FBTyxVQUFRLENBQUMsQ0FBQyxJQUFJO0FBQzdELFVBQU0sWUFBYyxZQUFZLFNBQVMsSUFBSyxZQUFZLENBQUMsSUFBSTtBQUMvRCxRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssYUFBYTtBQUNsQixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksVUFBVSxLQUFLLFdBQVcsU0FBUztBQUV2QyxRQUFJLENBQUMsV0FBVyxLQUFLLGlCQUFpQixXQUFXLFdBQVcsR0FBRztBQUU5RCxZQUFNLEtBQUssZ0JBQWdCLGFBQWEsRUFBRSxVQUFVLGlCQUFpQixPQUFPLEdBQUcsTUFBTSxNQUFNLFVBQVUsS0FBSyxpQkFBaUIsdUJBQXVCLENBQUM7QUFDbkosZ0JBQVUsS0FBSyxXQUFXLFNBQVM7QUFBQSxJQUNwQztBQUVBLFVBQU0sc0JBQTRDLENBQUM7QUFDbkQsUUFBSSxTQUFTO0FBQ1osMEJBQW9CLFFBQVE7QUFBQSxJQUM3QjtBQUVBLFNBQUssYUFBYSxtQkFBbUI7QUFDckMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVnQixVQUFnQjtBQUMvQixRQUFJLEtBQUssK0JBQStCLENBQUMsS0FBSyw0QkFBNEIsV0FBVyxHQUFHO0FBQ3ZGLFdBQUssNEJBQTRCLFFBQVE7QUFBQSxJQUMxQztBQUNBLFNBQUssV0FBVyxLQUFLO0FBQ3JCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQXBxQmEscUJBQU47QUFBQSxFQXFCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhDVTtBQXNxQmIsa0JBQWtCLHFCQUFxQixvQkFBb0Isa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbInJlZmVyZW5jZSJdCn0K
