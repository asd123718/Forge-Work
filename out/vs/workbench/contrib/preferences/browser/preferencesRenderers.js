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
import { EventHelper, getDomNodePagePosition } from "../../../../base/browser/dom.js";
import { SubmenuAction } from "../../../../base/common/actions.js";
import { Delayer } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import * as editorCommon from "../../../../editor/common/editorCommon.js";
import { TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { ModelDecorationOptions } from "../../../../editor/common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { CodeActionKind } from "../../../../editor/contrib/codeAction/common/types.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope, OVERRIDE_PROPERTY_REGEX, overrideIdentifiersFromKey } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IMarkerService, MarkerSeverity, MarkerTag } from "../../../../platform/markers/common/markers.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { RangeHighlightDecorations } from "../../../browser/codeeditor.js";
import { settingsEditIcon } from "./preferencesIcons.js";
import { EditPreferenceWidget } from "./preferencesWidgets.js";
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { DefaultSettingsEditorModel, WorkspaceConfigurationEditorModel } from "../../../services/preferences/common/preferencesModels.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { EXPERIMENTAL_INDICATOR_DESCRIPTION, PREVIEW_INDICATOR_DESCRIPTION } from "../common/preferences.js";
import { mcpConfigurationSection } from "../../mcp/common/mcpConfiguration.js";
import { McpCommandIds } from "../../mcp/common/mcpCommandIds.js";
let UserSettingsRenderer = class extends Disposable {
  constructor(editor, preferencesModel, preferencesService, configurationService, instantiationService) {
    super();
    this.editor = editor;
    this.preferencesModel = preferencesModel;
    this.preferencesService = preferencesService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.modelChangeDelayer = this._register(new Delayer(200));
    this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor));
    this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.preferencesModel, this.settingHighlighter));
    this._register(this.editSettingActionRenderer.onUpdateSetting(({ key, value, source }) => this.updatePreference(key, value, source)));
    this._register(this.editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));
    this.unsupportedSettingsRenderer = this._register(instantiationService.createInstance(UnsupportedSettingsRenderer, editor, preferencesModel));
    this.mcpSettingsRenderer = this._register(instantiationService.createInstance(McpSettingsRenderer, editor, preferencesModel));
  }
  render() {
    this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this.associatedPreferencesModel);
    this.unsupportedSettingsRenderer.render();
    this.mcpSettingsRenderer.render();
  }
  updatePreference(key, value, source) {
    const overrideIdentifiers = source.overrideOf ? overrideIdentifiersFromKey(source.overrideOf.key) : null;
    const resource = this.preferencesModel.uri;
    this.configurationService.updateValue(key, value, { overrideIdentifiers, resource }, this.preferencesModel.configurationTarget).then(() => this.onSettingUpdated(source));
  }
  onModelChanged() {
    if (!this.editor.hasModel()) {
      return;
    }
    this.render();
  }
  onSettingUpdated(setting) {
    this.editor.focus();
    setting = this.getSetting(setting);
    if (setting) {
      this.editor.setSelection(setting.valueRange);
      this.settingHighlighter.highlight(setting, true);
    }
  }
  getSetting(setting) {
    const { key, overrideOf } = setting;
    if (overrideOf) {
      const setting2 = this.getSetting(overrideOf);
      for (const override of setting2.overrides) {
        if (override.key === key) {
          return override;
        }
      }
      return void 0;
    }
    return this.preferencesModel.getPreference(key);
  }
  focusPreference(setting) {
    const s = this.getSetting(setting);
    if (s) {
      this.settingHighlighter.highlight(s, true);
      this.editor.setPosition({ lineNumber: s.keyRange.startLineNumber, column: s.keyRange.startColumn });
    } else {
      this.settingHighlighter.clear(true);
    }
  }
  clearFocus(setting) {
    this.settingHighlighter.clear(true);
  }
  editPreference(setting) {
    const editableSetting = this.getSetting(setting);
    return !!(editableSetting && this.editSettingActionRenderer.activateOnSetting(editableSetting));
  }
};
UserSettingsRenderer = __decorateClass([
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService)
], UserSettingsRenderer);
let WorkspaceSettingsRenderer = class extends UserSettingsRenderer {
  constructor(editor, preferencesModel, preferencesService, configurationService, instantiationService) {
    super(editor, preferencesModel, preferencesService, configurationService, instantiationService);
    this.workspaceConfigurationRenderer = this._register(instantiationService.createInstance(WorkspaceConfigurationRenderer, editor, preferencesModel));
  }
  render() {
    super.render();
    this.workspaceConfigurationRenderer.render();
  }
};
WorkspaceSettingsRenderer = __decorateClass([
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService)
], WorkspaceSettingsRenderer);
let EditSettingRenderer = class extends Disposable {
  constructor(editor, primarySettingsModel, settingHighlighter, configurationService, instantiationService, contextMenuService) {
    super();
    this.editor = editor;
    this.primarySettingsModel = primarySettingsModel;
    this.settingHighlighter = settingHighlighter;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.settingsGroups = [];
    this._onUpdateSetting = this._register(new Emitter());
    this.onUpdateSetting = this._onUpdateSetting.event;
    this.editPreferenceWidgetForCursorPosition = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
    this.editPreferenceWidgetForMouseMove = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
    this.toggleEditPreferencesForMouseMoveDelayer = this._register(new Delayer(75));
    this._register(this.editPreferenceWidgetForCursorPosition.onClick((e) => this.onEditSettingClicked(this.editPreferenceWidgetForCursorPosition, e)));
    this._register(this.editPreferenceWidgetForMouseMove.onClick((e) => this.onEditSettingClicked(this.editPreferenceWidgetForMouseMove, e)));
    this._register(this.editor.onDidChangeCursorPosition((positionChangeEvent) => this.onPositionChanged(positionChangeEvent)));
    this._register(this.editor.onMouseMove((mouseMoveEvent) => this.onMouseMoved(mouseMoveEvent)));
    this._register(this.editor.onDidChangeConfiguration(() => this.onConfigurationChanged()));
  }
  render(settingsGroups, associatedPreferencesModel) {
    this.editPreferenceWidgetForCursorPosition.hide();
    this.editPreferenceWidgetForMouseMove.hide();
    this.settingsGroups = settingsGroups;
    this.associatedPreferencesModel = associatedPreferencesModel;
    const settings = this.getSettings(this.editor.getPosition().lineNumber);
    if (settings.length) {
      this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
    }
  }
  isDefaultSettings() {
    return this.primarySettingsModel instanceof DefaultSettingsEditorModel;
  }
  onConfigurationChanged() {
    if (!this.editor.getOption(EditorOption.glyphMargin)) {
      this.editPreferenceWidgetForCursorPosition.hide();
      this.editPreferenceWidgetForMouseMove.hide();
    }
  }
  onPositionChanged(positionChangeEvent) {
    this.editPreferenceWidgetForMouseMove.hide();
    const settings = this.getSettings(positionChangeEvent.position.lineNumber);
    if (settings.length) {
      this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
    } else {
      this.editPreferenceWidgetForCursorPosition.hide();
    }
  }
  onMouseMoved(mouseMoveEvent) {
    const editPreferenceWidget = this.getEditPreferenceWidgetUnderMouse(mouseMoveEvent);
    if (editPreferenceWidget) {
      this.onMouseOver(editPreferenceWidget);
      return;
    }
    this.settingHighlighter.clear();
    this.toggleEditPreferencesForMouseMoveDelayer.trigger(() => this.toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent));
  }
  getEditPreferenceWidgetUnderMouse(mouseMoveEvent) {
    if (mouseMoveEvent.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const line = mouseMoveEvent.target.position.lineNumber;
      if (this.editPreferenceWidgetForMouseMove.getLine() === line && this.editPreferenceWidgetForMouseMove.isVisible()) {
        return this.editPreferenceWidgetForMouseMove;
      }
      if (this.editPreferenceWidgetForCursorPosition.getLine() === line && this.editPreferenceWidgetForCursorPosition.isVisible()) {
        return this.editPreferenceWidgetForCursorPosition;
      }
    }
    return void 0;
  }
  toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent) {
    const settings = mouseMoveEvent.target.position ? this.getSettings(mouseMoveEvent.target.position.lineNumber) : null;
    if (settings && settings.length) {
      this.showEditPreferencesWidget(this.editPreferenceWidgetForMouseMove, settings);
    } else {
      this.editPreferenceWidgetForMouseMove.hide();
    }
  }
  showEditPreferencesWidget(editPreferencesWidget, settings) {
    const line = settings[0].valueRange.startLineNumber;
    if (this.editor.getOption(EditorOption.glyphMargin) && this.marginFreeFromOtherDecorations(line)) {
      editPreferencesWidget.show(line, nls.localize("editTtile", "Edit"), settings);
      const editPreferenceWidgetToHide = editPreferencesWidget === this.editPreferenceWidgetForCursorPosition ? this.editPreferenceWidgetForMouseMove : this.editPreferenceWidgetForCursorPosition;
      editPreferenceWidgetToHide.hide();
    }
  }
  marginFreeFromOtherDecorations(line) {
    const decorations = this.editor.getLineDecorations(line);
    if (decorations) {
      for (const { options } of decorations) {
        if (options.glyphMarginClassName && options.glyphMarginClassName.indexOf(ThemeIcon.asClassName(settingsEditIcon)) === -1) {
          return false;
        }
      }
    }
    return true;
  }
  getSettings(lineNumber) {
    const configurationMap = this.getConfigurationsMap();
    return this.getSettingsAtLineNumber(lineNumber).filter((setting) => {
      const configurationNode = configurationMap[setting.key];
      if (configurationNode) {
        if (configurationNode.policy && this.configurationService.inspect(setting.key).policyValue !== void 0) {
          return false;
        }
        if (this.isDefaultSettings()) {
          if (setting.key === "launch") {
            return false;
          }
          return true;
        }
        if (configurationNode.type === "boolean" || configurationNode.enum) {
          if (this.primarySettingsModel.configurationTarget !== ConfigurationTarget.WORKSPACE_FOLDER) {
            return true;
          }
          if (configurationNode.scope === ConfigurationScope.RESOURCE || configurationNode.scope === ConfigurationScope.LANGUAGE_OVERRIDABLE) {
            return true;
          }
        }
      }
      return false;
    });
  }
  getSettingsAtLineNumber(lineNumber) {
    let index = 0;
    const settings = [];
    for (const group of this.settingsGroups) {
      if (group.range.startLineNumber > lineNumber) {
        break;
      }
      if (lineNumber >= group.range.startLineNumber && lineNumber <= group.range.endLineNumber) {
        for (const section of group.sections) {
          for (const setting of section.settings) {
            if (setting.range.startLineNumber > lineNumber) {
              break;
            }
            if (lineNumber >= setting.range.startLineNumber && lineNumber <= setting.range.endLineNumber) {
              if (!this.isDefaultSettings() && setting.overrides.length) {
                for (const overrideSetting of setting.overrides) {
                  if (lineNumber >= overrideSetting.range.startLineNumber && lineNumber <= overrideSetting.range.endLineNumber) {
                    settings.push({ ...overrideSetting, index, groupId: group.id });
                  }
                }
              } else {
                settings.push({ ...setting, index, groupId: group.id });
              }
            }
            index++;
          }
        }
      }
    }
    return settings;
  }
  onMouseOver(editPreferenceWidget) {
    this.settingHighlighter.highlight(editPreferenceWidget.preferences[0]);
  }
  onEditSettingClicked(editPreferenceWidget, e) {
    EventHelper.stop(e.event, true);
    const actions = this.getSettings(editPreferenceWidget.getLine()).length === 1 ? this.getActions(editPreferenceWidget.preferences[0], this.getConfigurationsMap()[editPreferenceWidget.preferences[0].key]) : editPreferenceWidget.preferences.map((setting) => new SubmenuAction(`preferences.submenu.${setting.key}`, setting.key, this.getActions(setting, this.getConfigurationsMap()[setting.key])));
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.event,
      getActions: () => actions
    });
  }
  activateOnSetting(setting) {
    const startLine = setting.keyRange.startLineNumber;
    const settings = this.getSettings(startLine);
    if (!settings.length) {
      return false;
    }
    this.editPreferenceWidgetForMouseMove.show(startLine, "", settings);
    const actions = this.getActions(this.editPreferenceWidgetForMouseMove.preferences[0], this.getConfigurationsMap()[this.editPreferenceWidgetForMouseMove.preferences[0].key]);
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.toAbsoluteCoords(new Position(startLine, 1)),
      getActions: () => actions
    });
    return true;
  }
  toAbsoluteCoords(position) {
    const positionCoords = this.editor.getScrolledVisiblePosition(position);
    const editorCoords = getDomNodePagePosition(this.editor.getDomNode());
    const x = editorCoords.left + positionCoords.left;
    const y = editorCoords.top + positionCoords.top + positionCoords.height;
    return { x, y: y + 10 };
  }
  getConfigurationsMap() {
    return Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
  }
  getActions(setting, jsonSchema) {
    if (jsonSchema.type === "boolean") {
      return [{
        id: "truthyValue",
        label: "true",
        tooltip: "true",
        enabled: true,
        run: () => this.updateSetting(setting.key, true, setting),
        class: void 0
      }, {
        id: "falsyValue",
        label: "false",
        tooltip: "false",
        enabled: true,
        run: () => this.updateSetting(setting.key, false, setting),
        class: void 0
      }];
    }
    if (jsonSchema.enum) {
      return jsonSchema.enum.map((value) => {
        return {
          id: value,
          label: JSON.stringify(value),
          tooltip: JSON.stringify(value),
          enabled: true,
          run: () => this.updateSetting(setting.key, value, setting),
          class: void 0
        };
      });
    }
    return this.getDefaultActions(setting);
  }
  getDefaultActions(setting) {
    if (this.isDefaultSettings()) {
      const settingInOtherModel = this.associatedPreferencesModel.getPreference(setting.key);
      return [{
        id: "setDefaultValue",
        label: settingInOtherModel ? nls.localize("replaceDefaultValue", "Replace in Settings") : nls.localize("copyDefaultValue", "Copy to Settings"),
        tooltip: settingInOtherModel ? nls.localize("replaceDefaultValue", "Replace in Settings") : nls.localize("copyDefaultValue", "Copy to Settings"),
        enabled: true,
        run: () => this.updateSetting(setting.key, setting.value, setting),
        class: void 0
      }];
    }
    return [];
  }
  updateSetting(key, value, source) {
    this._onUpdateSetting.fire({ key, value, source });
  }
};
EditSettingRenderer = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextMenuService)
], EditSettingRenderer);
let SettingHighlighter = class extends Disposable {
  constructor(editor, instantiationService) {
    super();
    this.editor = editor;
    this.fixedHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
    this.volatileHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
  }
  highlight(setting, fix = false) {
    this.volatileHighlighter.removeHighlightRange();
    this.fixedHighlighter.removeHighlightRange();
    const highlighter = fix ? this.fixedHighlighter : this.volatileHighlighter;
    highlighter.highlightRange({
      range: setting.valueRange,
      resource: this.editor.getModel().uri
    }, this.editor);
    this.editor.revealLineInCenterIfOutsideViewport(setting.valueRange.startLineNumber, editorCommon.ScrollType.Smooth);
  }
  clear(fix = false) {
    this.volatileHighlighter.removeHighlightRange();
    if (fix) {
      this.fixedHighlighter.removeHighlightRange();
    }
  }
};
SettingHighlighter = __decorateClass([
  __decorateParam(1, IInstantiationService)
], SettingHighlighter);
let UnsupportedSettingsRenderer = class extends Disposable {
  constructor(editor, settingsEditorModel, markerService, environmentService, configurationService, workspaceTrustManagementService, uriIdentityService, languageFeaturesService, userDataProfileService, userDataProfilesService) {
    super();
    this.editor = editor;
    this.settingsEditorModel = settingsEditorModel;
    this.markerService = markerService;
    this.environmentService = environmentService;
    this.configurationService = configurationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.uriIdentityService = uriIdentityService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.renderingDelayer = this._register(new Delayer(200));
    this.codeActions = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    this._register(this.editor.getModel().onDidChangeContent(() => this.delayedRender()));
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.source === ConfigurationTarget.DEFAULT)(() => this.delayedRender()));
    this._register(languageFeaturesService.codeActionProvider.register({ pattern: settingsEditorModel.uri.path }, this));
    this._register(userDataProfileService.onDidChangeCurrentProfile(() => this.delayedRender()));
  }
  delayedRender() {
    this.renderingDelayer.trigger(() => this.render());
  }
  render() {
    this.codeActions.clear();
    const markerData = this.generateMarkerData();
    if (markerData.length) {
      this.markerService.changeOne("UnsupportedSettingsRenderer", this.settingsEditorModel.uri, markerData);
    } else {
      this.markerService.remove("UnsupportedSettingsRenderer", [this.settingsEditorModel.uri]);
    }
  }
  async provideCodeActions(model, range, context, token) {
    const actions = [];
    const codeActionsByRange = this.codeActions.get(model.uri);
    if (codeActionsByRange) {
      for (const [codeActionsRange, codeActions] of codeActionsByRange) {
        if (codeActionsRange.containsRange(range)) {
          actions.push(...codeActions);
        }
      }
    }
    return {
      actions,
      dispose: () => {
      }
    };
  }
  generateMarkerData() {
    const markerData = [];
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    for (const settingsGroup of this.settingsEditorModel.settingsGroups) {
      for (const section of settingsGroup.sections) {
        for (const setting of section.settings) {
          if (OVERRIDE_PROPERTY_REGEX.test(setting.key)) {
            if (setting.overrides) {
              this.handleOverrides(setting.overrides, configurationRegistry, markerData);
            }
            continue;
          }
          const configuration = configurationRegistry[setting.key];
          if (configuration) {
            this.handleUnstableSettingConfiguration(setting, configuration, markerData);
            if (this.handlePolicyConfiguration(setting, configuration, markerData)) {
              continue;
            }
            switch (this.settingsEditorModel.configurationTarget) {
              case ConfigurationTarget.USER_LOCAL:
                this.handleLocalUserConfiguration(setting, configuration, markerData);
                break;
              case ConfigurationTarget.USER_REMOTE:
                this.handleRemoteUserConfiguration(setting, configuration, markerData);
                break;
              case ConfigurationTarget.WORKSPACE:
                this.handleWorkspaceConfiguration(setting, configuration, markerData);
                break;
              case ConfigurationTarget.WORKSPACE_FOLDER:
                this.handleWorkspaceFolderConfiguration(setting, configuration, markerData);
                break;
            }
          } else {
            markerData.push(this.generateUnknownConfigurationMarker(setting));
          }
        }
      }
    }
    return markerData;
  }
  handlePolicyConfiguration(setting, configuration, markerData) {
    if (!configuration.policy) {
      return false;
    }
    if (this.configurationService.inspect(setting.key).policyValue === void 0) {
      return false;
    }
    if (this.settingsEditorModel.configurationTarget === ConfigurationTarget.DEFAULT) {
      return false;
    }
    markerData.push({
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unsupportedPolicySetting", "This setting cannot be applied because it is configured in the system policy.")
    });
    return true;
  }
  handleOverrides(overrides, configurationRegistry, markerData) {
    for (const setting of overrides || []) {
      const configuration = configurationRegistry[setting.key];
      if (configuration) {
        if (configuration.scope !== ConfigurationScope.LANGUAGE_OVERRIDABLE) {
          markerData.push({
            severity: MarkerSeverity.Hint,
            tags: [MarkerTag.Unnecessary],
            ...setting.range,
            message: nls.localize("unsupportLanguageOverrideSetting", "This setting cannot be applied because it is not registered as language override setting.")
          });
        }
      } else {
        markerData.push(this.generateUnknownConfigurationMarker(setting));
      }
    }
  }
  handleLocalUserConfiguration(setting, configuration, markerData) {
    if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
      if (isEqual(this.userDataProfilesService.defaultProfile.settingsResource, this.settingsEditorModel.uri) && !this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
        markerData.push({
          severity: MarkerSeverity.Hint,
          tags: [MarkerTag.Unnecessary],
          ...setting.range,
          message: nls.localize("defaultProfileSettingWhileNonDefaultActive", "This setting cannot be applied while a non-default profile is active. It will be applied when the default profile is active.")
        });
      } else if (isEqual(this.userDataProfileService.currentProfile.settingsResource, this.settingsEditorModel.uri)) {
        if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
          markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
        } else if (this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
          markerData.push({
            severity: MarkerSeverity.Hint,
            tags: [MarkerTag.Unnecessary],
            ...setting.range,
            message: nls.localize("allProfileSettingWhileInNonDefaultProfileSetting", "This setting cannot be applied because it is configured to be applied in all profiles using setting {0}. Value from the default profile will be used instead.", APPLY_ALL_PROFILES_SETTING)
          });
        }
      }
    }
    if (this.environmentService.remoteAuthority && (configuration.scope === ConfigurationScope.MACHINE || configuration.scope === ConfigurationScope.APPLICATION_MACHINE || configuration.scope === ConfigurationScope.MACHINE_OVERRIDABLE)) {
      markerData.push({
        severity: MarkerSeverity.Hint,
        tags: [MarkerTag.Unnecessary],
        ...setting.range,
        message: nls.localize("unsupportedRemoteMachineSetting", "This setting cannot be applied in this window. It will be applied when you open a local window.")
      });
    }
  }
  handleRemoteUserConfiguration(setting, configuration, markerData) {
    if (configuration.scope === ConfigurationScope.APPLICATION) {
      markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
    }
  }
  handleWorkspaceConfiguration(setting, configuration, markerData) {
    if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
      markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
    }
    if (configuration.scope === ConfigurationScope.MACHINE) {
      markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
    }
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && configuration.restricted) {
      const marker = this.generateUntrustedSettingMarker(setting);
      markerData.push(marker);
      const codeActions = this.generateUntrustedSettingCodeActions([marker]);
      this.addCodeActions(marker, codeActions);
    }
  }
  handleWorkspaceFolderConfiguration(setting, configuration, markerData) {
    if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
      markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
    }
    if (configuration.scope === ConfigurationScope.MACHINE) {
      markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
    }
    if (configuration.scope === ConfigurationScope.WINDOW) {
      markerData.push({
        severity: MarkerSeverity.Hint,
        tags: [MarkerTag.Unnecessary],
        ...setting.range,
        message: nls.localize("unsupportedWindowSetting", "This setting cannot be applied in this workspace. It will be applied when you open the containing workspace folder directly.")
      });
    }
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && configuration.restricted) {
      const marker = this.generateUntrustedSettingMarker(setting);
      markerData.push(marker);
      const codeActions = this.generateUntrustedSettingCodeActions([marker]);
      this.addCodeActions(marker, codeActions);
    }
  }
  handleUnstableSettingConfiguration(setting, configuration, markerData) {
    if (configuration.tags?.includes("preview")) {
      markerData.push(this.generatePreviewSettingMarker(setting));
    } else if (configuration.tags?.includes("experimental")) {
      markerData.push(this.generateExperimentalSettingMarker(setting));
    }
  }
  generateUnsupportedApplicationSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unsupportedApplicationSetting", "This setting has an application scope and can only be set in the settings file from the Default profile.")
    };
  }
  generateUnsupportedMachineSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unsupportedMachineSetting", "This setting can only be applied in user settings in local window or in remote settings in remote window.")
    };
  }
  generateUntrustedSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Warning,
      ...setting.range,
      message: nls.localize("untrustedSetting", "This setting can only be applied in a trusted workspace.")
    };
  }
  generateUnknownConfigurationMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unknown configuration setting", "Unknown Configuration Setting")
    };
  }
  generateUntrustedSettingCodeActions(diagnostics) {
    return [{
      title: nls.localize("manage workspace trust", "Manage Workspace Trust"),
      command: {
        id: "workbench.trust.manage",
        title: nls.localize("manage workspace trust", "Manage Workspace Trust")
      },
      diagnostics,
      kind: CodeActionKind.QuickFix.value
    }];
  }
  generatePreviewSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      ...setting.range,
      message: PREVIEW_INDICATOR_DESCRIPTION
    };
  }
  generateExperimentalSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      ...setting.range,
      message: EXPERIMENTAL_INDICATOR_DESCRIPTION
    };
  }
  addCodeActions(range, codeActions) {
    let actions = this.codeActions.get(this.settingsEditorModel.uri);
    if (!actions) {
      actions = [];
      this.codeActions.set(this.settingsEditorModel.uri, actions);
    }
    actions.push([Range.lift(range), codeActions]);
  }
  dispose() {
    this.markerService.remove("UnsupportedSettingsRenderer", [this.settingsEditorModel.uri]);
    this.codeActions.clear();
    super.dispose();
  }
};
UnsupportedSettingsRenderer = __decorateClass([
  __decorateParam(2, IMarkerService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IWorkbenchConfigurationService),
  __decorateParam(5, IWorkspaceTrustManagementService),
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, IUserDataProfileService),
  __decorateParam(9, IUserDataProfilesService)
], UnsupportedSettingsRenderer);
let McpSettingsRenderer = class extends Disposable {
  constructor(editor, settingsEditorModel, markerService, uriIdentityService, languageFeaturesService) {
    super();
    this.editor = editor;
    this.settingsEditorModel = settingsEditorModel;
    this.markerService = markerService;
    this.uriIdentityService = uriIdentityService;
    this.renderingDelayer = this._register(new Delayer(200));
    this.codeActions = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    this._register(this.editor.getModel().onDidChangeContent(() => this.delayedRender()));
    this._register(languageFeaturesService.codeActionProvider.register({ pattern: settingsEditorModel.uri.path }, this));
  }
  delayedRender() {
    this.renderingDelayer.trigger(() => this.render());
  }
  render() {
    this.codeActions.clear();
    const markerData = this.generateMarkerData();
    if (markerData.length) {
      this.markerService.changeOne("McpSettingsRenderer", this.settingsEditorModel.uri, markerData);
    } else {
      this.markerService.remove("McpSettingsRenderer", [this.settingsEditorModel.uri]);
    }
  }
  async provideCodeActions(model, range, context, token) {
    const actions = [];
    const codeActionsByRange = this.codeActions.get(model.uri);
    if (codeActionsByRange) {
      for (const [codeActionsRange, codeActions] of codeActionsByRange) {
        if (codeActionsRange.containsRange(range)) {
          actions.push(...codeActions);
        }
      }
    }
    return {
      actions,
      dispose: () => {
      }
    };
  }
  generateMarkerData() {
    const markerData = [];
    if (this.settingsEditorModel.configurationTarget !== ConfigurationTarget.USER_LOCAL && this.settingsEditorModel.configurationTarget !== ConfigurationTarget.USER_REMOTE) {
      return markerData;
    }
    for (const settingsGroup of this.settingsEditorModel.settingsGroups) {
      for (const section of settingsGroup.sections) {
        for (const setting of section.settings) {
          if (setting.key === mcpConfigurationSection) {
            const marker = this.generateMcpConfigurationMarker(setting);
            markerData.push(marker);
            const codeActions = this.generateMcpConfigurationCodeActions([marker]);
            this.addCodeActions(setting.range, codeActions);
          }
        }
      }
    }
    return markerData;
  }
  generateMcpConfigurationMarker(setting) {
    const isRemote = this.settingsEditorModel.configurationTarget === ConfigurationTarget.USER_REMOTE;
    const message = isRemote ? nls.localize("mcp.renderer.remoteConfigFound", "MCP servers should not be configured in remote user settings. Use the dedicated MCP configuration instead.") : nls.localize("mcp.renderer.userConfigFound", "MCP servers should not be configured in user settings. Use the dedicated MCP configuration instead.");
    return {
      severity: MarkerSeverity.Warning,
      ...setting.range,
      message
    };
  }
  generateMcpConfigurationCodeActions(diagnostics) {
    const isRemote = this.settingsEditorModel.configurationTarget === ConfigurationTarget.USER_REMOTE;
    const openConfigLabel = isRemote ? nls.localize("mcp.renderer.openRemoteConfig", "Open Remote User MCP Configuration") : nls.localize("mcp.renderer.openUserConfig", "Open User MCP Configuration");
    const commandId = isRemote ? McpCommandIds.OpenRemoteUserMcp : McpCommandIds.OpenUserMcp;
    return [{
      title: openConfigLabel,
      command: {
        id: commandId,
        title: openConfigLabel
      },
      diagnostics,
      kind: CodeActionKind.QuickFix.value
    }];
  }
  addCodeActions(range, codeActions) {
    let actions = this.codeActions.get(this.settingsEditorModel.uri);
    if (!actions) {
      actions = [];
      this.codeActions.set(this.settingsEditorModel.uri, actions);
    }
    actions.push([Range.lift(range), codeActions]);
  }
  dispose() {
    this.markerService.remove("McpSettingsRenderer", [this.settingsEditorModel.uri]);
    this.codeActions.clear();
    super.dispose();
  }
};
McpSettingsRenderer = __decorateClass([
  __decorateParam(2, IMarkerService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILanguageFeaturesService)
], McpSettingsRenderer);
let WorkspaceConfigurationRenderer = class extends Disposable {
  constructor(editor, workspaceSettingsEditorModel, workspaceContextService, markerService) {
    super();
    this.editor = editor;
    this.workspaceSettingsEditorModel = workspaceSettingsEditorModel;
    this.workspaceContextService = workspaceContextService;
    this.markerService = markerService;
    this.renderingDelayer = this._register(new Delayer(200));
    this.decorations = this.editor.createDecorationsCollection();
    this._register(this.editor.getModel().onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render())));
  }
  render() {
    const markerData = [];
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.workspaceSettingsEditorModel instanceof WorkspaceConfigurationEditorModel) {
      const ranges = [];
      for (const settingsGroup of this.workspaceSettingsEditorModel.configurationGroups) {
        for (const section of settingsGroup.sections) {
          for (const setting of section.settings) {
            if (!WorkspaceConfigurationRenderer.supportedKeys.includes(setting.key)) {
              markerData.push({
                severity: MarkerSeverity.Hint,
                tags: [MarkerTag.Unnecessary],
                ...setting.range,
                message: nls.localize("unsupportedProperty", "Unsupported Property")
              });
            }
          }
        }
      }
      this.decorations.set(ranges.map((range) => this.createDecoration(range)));
    }
    if (markerData.length) {
      this.markerService.changeOne("WorkspaceConfigurationRenderer", this.workspaceSettingsEditorModel.uri, markerData);
    } else {
      this.markerService.remove("WorkspaceConfigurationRenderer", [this.workspaceSettingsEditorModel.uri]);
    }
  }
  createDecoration(range) {
    return {
      range,
      options: WorkspaceConfigurationRenderer._DIM_CONFIGURATION_
    };
  }
  dispose() {
    this.markerService.remove("WorkspaceConfigurationRenderer", [this.workspaceSettingsEditorModel.uri]);
    this.decorations.clear();
    super.dispose();
  }
};
WorkspaceConfigurationRenderer.supportedKeys = ["folders", "tasks", "launch", mcpConfigurationSection, "extensions", "settings", "remoteAuthority", "transient"];
WorkspaceConfigurationRenderer._DIM_CONFIGURATION_ = ModelDecorationOptions.register({
  description: "dim-configuration",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  inlineClassName: "dim-configuration"
});
WorkspaceConfigurationRenderer = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IMarkerService)
], WorkspaceConfigurationRenderer);
export {
  UserSettingsRenderer,
  WorkspaceSettingsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxwcmVmZXJlbmNlc1JlbmRlcmVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50SGVscGVyLCBnZXREb21Ob2RlUGFnZVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0ICogYXMgZWRpdG9yQ29tbW9uIGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgsIG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSwgTWFya2VyVGFnIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgUmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29kZWVkaXRvci5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nc0VkaXRJY29uIH0gZnJvbSAnLi9wcmVmZXJlbmNlc0ljb25zLmpzJztcbmltcG9ydCB7IEVkaXRQcmVmZXJlbmNlV2lkZ2V0IH0gZnJvbSAnLi9wcmVmZXJlbmNlc1dpZGdldHMuanMnO1xuaW1wb3J0IHsgQVBQTElDQVRJT05fU0NPUEVTLCBBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORywgSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNFZGl0b3JNb2RlbCwgSVByZWZlcmVuY2VzU2VydmljZSwgSVNldHRpbmcsIElTZXR0aW5nc0VkaXRvck1vZGVsLCBJU2V0dGluZ3NHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0U2V0dGluZ3NFZGl0b3JNb2RlbCwgU2V0dGluZ3NFZGl0b3JNb2RlbCwgV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRVhQRVJJTUVOVEFMX0lORElDQVRPUl9ERVNDUklQVElPTiwgUFJFVklFV19JTkRJQ0FUT1JfREVTQ1JJUFRJT04gfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgbWNwQ29uZmlndXJhdGlvblNlY3Rpb24gfSBmcm9tICcuLi8uLi9tY3AvY29tbW9uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWNwQ29tbWFuZElkcyB9IGZyb20gJy4uLy4uL21jcC9jb21tb24vbWNwQ29tbWFuZElkcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByZWZlcmVuY2VzUmVuZGVyZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlbmRlcigpOiB2b2lkO1xuXHR1cGRhdGVQcmVmZXJlbmNlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgc291cmNlOiBJU2V0dGluZyk6IHZvaWQ7XG5cdGZvY3VzUHJlZmVyZW5jZShzZXR0aW5nOiBJU2V0dGluZyk6IHZvaWQ7XG5cdGNsZWFyRm9jdXMoc2V0dGluZzogSVNldHRpbmcpOiB2b2lkO1xuXHRlZGl0UHJlZmVyZW5jZShzZXR0aW5nOiBJU2V0dGluZyk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBVc2VyU2V0dGluZ3NSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJlZmVyZW5jZXNSZW5kZXJlciB7XG5cblx0cHJpdmF0ZSBzZXR0aW5nSGlnaGxpZ2h0ZXI6IFNldHRpbmdIaWdobGlnaHRlcjtcblx0cHJpdmF0ZSBlZGl0U2V0dGluZ0FjdGlvblJlbmRlcmVyOiBFZGl0U2V0dGluZ1JlbmRlcmVyO1xuXHRwcml2YXRlIG1vZGVsQ2hhbmdlRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDIwMCkpO1xuXHRwcml2YXRlIGFzc29jaWF0ZWRQcmVmZXJlbmNlc01vZGVsITogSVByZWZlcmVuY2VzRWRpdG9yTW9kZWw8SVNldHRpbmc+O1xuXG5cdHByaXZhdGUgdW5zdXBwb3J0ZWRTZXR0aW5nc1JlbmRlcmVyOiBVbnN1cHBvcnRlZFNldHRpbmdzUmVuZGVyZXI7XG5cdHByaXZhdGUgbWNwU2V0dGluZ3NSZW5kZXJlcjogTWNwU2V0dGluZ3NSZW5kZXJlcjtcblxuXHRjb25zdHJ1Y3Rvcihwcm90ZWN0ZWQgZWRpdG9yOiBJQ29kZUVkaXRvciwgcmVhZG9ubHkgcHJlZmVyZW5jZXNNb2RlbDogU2V0dGluZ3NFZGl0b3JNb2RlbCxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcm90ZWN0ZWQgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNldHRpbmdIaWdobGlnaHRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdIaWdobGlnaHRlciwgZWRpdG9yKSk7XG5cdFx0dGhpcy5lZGl0U2V0dGluZ0FjdGlvblJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0U2V0dGluZ1JlbmRlcmVyLCB0aGlzLmVkaXRvciwgdGhpcy5wcmVmZXJlbmNlc01vZGVsLCB0aGlzLnNldHRpbmdIaWdobGlnaHRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdFNldHRpbmdBY3Rpb25SZW5kZXJlci5vblVwZGF0ZVNldHRpbmcoKHsga2V5LCB2YWx1ZSwgc291cmNlIH0pID0+IHRoaXMudXBkYXRlUHJlZmVyZW5jZShrZXksIHZhbHVlLCBzb3VyY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHRoaXMubW9kZWxDaGFuZ2VEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5vbk1vZGVsQ2hhbmdlZCgpKSkpO1xuXHRcdHRoaXMudW5zdXBwb3J0ZWRTZXR0aW5nc1JlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5zdXBwb3J0ZWRTZXR0aW5nc1JlbmRlcmVyLCBlZGl0b3IsIHByZWZlcmVuY2VzTW9kZWwpKTtcblx0XHR0aGlzLm1jcFNldHRpbmdzUmVuZGVyZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTZXR0aW5nc1JlbmRlcmVyLCBlZGl0b3IsIHByZWZlcmVuY2VzTW9kZWwpKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRTZXR0aW5nQWN0aW9uUmVuZGVyZXIucmVuZGVyKHRoaXMucHJlZmVyZW5jZXNNb2RlbC5zZXR0aW5nc0dyb3VwcywgdGhpcy5hc3NvY2lhdGVkUHJlZmVyZW5jZXNNb2RlbCk7XG5cdFx0dGhpcy51bnN1cHBvcnRlZFNldHRpbmdzUmVuZGVyZXIucmVuZGVyKCk7XG5cdFx0dGhpcy5tY3BTZXR0aW5nc1JlbmRlcmVyLnJlbmRlcigpO1xuXHR9XG5cblx0dXBkYXRlUHJlZmVyZW5jZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHNvdXJjZTogSUluZGV4ZWRTZXR0aW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVycyA9IHNvdXJjZS5vdmVycmlkZU9mID8gb3ZlcnJpZGVJZGVudGlmaWVyc0Zyb21LZXkoc291cmNlLm92ZXJyaWRlT2Yua2V5KSA6IG51bGw7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnByZWZlcmVuY2VzTW9kZWwudXJpO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoa2V5LCB2YWx1ZSwgeyBvdmVycmlkZUlkZW50aWZpZXJzLCByZXNvdXJjZSB9LCB0aGlzLnByZWZlcmVuY2VzTW9kZWwuY29uZmlndXJhdGlvblRhcmdldClcblx0XHRcdC50aGVuKCgpID0+IHRoaXMub25TZXR0aW5nVXBkYXRlZChzb3VyY2UpKTtcblx0fVxuXG5cdHByaXZhdGUgb25Nb2RlbENoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHQvLyBtb2RlbCBjb3VsZCBoYXZlIGJlZW4gZGlzcG9zZWQgZHVyaW5nIHRoZSBkZWxheVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblNldHRpbmdVcGRhdGVkKHNldHRpbmc6IElTZXR0aW5nKSB7XG5cdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHRzZXR0aW5nID0gdGhpcy5nZXRTZXR0aW5nKHNldHRpbmcpITtcblx0XHRpZiAoc2V0dGluZykge1xuXHRcdFx0Ly8gVE9ETzpAc2FuZHkgU2VsZWN0aW9uIHJhbmdlIHNob3VsZCBiZSB0ZW1wbGF0ZSByYW5nZVxuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2VsZWN0aW9uKHNldHRpbmcudmFsdWVSYW5nZSk7XG5cdFx0XHR0aGlzLnNldHRpbmdIaWdobGlnaHRlci5oaWdobGlnaHQoc2V0dGluZywgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nKTogSVNldHRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsga2V5LCBvdmVycmlkZU9mIH0gPSBzZXR0aW5nO1xuXHRcdGlmIChvdmVycmlkZU9mKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5nZXRTZXR0aW5nKG92ZXJyaWRlT2YpO1xuXHRcdFx0Zm9yIChjb25zdCBvdmVycmlkZSBvZiBzZXR0aW5nIS5vdmVycmlkZXMhKSB7XG5cdFx0XHRcdGlmIChvdmVycmlkZS5rZXkgPT09IGtleSkge1xuXHRcdFx0XHRcdHJldHVybiBvdmVycmlkZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5wcmVmZXJlbmNlc01vZGVsLmdldFByZWZlcmVuY2Uoa2V5KTtcblx0fVxuXG5cdGZvY3VzUHJlZmVyZW5jZShzZXR0aW5nOiBJU2V0dGluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHMgPSB0aGlzLmdldFNldHRpbmcoc2V0dGluZyk7XG5cdFx0aWYgKHMpIHtcblx0XHRcdHRoaXMuc2V0dGluZ0hpZ2hsaWdodGVyLmhpZ2hsaWdodChzLCB0cnVlKTtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogcy5rZXlSYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogcy5rZXlSYW5nZS5zdGFydENvbHVtbiB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXR0aW5nSGlnaGxpZ2h0ZXIuY2xlYXIodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXJGb2N1cyhzZXR0aW5nOiBJU2V0dGluZyk6IHZvaWQge1xuXHRcdHRoaXMuc2V0dGluZ0hpZ2hsaWdodGVyLmNsZWFyKHRydWUpO1xuXHR9XG5cblx0ZWRpdFByZWZlcmVuY2Uoc2V0dGluZzogSVNldHRpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBlZGl0YWJsZVNldHRpbmcgPSB0aGlzLmdldFNldHRpbmcoc2V0dGluZyk7XG5cdFx0cmV0dXJuICEhKGVkaXRhYmxlU2V0dGluZyAmJiB0aGlzLmVkaXRTZXR0aW5nQWN0aW9uUmVuZGVyZXIuYWN0aXZhdGVPblNldHRpbmcoZWRpdGFibGVTZXR0aW5nKSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlU2V0dGluZ3NSZW5kZXJlciBleHRlbmRzIFVzZXJTZXR0aW5nc1JlbmRlcmVyIGltcGxlbWVudHMgSVByZWZlcmVuY2VzUmVuZGVyZXIge1xuXG5cdHByaXZhdGUgd29ya3NwYWNlQ29uZmlndXJhdGlvblJlbmRlcmVyOiBXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXI7XG5cblx0Y29uc3RydWN0b3IoZWRpdG9yOiBJQ29kZUVkaXRvciwgcHJlZmVyZW5jZXNNb2RlbDogU2V0dGluZ3NFZGl0b3JNb2RlbCxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IsIHByZWZlcmVuY2VzTW9kZWwsIHByZWZlcmVuY2VzU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZW5kZXJlciwgZWRpdG9yLCBwcmVmZXJlbmNlc01vZGVsKSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKCk7XG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIucmVuZGVyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5kZXhlZFNldHRpbmcgZXh0ZW5kcyBJU2V0dGluZyB7XG5cdGluZGV4OiBudW1iZXI7XG5cdGdyb3VwSWQ6IHN0cmluZztcbn1cblxuY2xhc3MgRWRpdFNldHRpbmdSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbjogRWRpdFByZWZlcmVuY2VXaWRnZXQ8SUluZGV4ZWRTZXR0aW5nPjtcblx0cHJpdmF0ZSBlZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZTogRWRpdFByZWZlcmVuY2VXaWRnZXQ8SUluZGV4ZWRTZXR0aW5nPjtcblxuXHRwcml2YXRlIHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdID0gW107XG5cdGFzc29jaWF0ZWRQcmVmZXJlbmNlc01vZGVsITogSVByZWZlcmVuY2VzRWRpdG9yTW9kZWw8SVNldHRpbmc+O1xuXHRwcml2YXRlIHRvZ2dsZUVkaXRQcmVmZXJlbmNlc0Zvck1vdXNlTW92ZURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25VcGRhdGVTZXR0aW5nOiBFbWl0dGVyPHsga2V5OiBzdHJpbmc7IHZhbHVlOiB1bmtub3duOyBzb3VyY2U6IElJbmRleGVkU2V0dGluZyB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsga2V5OiBzdHJpbmc7IHZhbHVlOiB1bmtub3duOyBzb3VyY2U6IElJbmRleGVkU2V0dGluZyB9PigpKTtcblx0cmVhZG9ubHkgb25VcGRhdGVTZXR0aW5nOiBFdmVudDx7IGtleTogc3RyaW5nOyB2YWx1ZTogdW5rbm93bjsgc291cmNlOiBJSW5kZXhlZFNldHRpbmcgfT4gPSB0aGlzLl9vblVwZGF0ZVNldHRpbmcuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBlZGl0b3I6IElDb2RlRWRpdG9yLCBwcml2YXRlIHByaW1hcnlTZXR0aW5nc01vZGVsOiBJU2V0dGluZ3NFZGl0b3JNb2RlbCxcblx0XHRwcml2YXRlIHNldHRpbmdIaWdobGlnaHRlcjogU2V0dGluZ0hpZ2hsaWdodGVyLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRQcmVmZXJlbmNlV2lkZ2V0PElJbmRleGVkU2V0dGluZz4sIGVkaXRvcikpO1xuXHRcdHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRQcmVmZXJlbmNlV2lkZ2V0PElJbmRleGVkU2V0dGluZz4sIGVkaXRvcikpO1xuXHRcdHRoaXMudG9nZ2xlRWRpdFByZWZlcmVuY2VzRm9yTW91c2VNb3ZlRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDc1KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24ub25DbGljayhlID0+IHRoaXMub25FZGl0U2V0dGluZ0NsaWNrZWQodGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uLCBlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUub25DbGljayhlID0+IHRoaXMub25FZGl0U2V0dGluZ0NsaWNrZWQodGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZSwgZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24ocG9zaXRpb25DaGFuZ2VFdmVudCA9PiB0aGlzLm9uUG9zaXRpb25DaGFuZ2VkKHBvc2l0aW9uQ2hhbmdlRXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25Nb3VzZU1vdmUobW91c2VNb3ZlRXZlbnQgPT4gdGhpcy5vbk1vdXNlTW92ZWQobW91c2VNb3ZlRXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCgpID0+IHRoaXMub25Db25maWd1cmF0aW9uQ2hhbmdlZCgpKSk7XG5cdH1cblxuXHRyZW5kZXIoc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW10sIGFzc29jaWF0ZWRQcmVmZXJlbmNlc01vZGVsOiBJUHJlZmVyZW5jZXNFZGl0b3JNb2RlbDxJU2V0dGluZz4pOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24uaGlkZSgpO1xuXHRcdHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUuaGlkZSgpO1xuXHRcdHRoaXMuc2V0dGluZ3NHcm91cHMgPSBzZXR0aW5nc0dyb3Vwcztcblx0XHR0aGlzLmFzc29jaWF0ZWRQcmVmZXJlbmNlc01vZGVsID0gYXNzb2NpYXRlZFByZWZlcmVuY2VzTW9kZWw7XG5cblx0XHRjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2V0U2V0dGluZ3ModGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSEubGluZU51bWJlcik7XG5cdFx0aWYgKHNldHRpbmdzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zaG93RWRpdFByZWZlcmVuY2VzV2lkZ2V0KHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbiwgc2V0dGluZ3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNEZWZhdWx0U2V0dGluZ3MoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucHJpbWFyeVNldHRpbmdzTW9kZWwgaW5zdGFuY2VvZiBEZWZhdWx0U2V0dGluZ3NFZGl0b3JNb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZ2x5cGhNYXJnaW4pKSB7XG5cdFx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24uaGlkZSgpO1xuXHRcdFx0dGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZS5oaWRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblBvc2l0aW9uQ2hhbmdlZChwb3NpdGlvbkNoYW5nZUV2ZW50OiBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQpIHtcblx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLmhpZGUoKTtcblx0XHRjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2V0U2V0dGluZ3MocG9zaXRpb25DaGFuZ2VFdmVudC5wb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRpZiAoc2V0dGluZ3MubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnNob3dFZGl0UHJlZmVyZW5jZXNXaWRnZXQodGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uLCBzZXR0aW5ncyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbi5oaWRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbk1vdXNlTW92ZWQobW91c2VNb3ZlRXZlbnQ6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdFByZWZlcmVuY2VXaWRnZXQgPSB0aGlzLmdldEVkaXRQcmVmZXJlbmNlV2lkZ2V0VW5kZXJNb3VzZShtb3VzZU1vdmVFdmVudCk7XG5cdFx0aWYgKGVkaXRQcmVmZXJlbmNlV2lkZ2V0KSB7XG5cdFx0XHR0aGlzLm9uTW91c2VPdmVyKGVkaXRQcmVmZXJlbmNlV2lkZ2V0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZXR0aW5nSGlnaGxpZ2h0ZXIuY2xlYXIoKTtcblx0XHR0aGlzLnRvZ2dsZUVkaXRQcmVmZXJlbmNlc0Zvck1vdXNlTW92ZURlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnRvZ2dsZUVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlKG1vdXNlTW92ZUV2ZW50KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXRQcmVmZXJlbmNlV2lkZ2V0VW5kZXJNb3VzZShtb3VzZU1vdmVFdmVudDogSUVkaXRvck1vdXNlRXZlbnQpOiBFZGl0UHJlZmVyZW5jZVdpZGdldDxJU2V0dGluZz4gfCB1bmRlZmluZWQge1xuXHRcdGlmIChtb3VzZU1vdmVFdmVudC50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU4pIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBtb3VzZU1vdmVFdmVudC50YXJnZXQucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGlmICh0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLmdldExpbmUoKSA9PT0gbGluZSAmJiB0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbi5nZXRMaW5lKCkgPT09IGxpbmUgJiYgdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlKG1vdXNlTW92ZUV2ZW50OiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHNldHRpbmdzID0gbW91c2VNb3ZlRXZlbnQudGFyZ2V0LnBvc2l0aW9uID8gdGhpcy5nZXRTZXR0aW5ncyhtb3VzZU1vdmVFdmVudC50YXJnZXQucG9zaXRpb24ubGluZU51bWJlcikgOiBudWxsO1xuXHRcdGlmIChzZXR0aW5ncyAmJiBzZXR0aW5ncy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc2hvd0VkaXRQcmVmZXJlbmNlc1dpZGdldCh0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLCBzZXR0aW5ncyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUuaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd0VkaXRQcmVmZXJlbmNlc1dpZGdldChlZGl0UHJlZmVyZW5jZXNXaWRnZXQ6IEVkaXRQcmVmZXJlbmNlV2lkZ2V0PElTZXR0aW5nPiwgc2V0dGluZ3M6IElJbmRleGVkU2V0dGluZ1tdKSB7XG5cdFx0Y29uc3QgbGluZSA9IHNldHRpbmdzWzBdLnZhbHVlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGlmICh0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdseXBoTWFyZ2luKSAmJiB0aGlzLm1hcmdpbkZyZWVGcm9tT3RoZXJEZWNvcmF0aW9ucyhsaW5lKSkge1xuXHRcdFx0ZWRpdFByZWZlcmVuY2VzV2lkZ2V0LnNob3cobGluZSwgbmxzLmxvY2FsaXplKCdlZGl0VHRpbGUnLCBcIkVkaXRcIiksIHNldHRpbmdzKTtcblx0XHRcdGNvbnN0IGVkaXRQcmVmZXJlbmNlV2lkZ2V0VG9IaWRlID0gZWRpdFByZWZlcmVuY2VzV2lkZ2V0ID09PSB0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24gPyB0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlIDogdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uO1xuXHRcdFx0ZWRpdFByZWZlcmVuY2VXaWRnZXRUb0hpZGUuaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWFyZ2luRnJlZUZyb21PdGhlckRlY29yYXRpb25zKGxpbmU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5lZGl0b3IuZ2V0TGluZURlY29yYXRpb25zKGxpbmUpO1xuXHRcdGlmIChkZWNvcmF0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCB7IG9wdGlvbnMgfSBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZSAmJiBvcHRpb25zLmdseXBoTWFyZ2luQ2xhc3NOYW1lLmluZGV4T2YoVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHNldHRpbmdzRWRpdEljb24pKSA9PT0gLTEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldFNldHRpbmdzKGxpbmVOdW1iZXI6IG51bWJlcik6IElJbmRleGVkU2V0dGluZ1tdIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uTWFwID0gdGhpcy5nZXRDb25maWd1cmF0aW9uc01hcCgpO1xuXHRcdHJldHVybiB0aGlzLmdldFNldHRpbmdzQXRMaW5lTnVtYmVyKGxpbmVOdW1iZXIpLmZpbHRlcihzZXR0aW5nID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Ob2RlID0gY29uZmlndXJhdGlvbk1hcFtzZXR0aW5nLmtleV07XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvbk5vZGUpIHtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25Ob2RlLnBvbGljeSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qoc2V0dGluZy5rZXkpLnBvbGljeVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuaXNEZWZhdWx0U2V0dGluZ3MoKSkge1xuXHRcdFx0XHRcdGlmIChzZXR0aW5nLmtleSA9PT0gJ2xhdW5jaCcpIHtcblx0XHRcdFx0XHRcdC8vIERvIG5vdCBzaG93IGJlY2F1c2Ugb2YgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyNTkzXG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uTm9kZS50eXBlID09PSAnYm9vbGVhbicgfHwgY29uZmlndXJhdGlvbk5vZGUuZW51bSkge1xuXHRcdFx0XHRcdGlmICgoPFNldHRpbmdzRWRpdG9yTW9kZWw+dGhpcy5wcmltYXJ5U2V0dGluZ3NNb2RlbCkuY29uZmlndXJhdGlvblRhcmdldCAhPT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25Ob2RlLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UgfHwgY29uZmlndXJhdGlvbk5vZGUuc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNldHRpbmdzQXRMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IElJbmRleGVkU2V0dGluZ1tdIHtcblx0XHQvLyBpbmRleCBvZiBzZXR0aW5nLCBhY3Jvc3MgYWxsIGdyb3Vwcy9zZWN0aW9uc1xuXHRcdGxldCBpbmRleCA9IDA7XG5cblx0XHRjb25zdCBzZXR0aW5nczogSUluZGV4ZWRTZXR0aW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdGlmIChncm91cC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPiBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPj0gZ3JvdXAucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGxpbmVOdW1iZXIgPD0gZ3JvdXAucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0aWYgKHNldHRpbmcucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChsaW5lTnVtYmVyID49IHNldHRpbmcucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGxpbmVOdW1iZXIgPD0gc2V0dGluZy5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghdGhpcy5pc0RlZmF1bHRTZXR0aW5ncygpICYmIHNldHRpbmcub3ZlcnJpZGVzIS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBPbmx5IG9uZSBsZXZlbCBiZWNhdXNlIG92ZXJyaWRlIHNldHRpbmdzIGNhbm5vdCBoYXZlIG92ZXJyaWRlIHNldHRpbmdzXG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBvdmVycmlkZVNldHRpbmcgb2Ygc2V0dGluZy5vdmVycmlkZXMhKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAobGluZU51bWJlciA+PSBvdmVycmlkZVNldHRpbmcucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGxpbmVOdW1iZXIgPD0gb3ZlcnJpZGVTZXR0aW5nLnJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0c2V0dGluZ3MucHVzaCh7IC4uLm92ZXJyaWRlU2V0dGluZywgaW5kZXgsIGdyb3VwSWQ6IGdyb3VwLmlkIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRzZXR0aW5ncy5wdXNoKHsgLi4uc2V0dGluZywgaW5kZXgsIGdyb3VwSWQ6IGdyb3VwLmlkIH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGluZGV4Kys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZXR0aW5ncztcblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZU92ZXIoZWRpdFByZWZlcmVuY2VXaWRnZXQ6IEVkaXRQcmVmZXJlbmNlV2lkZ2V0PElTZXR0aW5nPik6IHZvaWQge1xuXHRcdHRoaXMuc2V0dGluZ0hpZ2hsaWdodGVyLmhpZ2hsaWdodChlZGl0UHJlZmVyZW5jZVdpZGdldC5wcmVmZXJlbmNlc1swXSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdFNldHRpbmdDbGlja2VkKGVkaXRQcmVmZXJlbmNlV2lkZ2V0OiBFZGl0UHJlZmVyZW5jZVdpZGdldDxJSW5kZXhlZFNldHRpbmc+LCBlOiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdEV2ZW50SGVscGVyLnN0b3AoZS5ldmVudCwgdHJ1ZSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5nZXRTZXR0aW5ncyhlZGl0UHJlZmVyZW5jZVdpZGdldC5nZXRMaW5lKCkpLmxlbmd0aCA9PT0gMSA/IHRoaXMuZ2V0QWN0aW9ucyhlZGl0UHJlZmVyZW5jZVdpZGdldC5wcmVmZXJlbmNlc1swXSwgdGhpcy5nZXRDb25maWd1cmF0aW9uc01hcCgpW2VkaXRQcmVmZXJlbmNlV2lkZ2V0LnByZWZlcmVuY2VzWzBdLmtleV0pXG5cdFx0XHQ6IGVkaXRQcmVmZXJlbmNlV2lkZ2V0LnByZWZlcmVuY2VzLm1hcChzZXR0aW5nID0+IG5ldyBTdWJtZW51QWN0aW9uKGBwcmVmZXJlbmNlcy5zdWJtZW51LiR7c2V0dGluZy5rZXl9YCwgc2V0dGluZy5rZXksIHRoaXMuZ2V0QWN0aW9ucyhzZXR0aW5nLCB0aGlzLmdldENvbmZpZ3VyYXRpb25zTWFwKClbc2V0dGluZy5rZXldKSkpO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuZXZlbnQsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zXG5cdFx0fSk7XG5cdH1cblxuXHRhY3RpdmF0ZU9uU2V0dGluZyhzZXR0aW5nOiBJU2V0dGluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHNldHRpbmcua2V5UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gdGhpcy5nZXRTZXR0aW5ncyhzdGFydExpbmUpO1xuXHRcdGlmICghc2V0dGluZ3MubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZS5zaG93KHN0YXJ0TGluZSwgJycsIHNldHRpbmdzKTtcblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5nZXRBY3Rpb25zKHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUucHJlZmVyZW5jZXNbMF0sIHRoaXMuZ2V0Q29uZmlndXJhdGlvbnNNYXAoKVt0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLnByZWZlcmVuY2VzWzBdLmtleV0pO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMudG9BYnNvbHV0ZUNvb3JkcyhuZXcgUG9zaXRpb24oc3RhcnRMaW5lLCAxKSksXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgdG9BYnNvbHV0ZUNvb3Jkcyhwb3NpdGlvbjogUG9zaXRpb24pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IHBvc2l0aW9uQ29vcmRzID0gdGhpcy5lZGl0b3IuZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdGNvbnN0IGVkaXRvckNvb3JkcyA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5lZGl0b3IuZ2V0RG9tTm9kZSgpISk7XG5cdFx0Y29uc3QgeCA9IGVkaXRvckNvb3Jkcy5sZWZ0ICsgcG9zaXRpb25Db29yZHMhLmxlZnQ7XG5cdFx0Y29uc3QgeSA9IGVkaXRvckNvb3Jkcy50b3AgKyBwb3NpdGlvbkNvb3JkcyEudG9wICsgcG9zaXRpb25Db29yZHMhLmhlaWdodDtcblxuXHRcdHJldHVybiB7IHgsIHk6IHkgKyAxMCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWd1cmF0aW9uc01hcCgpOiB7IFtxdWFsaWZpZWRLZXk6IHN0cmluZ106IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfSB7XG5cdFx0cmV0dXJuIFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnMoc2V0dGluZzogSUluZGV4ZWRTZXR0aW5nLCBqc29uU2NoZW1hOiBJSlNPTlNjaGVtYSk6IElBY3Rpb25bXSB7XG5cdFx0aWYgKGpzb25TY2hlbWEudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0aWQ6ICd0cnV0aHlWYWx1ZScsXG5cdFx0XHRcdGxhYmVsOiAndHJ1ZScsXG5cdFx0XHRcdHRvb2x0aXA6ICd0cnVlJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnVwZGF0ZVNldHRpbmcoc2V0dGluZy5rZXksIHRydWUsIHNldHRpbmcpLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiAnZmFsc3lWYWx1ZScsXG5cdFx0XHRcdGxhYmVsOiAnZmFsc2UnLFxuXHRcdFx0XHR0b29sdGlwOiAnZmFsc2UnLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMudXBkYXRlU2V0dGluZyhzZXR0aW5nLmtleSwgZmFsc2UsIHNldHRpbmcpLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkXG5cdFx0XHR9XTtcblx0XHR9XG5cdFx0aWYgKGpzb25TY2hlbWEuZW51bSkge1xuXHRcdFx0cmV0dXJuIGpzb25TY2hlbWEuZW51bS5tYXAodmFsdWUgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiB2YWx1ZSxcblx0XHRcdFx0XHRsYWJlbDogSlNPTi5zdHJpbmdpZnkodmFsdWUpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IEpTT04uc3RyaW5naWZ5KHZhbHVlKSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy51cGRhdGVTZXR0aW5nKHNldHRpbmcua2V5LCB2YWx1ZSwgc2V0dGluZyksXG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldERlZmF1bHRBY3Rpb25zKHNldHRpbmcpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0QWN0aW9ucyhzZXR0aW5nOiBJSW5kZXhlZFNldHRpbmcpOiBJQWN0aW9uW10ge1xuXHRcdGlmICh0aGlzLmlzRGVmYXVsdFNldHRpbmdzKCkpIHtcblx0XHRcdGNvbnN0IHNldHRpbmdJbk90aGVyTW9kZWwgPSB0aGlzLmFzc29jaWF0ZWRQcmVmZXJlbmNlc01vZGVsLmdldFByZWZlcmVuY2Uoc2V0dGluZy5rZXkpO1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdGlkOiAnc2V0RGVmYXVsdFZhbHVlJyxcblx0XHRcdFx0bGFiZWw6IHNldHRpbmdJbk90aGVyTW9kZWwgPyBubHMubG9jYWxpemUoJ3JlcGxhY2VEZWZhdWx0VmFsdWUnLCBcIlJlcGxhY2UgaW4gU2V0dGluZ3NcIikgOiBubHMubG9jYWxpemUoJ2NvcHlEZWZhdWx0VmFsdWUnLCBcIkNvcHkgdG8gU2V0dGluZ3NcIiksXG5cdFx0XHRcdHRvb2x0aXA6IHNldHRpbmdJbk90aGVyTW9kZWwgPyBubHMubG9jYWxpemUoJ3JlcGxhY2VEZWZhdWx0VmFsdWUnLCBcIlJlcGxhY2UgaW4gU2V0dGluZ3NcIikgOiBubHMubG9jYWxpemUoJ2NvcHlEZWZhdWx0VmFsdWUnLCBcIkNvcHkgdG8gU2V0dGluZ3NcIiksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy51cGRhdGVTZXR0aW5nKHNldHRpbmcua2V5LCBzZXR0aW5nLnZhbHVlLCBzZXR0aW5nKSxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZFxuXHRcdFx0fV07XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2V0dGluZyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHNvdXJjZTogSUluZGV4ZWRTZXR0aW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25VcGRhdGVTZXR0aW5nLmZpcmUoeyBrZXksIHZhbHVlLCBzb3VyY2UgfSk7XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ0hpZ2hsaWdodGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBmaXhlZEhpZ2hsaWdodGVyOiBSYW5nZUhpZ2hsaWdodERlY29yYXRpb25zO1xuXHRwcml2YXRlIHZvbGF0aWxlSGlnaGxpZ2h0ZXI6IFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnM7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBlZGl0b3I6IElDb2RlRWRpdG9yLCBASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZml4ZWRIaWdobGlnaHRlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMpKTtcblx0XHR0aGlzLnZvbGF0aWxlSGlnaGxpZ2h0ZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSYW5nZUhpZ2hsaWdodERlY29yYXRpb25zKSk7XG5cdH1cblxuXHRoaWdobGlnaHQoc2V0dGluZzogSVNldHRpbmcsIGZpeDogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0dGhpcy52b2xhdGlsZUhpZ2hsaWdodGVyLnJlbW92ZUhpZ2hsaWdodFJhbmdlKCk7XG5cdFx0dGhpcy5maXhlZEhpZ2hsaWdodGVyLnJlbW92ZUhpZ2hsaWdodFJhbmdlKCk7XG5cblx0XHRjb25zdCBoaWdobGlnaHRlciA9IGZpeCA/IHRoaXMuZml4ZWRIaWdobGlnaHRlciA6IHRoaXMudm9sYXRpbGVIaWdobGlnaHRlcjtcblx0XHRoaWdobGlnaHRlci5oaWdobGlnaHRSYW5nZSh7XG5cdFx0XHRyYW5nZTogc2V0dGluZy52YWx1ZVJhbmdlLFxuXHRcdFx0cmVzb3VyY2U6IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLnVyaVxuXHRcdH0sIHRoaXMuZWRpdG9yKTtcblxuXHRcdHRoaXMuZWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHNldHRpbmcudmFsdWVSYW5nZS5zdGFydExpbmVOdW1iZXIsIGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk7XG5cdH1cblxuXHRjbGVhcihmaXg6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMudm9sYXRpbGVIaWdobGlnaHRlci5yZW1vdmVIaWdobGlnaHRSYW5nZSgpO1xuXHRcdGlmIChmaXgpIHtcblx0XHRcdHRoaXMuZml4ZWRIaWdobGlnaHRlci5yZW1vdmVIaWdobGlnaHRSYW5nZSgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBVbnN1cHBvcnRlZFNldHRpbmdzUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Qcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZW5kZXJpbmdEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMjAwKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb2RlQWN0aW9ucyA9IG5ldyBSZXNvdXJjZU1hcDxbUmFuZ2UsIGxhbmd1YWdlcy5Db2RlQWN0aW9uW11dW10+KHVyaSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXR0aW5nc0VkaXRvck1vZGVsOiBTZXR0aW5nc0VkaXRvck1vZGVsLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5nZXRNb2RlbCgpIS5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gdGhpcy5kZWxheWVkUmVuZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5zb3VyY2UgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkoKCkgPT4gdGhpcy5kZWxheWVkUmVuZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlQWN0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBwYXR0ZXJuOiBzZXR0aW5nc0VkaXRvck1vZGVsLnVyaS5wYXRoIH0sIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoKCkgPT4gdGhpcy5kZWxheWVkUmVuZGVyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgZGVsYXllZFJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmluZ0RlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnJlbmRlcigpKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb2RlQWN0aW9ucy5jbGVhcigpO1xuXHRcdGNvbnN0IG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10gPSB0aGlzLmdlbmVyYXRlTWFya2VyRGF0YSgpO1xuXHRcdGlmIChtYXJrZXJEYXRhLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5tYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZSgnVW5zdXBwb3J0ZWRTZXR0aW5nc1JlbmRlcmVyJywgdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaSwgbWFya2VyRGF0YSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFya2VyU2VydmljZS5yZW1vdmUoJ1Vuc3VwcG9ydGVkU2V0dGluZ3NSZW5kZXJlcicsIFt0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpXSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNvZGVBY3Rpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UgfCBTZWxlY3Rpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5Db2RlQWN0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3Q+IHtcblx0XHRjb25zdCBhY3Rpb25zOiBsYW5ndWFnZXMuQ29kZUFjdGlvbltdID0gW107XG5cdFx0Y29uc3QgY29kZUFjdGlvbnNCeVJhbmdlID0gdGhpcy5jb2RlQWN0aW9ucy5nZXQobW9kZWwudXJpKTtcblx0XHRpZiAoY29kZUFjdGlvbnNCeVJhbmdlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtjb2RlQWN0aW9uc1JhbmdlLCBjb2RlQWN0aW9uc10gb2YgY29kZUFjdGlvbnNCeVJhbmdlKSB7XG5cdFx0XHRcdGlmIChjb2RlQWN0aW9uc1JhbmdlLmNvbnRhaW5zUmFuZ2UocmFuZ2UpKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKC4uLmNvZGVBY3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0YWN0aW9ucyxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlTWFya2VyRGF0YSgpOiBJTWFya2VyRGF0YVtdIHtcblx0XHRjb25zdCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdID0gW107XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRmb3IgKGNvbnN0IHNldHRpbmdzR3JvdXAgb2YgdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnNldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2Ygc2V0dGluZ3NHcm91cC5zZWN0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KHNldHRpbmcua2V5KSkge1xuXHRcdFx0XHRcdFx0aWYgKHNldHRpbmcub3ZlcnJpZGVzKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaGFuZGxlT3ZlcnJpZGVzKHNldHRpbmcub3ZlcnJpZGVzLCBjb25maWd1cmF0aW9uUmVnaXN0cnksIG1hcmtlckRhdGEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uUmVnaXN0cnlbc2V0dGluZy5rZXldO1xuXHRcdFx0XHRcdGlmIChjb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmhhbmRsZVVuc3RhYmxlU2V0dGluZ0NvbmZpZ3VyYXRpb24oc2V0dGluZywgY29uZmlndXJhdGlvbiwgbWFya2VyRGF0YSk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5oYW5kbGVQb2xpY3lDb25maWd1cmF0aW9uKHNldHRpbmcsIGNvbmZpZ3VyYXRpb24sIG1hcmtlckRhdGEpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3dpdGNoICh0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwuY29uZmlndXJhdGlvblRhcmdldCkge1xuXHRcdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmhhbmRsZUxvY2FsVXNlckNvbmZpZ3VyYXRpb24oc2V0dGluZywgY29uZmlndXJhdGlvbiwgbWFya2VyRGF0YSk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmhhbmRsZVJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHNldHRpbmcsIGNvbmZpZ3VyYXRpb24sIG1hcmtlckRhdGEpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuaGFuZGxlV29ya3NwYWNlQ29uZmlndXJhdGlvbihzZXR0aW5nLCBjb25maWd1cmF0aW9uLCBtYXJrZXJEYXRhKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVXb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uKHNldHRpbmcsIGNvbmZpZ3VyYXRpb24sIG1hcmtlckRhdGEpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtYXJrZXJEYXRhLnB1c2godGhpcy5nZW5lcmF0ZVVua25vd25Db25maWd1cmF0aW9uTWFya2VyKHNldHRpbmcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1hcmtlckRhdGE7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVBvbGljeUNvbmZpZ3VyYXRpb24oc2V0dGluZzogSVNldHRpbmcsIGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10pOiBib29sZWFuIHtcblx0XHRpZiAoIWNvbmZpZ3VyYXRpb24ucG9saWN5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qoc2V0dGluZy5rZXkpLnBvbGljeVZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC5jb25maWd1cmF0aW9uVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0bWFya2VyRGF0YS5wdXNoKHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bnN1cHBvcnRlZFBvbGljeVNldHRpbmcnLCBcIlRoaXMgc2V0dGluZyBjYW5ub3QgYmUgYXBwbGllZCBiZWNhdXNlIGl0IGlzIGNvbmZpZ3VyZWQgaW4gdGhlIHN5c3RlbSBwb2xpY3kuXCIpXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZU92ZXJyaWRlcyhvdmVycmlkZXM6IElTZXR0aW5nW10sIGNvbmZpZ3VyYXRpb25SZWdpc3RyeTogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+LCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIG92ZXJyaWRlcyB8fCBbXSkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeVtzZXR0aW5nLmtleV07XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRpZiAoY29uZmlndXJhdGlvbi5zY29wZSAhPT0gQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFKSB7XG5cdFx0XHRcdFx0bWFya2VyRGF0YS5wdXNoKHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0XHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bnN1cHBvcnRMYW5ndWFnZU92ZXJyaWRlU2V0dGluZycsIFwiVGhpcyBzZXR0aW5nIGNhbm5vdCBiZSBhcHBsaWVkIGJlY2F1c2UgaXQgaXMgbm90IHJlZ2lzdGVyZWQgYXMgbGFuZ3VhZ2Ugb3ZlcnJpZGUgc2V0dGluZy5cIilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVVbmtub3duQ29uZmlndXJhdGlvbk1hcmtlcihzZXR0aW5nKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVMb2NhbFVzZXJDb25maWd1cmF0aW9uKHNldHRpbmc6IElTZXR0aW5nLCBjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0ICYmICF0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUudXNlRGVmYXVsdEZsYWdzPy5zZXR0aW5ncykge1xuXHRcdFx0aWYgKGlzRXF1YWwodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCB0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpKSAmJiAhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pc1NldHRpbmdBcHBsaWVkRm9yQWxsUHJvZmlsZXMoc2V0dGluZy5rZXkpKSB7XG5cdFx0XHRcdC8vIElmIHdlJ3JlIGluIHRoZSBkZWZhdWx0IHByb2ZpbGUgc2V0dGluZyBmaWxlLCBhbmQgdGhlIHNldHRpbmcgY2Fubm90IGJlIGFwcGxpZWQgaW4gYWxsIHByb2ZpbGVzXG5cdFx0XHRcdG1hcmtlckRhdGEucHVzaCh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2RlZmF1bHRQcm9maWxlU2V0dGluZ1doaWxlTm9uRGVmYXVsdEFjdGl2ZScsIFwiVGhpcyBzZXR0aW5nIGNhbm5vdCBiZSBhcHBsaWVkIHdoaWxlIGEgbm9uLWRlZmF1bHQgcHJvZmlsZSBpcyBhY3RpdmUuIEl0IHdpbGwgYmUgYXBwbGllZCB3aGVuIHRoZSBkZWZhdWx0IHByb2ZpbGUgaXMgYWN0aXZlLlwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNFcXVhbCh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaSkpIHtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24uc2NvcGUgJiYgQVBQTElDQVRJT05fU0NPUEVTLmluY2x1ZGVzKGNvbmZpZ3VyYXRpb24uc2NvcGUpKSB7XG5cdFx0XHRcdFx0Ly8gSWYgd2UncmUgaW4gYSBwcm9maWxlIHNldHRpbmcgZmlsZSwgYW5kIHRoZSBzZXR0aW5nIGlzIGFwcGxpY2F0aW9uLXNjb3BlZCwgZmFkZSBpdCBvdXQuXG5cdFx0XHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVVbnN1cHBvcnRlZEFwcGxpY2F0aW9uU2V0dGluZ01hcmtlcihzZXR0aW5nKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pc1NldHRpbmdBcHBsaWVkRm9yQWxsUHJvZmlsZXMoc2V0dGluZy5rZXkpKSB7XG5cdFx0XHRcdFx0Ly8gSWYgd2UncmUgaW4gdGhlIG5vbi1kZWZhdWx0IHByb2ZpbGUgc2V0dGluZyBmaWxlLCBhbmQgdGhlIHNldHRpbmcgY2FuIGJlIGFwcGxpZWQgaW4gYWxsIHByb2ZpbGVzLCBmYWRlIGl0IG91dC5cblx0XHRcdFx0XHRtYXJrZXJEYXRhLnB1c2goe1xuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdFx0XHR0YWdzOiBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFx0XHRcdC4uLnNldHRpbmcucmFuZ2UsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2FsbFByb2ZpbGVTZXR0aW5nV2hpbGVJbk5vbkRlZmF1bHRQcm9maWxlU2V0dGluZycsIFwiVGhpcyBzZXR0aW5nIGNhbm5vdCBiZSBhcHBsaWVkIGJlY2F1c2UgaXQgaXMgY29uZmlndXJlZCB0byBiZSBhcHBsaWVkIGluIGFsbCBwcm9maWxlcyB1c2luZyBzZXR0aW5nIHswfS4gVmFsdWUgZnJvbSB0aGUgZGVmYXVsdCBwcm9maWxlIHdpbGwgYmUgdXNlZCBpbnN0ZWFkLlwiLCBBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORylcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmIChjb25maWd1cmF0aW9uLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORSB8fCBjb25maWd1cmF0aW9uLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05fTUFDSElORSB8fCBjb25maWd1cmF0aW9uLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORV9PVkVSUklEQUJMRSkpIHtcblx0XHRcdG1hcmtlckRhdGEucHVzaCh7XG5cdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0XHR0YWdzOiBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bnN1cHBvcnRlZFJlbW90ZU1hY2hpbmVTZXR0aW5nJywgXCJUaGlzIHNldHRpbmcgY2Fubm90IGJlIGFwcGxpZWQgaW4gdGhpcyB3aW5kb3cuIEl0IHdpbGwgYmUgYXBwbGllZCB3aGVuIHlvdSBvcGVuIGEgbG9jYWwgd2luZG93LlwiKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVSZW1vdGVVc2VyQ29uZmlndXJhdGlvbihzZXR0aW5nOiBJU2V0dGluZywgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSk6IHZvaWQge1xuXHRcdGlmIChjb25maWd1cmF0aW9uLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04pIHtcblx0XHRcdG1hcmtlckRhdGEucHVzaCh0aGlzLmdlbmVyYXRlVW5zdXBwb3J0ZWRBcHBsaWNhdGlvblNldHRpbmdNYXJrZXIoc2V0dGluZykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlV29ya3NwYWNlQ29uZmlndXJhdGlvbihzZXR0aW5nOiBJU2V0dGluZywgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSk6IHZvaWQge1xuXHRcdGlmIChjb25maWd1cmF0aW9uLnNjb3BlICYmIEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyhjb25maWd1cmF0aW9uLnNjb3BlKSkge1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVVbnN1cHBvcnRlZEFwcGxpY2F0aW9uU2V0dGluZ01hcmtlcihzZXR0aW5nKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FKSB7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2godGhpcy5nZW5lcmF0ZVVuc3VwcG9ydGVkTWFjaGluZVNldHRpbmdNYXJrZXIoc2V0dGluZykpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpICYmIGNvbmZpZ3VyYXRpb24ucmVzdHJpY3RlZCkge1xuXHRcdFx0Y29uc3QgbWFya2VyID0gdGhpcy5nZW5lcmF0ZVVudHJ1c3RlZFNldHRpbmdNYXJrZXIoc2V0dGluZyk7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2gobWFya2VyKTtcblx0XHRcdGNvbnN0IGNvZGVBY3Rpb25zID0gdGhpcy5nZW5lcmF0ZVVudHJ1c3RlZFNldHRpbmdDb2RlQWN0aW9ucyhbbWFya2VyXSk7XG5cdFx0XHR0aGlzLmFkZENvZGVBY3Rpb25zKG1hcmtlciwgY29kZUFjdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbihzZXR0aW5nOiBJU2V0dGluZywgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSk6IHZvaWQge1xuXHRcdGlmIChjb25maWd1cmF0aW9uLnNjb3BlICYmIEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyhjb25maWd1cmF0aW9uLnNjb3BlKSkge1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVVbnN1cHBvcnRlZEFwcGxpY2F0aW9uU2V0dGluZ01hcmtlcihzZXR0aW5nKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FKSB7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2godGhpcy5nZW5lcmF0ZVVuc3VwcG9ydGVkTWFjaGluZVNldHRpbmdNYXJrZXIoc2V0dGluZykpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmF0aW9uLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XKSB7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2goe1xuXHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdC4uLnNldHRpbmcucmFuZ2UsXG5cdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5zdXBwb3J0ZWRXaW5kb3dTZXR0aW5nJywgXCJUaGlzIHNldHRpbmcgY2Fubm90IGJlIGFwcGxpZWQgaW4gdGhpcyB3b3Jrc3BhY2UuIEl0IHdpbGwgYmUgYXBwbGllZCB3aGVuIHlvdSBvcGVuIHRoZSBjb250YWluaW5nIHdvcmtzcGFjZSBmb2xkZXIgZGlyZWN0bHkuXCIpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSAmJiBjb25maWd1cmF0aW9uLnJlc3RyaWN0ZWQpIHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHRoaXMuZ2VuZXJhdGVVbnRydXN0ZWRTZXR0aW5nTWFya2VyKHNldHRpbmcpO1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKG1hcmtlcik7XG5cdFx0XHRjb25zdCBjb2RlQWN0aW9ucyA9IHRoaXMuZ2VuZXJhdGVVbnRydXN0ZWRTZXR0aW5nQ29kZUFjdGlvbnMoW21hcmtlcl0pO1xuXHRcdFx0dGhpcy5hZGRDb2RlQWN0aW9ucyhtYXJrZXIsIGNvZGVBY3Rpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVVuc3RhYmxlU2V0dGluZ0NvbmZpZ3VyYXRpb24oc2V0dGluZzogSVNldHRpbmcsIGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10pOiB2b2lkIHtcblx0XHRpZiAoY29uZmlndXJhdGlvbi50YWdzPy5pbmNsdWRlcygncHJldmlldycpKSB7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2godGhpcy5nZW5lcmF0ZVByZXZpZXdTZXR0aW5nTWFya2VyKHNldHRpbmcpKTtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZ3VyYXRpb24udGFncz8uaW5jbHVkZXMoJ2V4cGVyaW1lbnRhbCcpKSB7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2godGhpcy5nZW5lcmF0ZUV4cGVyaW1lbnRhbFNldHRpbmdNYXJrZXIoc2V0dGluZykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVVbnN1cHBvcnRlZEFwcGxpY2F0aW9uU2V0dGluZ01hcmtlcihzZXR0aW5nOiBJU2V0dGluZyk6IElNYXJrZXJEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHR0YWdzOiBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdC4uLnNldHRpbmcucmFuZ2UsXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3Vuc3VwcG9ydGVkQXBwbGljYXRpb25TZXR0aW5nJywgXCJUaGlzIHNldHRpbmcgaGFzIGFuIGFwcGxpY2F0aW9uIHNjb3BlIGFuZCBjYW4gb25seSBiZSBzZXQgaW4gdGhlIHNldHRpbmdzIGZpbGUgZnJvbSB0aGUgRGVmYXVsdCBwcm9maWxlLlwiKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlVW5zdXBwb3J0ZWRNYWNoaW5lU2V0dGluZ01hcmtlcihzZXR0aW5nOiBJU2V0dGluZyk6IElNYXJrZXJEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHR0YWdzOiBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdC4uLnNldHRpbmcucmFuZ2UsXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3Vuc3VwcG9ydGVkTWFjaGluZVNldHRpbmcnLCBcIlRoaXMgc2V0dGluZyBjYW4gb25seSBiZSBhcHBsaWVkIGluIHVzZXIgc2V0dGluZ3MgaW4gbG9jYWwgd2luZG93IG9yIGluIHJlbW90ZSBzZXR0aW5ncyBpbiByZW1vdGUgd2luZG93LlwiKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlVW50cnVzdGVkU2V0dGluZ01hcmtlcihzZXR0aW5nOiBJU2V0dGluZyk6IElNYXJrZXJEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bnRydXN0ZWRTZXR0aW5nJywgXCJUaGlzIHNldHRpbmcgY2FuIG9ubHkgYmUgYXBwbGllZCBpbiBhIHRydXN0ZWQgd29ya3NwYWNlLlwiKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlVW5rbm93bkNvbmZpZ3VyYXRpb25NYXJrZXIoc2V0dGluZzogSVNldHRpbmcpOiBJTWFya2VyRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bmtub3duIGNvbmZpZ3VyYXRpb24gc2V0dGluZycsIFwiVW5rbm93biBDb25maWd1cmF0aW9uIFNldHRpbmdcIilcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZVVudHJ1c3RlZFNldHRpbmdDb2RlQWN0aW9ucyhkaWFnbm9zdGljczogSU1hcmtlckRhdGFbXSk6IGxhbmd1YWdlcy5Db2RlQWN0aW9uW10ge1xuXHRcdHJldHVybiBbe1xuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnbWFuYWdlIHdvcmtzcGFjZSB0cnVzdCcsIFwiTWFuYWdlIFdvcmtzcGFjZSBUcnVzdFwiKSxcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gudHJ1c3QubWFuYWdlJyxcblx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnbWFuYWdlIHdvcmtzcGFjZSB0cnVzdCcsIFwiTWFuYWdlIFdvcmtzcGFjZSBUcnVzdFwiKVxuXHRcdFx0fSxcblx0XHRcdGRpYWdub3N0aWNzLFxuXHRcdFx0a2luZDogQ29kZUFjdGlvbktpbmQuUXVpY2tGaXgudmFsdWVcblx0XHR9XTtcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVQcmV2aWV3U2V0dGluZ01hcmtlcihzZXR0aW5nOiBJU2V0dGluZyk6IElNYXJrZXJEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0bWVzc2FnZTogUFJFVklFV19JTkRJQ0FUT1JfREVTQ1JJUFRJT05cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZUV4cGVyaW1lbnRhbFNldHRpbmdNYXJrZXIoc2V0dGluZzogSVNldHRpbmcpOiBJTWFya2VyRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdG1lc3NhZ2U6IEVYUEVSSU1FTlRBTF9JTkRJQ0FUT1JfREVTQ1JJUFRJT05cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRDb2RlQWN0aW9ucyhyYW5nZTogSVJhbmdlLCBjb2RlQWN0aW9uczogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25bXSk6IHZvaWQge1xuXHRcdGxldCBhY3Rpb25zID0gdGhpcy5jb2RlQWN0aW9ucy5nZXQodGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaSk7XG5cdFx0aWYgKCFhY3Rpb25zKSB7XG5cdFx0XHRhY3Rpb25zID0gW107XG5cdFx0XHR0aGlzLmNvZGVBY3Rpb25zLnNldCh0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpLCBhY3Rpb25zKTtcblx0XHR9XG5cdFx0YWN0aW9ucy5wdXNoKFtSYW5nZS5saWZ0KHJhbmdlKSwgY29kZUFjdGlvbnNdKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubWFya2VyU2VydmljZS5yZW1vdmUoJ1Vuc3VwcG9ydGVkU2V0dGluZ3NSZW5kZXJlcicsIFt0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpXSk7XG5cdFx0dGhpcy5jb2RlQWN0aW9ucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmNsYXNzIE1jcFNldHRpbmdzUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Qcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZW5kZXJpbmdEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMjAwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29kZUFjdGlvbnMgPSBuZXcgUmVzb3VyY2VNYXA8W1JhbmdlLCBsYW5ndWFnZXMuQ29kZUFjdGlvbltdXVtdPih1cmkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ3NFZGl0b3JNb2RlbDogU2V0dGluZ3NFZGl0b3JNb2RlbCxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHRoaXMuZGVsYXllZFJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgcGF0dGVybjogc2V0dGluZ3NFZGl0b3JNb2RlbC51cmkucGF0aCB9LCB0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIGRlbGF5ZWRSZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJpbmdEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5yZW5kZXIoKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29kZUFjdGlvbnMuY2xlYXIoKTtcblx0XHRjb25zdCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdID0gdGhpcy5nZW5lcmF0ZU1hcmtlckRhdGEoKTtcblx0XHRpZiAobWFya2VyRGF0YS5sZW5ndGgpIHtcblx0XHRcdHRoaXMubWFya2VyU2VydmljZS5jaGFuZ2VPbmUoJ01jcFNldHRpbmdzUmVuZGVyZXInLCB0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpLCBtYXJrZXJEYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYXJrZXJTZXJ2aWNlLnJlbW92ZSgnTWNwU2V0dGluZ3NSZW5kZXJlcicsIFt0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpXSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNvZGVBY3Rpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UgfCBTZWxlY3Rpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5Db2RlQWN0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3Q+IHtcblx0XHRjb25zdCBhY3Rpb25zOiBsYW5ndWFnZXMuQ29kZUFjdGlvbltdID0gW107XG5cdFx0Y29uc3QgY29kZUFjdGlvbnNCeVJhbmdlID0gdGhpcy5jb2RlQWN0aW9ucy5nZXQobW9kZWwudXJpKTtcblx0XHRpZiAoY29kZUFjdGlvbnNCeVJhbmdlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtjb2RlQWN0aW9uc1JhbmdlLCBjb2RlQWN0aW9uc10gb2YgY29kZUFjdGlvbnNCeVJhbmdlKSB7XG5cdFx0XHRcdGlmIChjb2RlQWN0aW9uc1JhbmdlLmNvbnRhaW5zUmFuZ2UocmFuZ2UpKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKC4uLmNvZGVBY3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0YWN0aW9ucyxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlTWFya2VyRGF0YSgpOiBJTWFya2VyRGF0YVtdIHtcblx0XHRjb25zdCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdID0gW107XG5cblx0XHQvLyBPbmx5IGNoZWNrIGZvciBNQ1AgY29uZmlndXJhdGlvbiBpbiB1c2VyIGxvY2FsIGFuZCB1c2VyIHJlbW90ZSBzZXR0aW5nc1xuXHRcdGlmICh0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwuY29uZmlndXJhdGlvblRhcmdldCAhPT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMICYmXG5cdFx0XHR0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwuY29uZmlndXJhdGlvblRhcmdldCAhPT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSkge1xuXHRcdFx0cmV0dXJuIG1hcmtlckRhdGE7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXR0aW5nc0dyb3VwIG9mIHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC5zZXR0aW5nc0dyb3Vwcykge1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHNldHRpbmdzR3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRpZiAoc2V0dGluZy5rZXkgPT09IG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtYXJrZXIgPSB0aGlzLmdlbmVyYXRlTWNwQ29uZmlndXJhdGlvbk1hcmtlcihzZXR0aW5nKTtcblx0XHRcdFx0XHRcdG1hcmtlckRhdGEucHVzaChtYXJrZXIpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29kZUFjdGlvbnMgPSB0aGlzLmdlbmVyYXRlTWNwQ29uZmlndXJhdGlvbkNvZGVBY3Rpb25zKFttYXJrZXJdKTtcblx0XHRcdFx0XHRcdHRoaXMuYWRkQ29kZUFjdGlvbnMoc2V0dGluZy5yYW5nZSwgY29kZUFjdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWFya2VyRGF0YTtcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVNY3BDb25maWd1cmF0aW9uTWFya2VyKHNldHRpbmc6IElTZXR0aW5nKTogSU1hcmtlckRhdGEge1xuXHRcdGNvbnN0IGlzUmVtb3RlID0gdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLmNvbmZpZ3VyYXRpb25UYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGlzUmVtb3RlXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnbWNwLnJlbmRlcmVyLnJlbW90ZUNvbmZpZ0ZvdW5kJywgJ01DUCBzZXJ2ZXJzIHNob3VsZCBub3QgYmUgY29uZmlndXJlZCBpbiByZW1vdGUgdXNlciBzZXR0aW5ncy4gVXNlIHRoZSBkZWRpY2F0ZWQgTUNQIGNvbmZpZ3VyYXRpb24gaW5zdGVhZC4nKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ21jcC5yZW5kZXJlci51c2VyQ29uZmlnRm91bmQnLCAnTUNQIHNlcnZlcnMgc2hvdWxkIG5vdCBiZSBjb25maWd1cmVkIGluIHVzZXIgc2V0dGluZ3MuIFVzZSB0aGUgZGVkaWNhdGVkIE1DUCBjb25maWd1cmF0aW9uIGluc3RlYWQuJyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0bWVzc2FnZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlTWNwQ29uZmlndXJhdGlvbkNvZGVBY3Rpb25zKGRpYWdub3N0aWNzOiBJTWFya2VyRGF0YVtdKTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25bXSB7XG5cdFx0Y29uc3QgaXNSZW1vdGUgPSB0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwuY29uZmlndXJhdGlvblRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTtcblx0XHRjb25zdCBvcGVuQ29uZmlnTGFiZWwgPSBpc1JlbW90ZVxuXHRcdFx0PyBubHMubG9jYWxpemUoJ21jcC5yZW5kZXJlci5vcGVuUmVtb3RlQ29uZmlnJywgJ09wZW4gUmVtb3RlIFVzZXIgTUNQIENvbmZpZ3VyYXRpb24nKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ21jcC5yZW5kZXJlci5vcGVuVXNlckNvbmZpZycsICdPcGVuIFVzZXIgTUNQIENvbmZpZ3VyYXRpb24nKTtcblxuXHRcdGNvbnN0IGNvbW1hbmRJZCA9IGlzUmVtb3RlID8gTWNwQ29tbWFuZElkcy5PcGVuUmVtb3RlVXNlck1jcCA6IE1jcENvbW1hbmRJZHMuT3BlblVzZXJNY3A7XG5cblx0XHRyZXR1cm4gW3tcblx0XHRcdHRpdGxlOiBvcGVuQ29uZmlnTGFiZWwsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdHRpdGxlOiBvcGVuQ29uZmlnTGFiZWxcblx0XHRcdH0sXG5cdFx0XHRkaWFnbm9zdGljcyxcblx0XHRcdGtpbmQ6IENvZGVBY3Rpb25LaW5kLlF1aWNrRml4LnZhbHVlXG5cdFx0fV07XG5cdH1cblxuXHRwcml2YXRlIGFkZENvZGVBY3Rpb25zKHJhbmdlOiBJUmFuZ2UsIGNvZGVBY3Rpb25zOiBsYW5ndWFnZXMuQ29kZUFjdGlvbltdKTogdm9pZCB7XG5cdFx0bGV0IGFjdGlvbnMgPSB0aGlzLmNvZGVBY3Rpb25zLmdldCh0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpKTtcblx0XHRpZiAoIWFjdGlvbnMpIHtcblx0XHRcdGFjdGlvbnMgPSBbXTtcblx0XHRcdHRoaXMuY29kZUFjdGlvbnMuc2V0KHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC51cmksIGFjdGlvbnMpO1xuXHRcdH1cblx0XHRhY3Rpb25zLnB1c2goW1JhbmdlLmxpZnQocmFuZ2UpLCBjb2RlQWN0aW9uc10pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5tYXJrZXJTZXJ2aWNlLnJlbW92ZSgnTWNwU2V0dGluZ3NSZW5kZXJlcicsIFt0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpXSk7XG5cdFx0dGhpcy5jb2RlQWN0aW9ucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmNsYXNzIFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBzdXBwb3J0ZWRLZXlzID0gWydmb2xkZXJzJywgJ3Rhc2tzJywgJ2xhdW5jaCcsIG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uLCAnZXh0ZW5zaW9ucycsICdzZXR0aW5ncycsICdyZW1vdGVBdXRob3JpdHknLCAndHJhbnNpZW50J107XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uczogZWRpdG9yQ29tbW9uLklFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgcmVuZGVyaW5nRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDIwMCkpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvciwgcHJpdmF0ZSB3b3Jrc3BhY2VTZXR0aW5nc0VkaXRvck1vZGVsOiBTZXR0aW5nc0VkaXRvck1vZGVsLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLnJlbmRlcmluZ0RlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnJlbmRlcigpKSkpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10gPSBbXTtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UgJiYgdGhpcy53b3Jrc3BhY2VTZXR0aW5nc0VkaXRvck1vZGVsIGluc3RhbmNlb2YgV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRvck1vZGVsKSB7XG5cdFx0XHRjb25zdCByYW5nZXM6IElSYW5nZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHNldHRpbmdzR3JvdXAgb2YgdGhpcy53b3Jrc3BhY2VTZXR0aW5nc0VkaXRvck1vZGVsLmNvbmZpZ3VyYXRpb25Hcm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHNldHRpbmdzR3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0aWYgKCFXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIuc3VwcG9ydGVkS2V5cy5pbmNsdWRlcyhzZXR0aW5nLmtleSkpIHtcblx0XHRcdFx0XHRcdFx0bWFya2VyRGF0YS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0XHRcdFx0XHR0YWdzOiBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFx0XHRcdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5zdXBwb3J0ZWRQcm9wZXJ0eScsIFwiVW5zdXBwb3J0ZWQgUHJvcGVydHlcIilcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRlY29yYXRpb25zLnNldChyYW5nZXMubWFwKHJhbmdlID0+IHRoaXMuY3JlYXRlRGVjb3JhdGlvbihyYW5nZSkpKTtcblx0XHR9XG5cdFx0aWYgKG1hcmtlckRhdGEubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLm1hcmtlclNlcnZpY2UuY2hhbmdlT25lKCdXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXInLCB0aGlzLndvcmtzcGFjZVNldHRpbmdzRWRpdG9yTW9kZWwudXJpLCBtYXJrZXJEYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYXJrZXJTZXJ2aWNlLnJlbW92ZSgnV29ya3NwYWNlQ29uZmlndXJhdGlvblJlbmRlcmVyJywgW3RoaXMud29ya3NwYWNlU2V0dGluZ3NFZGl0b3JNb2RlbC51cmldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRElNX0NPTkZJR1VSQVRJT05fID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdkaW0tY29uZmlndXJhdGlvbicsXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0aW5saW5lQ2xhc3NOYW1lOiAnZGltLWNvbmZpZ3VyYXRpb24nXG5cdH0pO1xuXG5cdHByaXZhdGUgY3JlYXRlRGVjb3JhdGlvbihyYW5nZTogSVJhbmdlKTogSU1vZGVsRGVsdGFEZWNvcmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2UsXG5cdFx0XHRvcHRpb25zOiBXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIuX0RJTV9DT05GSUdVUkFUSU9OX1xuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubWFya2VyU2VydmljZS5yZW1vdmUoJ1dvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZW5kZXJlcicsIFt0aGlzLndvcmtzcGFjZVNldHRpbmdzRWRpdG9yTW9kZWwudXJpXSk7XG5cdFx0dGhpcy5kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWEsOEJBQThCO0FBQ3BELFNBQWtCLHFCQUFxQjtBQUN2QyxTQUFTLGVBQWU7QUFHeEIsU0FBUyxTQUFT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
