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
import * as nls from "../../../../nls.js";
import * as json from "../../../../base/common/json.js";
import { setProperty } from "../../../../base/common/jsonEdit.js";
import { Queue } from "../../../../base/common/async.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { FOLDER_SETTINGS_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, USER_STANDALONE_CONFIGURATIONS, TASKS_DEFAULT, FOLDER_SCOPES, IWorkbenchConfigurationService, APPLICATION_SCOPES, MCP_CONFIGURATION_KEY } from "./configuration.js";
import { FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_REGEX } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IPreferencesService } from "../../preferences/common/preferences.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { ErrorNoTelemetry } from "../../../../base/common/errors.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
var ConfigurationEditingErrorCode = /* @__PURE__ */ ((ConfigurationEditingErrorCode2) => {
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_UNKNOWN_KEY"] = 0] = "ERROR_UNKNOWN_KEY";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION"] = 1] = "ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE"] = 2] = "ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_FOLDER_CONFIGURATION"] = 3] = "ERROR_INVALID_FOLDER_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_USER_TARGET"] = 4] = "ERROR_INVALID_USER_TARGET";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_WORKSPACE_TARGET"] = 5] = "ERROR_INVALID_WORKSPACE_TARGET";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_FOLDER_TARGET"] = 6] = "ERROR_INVALID_FOLDER_TARGET";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION"] = 7] = "ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_NO_WORKSPACE_OPENED"] = 8] = "ERROR_NO_WORKSPACE_OPENED";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_CONFIGURATION_FILE_DIRTY"] = 9] = "ERROR_CONFIGURATION_FILE_DIRTY";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_CONFIGURATION_FILE_MODIFIED_SINCE"] = 10] = "ERROR_CONFIGURATION_FILE_MODIFIED_SINCE";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_CONFIGURATION"] = 11] = "ERROR_INVALID_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_POLICY_CONFIGURATION"] = 12] = "ERROR_POLICY_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INTERNAL"] = 13] = "ERROR_INTERNAL";
  return ConfigurationEditingErrorCode2;
})(ConfigurationEditingErrorCode || {});
class ConfigurationEditingError extends ErrorNoTelemetry {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
var EditableConfigurationTarget = /* @__PURE__ */ ((EditableConfigurationTarget2) => {
  EditableConfigurationTarget2[EditableConfigurationTarget2["USER_LOCAL"] = 1] = "USER_LOCAL";
  EditableConfigurationTarget2[EditableConfigurationTarget2["USER_REMOTE"] = 2] = "USER_REMOTE";
  EditableConfigurationTarget2[EditableConfigurationTarget2["WORKSPACE"] = 3] = "WORKSPACE";
  EditableConfigurationTarget2[EditableConfigurationTarget2["WORKSPACE_FOLDER"] = 4] = "WORKSPACE_FOLDER";
  return EditableConfigurationTarget2;
})(EditableConfigurationTarget || {});
let ConfigurationEditing = class {
  constructor(remoteSettingsResource, configurationService, contextService, userDataProfileService, userDataProfilesService, fileService, textModelResolverService, textFileService, notificationService, preferencesService, editorService, uriIdentityService, filesConfigurationService) {
    this.remoteSettingsResource = remoteSettingsResource;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.fileService = fileService;
    this.textModelResolverService = textModelResolverService;
    this.textFileService = textFileService;
    this.notificationService = notificationService;
    this.preferencesService = preferencesService;
    this.editorService = editorService;
    this.uriIdentityService = uriIdentityService;
    this.filesConfigurationService = filesConfigurationService;
    this.queue = new Queue();
  }
  async writeConfiguration(target, value, options = {}) {
    const operation = this.getConfigurationEditOperation(target, value, options.scopes || {});
    return this.queue.queue(async () => {
      try {
        await this.doWriteConfiguration(operation, options);
      } catch (error) {
        if (options.donotNotifyError) {
          throw error;
        }
        await this.onError(error, operation, options.scopes);
      }
    });
  }
  async doWriteConfiguration(operation, options) {
    await this.validate(operation.target, operation, !options.handleDirtyFile, options.scopes || {});
    const resource = operation.resource;
    const reference = await this.resolveModelReference(resource);
    try {
      const formattingOptions = this.getFormattingOptions(reference.object.textEditorModel);
      await this.updateConfiguration(operation, reference.object.textEditorModel, formattingOptions, options);
    } finally {
      reference.dispose();
    }
  }
  async updateConfiguration(operation, model, formattingOptions, options) {
    if (this.hasParseErrors(model.getValue(), operation)) {
      throw this.toConfigurationEditingError(11 /* ERROR_INVALID_CONFIGURATION */, operation.target, operation);
    }
    if (this.textFileService.isDirty(model.uri) && options.handleDirtyFile) {
      switch (options.handleDirtyFile) {
        case "save":
          await this.save(model, operation);
          break;
        case "revert":
          await this.textFileService.revert(model.uri);
          break;
      }
    }
    const edit = this.getEdits(operation, model.getValue(), formattingOptions)[0];
    if (edit) {
      let disposable;
      try {
        disposable = this.filesConfigurationService.enableAutoSaveAfterShortDelay(model.uri);
        if (this.applyEditsToBuffer(edit, model)) {
          await this.save(model, operation);
        }
      } finally {
        disposable?.dispose();
      }
    }
  }
  async save(model, operation) {
    try {
      await this.textFileService.save(model.uri, { ignoreErrorHandler: true });
    } catch (error) {
      if (error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
        throw this.toConfigurationEditingError(10 /* ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */, operation.target, operation);
      }
      throw new ConfigurationEditingError(nls.localize("fsError", "Error while writing to {0}. {1}", this.stringifyTarget(operation.target), error.message), 13 /* ERROR_INTERNAL */);
    }
  }
  applyEditsToBuffer(edit, model) {
    const startPosition = model.getPositionAt(edit.offset);
    const endPosition = model.getPositionAt(edit.offset + edit.length);
    const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
    const currentText = model.getValueInRange(range);
    if (edit.content !== currentText) {
      const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
      model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
      return true;
    }
    return false;
  }
  getEdits({ value, jsonPath }, modelContent, formattingOptions) {
    if (jsonPath.length) {
      return setProperty(modelContent, jsonPath, value, formattingOptions);
    }
    const content = JSON.stringify(value, null, formattingOptions.insertSpaces && formattingOptions.tabSize ? " ".repeat(formattingOptions.tabSize) : "	");
    return [{
      content,
      length: modelContent.length,
      offset: 0
    }];
  }
  getFormattingOptions(model) {
    const { insertSpaces, tabSize } = model.getOptions();
    const eol = model.getEOL();
    return { insertSpaces, tabSize, eol };
  }
  async onError(error, operation, scopes) {
    switch (error.code) {
      case 11 /* ERROR_INVALID_CONFIGURATION */:
        this.onInvalidConfigurationError(error, operation);
        break;
      case 9 /* ERROR_CONFIGURATION_FILE_DIRTY */:
        this.onConfigurationFileDirtyError(error, operation, scopes);
        break;
      case 10 /* ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */:
        return this.doWriteConfiguration(operation, { scopes, handleDirtyFile: "revert" });
      default:
        this.notificationService.error(error.message);
    }
  }
  onInvalidConfigurationError(error, operation) {
    const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize("openTasksConfiguration", "Open Tasks Configuration") : operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize("openLaunchConfiguration", "Open Launch Configuration") : operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY ? nls.localize("openMcpConfiguration", "Open MCP Configuration") : null;
    if (openStandAloneConfigurationActionLabel) {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [{
          label: openStandAloneConfigurationActionLabel,
          run: () => this.openFile(operation.resource)
        }]
      );
    } else {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [{
          label: nls.localize("open", "Open Settings"),
          run: () => this.openSettings(operation)
        }]
      );
    }
  }
  onConfigurationFileDirtyError(error, operation, scopes) {
    const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize("openTasksConfiguration", "Open Tasks Configuration") : operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize("openLaunchConfiguration", "Open Launch Configuration") : null;
    if (openStandAloneConfigurationActionLabel) {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [
          {
            label: nls.localize("saveAndRetry", "Save and Retry"),
            run: () => {
              const key = operation.key ? `${operation.workspaceStandAloneConfigurationKey}.${operation.key}` : operation.workspaceStandAloneConfigurationKey;
              this.writeConfiguration(operation.target, { key, value: operation.value }, { handleDirtyFile: "save", scopes });
            }
          },
          {
            label: openStandAloneConfigurationActionLabel,
            run: () => this.openFile(operation.resource)
          }
        ]
      );
    } else {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [
          {
            label: nls.localize("saveAndRetry", "Save and Retry"),
            run: () => this.writeConfiguration(operation.target, { key: operation.key, value: operation.value }, { handleDirtyFile: "save", scopes })
          },
          {
            label: nls.localize("open", "Open Settings"),
            run: () => this.openSettings(operation)
          }
        ]
      );
    }
  }
  openSettings(operation) {
    const options = { jsonEditor: true };
    switch (operation.target) {
      case 1 /* USER_LOCAL */:
        this.preferencesService.openUserSettings(options);
        break;
      case 2 /* USER_REMOTE */:
        this.preferencesService.openRemoteSettings(options);
        break;
      case 3 /* WORKSPACE */:
        this.preferencesService.openWorkspaceSettings(options);
        break;
      case 4 /* WORKSPACE_FOLDER */:
        if (operation.resource) {
          const workspaceFolder = this.contextService.getWorkspaceFolder(operation.resource);
          if (workspaceFolder) {
            this.preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, jsonEditor: true });
          }
        }
        break;
    }
  }
  openFile(resource) {
    this.editorService.openEditor({ resource, options: { pinned: true } });
  }
  toConfigurationEditingError(code, target, operation) {
    const message = this.toErrorMessage(code, target, operation);
    return new ConfigurationEditingError(message, code);
  }
  toErrorMessage(error, target, operation) {
    switch (error) {
      // API constraints
      case 12 /* ERROR_POLICY_CONFIGURATION */:
        return nls.localize("errorPolicyConfiguration", "Unable to write {0} because it is configured in system policy.", operation.key);
      case 0 /* ERROR_UNKNOWN_KEY */:
        return nls.localize("errorUnknownKey", "Unable to write to {0} because {1} is not a registered configuration.", this.stringifyTarget(target), operation.key);
      case 1 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */:
        return nls.localize("errorInvalidWorkspaceConfigurationApplication", "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
      case 2 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */:
        return nls.localize("errorInvalidWorkspaceConfigurationMachine", "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
      case 3 /* ERROR_INVALID_FOLDER_CONFIGURATION */:
        return nls.localize("errorInvalidFolderConfiguration", "Unable to write to Folder Settings because {0} does not support the folder resource scope.", operation.key);
      case 4 /* ERROR_INVALID_USER_TARGET */:
        return nls.localize("errorInvalidUserTarget", "Unable to write to User Settings because {0} does not support for global scope.", operation.key);
      case 5 /* ERROR_INVALID_WORKSPACE_TARGET */:
        return nls.localize("errorInvalidWorkspaceTarget", "Unable to write to Workspace Settings because {0} does not support for workspace scope in a multi folder workspace.", operation.key);
      case 6 /* ERROR_INVALID_FOLDER_TARGET */:
        return nls.localize("errorInvalidFolderTarget", "Unable to write to Folder Settings because no resource is provided.");
      case 7 /* ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION */:
        return nls.localize("errorInvalidResourceLanguageConfiguration", "Unable to write to Language Settings because {0} is not a resource language setting.", operation.key);
      case 8 /* ERROR_NO_WORKSPACE_OPENED */:
        return nls.localize("errorNoWorkspaceOpened", "Unable to write to {0} because no workspace is opened. Please open a workspace first and try again.", this.stringifyTarget(target));
      // User issues
      case 11 /* ERROR_INVALID_CONFIGURATION */: {
        if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
          return nls.localize("errorInvalidTaskConfiguration", "Unable to write into the tasks configuration file. Please open it to correct errors/warnings in it and try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
          return nls.localize("errorInvalidLaunchConfiguration", "Unable to write into the launch configuration file. Please open it to correct errors/warnings in it and try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
          return nls.localize("errorInvalidMCPConfiguration", "Unable to write into the MCP configuration file. Please open it to correct errors/warnings in it and try again.");
        }
        switch (target) {
          case 1 /* USER_LOCAL */:
            return nls.localize("errorInvalidConfiguration", "Unable to write into user settings. Please open the user settings to correct errors/warnings in it and try again.");
          case 2 /* USER_REMOTE */:
            return nls.localize("errorInvalidRemoteConfiguration", "Unable to write into remote user settings. Please open the remote user settings to correct errors/warnings in it and try again.");
          case 3 /* WORKSPACE */:
            return nls.localize("errorInvalidConfigurationWorkspace", "Unable to write into workspace settings. Please open the workspace settings to correct errors/warnings in the file and try again.");
          case 4 /* WORKSPACE_FOLDER */: {
            let workspaceFolderName = "<<unknown>>";
            if (operation.resource) {
              const folder = this.contextService.getWorkspaceFolder(operation.resource);
              if (folder) {
                workspaceFolderName = folder.name;
              }
            }
            return nls.localize("errorInvalidConfigurationFolder", "Unable to write into folder settings. Please open the '{0}' folder settings to correct errors/warnings in it and try again.", workspaceFolderName);
          }
          default:
            return "";
        }
      }
      case 9 /* ERROR_CONFIGURATION_FILE_DIRTY */: {
        if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
          return nls.localize("errorTasksConfigurationFileDirty", "Unable to write into tasks configuration file because the file has unsaved changes. Please save it first and then try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
          return nls.localize("errorLaunchConfigurationFileDirty", "Unable to write into launch configuration file because the file has unsaved changes. Please save it first and then try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
          return nls.localize("errorMCPConfigurationFileDirty", "Unable to write into MCP configuration file because the file has unsaved changes. Please save it first and then try again.");
        }
        switch (target) {
          case 1 /* USER_LOCAL */:
            return nls.localize("errorConfigurationFileDirty", "Unable to write into user settings because the file has unsaved changes. Please save the user settings file first and then try again.");
          case 2 /* USER_REMOTE */:
            return nls.localize("errorRemoteConfigurationFileDirty", "Unable to write into remote user settings because the file has unsaved changes. Please save the remote user settings file first and then try again.");
          case 3 /* WORKSPACE */:
            return nls.localize("errorConfigurationFileDirtyWorkspace", "Unable to write into workspace settings because the file has unsaved changes. Please save the workspace settings file first and then try again.");
          case 4 /* WORKSPACE_FOLDER */: {
            let workspaceFolderName = "<<unknown>>";
            if (operation.resource) {
              const folder = this.contextService.getWorkspaceFolder(operation.resource);
              if (folder) {
                workspaceFolderName = folder.name;
              }
            }
            return nls.localize("errorConfigurationFileDirtyFolder", "Unable to write into folder settings because the file has unsaved changes. Please save the '{0}' folder settings file first and then try again.", workspaceFolderName);
          }
          default:
            return "";
        }
      }
      case 10 /* ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */:
        if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
          return nls.localize("errorTasksConfigurationFileModifiedSince", "Unable to write into tasks configuration file because the content of the file is newer.");
        }
        if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
          return nls.localize("errorLaunchConfigurationFileModifiedSince", "Unable to write into launch configuration file because the content of the file is newer.");
        }
        if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
          return nls.localize("errorMCPConfigurationFileModifiedSince", "Unable to write into MCP configuration file because the content of the file is newer.");
        }
        switch (target) {
          case 1 /* USER_LOCAL */:
            return nls.localize("errorConfigurationFileModifiedSince", "Unable to write into user settings because the content of the file is newer.");
          case 2 /* USER_REMOTE */:
            return nls.localize("errorRemoteConfigurationFileModifiedSince", "Unable to write into remote user settings because the content of the file is newer.");
          case 3 /* WORKSPACE */:
            return nls.localize("errorConfigurationFileModifiedSinceWorkspace", "Unable to write into workspace settings because the content of the file is newer.");
          case 4 /* WORKSPACE_FOLDER */:
            return nls.localize("errorConfigurationFileModifiedSinceFolder", "Unable to write into folder settings because the content of the file is newer.");
        }
      case 13 /* ERROR_INTERNAL */:
        return nls.localize("errorUnknown", "Unable to write to {0} because of an internal error.", this.stringifyTarget(target));
    }
  }
  stringifyTarget(target) {
    switch (target) {
      case 1 /* USER_LOCAL */:
        return nls.localize("userTarget", "User Settings");
      case 2 /* USER_REMOTE */:
        return nls.localize("remoteUserTarget", "Remote User Settings");
      case 3 /* WORKSPACE */:
        return nls.localize("workspaceTarget", "Workspace Settings");
      case 4 /* WORKSPACE_FOLDER */:
        return nls.localize("folderTarget", "Folder Settings");
      default:
        return "";
    }
  }
  defaultResourceValue(resource) {
    const basename = this.uriIdentityService.extUri.basename(resource);
    const configurationValue = basename.substr(0, basename.length - this.uriIdentityService.extUri.extname(resource).length);
    switch (configurationValue) {
      case TASKS_CONFIGURATION_KEY:
        return TASKS_DEFAULT;
      default:
        return "{}";
    }
  }
  async resolveModelReference(resource) {
    const exists = await this.fileService.exists(resource);
    if (!exists) {
      await this.textFileService.write(resource, this.defaultResourceValue(resource), { encoding: "utf8" });
    }
    return this.textModelResolverService.createModelReference(resource);
  }
  hasParseErrors(content, operation) {
    if (operation.workspaceStandAloneConfigurationKey && !operation.key) {
      return false;
    }
    const parseErrors = [];
    json.parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
    return parseErrors.length > 0;
  }
  async validate(target, operation, checkDirty, overrides) {
    if (this.configurationService.inspect(operation.key).policyValue !== void 0) {
      throw this.toConfigurationEditingError(12 /* ERROR_POLICY_CONFIGURATION */, target, operation);
    }
    const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    const configurationScope = configurationProperties[operation.key]?.scope;
    if (!operation.workspaceStandAloneConfigurationKey) {
      const validKeys = this.configurationService.keys().default;
      if (validKeys.indexOf(operation.key) < 0 && !OVERRIDE_PROPERTY_REGEX.test(operation.key) && operation.value !== void 0) {
        throw this.toConfigurationEditingError(0 /* ERROR_UNKNOWN_KEY */, target, operation);
      }
    }
    if (operation.workspaceStandAloneConfigurationKey) {
      if (operation.workspaceStandAloneConfigurationKey !== TASKS_CONFIGURATION_KEY && operation.workspaceStandAloneConfigurationKey !== MCP_CONFIGURATION_KEY && (target === 1 /* USER_LOCAL */ || target === 2 /* USER_REMOTE */)) {
        throw this.toConfigurationEditingError(4 /* ERROR_INVALID_USER_TARGET */, target, operation);
      }
    }
    if ((target === 3 /* WORKSPACE */ || target === 4 /* WORKSPACE_FOLDER */) && this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      throw this.toConfigurationEditingError(8 /* ERROR_NO_WORKSPACE_OPENED */, target, operation);
    }
    if (target === 3 /* WORKSPACE */) {
      if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
        if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
          throw this.toConfigurationEditingError(1 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */, target, operation);
        }
        if (configurationScope === ConfigurationScope.MACHINE) {
          throw this.toConfigurationEditingError(2 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */, target, operation);
        }
      }
    }
    if (target === 4 /* WORKSPACE_FOLDER */) {
      if (!operation.resource) {
        throw this.toConfigurationEditingError(6 /* ERROR_INVALID_FOLDER_TARGET */, target, operation);
      }
      if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
        if (configurationScope !== void 0 && !FOLDER_SCOPES.includes(configurationScope)) {
          throw this.toConfigurationEditingError(3 /* ERROR_INVALID_FOLDER_CONFIGURATION */, target, operation);
        }
      }
    }
    if (overrides.overrideIdentifiers?.length) {
      if (configurationScope !== ConfigurationScope.LANGUAGE_OVERRIDABLE) {
        throw this.toConfigurationEditingError(7 /* ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION */, target, operation);
      }
    }
    if (!operation.resource) {
      throw this.toConfigurationEditingError(6 /* ERROR_INVALID_FOLDER_TARGET */, target, operation);
    }
    if (checkDirty && this.textFileService.isDirty(operation.resource)) {
      throw this.toConfigurationEditingError(9 /* ERROR_CONFIGURATION_FILE_DIRTY */, target, operation);
    }
  }
  getConfigurationEditOperation(target, config, overrides) {
    if (config.key) {
      const standaloneConfigurationMap = target === 1 /* USER_LOCAL */ ? USER_STANDALONE_CONFIGURATIONS : WORKSPACE_STANDALONE_CONFIGURATIONS;
      const standaloneConfigurationKeys = Object.keys(standaloneConfigurationMap);
      for (const key2 of standaloneConfigurationKeys) {
        const resource2 = this.getConfigurationFileResource(target, key2, standaloneConfigurationMap[key2], overrides.resource, void 0);
        if (config.key === key2) {
          const jsonPath2 = this.isWorkspaceConfigurationResource(resource2) ? [key2] : [];
          return { key: jsonPath2[jsonPath2.length - 1], jsonPath: jsonPath2, value: config.value, resource: resource2 ?? void 0, workspaceStandAloneConfigurationKey: key2, target };
        }
        const keyPrefix = `${key2}.`;
        if (config.key.indexOf(keyPrefix) === 0) {
          const jsonPath2 = this.isWorkspaceConfigurationResource(resource2) ? [key2, config.key.substring(keyPrefix.length)] : [config.key.substring(keyPrefix.length)];
          return { key: jsonPath2[jsonPath2.length - 1], jsonPath: jsonPath2, value: config.value, resource: resource2 ?? void 0, workspaceStandAloneConfigurationKey: key2, target };
        }
      }
    }
    const key = config.key;
    const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    const configurationScope = configurationProperties[key]?.scope;
    let jsonPath = overrides.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
    if (target === 1 /* USER_LOCAL */ || target === 2 /* USER_REMOTE */) {
      return { key, jsonPath, value: config.value, resource: this.getConfigurationFileResource(target, key, "", null, configurationScope) ?? void 0, target };
    }
    const resource = this.getConfigurationFileResource(target, key, FOLDER_SETTINGS_PATH, overrides.resource, configurationScope);
    if (this.isWorkspaceConfigurationResource(resource)) {
      jsonPath = ["settings", ...jsonPath];
    }
    return { key, jsonPath, value: config.value, resource: resource ?? void 0, target };
  }
  isWorkspaceConfigurationResource(resource) {
    const workspace = this.contextService.getWorkspace();
    return !!(workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath);
  }
  getConfigurationFileResource(target, key, relativePath, resource, scope) {
    if (target === 1 /* USER_LOCAL */) {
      if (key === TASKS_CONFIGURATION_KEY) {
        return this.userDataProfileService.currentProfile.tasksResource;
      }
      if (key === MCP_CONFIGURATION_KEY) {
        return this.userDataProfileService.currentProfile.mcpResource;
      } else {
        if (!this.userDataProfileService.currentProfile.isDefault && this.configurationService.isSettingAppliedForAllProfiles(key)) {
          return this.userDataProfilesService.defaultProfile.settingsResource;
        }
        return this.userDataProfileService.currentProfile.settingsResource;
      }
    }
    if (target === 2 /* USER_REMOTE */) {
      return this.remoteSettingsResource;
    }
    const workbenchState = this.contextService.getWorkbenchState();
    if (workbenchState !== WorkbenchState.EMPTY) {
      const workspace = this.contextService.getWorkspace();
      if (target === 3 /* WORKSPACE */) {
        if (workbenchState === WorkbenchState.WORKSPACE) {
          return workspace.configuration ?? null;
        }
        if (workbenchState === WorkbenchState.FOLDER) {
          return workspace.folders[0].toResource(relativePath);
        }
      }
      if (target === 4 /* WORKSPACE_FOLDER */) {
        if (resource) {
          const folder = this.contextService.getWorkspaceFolder(resource);
          if (folder) {
            return folder.toResource(relativePath);
          }
        }
      }
    }
    return null;
  }
};
ConfigurationEditing = __decorateClass([
  __decorateParam(1, IWorkbenchConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, ITextFileService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IUriIdentityService),
  __decorateParam(12, IFilesConfigurationService)
], ConfigurationEditing);
export {
  ConfigurationEditing,
  ConfigurationEditingError,
  ConfigurationEditingErrorCode,
  EditableConfigurationTarget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uXFxjb21tb25cXGNvbmZpZ3VyYXRpb25FZGl0aW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMganNvbiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IHNldFByb3BlcnR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVkaXQuanMnO1xuaW1wb3J0IHsgUXVldWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFZGl0LCBGb3JtYXR0aW5nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucywgSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZPTERFUl9TRVRUSU5HU19QQVRILCBXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OUywgVEFTS1NfQ09ORklHVVJBVElPTl9LRVksIExBVU5DSF9DT05GSUdVUkFUSU9OX0tFWSwgVVNFUl9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TLCBUQVNLU19ERUZBVUxULCBGT0xERVJfU0NPUEVTLCBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsIEFQUExJQ0FUSU9OX1NDT1BFUywgTUNQX0NPTkZJR1VSQVRJT05fS0VZIH0gZnJvbSAnLi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUsIGtleUZyb21PdmVycmlkZUlkZW50aWZpZXJzLCBPVkVSUklERV9QUk9QRVJUWV9SRUdFWCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlblNldHRpbmdzT3B0aW9ucywgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlIHtcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgYSBjb25maWd1cmF0aW9uIGtleSB0aGF0IGlzIG5vdCByZWdpc3RlcmVkLlxuXHQgKi9cblx0RVJST1JfVU5LTk9XTl9LRVksXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIGFuIGFwcGxpY2F0aW9uIHNldHRpbmcgaW50byB3b3Jrc3BhY2Ugc2V0dGluZ3MuXG5cdCAqL1xuXHRFUlJPUl9JTlZBTElEX1dPUktTUEFDRV9DT05GSUdVUkFUSU9OX0FQUExJQ0FUSU9OLFxuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHRyeWluZyB0byB3cml0ZSBhIG1hY2huZSBzZXR0aW5nIGludG8gd29ya3NwYWNlIHNldHRpbmdzLlxuXHQgKi9cblx0RVJST1JfSU5WQUxJRF9XT1JLU1BBQ0VfQ09ORklHVVJBVElPTl9NQUNISU5FLFxuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHRyeWluZyB0byB3cml0ZSBhbiBpbnZhbGlkIGZvbGRlciBjb25maWd1cmF0aW9uIGtleSB0byBmb2xkZXIgc2V0dGluZ3MuXG5cdCAqL1xuXHRFUlJPUl9JTlZBTElEX0ZPTERFUl9DT05GSUdVUkFUSU9OLFxuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHRyeWluZyB0byB3cml0ZSB0byB1c2VyIHRhcmdldCBidXQgbm90IHN1cHBvcnRlZCBmb3IgcHJvdmlkZWQga2V5LlxuXHQgKi9cblx0RVJST1JfSU5WQUxJRF9VU0VSX1RBUkdFVCxcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgdG8gdXNlciB0YXJnZXQgYnV0IG5vdCBzdXBwb3J0ZWQgZm9yIHByb3ZpZGVkIGtleS5cblx0ICovXG5cdEVSUk9SX0lOVkFMSURfV09SS1NQQUNFX1RBUkdFVCxcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgYSBjb25maWd1cmF0aW9uIGtleSB0byBmb2xkZXIgdGFyZ2V0XG5cdCAqL1xuXHRFUlJPUl9JTlZBTElEX0ZPTERFUl9UQVJHRVQsXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIHRvIGxhbmd1YWdlIHNwZWNpZmljIHNldHRpbmcgYnV0IG5vdCBzdXBwb3J0ZWQgZm9yIHByZW92aWRlZCBrZXlcblx0ICovXG5cdEVSUk9SX0lOVkFMSURfUkVTT1VSQ0VfTEFOR1VBR0VfQ09ORklHVVJBVElPTixcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgdG8gdGhlIHdvcmtzcGFjZSBjb25maWd1cmF0aW9uIHdpdGhvdXQgaGF2aW5nIGEgd29ya3NwYWNlIG9wZW5lZC5cblx0ICovXG5cdEVSUk9SX05PX1dPUktTUEFDRV9PUEVORUQsXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIGFuZCBzYXZlIHRvIHRoZSBjb25maWd1cmF0aW9uIGZpbGUgd2hpbGUgaXQgaXMgZGlydHkgaW4gdGhlIGVkaXRvci5cblx0ICovXG5cdEVSUk9SX0NPTkZJR1VSQVRJT05fRklMRV9ESVJUWSxcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgYW5kIHNhdmUgdG8gdGhlIGNvbmZpZ3VyYXRpb24gZmlsZSB3aGlsZSBpdCBpcyBub3QgdGhlIGxhdGVzdCBpbiB0aGUgZGlzay5cblx0ICovXG5cdEVSUk9SX0NPTkZJR1VSQVRJT05fRklMRV9NT0RJRklFRF9TSU5DRSxcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgdG8gYSBjb25maWd1cmF0aW9uIGZpbGUgdGhhdCBjb250YWlucyBKU09OIGVycm9ycy5cblx0ICovXG5cdEVSUk9SX0lOVkFMSURfQ09ORklHVVJBVElPTixcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgYSBwb2xpY3kgY29uZmlndXJhdGlvblxuXHQgKi9cblx0RVJST1JfUE9MSUNZX0NPTkZJR1VSQVRJT04sXG5cblx0LyoqXG5cdCAqIEludGVybmFsIEVycm9yLlxuXHQgKi9cblx0RVJST1JfSU5URVJOQUxcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IgZXh0ZW5kcyBFcnJvck5vVGVsZW1ldHJ5IHtcblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nLCBwdWJsaWMgY29kZTogQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWd1cmF0aW9uVmFsdWUge1xuXHRrZXk6IHN0cmluZztcblx0dmFsdWU6IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25FZGl0aW5nT3B0aW9ucyBleHRlbmRzIElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBTY29wZSBvZiBjb25maWd1cmF0aW9uIHRvIGJlIHdyaXR0ZW4gaW50by5cblx0ICovXG5cdHNjb3Blcz86IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQge1xuXHRVU0VSX0xPQ0FMID0gMSxcblx0VVNFUl9SRU1PVEUsXG5cdFdPUktTUEFDRSxcblx0V09SS1NQQUNFX0ZPTERFUlxufVxuXG5pbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uIGV4dGVuZHMgSUNvbmZpZ3VyYXRpb25WYWx1ZSB7XG5cdHRhcmdldDogRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0O1xuXHRqc29uUGF0aDoganNvbi5KU09OUGF0aDtcblx0cmVzb3VyY2U/OiBVUkk7XG5cdHdvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbkVkaXRpbmcge1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBxdWV1ZTogUXVldWU8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW1vdGVTZXR0aW5nc1Jlc291cmNlOiBVUkkgfCBudWxsLFxuXHRcdEBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5xdWV1ZSA9IG5ldyBRdWV1ZTx2b2lkPigpO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVDb25maWd1cmF0aW9uKHRhcmdldDogRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LCB2YWx1ZTogSUNvbmZpZ3VyYXRpb25WYWx1ZSwgb3B0aW9uczogSUNvbmZpZ3VyYXRpb25FZGl0aW5nT3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gdGhpcy5nZXRDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbih0YXJnZXQsIHZhbHVlLCBvcHRpb25zLnNjb3BlcyB8fCB7fSk7XG5cdFx0Ly8gcXVldWUgdXAgd3JpdGVzIHRvIHByZXZlbnQgcmFjZSBjb25kaXRpb25zXG5cdFx0cmV0dXJuIHRoaXMucXVldWUucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1dyaXRlQ29uZmlndXJhdGlvbihvcGVyYXRpb24sIG9wdGlvbnMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKG9wdGlvbnMuZG9ub3ROb3RpZnlFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMub25FcnJvcihlcnJvciwgb3BlcmF0aW9uLCBvcHRpb25zLnNjb3Blcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvV3JpdGVDb25maWd1cmF0aW9uKG9wZXJhdGlvbjogSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uLCBvcHRpb25zOiBJQ29uZmlndXJhdGlvbkVkaXRpbmdPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy52YWxpZGF0ZShvcGVyYXRpb24udGFyZ2V0LCBvcGVyYXRpb24sICFvcHRpb25zLmhhbmRsZURpcnR5RmlsZSwgb3B0aW9ucy5zY29wZXMgfHwge30pO1xuXHRcdGNvbnN0IHJlc291cmNlOiBVUkkgPSBvcGVyYXRpb24ucmVzb3VyY2UhO1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IGF3YWl0IHRoaXMucmVzb2x2ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9ybWF0dGluZ09wdGlvbnMgPSB0aGlzLmdldEZvcm1hdHRpbmdPcHRpb25zKHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlQ29uZmlndXJhdGlvbihvcGVyYXRpb24sIHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBmb3JtYXR0aW5nT3B0aW9ucywgb3B0aW9ucyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDb25maWd1cmF0aW9uKG9wZXJhdGlvbjogSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zLCBvcHRpb25zOiBJQ29uZmlndXJhdGlvbkVkaXRpbmdPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaGFzUGFyc2VFcnJvcnMobW9kZWwuZ2V0VmFsdWUoKSwgb3BlcmF0aW9uKSkge1xuXHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9DT05GSUdVUkFUSU9OLCBvcGVyYXRpb24udGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRleHRGaWxlU2VydmljZS5pc0RpcnR5KG1vZGVsLnVyaSkgJiYgb3B0aW9ucy5oYW5kbGVEaXJ0eUZpbGUpIHtcblx0XHRcdHN3aXRjaCAob3B0aW9ucy5oYW5kbGVEaXJ0eUZpbGUpIHtcblx0XHRcdFx0Y2FzZSAnc2F2ZSc6IGF3YWl0IHRoaXMuc2F2ZShtb2RlbCwgb3BlcmF0aW9uKTsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3JldmVydCc6IGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLnJldmVydChtb2RlbC51cmkpOyBicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlZGl0ID0gdGhpcy5nZXRFZGl0cyhvcGVyYXRpb24sIG1vZGVsLmdldFZhbHVlKCksIGZvcm1hdHRpbmdPcHRpb25zKVswXTtcblx0XHRpZiAoZWRpdCkge1xuXHRcdFx0bGV0IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gT3B0aW1pemF0aW9uOiB3ZSBhcHBseSBlZGl0cyB0byBhIHRleHQgbW9kZWwgYW5kIHNhdmUgaXRcblx0XHRcdFx0Ly8gcmlnaHQgYWZ0ZXIuIFVzZSB0aGUgZmlsZXMgY29uZmlnIHNlcnZpY2UgdG8gc2lnbmFsIHRoaXNcblx0XHRcdFx0Ly8gdG8gdGhlIHdvcmtiZW5jaCB0byBvcHRpbWlzZSB0aGUgVUkgZHVyaW5nIHRoaXMgb3BlcmF0aW9uLlxuXHRcdFx0XHQvLyBGb3IgZXhhbXBsZSwgYXZvaWRzIHRvIGJyaWVmbHkgc2hvdyBkaXJ0eSBpbmRpY2F0b3JzLlxuXHRcdFx0XHRkaXNwb3NhYmxlID0gdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmVuYWJsZUF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5KG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICh0aGlzLmFwcGx5RWRpdHNUb0J1ZmZlcihlZGl0LCBtb2RlbCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnNhdmUobW9kZWwsIG9wZXJhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGRpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmUobW9kZWw6IElUZXh0TW9kZWwsIG9wZXJhdGlvbjogSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLnNhdmUobW9kZWwudXJpLCB7IGlnbm9yZUVycm9ySGFuZGxlcjogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpIHtcblx0XHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfQ09ORklHVVJBVElPTl9GSUxFX01PRElGSUVEX1NJTkNFLCBvcGVyYXRpb24udGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IobmxzLmxvY2FsaXplKCdmc0Vycm9yJywgXCJFcnJvciB3aGlsZSB3cml0aW5nIHRvIHswfS4gezF9XCIsIHRoaXMuc3RyaW5naWZ5VGFyZ2V0KG9wZXJhdGlvbi50YXJnZXQpLCBlcnJvci5tZXNzYWdlKSwgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5URVJOQUwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlFZGl0c1RvQnVmZmVyKGVkaXQ6IEVkaXQsIG1vZGVsOiBJVGV4dE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQoZWRpdC5vZmZzZXQpO1xuXHRcdGNvbnN0IGVuZFBvc2l0aW9uID0gbW9kZWwuZ2V0UG9zaXRpb25BdChlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoKTtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uLCBlbmRQb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRQb3NpdGlvbi5jb2x1bW4pO1xuXHRcdGNvbnN0IGN1cnJlbnRUZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKTtcblx0XHRpZiAoZWRpdC5jb250ZW50ICE9PSBjdXJyZW50VGV4dCkge1xuXHRcdFx0Y29uc3QgZWRpdE9wZXJhdGlvbiA9IGN1cnJlbnRUZXh0ID8gRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHJhbmdlLCBlZGl0LmNvbnRlbnQpIDogRWRpdE9wZXJhdGlvbi5pbnNlcnQoc3RhcnRQb3NpdGlvbiwgZWRpdC5jb250ZW50KTtcblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbbmV3IFNlbGVjdGlvbihzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uLCBzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uKV0sIFtlZGl0T3BlcmF0aW9uXSwgKCkgPT4gW10pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWRpdHMoeyB2YWx1ZSwganNvblBhdGggfTogSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uLCBtb2RlbENvbnRlbnQ6IHN0cmluZywgZm9ybWF0dGluZ09wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogRWRpdFtdIHtcblx0XHRpZiAoanNvblBhdGgubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gc2V0UHJvcGVydHkobW9kZWxDb250ZW50LCBqc29uUGF0aCwgdmFsdWUsIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBXaXRob3V0IGpzb25QYXRoLCB0aGUgZW50aXJlIGNvbmZpZ3VyYXRpb24gZmlsZSBpcyBiZWluZyByZXBsYWNlZCwgc28gd2UganVzdCB1c2UgSlNPTi5zdHJpbmdpZnlcblx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkodmFsdWUsIG51bGwsIGZvcm1hdHRpbmdPcHRpb25zLmluc2VydFNwYWNlcyAmJiBmb3JtYXR0aW5nT3B0aW9ucy50YWJTaXplID8gJyAnLnJlcGVhdChmb3JtYXR0aW5nT3B0aW9ucy50YWJTaXplKSA6ICdcXHQnKTtcblx0XHRyZXR1cm4gW3tcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHRsZW5ndGg6IG1vZGVsQ29udGVudC5sZW5ndGgsXG5cdFx0XHRvZmZzZXQ6IDBcblx0XHR9XTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Rm9ybWF0dGluZ09wdGlvbnMobW9kZWw6IElUZXh0TW9kZWwpOiBGb3JtYXR0aW5nT3B0aW9ucyB7XG5cdFx0Y29uc3QgeyBpbnNlcnRTcGFjZXMsIHRhYlNpemUgfSA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBlb2wgPSBtb2RlbC5nZXRFT0woKTtcblx0XHRyZXR1cm4geyBpbnNlcnRTcGFjZXMsIHRhYlNpemUsIGVvbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkVycm9yKGVycm9yOiBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yLCBvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiwgc2NvcGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX0NPTkZJR1VSQVRJT046XG5cdFx0XHRcdHRoaXMub25JbnZhbGlkQ29uZmlndXJhdGlvbkVycm9yKGVycm9yLCBvcGVyYXRpb24pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfQ09ORklHVVJBVElPTl9GSUxFX0RJUlRZOlxuXHRcdFx0XHR0aGlzLm9uQ29uZmlndXJhdGlvbkZpbGVEaXJ0eUVycm9yKGVycm9yLCBvcGVyYXRpb24sIHNjb3Blcyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9DT05GSUdVUkFUSU9OX0ZJTEVfTU9ESUZJRURfU0lOQ0U6XG5cdFx0XHRcdHJldHVybiB0aGlzLmRvV3JpdGVDb25maWd1cmF0aW9uKG9wZXJhdGlvbiwgeyBzY29wZXMsIGhhbmRsZURpcnR5RmlsZTogJ3JldmVydCcgfSk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IubWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkludmFsaWRDb25maWd1cmF0aW9uRXJyb3IoZXJyb3I6IENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IsIG9wZXJhdGlvbjogSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uLCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wZW5TdGFuZEFsb25lQ29uZmlndXJhdGlvbkFjdGlvbkxhYmVsID0gb3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBUQVNLU19DT05GSUdVUkFUSU9OX0tFWSA/IG5scy5sb2NhbGl6ZSgnb3BlblRhc2tzQ29uZmlndXJhdGlvbicsIFwiT3BlbiBUYXNrcyBDb25maWd1cmF0aW9uXCIpXG5cdFx0XHQ6IG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTEFVTkNIX0NPTkZJR1VSQVRJT05fS0VZID8gbmxzLmxvY2FsaXplKCdvcGVuTGF1bmNoQ29uZmlndXJhdGlvbicsIFwiT3BlbiBMYXVuY2ggQ29uZmlndXJhdGlvblwiKVxuXHRcdFx0XHQ6IG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTUNQX0NPTkZJR1VSQVRJT05fS0VZID8gbmxzLmxvY2FsaXplKCdvcGVuTWNwQ29uZmlndXJhdGlvbicsIFwiT3BlbiBNQ1AgQ29uZmlndXJhdGlvblwiKVxuXHRcdFx0XHRcdDogbnVsbDtcblx0XHRpZiAob3BlblN0YW5kQWxvbmVDb25maWd1cmF0aW9uQWN0aW9uTGFiZWwpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIGVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IG9wZW5TdGFuZEFsb25lQ29uZmlndXJhdGlvbkFjdGlvbkxhYmVsLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuRmlsZShvcGVyYXRpb24ucmVzb3VyY2UhKVxuXHRcdFx0XHR9XVxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgZXJyb3IubWVzc2FnZSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdvcGVuJywgXCJPcGVuIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuU2V0dGluZ3Mob3BlcmF0aW9uKVxuXHRcdFx0XHR9XVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQ29uZmlndXJhdGlvbkZpbGVEaXJ0eUVycm9yKGVycm9yOiBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yLCBvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiwgc2NvcGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wZW5TdGFuZEFsb25lQ29uZmlndXJhdGlvbkFjdGlvbkxhYmVsID0gb3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBUQVNLU19DT05GSUdVUkFUSU9OX0tFWSA/IG5scy5sb2NhbGl6ZSgnb3BlblRhc2tzQ29uZmlndXJhdGlvbicsIFwiT3BlbiBUYXNrcyBDb25maWd1cmF0aW9uXCIpXG5cdFx0XHQ6IG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTEFVTkNIX0NPTkZJR1VSQVRJT05fS0VZID8gbmxzLmxvY2FsaXplKCdvcGVuTGF1bmNoQ29uZmlndXJhdGlvbicsIFwiT3BlbiBMYXVuY2ggQ29uZmlndXJhdGlvblwiKVxuXHRcdFx0XHQ6IG51bGw7XG5cdFx0aWYgKG9wZW5TdGFuZEFsb25lQ29uZmlndXJhdGlvbkFjdGlvbkxhYmVsKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkVycm9yLCBlcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3NhdmVBbmRSZXRyeScsIFwiU2F2ZSBhbmQgUmV0cnlcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBrZXkgPSBvcGVyYXRpb24ua2V5ID8gYCR7b3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5fS4ke29wZXJhdGlvbi5rZXl9YCA6IG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSE7XG5cdFx0XHRcdFx0XHR0aGlzLndyaXRlQ29uZmlndXJhdGlvbihvcGVyYXRpb24udGFyZ2V0LCB7IGtleSwgdmFsdWU6IG9wZXJhdGlvbi52YWx1ZSB9LCB7IGhhbmRsZURpcnR5RmlsZTogJ3NhdmUnLCBzY29wZXMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG9wZW5TdGFuZEFsb25lQ29uZmlndXJhdGlvbkFjdGlvbkxhYmVsLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuRmlsZShvcGVyYXRpb24ucmVzb3VyY2UhKVxuXHRcdFx0XHR9XVxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgZXJyb3IubWVzc2FnZSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdzYXZlQW5kUmV0cnknLCBcIlNhdmUgYW5kIFJldHJ5XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy53cml0ZUNvbmZpZ3VyYXRpb24ob3BlcmF0aW9uLnRhcmdldCwgeyBrZXk6IG9wZXJhdGlvbi5rZXksIHZhbHVlOiBvcGVyYXRpb24udmFsdWUgfSwgeyBoYW5kbGVEaXJ0eUZpbGU6ICdzYXZlJywgc2NvcGVzIH0pXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdvcGVuJywgXCJPcGVuIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuU2V0dGluZ3Mob3BlcmF0aW9uKVxuXHRcdFx0XHR9XVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9wZW5TZXR0aW5ncyhvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zID0geyBqc29uRWRpdG9yOiB0cnVlIH07XG5cdFx0c3dpdGNoIChvcGVyYXRpb24udGFyZ2V0KSB7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKG9wdGlvbnMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOlxuXHRcdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuUmVtb3RlU2V0dGluZ3Mob3B0aW9ucyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuV29ya3NwYWNlU2V0dGluZ3Mob3B0aW9ucyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjpcblx0XHRcdFx0aWYgKG9wZXJhdGlvbi5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKG9wZXJhdGlvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlbkZvbGRlclNldHRpbmdzKHsgZm9sZGVyVXJpOiB3b3Jrc3BhY2VGb2xkZXIudXJpLCBqc29uRWRpdG9yOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9wZW5GaWxlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoY29kZTogQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUsIHRhcmdldDogRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LCBvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbik6IENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3Ige1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnRvRXJyb3JNZXNzYWdlKGNvZGUsIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHRyZXR1cm4gbmV3IENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IobWVzc2FnZSwgY29kZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvRXJyb3JNZXNzYWdlKGVycm9yOiBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZSwgdGFyZ2V0OiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQsIG9wZXJhdGlvbjogSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEFQSSBjb25zdHJhaW50c1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9QT0xJQ1lfQ09ORklHVVJBVElPTjogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JQb2xpY3lDb25maWd1cmF0aW9uJywgXCJVbmFibGUgdG8gd3JpdGUgezB9IGJlY2F1c2UgaXQgaXMgY29uZmlndXJlZCBpbiBzeXN0ZW0gcG9saWN5LlwiLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfVU5LTk9XTl9LRVk6IHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yVW5rbm93bktleScsIFwiVW5hYmxlIHRvIHdyaXRlIHRvIHswfSBiZWNhdXNlIHsxfSBpcyBub3QgYSByZWdpc3RlcmVkIGNvbmZpZ3VyYXRpb24uXCIsIHRoaXMuc3RyaW5naWZ5VGFyZ2V0KHRhcmdldCksIG9wZXJhdGlvbi5rZXkpO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX1dPUktTUEFDRV9DT05GSUdVUkFUSU9OX0FQUExJQ0FUSU9OOiByZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uQXBwbGljYXRpb24nLCBcIlVuYWJsZSB0byB3cml0ZSB7MH0gdG8gV29ya3NwYWNlIFNldHRpbmdzLiBUaGlzIHNldHRpbmcgY2FuIGJlIHdyaXR0ZW4gb25seSBpbnRvIFVzZXIgc2V0dGluZ3MuXCIsIG9wZXJhdGlvbi5rZXkpO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX1dPUktTUEFDRV9DT05GSUdVUkFUSU9OX01BQ0hJTkU6IHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25NYWNoaW5lJywgXCJVbmFibGUgdG8gd3JpdGUgezB9IHRvIFdvcmtzcGFjZSBTZXR0aW5ncy4gVGhpcyBzZXR0aW5nIGNhbiBiZSB3cml0dGVuIG9ubHkgaW50byBVc2VyIHNldHRpbmdzLlwiLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9GT0xERVJfQ09ORklHVVJBVElPTjogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkRm9sZGVyQ29uZmlndXJhdGlvbicsIFwiVW5hYmxlIHRvIHdyaXRlIHRvIEZvbGRlciBTZXR0aW5ncyBiZWNhdXNlIHswfSBkb2VzIG5vdCBzdXBwb3J0IHRoZSBmb2xkZXIgcmVzb3VyY2Ugc2NvcGUuXCIsIG9wZXJhdGlvbi5rZXkpO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX1VTRVJfVEFSR0VUOiByZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRVc2VyVGFyZ2V0JywgXCJVbmFibGUgdG8gd3JpdGUgdG8gVXNlciBTZXR0aW5ncyBiZWNhdXNlIHswfSBkb2VzIG5vdCBzdXBwb3J0IGZvciBnbG9iYWwgc2NvcGUuXCIsIG9wZXJhdGlvbi5rZXkpO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX1dPUktTUEFDRV9UQVJHRVQ6IHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZFdvcmtzcGFjZVRhcmdldCcsIFwiVW5hYmxlIHRvIHdyaXRlIHRvIFdvcmtzcGFjZSBTZXR0aW5ncyBiZWNhdXNlIHswfSBkb2VzIG5vdCBzdXBwb3J0IGZvciB3b3Jrc3BhY2Ugc2NvcGUgaW4gYSBtdWx0aSBmb2xkZXIgd29ya3NwYWNlLlwiLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9GT0xERVJfVEFSR0VUOiByZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRGb2xkZXJUYXJnZXQnLCBcIlVuYWJsZSB0byB3cml0ZSB0byBGb2xkZXIgU2V0dGluZ3MgYmVjYXVzZSBubyByZXNvdXJjZSBpcyBwcm92aWRlZC5cIik7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfUkVTT1VSQ0VfTEFOR1VBR0VfQ09ORklHVVJBVElPTjogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkUmVzb3VyY2VMYW5ndWFnZUNvbmZpZ3VyYXRpb24nLCBcIlVuYWJsZSB0byB3cml0ZSB0byBMYW5ndWFnZSBTZXR0aW5ncyBiZWNhdXNlIHswfSBpcyBub3QgYSByZXNvdXJjZSBsYW5ndWFnZSBzZXR0aW5nLlwiLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfTk9fV09SS1NQQUNFX09QRU5FRDogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JOb1dvcmtzcGFjZU9wZW5lZCcsIFwiVW5hYmxlIHRvIHdyaXRlIHRvIHswfSBiZWNhdXNlIG5vIHdvcmtzcGFjZSBpcyBvcGVuZWQuIFBsZWFzZSBvcGVuIGEgd29ya3NwYWNlIGZpcnN0IGFuZCB0cnkgYWdhaW4uXCIsIHRoaXMuc3RyaW5naWZ5VGFyZ2V0KHRhcmdldCkpO1xuXG5cdFx0XHQvLyBVc2VyIGlzc3Vlc1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX0NPTkZJR1VSQVRJT046IHtcblx0XHRcdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gVEFTS1NfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRUYXNrQ29uZmlndXJhdGlvbicsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gdGhlIHRhc2tzIGNvbmZpZ3VyYXRpb24gZmlsZS4gUGxlYXNlIG9wZW4gaXQgdG8gY29ycmVjdCBlcnJvcnMvd2FybmluZ3MgaW4gaXQgYW5kIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTEFVTkNIX0NPTkZJR1VSQVRJT05fS0VZKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkTGF1bmNoQ29uZmlndXJhdGlvbicsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gdGhlIGxhdW5jaCBjb25maWd1cmF0aW9uIGZpbGUuIFBsZWFzZSBvcGVuIGl0IHRvIGNvcnJlY3QgZXJyb3JzL3dhcm5pbmdzIGluIGl0IGFuZCB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IE1DUF9DT05GSUdVUkFUSU9OX0tFWSkge1xuXHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZE1DUENvbmZpZ3VyYXRpb24nLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHRoZSBNQ1AgY29uZmlndXJhdGlvbiBmaWxlLiBQbGVhc2Ugb3BlbiBpdCB0byBjb3JyZWN0IGVycm9ycy93YXJuaW5ncyBpbiBpdCBhbmQgdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzd2l0Y2ggKHRhcmdldCkge1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRDb25maWd1cmF0aW9uJywgXCJVbmFibGUgdG8gd3JpdGUgaW50byB1c2VyIHNldHRpbmdzLiBQbGVhc2Ugb3BlbiB0aGUgdXNlciBzZXR0aW5ncyB0byBjb3JyZWN0IGVycm9ycy93YXJuaW5ncyBpbiBpdCBhbmQgdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZFJlbW90ZUNvbmZpZ3VyYXRpb24nLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHJlbW90ZSB1c2VyIHNldHRpbmdzLiBQbGVhc2Ugb3BlbiB0aGUgcmVtb3RlIHVzZXIgc2V0dGluZ3MgdG8gY29ycmVjdCBlcnJvcnMvd2FybmluZ3MgaW4gaXQgYW5kIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkQ29uZmlndXJhdGlvbldvcmtzcGFjZScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gd29ya3NwYWNlIHNldHRpbmdzLiBQbGVhc2Ugb3BlbiB0aGUgd29ya3NwYWNlIHNldHRpbmdzIHRvIGNvcnJlY3QgZXJyb3JzL3dhcm5pbmdzIGluIHRoZSBmaWxlIGFuZCB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6IHtcblx0XHRcdFx0XHRcdGxldCB3b3Jrc3BhY2VGb2xkZXJOYW1lOiBzdHJpbmcgPSAnPDx1bmtub3duPj4nO1xuXHRcdFx0XHRcdFx0aWYgKG9wZXJhdGlvbi5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihvcGVyYXRpb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyTmFtZSA9IGZvbGRlci5uYW1lO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRDb25maWd1cmF0aW9uRm9sZGVyJywgXCJVbmFibGUgdG8gd3JpdGUgaW50byBmb2xkZXIgc2V0dGluZ3MuIFBsZWFzZSBvcGVuIHRoZSAnezB9JyBmb2xkZXIgc2V0dGluZ3MgdG8gY29ycmVjdCBlcnJvcnMvd2FybmluZ3MgaW4gaXQgYW5kIHRyeSBhZ2Fpbi5cIiwgd29ya3NwYWNlRm9sZGVyTmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfQ09ORklHVVJBVElPTl9GSUxFX0RJUlRZOiB7XG5cdFx0XHRcdGlmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IFRBU0tTX0NPTkZJR1VSQVRJT05fS0VZKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JUYXNrc0NvbmZpZ3VyYXRpb25GaWxlRGlydHknLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHRhc2tzIGNvbmZpZ3VyYXRpb24gZmlsZSBiZWNhdXNlIHRoZSBmaWxlIGhhcyB1bnNhdmVkIGNoYW5nZXMuIFBsZWFzZSBzYXZlIGl0IGZpcnN0IGFuZCB0aGVuIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTEFVTkNIX0NPTkZJR1VSQVRJT05fS0VZKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JMYXVuY2hDb25maWd1cmF0aW9uRmlsZURpcnR5JywgXCJVbmFibGUgdG8gd3JpdGUgaW50byBsYXVuY2ggY29uZmlndXJhdGlvbiBmaWxlIGJlY2F1c2UgdGhlIGZpbGUgaGFzIHVuc2F2ZWQgY2hhbmdlcy4gUGxlYXNlIHNhdmUgaXQgZmlyc3QgYW5kIHRoZW4gdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBNQ1BfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvck1DUENvbmZpZ3VyYXRpb25GaWxlRGlydHknLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIE1DUCBjb25maWd1cmF0aW9uIGZpbGUgYmVjYXVzZSB0aGUgZmlsZSBoYXMgdW5zYXZlZCBjaGFuZ2VzLiBQbGVhc2Ugc2F2ZSBpdCBmaXJzdCBhbmQgdGhlbiB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN3aXRjaCAodGFyZ2V0KSB7XG5cdFx0XHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yQ29uZmlndXJhdGlvbkZpbGVEaXJ0eScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gdXNlciBzZXR0aW5ncyBiZWNhdXNlIHRoZSBmaWxlIGhhcyB1bnNhdmVkIGNoYW5nZXMuIFBsZWFzZSBzYXZlIHRoZSB1c2VyIHNldHRpbmdzIGZpbGUgZmlyc3QgYW5kIHRoZW4gdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yUmVtb3RlQ29uZmlndXJhdGlvbkZpbGVEaXJ0eScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gcmVtb3RlIHVzZXIgc2V0dGluZ3MgYmVjYXVzZSB0aGUgZmlsZSBoYXMgdW5zYXZlZCBjaGFuZ2VzLiBQbGVhc2Ugc2F2ZSB0aGUgcmVtb3RlIHVzZXIgc2V0dGluZ3MgZmlsZSBmaXJzdCBhbmQgdGhlbiB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yQ29uZmlndXJhdGlvbkZpbGVEaXJ0eVdvcmtzcGFjZScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gd29ya3NwYWNlIHNldHRpbmdzIGJlY2F1c2UgdGhlIGZpbGUgaGFzIHVuc2F2ZWQgY2hhbmdlcy4gUGxlYXNlIHNhdmUgdGhlIHdvcmtzcGFjZSBzZXR0aW5ncyBmaWxlIGZpcnN0IGFuZCB0aGVuIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjoge1xuXHRcdFx0XHRcdFx0bGV0IHdvcmtzcGFjZUZvbGRlck5hbWU6IHN0cmluZyA9ICc8PHVua25vd24+Pic7XG5cdFx0XHRcdFx0XHRpZiAob3BlcmF0aW9uLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKG9wZXJhdGlvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJOYW1lID0gZm9sZGVyLm5hbWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yQ29uZmlndXJhdGlvbkZpbGVEaXJ0eUZvbGRlcicsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gZm9sZGVyIHNldHRpbmdzIGJlY2F1c2UgdGhlIGZpbGUgaGFzIHVuc2F2ZWQgY2hhbmdlcy4gUGxlYXNlIHNhdmUgdGhlICd7MH0nIGZvbGRlciBzZXR0aW5ncyBmaWxlIGZpcnN0IGFuZCB0aGVuIHRyeSBhZ2Fpbi5cIiwgd29ya3NwYWNlRm9sZGVyTmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfQ09ORklHVVJBVElPTl9GSUxFX01PRElGSUVEX1NJTkNFOlxuXHRcdFx0XHRpZiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBUQVNLU19DT05GSUdVUkFUSU9OX0tFWSkge1xuXHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yVGFza3NDb25maWd1cmF0aW9uRmlsZU1vZGlmaWVkU2luY2UnLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHRhc2tzIGNvbmZpZ3VyYXRpb24gZmlsZSBiZWNhdXNlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBMQVVOQ0hfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckxhdW5jaENvbmZpZ3VyYXRpb25GaWxlTW9kaWZpZWRTaW5jZScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gbGF1bmNoIGNvbmZpZ3VyYXRpb24gZmlsZSBiZWNhdXNlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBNQ1BfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvck1DUENvbmZpZ3VyYXRpb25GaWxlTW9kaWZpZWRTaW5jZScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gTUNQIGNvbmZpZ3VyYXRpb24gZmlsZSBiZWNhdXNlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzd2l0Y2ggKHRhcmdldCkge1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckNvbmZpZ3VyYXRpb25GaWxlTW9kaWZpZWRTaW5jZScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gdXNlciBzZXR0aW5ncyBiZWNhdXNlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLlwiKTtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yUmVtb3RlQ29uZmlndXJhdGlvbkZpbGVNb2RpZmllZFNpbmNlJywgXCJVbmFibGUgdG8gd3JpdGUgaW50byByZW1vdGUgdXNlciBzZXR0aW5ncyBiZWNhdXNlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLlwiKTtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckNvbmZpZ3VyYXRpb25GaWxlTW9kaWZpZWRTaW5jZVdvcmtzcGFjZScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gd29ya3NwYWNlIHNldHRpbmdzIGJlY2F1c2UgdGhlIGNvbnRlbnQgb2YgdGhlIGZpbGUgaXMgbmV3ZXIuXCIpO1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckNvbmZpZ3VyYXRpb25GaWxlTW9kaWZpZWRTaW5jZUZvbGRlcicsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gZm9sZGVyIHNldHRpbmdzIGJlY2F1c2UgdGhlIGNvbnRlbnQgb2YgdGhlIGZpbGUgaXMgbmV3ZXIuXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVEVSTkFMOiByZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvclVua25vd24nLCBcIlVuYWJsZSB0byB3cml0ZSB0byB7MH0gYmVjYXVzZSBvZiBhbiBpbnRlcm5hbCBlcnJvci5cIiwgdGhpcy5zdHJpbmdpZnlUYXJnZXQodGFyZ2V0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdHJpbmdpZnlUYXJnZXQodGFyZ2V0OiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodGFyZ2V0KSB7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd1c2VyVGFyZ2V0JywgXCJVc2VyIFNldHRpbmdzXCIpO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW90ZVVzZXJUYXJnZXQnLCBcIlJlbW90ZSBVc2VyIFNldHRpbmdzXCIpO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VUYXJnZXQnLCBcIldvcmtzcGFjZSBTZXR0aW5nc1wiKTtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2ZvbGRlclRhcmdldCcsIFwiRm9sZGVyIFNldHRpbmdzXCIpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGVmYXVsdFJlc291cmNlVmFsdWUocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYmFzZW5hbWU6IHN0cmluZyA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5iYXNlbmFtZShyZXNvdXJjZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblZhbHVlOiBzdHJpbmcgPSBiYXNlbmFtZS5zdWJzdHIoMCwgYmFzZW5hbWUubGVuZ3RoIC0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmV4dG5hbWUocmVzb3VyY2UpLmxlbmd0aCk7XG5cdFx0c3dpdGNoIChjb25maWd1cmF0aW9uVmFsdWUpIHtcblx0XHRcdGNhc2UgVEFTS1NfQ09ORklHVVJBVElPTl9LRVk6IHJldHVybiBUQVNLU19ERUZBVUxUO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuICd7fSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+PiB7XG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocmVzb3VyY2UpO1xuXHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS53cml0ZShyZXNvdXJjZSwgdGhpcy5kZWZhdWx0UmVzb3VyY2VWYWx1ZShyZXNvdXJjZSksIHsgZW5jb2Rpbmc6ICd1dGY4JyB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgaGFzUGFyc2VFcnJvcnMoY29udGVudDogc3RyaW5nLCBvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbik6IGJvb2xlYW4ge1xuXHRcdC8vIElmIHdlIHdyaXRlIHRvIGEgd29ya3NwYWNlIHN0YW5kYWxvbmUgZmlsZSBhbmQgcmVwbGFjZSB0aGUgZW50aXJlIGNvbnRlbnRzIChubyBrZXkgcHJvdmlkZWQpXG5cdFx0Ly8gd2UgY2FuIHJldHVybiBoZXJlIGJlY2F1c2UgYW55IHBhcnNlIGVycm9ycyBjYW4gc2FmZWx5IGJlIGlnbm9yZWQgc2luY2UgYWxsIGNvbnRlbnRzIGFyZSByZXBsYWNlZFxuXHRcdGlmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgJiYgIW9wZXJhdGlvbi5rZXkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VFcnJvcnM6IGpzb24uUGFyc2VFcnJvcltdID0gW107XG5cdFx0anNvbi5wYXJzZShjb250ZW50LCBwYXJzZUVycm9ycywgeyBhbGxvd1RyYWlsaW5nQ29tbWE6IHRydWUsIGFsbG93RW1wdHlDb250ZW50OiB0cnVlIH0pO1xuXHRcdHJldHVybiBwYXJzZUVycm9ycy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZSh0YXJnZXQ6IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCwgb3BlcmF0aW9uOiBJQ29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24sIGNoZWNrRGlydHk6IGJvb2xlYW4sIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qob3BlcmF0aW9uLmtleSkucG9saWN5VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfUE9MSUNZX0NPTkZJR1VSQVRJT04sIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNjb3BlID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNbb3BlcmF0aW9uLmtleV0/LnNjb3BlO1xuXG5cdFx0LyoqXG5cdFx0ICogS2V5IHRvIHVwZGF0ZSBtdXN0IGJlIGEga25vd24gc2V0dGluZyBmcm9tIHRoZSByZWdpc3RyeSB1bmxlc3Ncblx0XHQgKiBcdC0gdGhlIGtleSBpcyBzdGFuZGFsb25lIGNvbmZpZ3VyYXRpb24gKGVnOiB0YXNrcywgZGVidWcpXG5cdFx0ICogXHQtIHRoZSBrZXkgaXMgYW4gb3ZlcnJpZGUgaWRlbnRpZmllclxuXHRcdCAqIFx0LSB0aGUgb3BlcmF0aW9uIGlzIHRvIGRlbGV0ZSB0aGUga2V5XG5cdFx0ICovXG5cdFx0aWYgKCFvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkpIHtcblx0XHRcdGNvbnN0IHZhbGlkS2V5cyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uua2V5cygpLmRlZmF1bHQ7XG5cdFx0XHRpZiAodmFsaWRLZXlzLmluZGV4T2Yob3BlcmF0aW9uLmtleSkgPCAwICYmICFPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KG9wZXJhdGlvbi5rZXkpICYmIG9wZXJhdGlvbi52YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX1VOS05PV05fS0VZLCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSkge1xuXHRcdFx0Ly8gR2xvYmFsIGxhdW5jaGVzIGFyZSBub3Qgc3VwcG9ydGVkXG5cdFx0XHRpZiAoKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSAhPT0gVEFTS1NfQ09ORklHVVJBVElPTl9LRVkpICYmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgIT09IE1DUF9DT05GSUdVUkFUSU9OX0tFWSkgJiYgKHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgfHwgdGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpKSB7XG5cdFx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfVVNFUl9UQVJHRVQsIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUYXJnZXQgY2Fubm90IGJlIHdvcmtzcGFjZSBvciBmb2xkZXIgaWYgbm8gd29ya3NwYWNlIG9wZW5lZFxuXHRcdGlmICgodGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIHx8IHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpICYmIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX05PX1dPUktTUEFDRV9PUEVORUQsIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSB7XG5cdFx0XHRpZiAoIW9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSAmJiAhT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChvcGVyYXRpb24ua2V5KSkge1xuXHRcdFx0XHRpZiAoY29uZmlndXJhdGlvblNjb3BlICYmIEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyhjb25maWd1cmF0aW9uU2NvcGUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9XT1JLU1BBQ0VfQ09ORklHVVJBVElPTl9BUFBMSUNBVElPTiwgdGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uU2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FKSB7XG5cdFx0XHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9XT1JLU1BBQ0VfQ09ORklHVVJBVElPTl9NQUNISU5FLCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUikge1xuXHRcdFx0aWYgKCFvcGVyYXRpb24ucmVzb3VyY2UpIHtcblx0XHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9GT0xERVJfVEFSR0VULCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghb3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ICYmICFPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KG9wZXJhdGlvbi5rZXkpKSB7XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uU2NvcGUgIT09IHVuZGVmaW5lZCAmJiAhRk9MREVSX1NDT1BFUy5pbmNsdWRlcyhjb25maWd1cmF0aW9uU2NvcGUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9GT0xERVJfQ09ORklHVVJBVElPTiwgdGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzPy5sZW5ndGgpIHtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uU2NvcGUgIT09IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLnRvQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX1JFU09VUkNFX0xBTkdVQUdFX0NPTkZJR1VSQVRJT04sIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIW9wZXJhdGlvbi5yZXNvdXJjZSkge1xuXHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9GT0xERVJfVEFSR0VULCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKGNoZWNrRGlydHkgJiYgdGhpcy50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eShvcGVyYXRpb24ucmVzb3VyY2UpKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnRvQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9DT05GSUdVUkFUSU9OX0ZJTEVfRElSVFksIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24odGFyZ2V0OiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQsIGNvbmZpZzogSUNvbmZpZ3VyYXRpb25WYWx1ZSwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyk6IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiB7XG5cblx0XHQvLyBDaGVjayBmb3Igc3RhbmRhbG9uZSB3b3Jrc3BhY2UgY29uZmlndXJhdGlvbnNcblx0XHRpZiAoY29uZmlnLmtleSkge1xuXHRcdFx0Y29uc3Qgc3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25NYXAgPSB0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMID8gVVNFUl9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TIDogV09SS1NQQUNFX1NUQU5EQUxPTkVfQ09ORklHVVJBVElPTlM7XG5cdFx0XHRjb25zdCBzdGFuZGFsb25lQ29uZmlndXJhdGlvbktleXMgPSBPYmplY3Qua2V5cyhzdGFuZGFsb25lQ29uZmlndXJhdGlvbk1hcCk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBzdGFuZGFsb25lQ29uZmlndXJhdGlvbktleXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmdldENvbmZpZ3VyYXRpb25GaWxlUmVzb3VyY2UodGFyZ2V0LCBrZXksIHN0YW5kYWxvbmVDb25maWd1cmF0aW9uTWFwW2tleV0sIG92ZXJyaWRlcy5yZXNvdXJjZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyBDaGVjayBmb3IgcHJlZml4XG5cdFx0XHRcdGlmIChjb25maWcua2V5ID09PSBrZXkpIHtcblx0XHRcdFx0XHRjb25zdCBqc29uUGF0aCA9IHRoaXMuaXNXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVzb3VyY2UocmVzb3VyY2UpID8gW2tleV0gOiBbXTtcblx0XHRcdFx0XHRyZXR1cm4geyBrZXk6IGpzb25QYXRoW2pzb25QYXRoLmxlbmd0aCAtIDFdLCBqc29uUGF0aCwgdmFsdWU6IGNvbmZpZy52YWx1ZSwgcmVzb3VyY2U6IHJlc291cmNlID8/IHVuZGVmaW5lZCwgd29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXk6IGtleSwgdGFyZ2V0IH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDaGVjayBmb3IgcHJlZml4LjxzZXR0aW5nPlxuXHRcdFx0XHRjb25zdCBrZXlQcmVmaXggPSBgJHtrZXl9LmA7XG5cdFx0XHRcdGlmIChjb25maWcua2V5LmluZGV4T2Yoa2V5UHJlZml4KSA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGpzb25QYXRoID0gdGhpcy5pc1dvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZXNvdXJjZShyZXNvdXJjZSkgPyBba2V5LCBjb25maWcua2V5LnN1YnN0cmluZyhrZXlQcmVmaXgubGVuZ3RoKV0gOiBbY29uZmlnLmtleS5zdWJzdHJpbmcoa2V5UHJlZml4Lmxlbmd0aCldO1xuXHRcdFx0XHRcdHJldHVybiB7IGtleToganNvblBhdGhbanNvblBhdGgubGVuZ3RoIC0gMV0sIGpzb25QYXRoLCB2YWx1ZTogY29uZmlnLnZhbHVlLCByZXNvdXJjZTogcmVzb3VyY2UgPz8gdW5kZWZpbmVkLCB3b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleToga2V5LCB0YXJnZXQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IGNvbmZpZy5rZXk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TY29wZSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV0/LnNjb3BlO1xuXHRcdGxldCBqc29uUGF0aCA9IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzPy5sZW5ndGggPyBba2V5RnJvbU92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMpLCBrZXldIDogW2tleV07XG5cdFx0aWYgKHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgfHwgdGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpIHtcblx0XHRcdHJldHVybiB7IGtleSwganNvblBhdGgsIHZhbHVlOiBjb25maWcudmFsdWUsIHJlc291cmNlOiB0aGlzLmdldENvbmZpZ3VyYXRpb25GaWxlUmVzb3VyY2UodGFyZ2V0LCBrZXksICcnLCBudWxsLCBjb25maWd1cmF0aW9uU2NvcGUpID8/IHVuZGVmaW5lZCwgdGFyZ2V0IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmdldENvbmZpZ3VyYXRpb25GaWxlUmVzb3VyY2UodGFyZ2V0LCBrZXksIEZPTERFUl9TRVRUSU5HU19QQVRILCBvdmVycmlkZXMucmVzb3VyY2UsIGNvbmZpZ3VyYXRpb25TY29wZSk7XG5cdFx0aWYgKHRoaXMuaXNXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVzb3VyY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRqc29uUGF0aCA9IFsnc2V0dGluZ3MnLCAuLi5qc29uUGF0aF07XG5cdFx0fVxuXHRcdHJldHVybiB7IGtleSwganNvblBhdGgsIHZhbHVlOiBjb25maWcudmFsdWUsIHJlc291cmNlOiByZXNvdXJjZSA/PyB1bmRlZmluZWQsIHRhcmdldCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBpc1dvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZXNvdXJjZShyZXNvdXJjZTogVVJJIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0cmV0dXJuICEhKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uICYmIHJlc291cmNlICYmIHdvcmtzcGFjZS5jb25maWd1cmF0aW9uLmZzUGF0aCA9PT0gcmVzb3VyY2UuZnNQYXRoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJhdGlvbkZpbGVSZXNvdXJjZSh0YXJnZXQ6IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCwga2V5OiBzdHJpbmcsIHJlbGF0aXZlUGF0aDogc3RyaW5nLCByZXNvdXJjZTogVVJJIHwgbnVsbCB8IHVuZGVmaW5lZCwgc2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZCk6IFVSSSB8IG51bGwge1xuXHRcdGlmICh0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHRpZiAoa2V5ID09PSBUQVNLU19DT05GSUdVUkFUSU9OX0tFWSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnRhc2tzUmVzb3VyY2U7XG5cdFx0XHR9IGlmIChrZXkgPT09IE1DUF9DT05GSUdVUkFUSU9OX0tFWSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCF0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0ICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaXNTZXR0aW5nQXBwbGllZEZvckFsbFByb2ZpbGVzKGtleSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZW1vdGVTZXR0aW5nc1Jlc291cmNlO1xuXHRcdH1cblx0XHRjb25zdCB3b3JrYmVuY2hTdGF0ZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKTtcblx0XHRpZiAod29ya2JlbmNoU3RhdGUgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cblx0XHRcdGlmICh0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpIHtcblx0XHRcdFx0aWYgKHdvcmtiZW5jaFN0YXRlID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdFx0XHRyZXR1cm4gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPz8gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAod29ya2JlbmNoU3RhdGUgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0XHRcdHJldHVybiB3b3Jrc3BhY2UuZm9sZGVyc1swXS50b1Jlc291cmNlKHJlbGF0aXZlUGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpIHtcblx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmb2xkZXIudG9SZXNvdXJjZShyZWxhdGl2ZVBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFFckIsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUV0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxzQkFBc0IscUNBQXFDLHlCQUF5QiwwQkFBMEIsZ0NBQWdDLGVBQWUsZUFBZSxnQ0FBZ0Msb0JBQW9CLDZCQUE2QjtBQUN0USxTQUE2QixxQkFBcUIsb0JBQW9CO0FBQ3RFLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFpQyxjQUFjLHlCQUF5QixvQkFBb0IsNEJBQTRCLCtCQUErQjtBQUN2SixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBK0IsMkJBQTJCO0FBQzFELFNBQVMsMkJBQTJCO0FBR3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFp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LEtBQUssd0JBQXdCLGVBQWU7QUFBQSxRQUNwRDtBQUNBLGVBQU8sS0FBSyx1QkFBdUIsZUFBZTtBQUFBLE1BQ25EO0FBQUEsSUFDRDtBQUNBLFFBQUksV0FBVyxxQkFBeUM7QUFDdkQsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0saUJBQWlCLEtBQUssZUFBZSxrQkFBa0I7QUFDN0QsUUFBSSxtQkFBbUIsZUFBZSxPQUFPO0FBRTVDLFlBQU0sWUFBWSxLQUFLLGVBQWUsYUFBYTtBQUVuRCxVQUFJLFdBQVcsbUJBQXVDO0FBQ3JELFlBQUksbUJBQW1CLGVBQWUsV0FBVztBQUNoRCxpQkFBTyxVQUFVLGlCQUFpQjtBQUFBLFFBQ25DO0FBQ0EsWUFBSSxtQkFBbUIsZUFBZSxRQUFRO0FBQzdDLGlCQUFPLFVBQVUsUUFBUSxDQUFDLEVBQUUsV0FBVyxZQUFZO0FBQUEsUUFDcEQ7QUFBQSxNQUNEO0FBRUEsVUFBSSxXQUFXLDBCQUE4QztBQUM1RCxZQUFJLFVBQVU7QUFDYixnQkFBTSxTQUFTLEtBQUssZUFBZSxtQkFBbUIsUUFBUTtBQUM5RCxjQUFJLFFBQVE7QUFDWCxtQkFBTyxPQUFPLFdBQVcsWUFBWTtBQUFBLFVBQ3RDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWpoQmEsdUJBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5CVTsiLAogICJuYW1lcyI6IFsiQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUiLCAiRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0IiwgImtleSIsICJyZXNvdXJjZSIsICJqc29uUGF0aCJdCn0K
