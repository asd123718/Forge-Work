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
import { coalesce } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { visit } from "../../../../base/common/json.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, Extensions, OVERRIDE_PROPERTY_REGEX } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorModel } from "../../../common/editor/editorModel.js";
import { SettingMatchType } from "./preferences.js";
import { FOLDER_SCOPES, WORKSPACE_SCOPES } from "../../configuration/common/configuration.js";
import { createValidator } from "./preferencesValidation.js";
import { isString } from "../../../../base/common/types.js";
const nullRange = { startLineNumber: -1, startColumn: -1, endLineNumber: -1, endColumn: -1 };
function isNullRange(range) {
  return range.startLineNumber === -1 && range.startColumn === -1 && range.endLineNumber === -1 && range.endColumn === -1;
}
function fixSettingLinks(text) {
  return text.replace(/`#([^#`]*)#`/g, (_, settingName) => `\`${settingName}\``);
}
class AbstractSettingsModel extends EditorModel {
  constructor() {
    super(...arguments);
    this._currentResultGroups = /* @__PURE__ */ new Map();
  }
  updateResultGroup(id, resultGroup) {
    if (resultGroup) {
      this._currentResultGroups.set(id, resultGroup);
    } else {
      this._currentResultGroups.delete(id);
    }
    this.removeDuplicateResults();
    return this.update();
  }
  /**
   * Remove duplicates between result groups, preferring results in earlier groups
   */
  removeDuplicateResults() {
    const settingKeys = /* @__PURE__ */ new Set();
    [...this._currentResultGroups.keys()].sort((a, b) => this._currentResultGroups.get(a).order - this._currentResultGroups.get(b).order).forEach((groupId) => {
      const group = this._currentResultGroups.get(groupId);
      group.result.filterMatches = group.result.filterMatches.filter((s) => !settingKeys.has(s.setting.key));
      group.result.filterMatches.forEach((s) => settingKeys.add(s.setting.key));
    });
  }
  filterSettings(filter, groupFilter, settingMatcher) {
    const allGroups = this.filterGroups;
    const filterMatches = [];
    for (const group of allGroups) {
      const groupMatched = groupFilter(group);
      for (const section of group.sections) {
        for (const setting of section.settings) {
          const settingMatchResult = settingMatcher(setting, group);
          if (groupMatched || settingMatchResult) {
            filterMatches.push({
              setting,
              matches: settingMatchResult && settingMatchResult.matches,
              matchType: settingMatchResult?.matchType ?? SettingMatchType.None,
              keyMatchScore: settingMatchResult?.keyMatchScore ?? 0,
              score: settingMatchResult?.score ?? 0
            });
          }
        }
      }
    }
    return filterMatches;
  }
  getPreference(key) {
    for (const group of this.settingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          if (key === setting.key) {
            return setting;
          }
        }
      }
    }
    return void 0;
  }
  collectMetadata(groups) {
    const metadata = /* @__PURE__ */ Object.create(null);
    let hasMetadata = false;
    groups.forEach((g) => {
      if (g.result.metadata) {
        metadata[g.id] = g.result.metadata;
        hasMetadata = true;
      }
    });
    return hasMetadata ? metadata : null;
  }
  get filterGroups() {
    return this.settingsGroups;
  }
}
class SettingsEditorModel extends AbstractSettingsModel {
  constructor(reference, _configurationTarget) {
    super();
    this._configurationTarget = _configurationTarget;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this.settingsModel = reference.object.textEditorModel;
    this._register(this.onWillDispose(() => reference.dispose()));
    this._register(this.settingsModel.onDidChangeContent(() => {
      this._settingsGroups = void 0;
      this._onDidChangeGroups.fire();
    }));
  }
  get uri() {
    return this.settingsModel.uri;
  }
  get configurationTarget() {
    return this._configurationTarget;
  }
  get settingsGroups() {
    if (!this._settingsGroups) {
      this.parse();
    }
    return this._settingsGroups;
  }
  get content() {
    return this.settingsModel.getValue();
  }
  isSettingsProperty(property, previousParents) {
    return previousParents.length === 0;
  }
  parse() {
    this._settingsGroups = parse(this.settingsModel, (property, previousParents) => this.isSettingsProperty(property, previousParents));
  }
  update() {
    const resultGroups = [...this._currentResultGroups.values()];
    if (!resultGroups.length) {
      return void 0;
    }
    const filteredSettings = [];
    const matches = [];
    resultGroups.forEach((group) => {
      group.result.filterMatches.forEach((filterMatch) => {
        filteredSettings.push(filterMatch.setting);
        if (filterMatch.matches) {
          matches.push(...filterMatch.matches);
        }
      });
    });
    let filteredGroup;
    const modelGroup = this.settingsGroups[0];
    if (modelGroup) {
      filteredGroup = {
        id: modelGroup.id,
        range: modelGroup.range,
        sections: [{
          settings: filteredSettings
        }],
        title: modelGroup.title,
        titleRange: modelGroup.titleRange,
        order: modelGroup.order,
        extensionInfo: modelGroup.extensionInfo
      };
    }
    const metadata = this.collectMetadata(resultGroups);
    return {
      allGroups: this.settingsGroups,
      filteredGroups: filteredGroup ? [filteredGroup] : [],
      matches,
      metadata: metadata ?? void 0
    };
  }
}
let Settings2EditorModel = class extends AbstractSettingsModel {
  constructor(_defaultSettings, configurationService) {
    super();
    this._defaultSettings = _defaultSettings;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this.additionalGroups = [];
    this.dirty = false;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.source === ConfigurationTarget.DEFAULT) {
        this.dirty = true;
        this._onDidChangeGroups.fire();
      }
    }));
    this._register(Registry.as(Extensions.Configuration).onDidSchemaChange((e) => {
      this.dirty = true;
      this._onDidChangeGroups.fire();
    }));
  }
  /** Doesn't include the "Commonly Used" group */
  get filterGroups() {
    return this.settingsGroups.slice(1);
  }
  get settingsGroups() {
    const groups = this._defaultSettings.getSettingsGroups(this.dirty);
    this.dirty = false;
    return [...groups, ...this.additionalGroups];
  }
  /** For programmatically added groups outside of registered configurations */
  setAdditionalGroups(groups) {
    this.additionalGroups = groups;
  }
  update() {
    throw new Error("Not supported");
  }
};
Settings2EditorModel = __decorateClass([
  __decorateParam(1, IConfigurationService)
], Settings2EditorModel);
function parse(model, isSettingsProperty) {
  const settings = [];
  let overrideSetting = null;
  let currentProperty = null;
  let currentParent = [];
  const previousParents = [];
  let settingsPropertyIndex = -1;
  const range = {
    startLineNumber: 0,
    startColumn: 0,
    endLineNumber: 0,
    endColumn: 0
  };
  function onValue(value, offset, length) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty) {
      currentParent[currentProperty] = value;
    }
    if (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null) {
      const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
      if (setting) {
        const valueStartPosition = model.getPositionAt(offset);
        const valueEndPosition = model.getPositionAt(offset + length);
        setting.value = value;
        setting.valueRange = {
          startLineNumber: valueStartPosition.lineNumber,
          startColumn: valueStartPosition.column,
          endLineNumber: valueEndPosition.lineNumber,
          endColumn: valueEndPosition.column
        };
        setting.range = Object.assign(setting.range, {
          endLineNumber: valueEndPosition.lineNumber,
          endColumn: valueEndPosition.column
        });
      }
    }
  }
  const visitor = {
    onObjectBegin: (offset, length) => {
      if (isSettingsProperty(currentProperty, previousParents)) {
        settingsPropertyIndex = previousParents.length;
        const position = model.getPositionAt(offset);
        range.startLineNumber = position.lineNumber;
        range.startColumn = position.column;
      }
      const object = {};
      onValue(object, offset, length);
      currentParent = object;
      currentProperty = null;
      previousParents.push(currentParent);
    },
    onObjectProperty: (name, offset, length) => {
      currentProperty = name;
      if (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null) {
        const settingStartPosition = model.getPositionAt(offset);
        const setting = {
          description: [],
          descriptionIsMarkdown: false,
          key: name,
          keyRange: {
            startLineNumber: settingStartPosition.lineNumber,
            startColumn: settingStartPosition.column + 1,
            endLineNumber: settingStartPosition.lineNumber,
            endColumn: settingStartPosition.column + length
          },
          range: {
            startLineNumber: settingStartPosition.lineNumber,
            startColumn: settingStartPosition.column,
            endLineNumber: 0,
            endColumn: 0
          },
          value: null,
          valueRange: nullRange,
          descriptionRanges: [],
          overrides: [],
          overrideOf: overrideSetting ?? void 0
        };
        if (previousParents.length === settingsPropertyIndex + 1) {
          settings.push(setting);
          if (OVERRIDE_PROPERTY_REGEX.test(name)) {
            overrideSetting = setting;
          }
        } else {
          overrideSetting.overrides.push(setting);
        }
      }
    },
    onObjectEnd: (offset, length) => {
      currentParent = previousParents.pop();
      if (settingsPropertyIndex !== -1 && (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
        const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
        if (setting) {
          const valueEndPosition = model.getPositionAt(offset + length);
          setting.valueRange = Object.assign(setting.valueRange, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
          setting.range = Object.assign(setting.range, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
        }
        if (previousParents.length === settingsPropertyIndex + 1) {
          overrideSetting = null;
        }
      }
      if (previousParents.length === settingsPropertyIndex) {
        const position = model.getPositionAt(offset);
        range.endLineNumber = position.lineNumber;
        range.endColumn = position.column;
        settingsPropertyIndex = -1;
      }
    },
    onArrayBegin: (offset, length) => {
      const array = [];
      onValue(array, offset, length);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: (offset, length) => {
      currentParent = previousParents.pop();
      if (previousParents.length === settingsPropertyIndex + 1 || previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null) {
        const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
        if (setting) {
          const valueEndPosition = model.getPositionAt(offset + length);
          setting.valueRange = Object.assign(setting.valueRange, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
          setting.range = Object.assign(setting.range, {
            endLineNumber: valueEndPosition.lineNumber,
            endColumn: valueEndPosition.column
          });
        }
      }
    },
    onLiteralValue: onValue,
    onError: (error) => {
      const setting = settings[settings.length - 1];
      if (setting && (isNullRange(setting.range) || isNullRange(setting.keyRange) || isNullRange(setting.valueRange))) {
        settings.pop();
      }
    }
  };
  if (!model.isDisposed()) {
    visit(model.getValue(), visitor);
  }
  return settings.length > 0 ? [{
    id: model.isDisposed() ? "" : model.id,
    sections: [
      {
        settings
      }
    ],
    title: "",
    titleRange: nullRange,
    range
  }] : [];
}
class WorkspaceConfigurationEditorModel extends SettingsEditorModel {
  constructor() {
    super(...arguments);
    this._configurationGroups = [];
  }
  get configurationGroups() {
    return this._configurationGroups;
  }
  parse() {
    super.parse();
    this._configurationGroups = parse(this.settingsModel, (property, previousParents) => previousParents.length === 0);
  }
  isSettingsProperty(property, previousParents) {
    return property === "settings" && previousParents.length === 1;
  }
}
class DefaultSettings extends Disposable {
  constructor(_mostCommonlyUsedSettingsKeys, target, configurationService) {
    super();
    this._mostCommonlyUsedSettingsKeys = _mostCommonlyUsedSettingsKeys;
    this.target = target;
    this.configurationService = configurationService;
    this._settingsByName = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.source === ConfigurationTarget.DEFAULT) {
        this.reset();
        this._onDidChange.fire();
      }
    }));
  }
  getContent(forceUpdate = false) {
    if (!this._content || forceUpdate) {
      this.initialize();
    }
    return this._content;
  }
  getContentWithoutMostCommonlyUsed(forceUpdate = false) {
    if (!this._contentWithoutMostCommonlyUsed || forceUpdate) {
      this.initialize();
    }
    return this._contentWithoutMostCommonlyUsed;
  }
  getSettingsGroups(forceUpdate = false) {
    if (!this._allSettingsGroups || forceUpdate) {
      this.initialize();
    }
    return this._allSettingsGroups;
  }
  initialize() {
    this._allSettingsGroups = this.parse();
    this._content = this.toContent(this._allSettingsGroups, 0);
    this._contentWithoutMostCommonlyUsed = this.toContent(this._allSettingsGroups, 1);
  }
  reset() {
    this._content = void 0;
    this._contentWithoutMostCommonlyUsed = void 0;
    this._allSettingsGroups = void 0;
  }
  parse() {
    const settingsGroups = this.getRegisteredGroups();
    this.initAllSettingsMap(settingsGroups);
    const mostCommonlyUsed = this.getMostCommonlyUsedSettings();
    return [mostCommonlyUsed, ...settingsGroups];
  }
  getRegisteredGroups() {
    const registry = Registry.as(Extensions.Configuration);
    const allConfigurations = { ...registry.getConfigurationProperties() };
    const excludedConfigurations = registry.getExcludedConfigurationProperties();
    for (const policyKey of this.configurationService.keys().policy ?? []) {
      const policyConfiguration = excludedConfigurations[policyKey];
      if (policyConfiguration) {
        allConfigurations[policyKey] = policyConfiguration;
      }
    }
    const groups = this.removeEmptySettingsGroups(this.parseProperties(allConfigurations).sort(this.compareGroups));
    return this.sortGroups(groups);
  }
  sortGroups(groups) {
    groups.forEach((group) => {
      group.sections.forEach((section) => {
        section.settings.sort((a, b) => a.key.localeCompare(b.key));
      });
    });
    return groups;
  }
  initAllSettingsMap(allSettingsGroups) {
    this._settingsByName = /* @__PURE__ */ new Map();
    for (const group of allSettingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          this._settingsByName.set(setting.key, setting);
        }
      }
    }
  }
  getMostCommonlyUsedSettings() {
    const settings = coalesce(this._mostCommonlyUsedSettingsKeys.map((key) => {
      const setting = this._settingsByName.get(key);
      if (setting) {
        return {
          description: setting.description,
          key: setting.key,
          value: setting.value,
          keyRange: nullRange,
          range: nullRange,
          valueRange: nullRange,
          overrides: [],
          scope: ConfigurationScope.RESOURCE,
          type: setting.type,
          enum: setting.enum,
          enumDescriptions: setting.enumDescriptions,
          descriptionRanges: []
        };
      }
      return null;
    }));
    return {
      id: "mostCommonlyUsed",
      range: nullRange,
      title: nls.localize("commonlyUsed", "Commonly Used"),
      titleRange: nullRange,
      sections: [
        {
          settings
        }
      ]
    };
  }
  parseProperties(properties) {
    const result = [];
    const byTitle = /* @__PURE__ */ new Map();
    const byId = /* @__PURE__ */ new Map();
    for (const [key, property] of Object.entries(properties)) {
      if (!property.section) {
        continue;
      }
      let settingsGroup;
      if (property.section.title) {
        const groups = byTitle.get(property.section.title);
        if (groups) {
          const extensionId = property.section.extensionInfo?.id;
          settingsGroup = groups.find((g) => g.extensionInfo?.id === extensionId);
        }
      }
      if (!settingsGroup && property.section.id) {
        const groups = byId.get(property.section.id);
        if (groups) {
          const extensionId = property.section.extensionInfo?.id;
          settingsGroup = groups.find((g) => g.extensionInfo?.id === extensionId && !g.title);
        }
        if (settingsGroup && !settingsGroup?.title && property.section.title) {
          settingsGroup.title = property.section.title;
          const byTitleGroups = byTitle.get(property.section.title);
          if (byTitleGroups) {
            byTitleGroups.push(settingsGroup);
          } else {
            byTitle.set(property.section.title, [settingsGroup]);
          }
        }
      }
      if (!settingsGroup) {
        settingsGroup = { sections: [{ title: property.section.title, settings: [] }], id: property.section.id || "", title: property.section.title ?? "", titleRange: nullRange, order: property.section.order, range: nullRange, extensionInfo: isString(property.source) ? void 0 : property.source };
        result.push(settingsGroup);
        if (property.section.title) {
          const byTitleGroups = byTitle.get(property.section.title);
          if (byTitleGroups) {
            byTitleGroups.push(settingsGroup);
          } else {
            byTitle.set(property.section.title, [settingsGroup]);
          }
        }
        if (property.section.id) {
          const byIdGroups = byId.get(property.section.id);
          if (byIdGroups) {
            byIdGroups.push(settingsGroup);
          } else {
            byId.set(property.section.id, [settingsGroup]);
          }
        }
      }
      const setting = this.parseSetting(key, property);
      if (setting) {
        settingsGroup.sections[0].settings.push(setting);
      }
    }
    return result;
  }
  removeEmptySettingsGroups(settingsGroups) {
    const result = [];
    for (const settingsGroup of settingsGroups) {
      settingsGroup.sections = settingsGroup.sections.filter((section) => section.settings.length > 0);
      if (settingsGroup.sections.length) {
        result.push(settingsGroup);
      }
    }
    return result;
  }
  parseSetting(key, prop) {
    if (!this.matchesScope(prop)) {
      return void 0;
    }
    const value = prop.default;
    let description = prop.markdownDescription || prop.description || "";
    if (typeof description !== "string") {
      description = "";
    }
    const descriptionLines = description.split("\n");
    const overrides = OVERRIDE_PROPERTY_REGEX.test(key) ? this.parseOverrideSettings(prop.default) : [];
    let listItemType;
    if (prop.type === "array" && prop.items && !Array.isArray(prop.items) && prop.items.type) {
      if (prop.items.enum) {
        listItemType = "enum";
      } else if (!Array.isArray(prop.items.type)) {
        listItemType = prop.items.type;
      }
    }
    const objectProperties = prop.type === "object" ? prop.properties : void 0;
    const objectPatternProperties = prop.type === "object" ? prop.patternProperties : void 0;
    const objectAdditionalProperties = prop.type === "object" ? prop.additionalProperties : void 0;
    const propertyNames = prop.type === "object" ? prop.propertyNames : void 0;
    let enumToUse = prop.enum;
    let enumDescriptions = prop.markdownEnumDescriptions ?? prop.enumDescriptions;
    let enumDescriptionsAreMarkdown = !!prop.markdownEnumDescriptions;
    if (listItemType === "enum" && !Array.isArray(prop.items)) {
      enumToUse = prop.items.enum;
      enumDescriptions = prop.items.markdownEnumDescriptions ?? prop.items.enumDescriptions;
      enumDescriptionsAreMarkdown = !!prop.items.markdownEnumDescriptions;
    }
    let allKeysAreBoolean = false;
    if (prop.type === "object" && !prop.additionalProperties && prop.properties && Object.keys(prop.properties).length) {
      allKeysAreBoolean = Object.keys(prop.properties).every((key2) => {
        return prop.properties[key2].type === "boolean";
      });
    }
    let isLanguageTagSetting = false;
    if (OVERRIDE_PROPERTY_REGEX.test(key)) {
      isLanguageTagSetting = true;
    }
    let defaultValueSource;
    if (!isLanguageTagSetting) {
      const registeredConfigurationProp = prop;
      if (registeredConfigurationProp && registeredConfigurationProp.defaultValueSource) {
        defaultValueSource = registeredConfigurationProp.defaultValueSource;
      }
    }
    if (!enumToUse && (prop.enumItemLabels || enumDescriptions || enumDescriptionsAreMarkdown)) {
      console.error(`The setting ${key} has enum-related fields, but doesn't have an enum field. This setting may render improperly in the Settings editor.`);
    }
    return {
      key,
      value,
      description: descriptionLines,
      descriptionIsMarkdown: !!prop.markdownDescription,
      keywords: prop.keywords,
      range: nullRange,
      keyRange: nullRange,
      valueRange: nullRange,
      descriptionRanges: [],
      overrides,
      scope: prop.scope,
      type: prop.type,
      arrayItemType: listItemType,
      objectProperties,
      objectPatternProperties,
      objectAdditionalProperties,
      propertyNames,
      enum: enumToUse,
      enumDescriptions,
      enumDescriptionsAreMarkdown,
      enumItemLabels: prop.enumItemLabels,
      uniqueItems: prop.uniqueItems,
      tags: prop.tags,
      disallowSyncIgnore: prop.disallowSyncIgnore,
      restricted: prop.restricted,
      extensionInfo: isString(prop.source) ? void 0 : prop.source,
      deprecationMessage: prop.markdownDeprecationMessage || prop.deprecationMessage,
      deprecationMessageIsMarkdown: !!prop.markdownDeprecationMessage,
      validator: createValidator(prop),
      allKeysAreBoolean,
      editPresentation: prop.editPresentation,
      order: prop.order,
      nonLanguageSpecificDefaultValueSource: defaultValueSource,
      isLanguageTagSetting,
      categoryLabel: (isString(prop.source) ? void 0 : prop.source?.id) === prop.section?.id ? prop.title : prop.section?.id
    };
  }
  parseOverrideSettings(overrideSettings) {
    return Object.keys(overrideSettings).map((key) => ({
      key,
      value: overrideSettings[key],
      description: [],
      descriptionIsMarkdown: false,
      range: nullRange,
      keyRange: nullRange,
      valueRange: nullRange,
      descriptionRanges: [],
      overrides: []
    }));
  }
  matchesScope(property) {
    if (!property.scope) {
      return true;
    }
    if (this.target === ConfigurationTarget.WORKSPACE_FOLDER) {
      return FOLDER_SCOPES.indexOf(property.scope) !== -1;
    }
    if (this.target === ConfigurationTarget.WORKSPACE) {
      return WORKSPACE_SCOPES.indexOf(property.scope) !== -1;
    }
    return true;
  }
  compareGroups(c1, c2) {
    if (typeof c1?.order !== "number") {
      return 1;
    }
    if (typeof c2?.order !== "number") {
      return -1;
    }
    if (c1.order === c2.order) {
      const title1 = c1.title || "";
      const title2 = c2.title || "";
      return title1.localeCompare(title2);
    }
    return c1.order - c2.order;
  }
  toContent(settingsGroups, startIndex) {
    const builder = new SettingsContentBuilder();
    for (let i = startIndex; i < settingsGroups.length; i++) {
      builder.pushGroup(settingsGroups[i], i === startIndex, i === settingsGroups.length - 1);
    }
    return builder.getContent();
  }
}
class DefaultSettingsEditorModel extends AbstractSettingsModel {
  constructor(_uri, reference, defaultSettings) {
    super();
    this._uri = _uri;
    this.defaultSettings = defaultSettings;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this._register(defaultSettings.onDidChange(() => this._onDidChangeGroups.fire()));
    this._model = reference.object.textEditorModel;
    this._register(this.onWillDispose(() => reference.dispose()));
  }
  get uri() {
    return this._uri;
  }
  get target() {
    return this.defaultSettings.target;
  }
  get settingsGroups() {
    return this.defaultSettings.getSettingsGroups();
  }
  get filterGroups() {
    return this.settingsGroups.slice(1);
  }
  update() {
    if (this._model.isDisposed()) {
      return void 0;
    }
    const resultGroups = [...this._currentResultGroups.values()].sort((a, b) => a.order - b.order);
    const nonEmptyResultGroups = resultGroups.filter((group) => group.result.filterMatches.length);
    const startLine = this.settingsGroups.at(-1).range.endLineNumber + 2;
    const { settingsGroups: filteredGroups, matches } = this.writeResultGroups(nonEmptyResultGroups, startLine);
    const metadata = this.collectMetadata(resultGroups);
    return resultGroups.length ? {
      allGroups: this.settingsGroups,
      filteredGroups,
      matches,
      metadata: metadata ?? void 0
    } : void 0;
  }
  /**
   * Translate the ISearchResultGroups to text, and write it to the editor model
   */
  writeResultGroups(groups, startLine) {
    const contentBuilderOffset = startLine - 1;
    const builder = new SettingsContentBuilder(contentBuilderOffset);
    const settingsGroups = [];
    const matches = [];
    if (groups.length) {
      builder.pushLine(",");
      groups.forEach((resultGroup) => {
        const settingsGroup = this.getGroup(resultGroup);
        settingsGroups.push(settingsGroup);
        matches.push(...this.writeSettingsGroupToBuilder(builder, settingsGroup, resultGroup.result.filterMatches));
      });
    }
    const groupContent = builder.getContent() + "\n";
    const groupEndLine = this._model.getLineCount();
    const cursorPosition = new Selection(startLine, 1, startLine, 1);
    const edit = {
      text: groupContent,
      forceMoveMarkers: true,
      range: new Range(startLine, 1, groupEndLine, 1)
    };
    this._model.pushEditOperations([cursorPosition], [edit], () => [cursorPosition]);
    const tokenizeTo = Math.min(startLine + 60, this._model.getLineCount());
    this._model.tokenization.forceTokenization(tokenizeTo);
    return { matches, settingsGroups };
  }
  writeSettingsGroupToBuilder(builder, settingsGroup, filterMatches) {
    filterMatches = filterMatches.map((filteredMatch) => {
      return {
        setting: filteredMatch.setting,
        score: filteredMatch.score,
        matchType: filteredMatch.matchType,
        keyMatchScore: filteredMatch.keyMatchScore,
        matches: filteredMatch.matches && filteredMatch.matches.map((match) => {
          return new Range(
            match.startLineNumber - filteredMatch.setting.range.startLineNumber,
            match.startColumn,
            match.endLineNumber - filteredMatch.setting.range.startLineNumber,
            match.endColumn
          );
        })
      };
    });
    builder.pushGroup(settingsGroup);
    const fixedMatches = filterMatches.map((m) => m.matches || []).flatMap((settingMatches, i) => {
      const setting = settingsGroup.sections[0].settings[i];
      return settingMatches.map((range) => {
        return new Range(
          range.startLineNumber + setting.range.startLineNumber,
          range.startColumn,
          range.endLineNumber + setting.range.startLineNumber,
          range.endColumn
        );
      });
    });
    return fixedMatches;
  }
  copySetting(setting) {
    return {
      description: setting.description,
      scope: setting.scope,
      type: setting.type,
      enum: setting.enum,
      enumDescriptions: setting.enumDescriptions,
      key: setting.key,
      value: setting.value,
      range: setting.range,
      overrides: [],
      overrideOf: setting.overrideOf,
      tags: setting.tags,
      deprecationMessage: setting.deprecationMessage,
      keyRange: nullRange,
      valueRange: nullRange,
      descriptionIsMarkdown: void 0,
      descriptionRanges: []
    };
  }
  getPreference(key) {
    for (const group of this.settingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          if (setting.key === key) {
            return setting;
          }
        }
      }
    }
    return void 0;
  }
  getGroup(resultGroup) {
    return {
      id: resultGroup.id,
      range: nullRange,
      title: resultGroup.label,
      titleRange: nullRange,
      sections: [
        {
          settings: resultGroup.result.filterMatches.map((m) => this.copySetting(m.setting))
        }
      ]
    };
  }
}
class SettingsContentBuilder {
  constructor(_rangeOffset = 0) {
    this._rangeOffset = _rangeOffset;
    this._contentByLines = [];
  }
  get lineCountWithOffset() {
    return this._contentByLines.length + this._rangeOffset;
  }
  get lastLine() {
    return this._contentByLines[this._contentByLines.length - 1] || "";
  }
  pushLine(...lineText) {
    this._contentByLines.push(...lineText);
  }
  pushGroup(settingsGroups, isFirst, isLast) {
    this._contentByLines.push(isFirst ? "[{" : "{");
    const lastSetting = this._pushGroup(settingsGroups, "  ");
    if (lastSetting) {
      const lineIdx = lastSetting.range.endLineNumber - this._rangeOffset;
      const content = this._contentByLines[lineIdx - 2];
      this._contentByLines[lineIdx - 2] = content.substring(0, content.length - 1);
    }
    this._contentByLines.push(isLast ? "}]" : "},");
  }
  _pushGroup(group, indent) {
    let lastSetting = null;
    const groupStart = this.lineCountWithOffset + 1;
    for (const section of group.sections) {
      if (section.title) {
        this.addDescription([section.title], indent, this._contentByLines);
      }
      if (section.settings.length) {
        for (const setting of section.settings) {
          this.pushSetting(setting, indent);
          lastSetting = setting;
        }
      }
    }
    group.range = { startLineNumber: groupStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
    return lastSetting;
  }
  getContent() {
    return this._contentByLines.join("\n");
  }
  pushSetting(setting, indent) {
    const settingStart = this.lineCountWithOffset + 1;
    this.pushSettingDescription(setting, indent);
    let preValueContent = indent;
    const keyString = JSON.stringify(setting.key);
    preValueContent += keyString;
    setting.keyRange = { startLineNumber: this.lineCountWithOffset + 1, startColumn: preValueContent.indexOf(setting.key) + 1, endLineNumber: this.lineCountWithOffset + 1, endColumn: setting.key.length };
    preValueContent += ": ";
    const valueStart = this.lineCountWithOffset + 1;
    this.pushValue(setting, preValueContent, indent);
    setting.valueRange = { startLineNumber: valueStart, startColumn: preValueContent.length + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length + 1 };
    this._contentByLines[this._contentByLines.length - 1] += ",";
    this._contentByLines.push("");
    setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
  }
  pushSettingDescription(setting, indent) {
    setting.descriptionRanges = [];
    const descriptionPreValue = indent + "// ";
    const deprecationMessageLines = setting.deprecationMessage?.split(/\n/g) ?? [];
    for (let line of [...deprecationMessageLines, ...setting.description]) {
      line = fixSettingLinks(line);
      this._contentByLines.push(descriptionPreValue + line);
      setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
    }
    if (setting.enum && setting.enumDescriptions?.some((desc) => !!desc)) {
      setting.enumDescriptions.forEach((desc, i) => {
        const displayEnum = escapeInvisibleChars(String(setting.enum[i]));
        const line = desc ? `${displayEnum}: ${fixSettingLinks(desc)}` : displayEnum;
        const lines = line.split(/\n/g);
        lines[0] = " - " + lines[0];
        this._contentByLines.push(...lines.map((l) => `${indent}// ${l}`));
        setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
      });
    }
  }
  pushValue(setting, preValueConent, indent) {
    const valueString = JSON.stringify(setting.value, null, indent);
    if (valueString && typeof setting.value === "object") {
      if (setting.overrides && setting.overrides.length) {
        this._contentByLines.push(preValueConent + " {");
        for (const subSetting of setting.overrides) {
          this.pushSetting(subSetting, indent + indent);
          this._contentByLines.pop();
        }
        const lastSetting = setting.overrides[setting.overrides.length - 1];
        const content = this._contentByLines[lastSetting.range.endLineNumber - 2];
        this._contentByLines[lastSetting.range.endLineNumber - 2] = content.substring(0, content.length - 1);
        this._contentByLines.push(indent + "}");
      } else {
        const mulitLineValue = valueString.split("\n");
        this._contentByLines.push(preValueConent + mulitLineValue[0]);
        for (let i = 1; i < mulitLineValue.length; i++) {
          this._contentByLines.push(indent + mulitLineValue[i]);
        }
      }
    } else {
      this._contentByLines.push(preValueConent + valueString);
    }
  }
  addDescription(description, indent, result) {
    for (const line of description) {
      result.push(indent + "// " + line);
    }
  }
}
class RawSettingsContentBuilder extends SettingsContentBuilder {
  constructor(indent = "	") {
    super(0);
    this.indent = indent;
  }
  pushGroup(settingsGroups) {
    this._pushGroup(settingsGroups, this.indent);
  }
}
class DefaultRawSettingsEditorModel extends Disposable {
  constructor(defaultSettings) {
    super();
    this.defaultSettings = defaultSettings;
    this._content = null;
    this._onDidContentChanged = this._register(new Emitter());
    this.onDidContentChanged = this._onDidContentChanged.event;
    this._register(defaultSettings.onDidChange(() => {
      this._content = null;
      this._onDidContentChanged.fire();
    }));
  }
  get content() {
    if (this._content === null) {
      const builder = new RawSettingsContentBuilder();
      builder.pushLine("{");
      for (const settingsGroup of this.defaultSettings.getRegisteredGroups()) {
        builder.pushGroup(settingsGroup);
      }
      builder.pushLine("}");
      this._content = builder.getContent();
    }
    return this._content;
  }
}
function escapeInvisibleChars(enumValue) {
  return enumValue && enumValue.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
function defaultKeybindingsContents(keybindingService) {
  const defaultsHeader = "// " + nls.localize("defaultKeybindingsHeader", "Override key bindings by placing them into your key bindings file.");
  return defaultsHeader + "\n" + keybindingService.getDefaultKeybindingsContent();
}
let DefaultKeybindingsEditorModel = class {
  constructor(_uri, keybindingService) {
    this._uri = _uri;
    this.keybindingService = keybindingService;
  }
  get uri() {
    return this._uri;
  }
  get content() {
    if (!this._content) {
      this._content = defaultKeybindingsContents(this.keybindingService);
    }
    return this._content;
  }
  getPreference() {
    return null;
  }
  dispose() {
  }
};
DefaultKeybindingsEditorModel = __decorateClass([
  __decorateParam(1, IKeybindingService)
], DefaultKeybindingsEditorModel);
export {
  DefaultKeybindingsEditorModel,
  DefaultRawSettingsEditorModel,
  DefaultSettings,
  DefaultSettingsEditorModel,
  Settings2EditorModel,
  SettingsEditorModel,
  WorkspaceConfigurationEditorModel,
  defaultKeybindingsContents,
  fixSettingLinks,
  nullRange
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcmVmZXJlbmNlc1xcY29tbW9uXFxwcmVmZXJlbmNlc01vZGVscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBKU09OVmlzaXRvciwgdmlzaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkRlZmF1bHRWYWx1ZVNvdXJjZSwgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBPVkVSUklERV9QUk9QRVJUWV9SRUdFWCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmlsdGVyTWV0YWRhdGEsIElGaWx0ZXJSZXN1bHQsIElHcm91cEZpbHRlciwgSUtleWJpbmRpbmdzRWRpdG9yTW9kZWwsIElTZWFyY2hSZXN1bHRHcm91cCwgSVNldHRpbmcsIElTZXR0aW5nTWF0Y2gsIElTZXR0aW5nTWF0Y2hlciwgSVNldHRpbmdzRWRpdG9yTW9kZWwsIElTZXR0aW5nc0dyb3VwLCBTZXR0aW5nTWF0Y2hUeXBlIH0gZnJvbSAnLi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBGT0xERVJfU0NPUEVTLCBXT1JLU1BBQ0VfU0NPUEVTIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVWYWxpZGF0b3IgfSBmcm9tICcuL3ByZWZlcmVuY2VzVmFsaWRhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNvbnN0IG51bGxSYW5nZTogSVJhbmdlID0geyBzdGFydExpbmVOdW1iZXI6IC0xLCBzdGFydENvbHVtbjogLTEsIGVuZExpbmVOdW1iZXI6IC0xLCBlbmRDb2x1bW46IC0xIH07XG5mdW5jdGlvbiBpc051bGxSYW5nZShyYW5nZTogSVJhbmdlKTogYm9vbGVhbiB7IHJldHVybiByYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IC0xICYmIHJhbmdlLnN0YXJ0Q29sdW1uID09PSAtMSAmJiByYW5nZS5lbmRMaW5lTnVtYmVyID09PSAtMSAmJiByYW5nZS5lbmRDb2x1bW4gPT09IC0xOyB9XG5cbi8qKlxuICogU3RyaXBzIFZTIENvZGUncyBjdXN0b20gYCNzZXR0aW5nSWQjYCBsaW5rIHN5bnRheCBmcm9tIGEgbWFya2Rvd24gc3RyaW5nIHNvIHRoZSBzZXR0aW5nIGtleVxuICogcmVtYWlucyBhcyBpbmxpbmUgY29kZSAoZS5nLiBgYCBgc2V0dGluZ0lkYCBgYCkuIFVzZWZ1bCBmb3IgY29udGV4dHMgdGhhdCBkb24ndCByZW5kZXIgbWFya2Rvd24gbGlua3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaXhTZXR0aW5nTGlua3ModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHRleHQucmVwbGFjZSgvYCMoW14jYF0qKSNgL2csIChfLCBzZXR0aW5nTmFtZSkgPT4gYFxcYCR7c2V0dGluZ05hbWV9XFxgYCk7XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0U2V0dGluZ3NNb2RlbCBleHRlbmRzIEVkaXRvck1vZGVsIHtcblxuXHRwcm90ZWN0ZWQgX2N1cnJlbnRSZXN1bHRHcm91cHMgPSBuZXcgTWFwPHN0cmluZywgSVNlYXJjaFJlc3VsdEdyb3VwPigpO1xuXG5cdHVwZGF0ZVJlc3VsdEdyb3VwKGlkOiBzdHJpbmcsIHJlc3VsdEdyb3VwOiBJU2VhcmNoUmVzdWx0R3JvdXAgfCB1bmRlZmluZWQpOiBJRmlsdGVyUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVzdWx0R3JvdXApIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZXN1bHRHcm91cHMuc2V0KGlkLCByZXN1bHRHcm91cCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZXN1bHRHcm91cHMuZGVsZXRlKGlkKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbW92ZUR1cGxpY2F0ZVJlc3VsdHMoKTtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgZHVwbGljYXRlcyBiZXR3ZWVuIHJlc3VsdCBncm91cHMsIHByZWZlcnJpbmcgcmVzdWx0cyBpbiBlYXJsaWVyIGdyb3Vwc1xuXHQgKi9cblx0cHJpdmF0ZSByZW1vdmVEdXBsaWNhdGVSZXN1bHRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNldHRpbmdLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Wy4uLnRoaXMuX2N1cnJlbnRSZXN1bHRHcm91cHMua2V5cygpXVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IHRoaXMuX2N1cnJlbnRSZXN1bHRHcm91cHMuZ2V0KGEpIS5vcmRlciAtIHRoaXMuX2N1cnJlbnRSZXN1bHRHcm91cHMuZ2V0KGIpIS5vcmRlcilcblx0XHRcdC5mb3JFYWNoKGdyb3VwSWQgPT4ge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IHRoaXMuX2N1cnJlbnRSZXN1bHRHcm91cHMuZ2V0KGdyb3VwSWQpITtcblx0XHRcdFx0Z3JvdXAucmVzdWx0LmZpbHRlck1hdGNoZXMgPSBncm91cC5yZXN1bHQuZmlsdGVyTWF0Y2hlcy5maWx0ZXIocyA9PiAhc2V0dGluZ0tleXMuaGFzKHMuc2V0dGluZy5rZXkpKTtcblx0XHRcdFx0Z3JvdXAucmVzdWx0LmZpbHRlck1hdGNoZXMuZm9yRWFjaChzID0+IHNldHRpbmdLZXlzLmFkZChzLnNldHRpbmcua2V5KSk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdGZpbHRlclNldHRpbmdzKGZpbHRlcjogc3RyaW5nLCBncm91cEZpbHRlcjogSUdyb3VwRmlsdGVyLCBzZXR0aW5nTWF0Y2hlcjogSVNldHRpbmdNYXRjaGVyKTogSVNldHRpbmdNYXRjaFtdIHtcblx0XHRjb25zdCBhbGxHcm91cHMgPSB0aGlzLmZpbHRlckdyb3VwcztcblxuXHRcdGNvbnN0IGZpbHRlck1hdGNoZXM6IElTZXR0aW5nTWF0Y2hbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgYWxsR3JvdXBzKSB7XG5cdFx0XHRjb25zdCBncm91cE1hdGNoZWQgPSBncm91cEZpbHRlcihncm91cCk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRjb25zdCBzZXR0aW5nTWF0Y2hSZXN1bHQgPSBzZXR0aW5nTWF0Y2hlcihzZXR0aW5nLCBncm91cCk7XG5cblx0XHRcdFx0XHRpZiAoZ3JvdXBNYXRjaGVkIHx8IHNldHRpbmdNYXRjaFJlc3VsdCkge1xuXHRcdFx0XHRcdFx0ZmlsdGVyTWF0Y2hlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0c2V0dGluZyxcblx0XHRcdFx0XHRcdFx0bWF0Y2hlczogc2V0dGluZ01hdGNoUmVzdWx0ICYmIHNldHRpbmdNYXRjaFJlc3VsdC5tYXRjaGVzLFxuXHRcdFx0XHRcdFx0XHRtYXRjaFR5cGU6IHNldHRpbmdNYXRjaFJlc3VsdD8ubWF0Y2hUeXBlID8/IFNldHRpbmdNYXRjaFR5cGUuTm9uZSxcblx0XHRcdFx0XHRcdFx0a2V5TWF0Y2hTY29yZTogc2V0dGluZ01hdGNoUmVzdWx0Py5rZXlNYXRjaFNjb3JlID8/IDAsXG5cdFx0XHRcdFx0XHRcdHNjb3JlOiBzZXR0aW5nTWF0Y2hSZXN1bHQ/LnNjb3JlID8/IDBcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmaWx0ZXJNYXRjaGVzO1xuXHR9XG5cblx0Z2V0UHJlZmVyZW5jZShrZXk6IHN0cmluZyk6IElTZXR0aW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBncm91cC5zZWN0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdGlmIChrZXkgPT09IHNldHRpbmcua2V5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc2V0dGluZztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbGxlY3RNZXRhZGF0YShncm91cHM6IElTZWFyY2hSZXN1bHRHcm91cFtdKTogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbHRlck1ldGFkYXRhPiB8IG51bGwge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRsZXQgaGFzTWV0YWRhdGEgPSBmYWxzZTtcblx0XHRncm91cHMuZm9yRWFjaChnID0+IHtcblx0XHRcdGlmIChnLnJlc3VsdC5tZXRhZGF0YSkge1xuXHRcdFx0XHRtZXRhZGF0YVtnLmlkXSA9IGcucmVzdWx0Lm1ldGFkYXRhO1xuXHRcdFx0XHRoYXNNZXRhZGF0YSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gaGFzTWV0YWRhdGEgPyBtZXRhZGF0YSA6IG51bGw7XG5cdH1cblxuXG5cdHByb3RlY3RlZCBnZXQgZmlsdGVyR3JvdXBzKCk6IElTZXR0aW5nc0dyb3VwW10ge1xuXHRcdHJldHVybiB0aGlzLnNldHRpbmdzR3JvdXBzO1xuXHR9XG5cblx0YWJzdHJhY3Qgc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW107XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHVwZGF0ZSgpOiBJRmlsdGVyUmVzdWx0IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NFZGl0b3JNb2RlbCBleHRlbmRzIEFic3RyYWN0U2V0dGluZ3NNb2RlbCBpbXBsZW1lbnRzIElTZXR0aW5nc0VkaXRvck1vZGVsIHtcblxuXHRwcml2YXRlIF9zZXR0aW5nc0dyb3VwczogSVNldHRpbmdzR3JvdXBbXSB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIHNldHRpbmdzTW9kZWw6IElUZXh0TW9kZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cHM6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cHM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocmVmZXJlbmNlOiBJUmVmZXJlbmNlPElUZXh0RWRpdG9yTW9kZWw+LCBwcml2YXRlIF9jb25maWd1cmF0aW9uVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNldHRpbmdzTW9kZWwgPSByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCE7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbldpbGxEaXNwb3NlKCgpID0+IHJlZmVyZW5jZS5kaXNwb3NlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdzTW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdHRoaXMuX3NldHRpbmdzR3JvdXBzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCB1cmkoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5nc01vZGVsLnVyaTtcblx0fVxuXG5cdGdldCBjb25maWd1cmF0aW9uVGFyZ2V0KCk6IENvbmZpZ3VyYXRpb25UYXJnZXQge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uVGFyZ2V0O1xuXHR9XG5cblx0Z2V0IHNldHRpbmdzR3JvdXBzKCk6IElTZXR0aW5nc0dyb3VwW10ge1xuXHRcdGlmICghdGhpcy5fc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdHRoaXMucGFyc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NldHRpbmdzR3JvdXBzITtcblx0fVxuXG5cdGdldCBjb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ3NNb2RlbC5nZXRWYWx1ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGlzU2V0dGluZ3NQcm9wZXJ0eShwcm9wZXJ0eTogc3RyaW5nLCBwcmV2aW91c1BhcmVudHM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IDA7IC8vIFNldHRpbmdzIGlzIHJvb3Rcblx0fVxuXG5cdHByb3RlY3RlZCBwYXJzZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXR0aW5nc0dyb3VwcyA9IHBhcnNlKHRoaXMuc2V0dGluZ3NNb2RlbCwgKHByb3BlcnR5OiBzdHJpbmcsIHByZXZpb3VzUGFyZW50czogc3RyaW5nW10pOiBib29sZWFuID0+IHRoaXMuaXNTZXR0aW5nc1Byb3BlcnR5KHByb3BlcnR5LCBwcmV2aW91c1BhcmVudHMpKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGUoKTogSUZpbHRlclJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0R3JvdXBzID0gWy4uLnRoaXMuX2N1cnJlbnRSZXN1bHRHcm91cHMudmFsdWVzKCldO1xuXHRcdGlmICghcmVzdWx0R3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBUcmFuc2Zvcm0gcmVzdWx0R3JvdXBzIGludG8gSUZpbHRlclJlc3VsdCAtIElTZXR0aW5nIHJhbmdlcyBhcmUgYWxyZWFkeSBjb3JyZWN0IGhlcmVcblx0XHRjb25zdCBmaWx0ZXJlZFNldHRpbmdzOiBJU2V0dGluZ1tdID0gW107XG5cdFx0Y29uc3QgbWF0Y2hlczogSVJhbmdlW10gPSBbXTtcblx0XHRyZXN1bHRHcm91cHMuZm9yRWFjaChncm91cCA9PiB7XG5cdFx0XHRncm91cC5yZXN1bHQuZmlsdGVyTWF0Y2hlcy5mb3JFYWNoKGZpbHRlck1hdGNoID0+IHtcblx0XHRcdFx0ZmlsdGVyZWRTZXR0aW5ncy5wdXNoKGZpbHRlck1hdGNoLnNldHRpbmcpO1xuXHRcdFx0XHRpZiAoZmlsdGVyTWF0Y2gubWF0Y2hlcykge1xuXHRcdFx0XHRcdG1hdGNoZXMucHVzaCguLi5maWx0ZXJNYXRjaC5tYXRjaGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRsZXQgZmlsdGVyZWRHcm91cDogSVNldHRpbmdzR3JvdXAgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9kZWxHcm91cCA9IHRoaXMuc2V0dGluZ3NHcm91cHNbMF07IC8vIEVkaXRhYmxlIG1vZGVsIGhhcyBvbmUgb3IgemVybyBncm91cHNcblx0XHRpZiAobW9kZWxHcm91cCkge1xuXHRcdFx0ZmlsdGVyZWRHcm91cCA9IHtcblx0XHRcdFx0aWQ6IG1vZGVsR3JvdXAuaWQsXG5cdFx0XHRcdHJhbmdlOiBtb2RlbEdyb3VwLnJhbmdlLFxuXHRcdFx0XHRzZWN0aW9uczogW3tcblx0XHRcdFx0XHRzZXR0aW5nczogZmlsdGVyZWRTZXR0aW5nc1xuXHRcdFx0XHR9XSxcblx0XHRcdFx0dGl0bGU6IG1vZGVsR3JvdXAudGl0bGUsXG5cdFx0XHRcdHRpdGxlUmFuZ2U6IG1vZGVsR3JvdXAudGl0bGVSYW5nZSxcblx0XHRcdFx0b3JkZXI6IG1vZGVsR3JvdXAub3JkZXIsXG5cdFx0XHRcdGV4dGVuc2lvbkluZm86IG1vZGVsR3JvdXAuZXh0ZW5zaW9uSW5mb1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuY29sbGVjdE1ldGFkYXRhKHJlc3VsdEdyb3Vwcyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFsbEdyb3VwczogdGhpcy5zZXR0aW5nc0dyb3Vwcyxcblx0XHRcdGZpbHRlcmVkR3JvdXBzOiBmaWx0ZXJlZEdyb3VwID8gW2ZpbHRlcmVkR3JvdXBdIDogW10sXG5cdFx0XHRtYXRjaGVzLFxuXHRcdFx0bWV0YWRhdGE6IG1ldGFkYXRhID8/IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdzMkVkaXRvck1vZGVsIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nc01vZGVsIGltcGxlbWVudHMgSVNldHRpbmdzRWRpdG9yTW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwczogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUdyb3Vwcy5ldmVudDtcblxuXHRwcml2YXRlIGFkZGl0aW9uYWxHcm91cHM6IElTZXR0aW5nc0dyb3VwW10gPSBbXTtcblx0cHJpdmF0ZSBkaXJ0eSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2RlZmF1bHRTZXR0aW5nczogRGVmYXVsdFNldHRpbmdzLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLnNvdXJjZSA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKSB7XG5cdFx0XHRcdHRoaXMuZGlydHkgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUdyb3Vwcy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikub25EaWRTY2hlbWFDaGFuZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLmRpcnR5ID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKiogRG9lc24ndCBpbmNsdWRlIHRoZSBcIkNvbW1vbmx5IFVzZWRcIiBncm91cCAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IGZpbHRlckdyb3VwcygpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5nc0dyb3Vwcy5zbGljZSgxKTtcblx0fVxuXG5cdGdldCBzZXR0aW5nc0dyb3VwcygpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9kZWZhdWx0U2V0dGluZ3MuZ2V0U2V0dGluZ3NHcm91cHModGhpcy5kaXJ0eSk7XG5cdFx0dGhpcy5kaXJ0eSA9IGZhbHNlO1xuXHRcdHJldHVybiBbLi4uZ3JvdXBzLCAuLi50aGlzLmFkZGl0aW9uYWxHcm91cHNdO1xuXHR9XG5cblx0LyoqIEZvciBwcm9ncmFtbWF0aWNhbGx5IGFkZGVkIGdyb3VwcyBvdXRzaWRlIG9mIHJlZ2lzdGVyZWQgY29uZmlndXJhdGlvbnMgKi9cblx0c2V0QWRkaXRpb25hbEdyb3Vwcyhncm91cHM6IElTZXR0aW5nc0dyb3VwW10pIHtcblx0XHR0aGlzLmFkZGl0aW9uYWxHcm91cHMgPSBncm91cHM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlKCk6IElGaWx0ZXJSZXN1bHQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBhcnNlKG1vZGVsOiBJVGV4dE1vZGVsLCBpc1NldHRpbmdzUHJvcGVydHk6IChjdXJyZW50UHJvcGVydHk6IHN0cmluZywgcHJldmlvdXNQYXJlbnRzOiBzdHJpbmdbXSkgPT4gYm9vbGVhbik6IElTZXR0aW5nc0dyb3VwW10ge1xuXHRjb25zdCBzZXR0aW5nczogSVNldHRpbmdbXSA9IFtdO1xuXHRsZXQgb3ZlcnJpZGVTZXR0aW5nOiBJU2V0dGluZyB8IG51bGwgPSBudWxsO1xuXG5cdGxldCBjdXJyZW50UHJvcGVydHk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRsZXQgY3VycmVudFBhcmVudDogYW55ID0gW107XG5cdGNvbnN0IHByZXZpb3VzUGFyZW50czogYW55W10gPSBbXTtcblx0bGV0IHNldHRpbmdzUHJvcGVydHlJbmRleDogbnVtYmVyID0gLTE7XG5cdGNvbnN0IHJhbmdlID0ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogMCxcblx0XHRzdGFydENvbHVtbjogMCxcblx0XHRlbmRMaW5lTnVtYmVyOiAwLFxuXHRcdGVuZENvbHVtbjogMFxuXHR9O1xuXG5cdGZ1bmN0aW9uIG9uVmFsdWUodmFsdWU6IGFueSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFBhcmVudCkpIHtcblx0XHRcdCg8YW55W10+Y3VycmVudFBhcmVudCkucHVzaCh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50UHJvcGVydHkpIHtcblx0XHRcdGN1cnJlbnRQYXJlbnRbY3VycmVudFByb3BlcnR5XSA9IHZhbHVlO1xuXHRcdH1cblx0XHRpZiAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMSB8fCAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMiAmJiBvdmVycmlkZVNldHRpbmcgIT09IG51bGwpKSB7XG5cdFx0XHQvLyBzZXR0aW5ncyB2YWx1ZSBzdGFydGVkXG5cdFx0XHRjb25zdCBzZXR0aW5nID0gcHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMSA/IHNldHRpbmdzW3NldHRpbmdzLmxlbmd0aCAtIDFdIDogb3ZlcnJpZGVTZXR0aW5nIS5vdmVycmlkZXMhW292ZXJyaWRlU2V0dGluZyEub3ZlcnJpZGVzIS5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChzZXR0aW5nKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlU3RhcnRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcblx0XHRcdFx0Y29uc3QgdmFsdWVFbmRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0ICsgbGVuZ3RoKTtcblx0XHRcdFx0c2V0dGluZy52YWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHRzZXR0aW5nLnZhbHVlUmFuZ2UgPSB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiB2YWx1ZVN0YXJ0UG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogdmFsdWVTdGFydFBvc2l0aW9uLmNvbHVtbixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB2YWx1ZUVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiB2YWx1ZUVuZFBvc2l0aW9uLmNvbHVtblxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzZXR0aW5nLnJhbmdlID0gT2JqZWN0LmFzc2lnbihzZXR0aW5nLnJhbmdlLCB7XG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdmFsdWVFbmRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogdmFsdWVFbmRQb3NpdGlvbi5jb2x1bW5cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHZpc2l0b3I6IEpTT05WaXNpdG9yID0ge1xuXHRcdG9uT2JqZWN0QmVnaW46IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChpc1NldHRpbmdzUHJvcGVydHkoY3VycmVudFByb3BlcnR5ISwgcHJldmlvdXNQYXJlbnRzKSkge1xuXHRcdFx0XHQvLyBTZXR0aW5ncyBzdGFydGVkXG5cdFx0XHRcdHNldHRpbmdzUHJvcGVydHlJbmRleCA9IHByZXZpb3VzUGFyZW50cy5sZW5ndGg7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQpO1xuXHRcdFx0XHRyYW5nZS5zdGFydExpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0XHRyYW5nZS5zdGFydENvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9iamVjdCA9IHt9O1xuXHRcdFx0b25WYWx1ZShvYmplY3QsIG9mZnNldCwgbGVuZ3RoKTtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBvYmplY3Q7XG5cdFx0XHRjdXJyZW50UHJvcGVydHkgPSBudWxsO1xuXHRcdFx0cHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG5cdFx0fSxcblx0XHRvbk9iamVjdFByb3BlcnR5OiAobmFtZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG5hbWU7XG5cdFx0XHRpZiAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMSB8fCAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMiAmJiBvdmVycmlkZVNldHRpbmcgIT09IG51bGwpKSB7XG5cdFx0XHRcdC8vIHNldHRpbmcgc3RhcnRlZFxuXHRcdFx0XHRjb25zdCBzZXR0aW5nU3RhcnRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcblx0XHRcdFx0Y29uc3Qgc2V0dGluZzogSVNldHRpbmcgPSB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IFtdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uSXNNYXJrZG93bjogZmFsc2UsXG5cdFx0XHRcdFx0a2V5OiBuYW1lLFxuXHRcdFx0XHRcdGtleVJhbmdlOiB7XG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHNldHRpbmdTdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogc2V0dGluZ1N0YXJ0UG9zaXRpb24uY29sdW1uICsgMSxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHNldHRpbmdTdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHNldHRpbmdTdGFydFBvc2l0aW9uLmNvbHVtbiArIGxlbmd0aFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc2V0dGluZ1N0YXJ0UG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBzZXR0aW5nU3RhcnRQb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiAwXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR2YWx1ZTogbnVsbCxcblx0XHRcdFx0XHR2YWx1ZVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25SYW5nZXM6IFtdLFxuXHRcdFx0XHRcdG92ZXJyaWRlczogW10sXG5cdFx0XHRcdFx0b3ZlcnJpZGVPZjogb3ZlcnJpZGVTZXR0aW5nID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEpIHtcblx0XHRcdFx0XHRzZXR0aW5ncy5wdXNoKHNldHRpbmcpO1xuXHRcdFx0XHRcdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KG5hbWUpKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZVNldHRpbmcgPSBzZXR0aW5nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvdmVycmlkZVNldHRpbmchLm92ZXJyaWRlcyEucHVzaChzZXR0aW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25PYmplY3RFbmQ6IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBwcmV2aW91c1BhcmVudHMucG9wKCk7XG5cdFx0XHRpZiAoc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICE9PSAtMSAmJiAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMSB8fCAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMiAmJiBvdmVycmlkZVNldHRpbmcgIT09IG51bGwpKSkge1xuXHRcdFx0XHQvLyBzZXR0aW5nIGVuZGVkXG5cdFx0XHRcdGNvbnN0IHNldHRpbmcgPSBwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSBzZXR0aW5nc1Byb3BlcnR5SW5kZXggKyAxID8gc2V0dGluZ3Nbc2V0dGluZ3MubGVuZ3RoIC0gMV0gOiBvdmVycmlkZVNldHRpbmchLm92ZXJyaWRlcyFbb3ZlcnJpZGVTZXR0aW5nIS5vdmVycmlkZXMhLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRpZiAoc2V0dGluZykge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlRW5kUG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdFx0c2V0dGluZy52YWx1ZVJhbmdlID0gT2JqZWN0LmFzc2lnbihzZXR0aW5nLnZhbHVlUmFuZ2UsIHtcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHZhbHVlRW5kUG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdmFsdWVFbmRQb3NpdGlvbi5jb2x1bW5cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzZXR0aW5nLnJhbmdlID0gT2JqZWN0LmFzc2lnbihzZXR0aW5nLnJhbmdlLCB7XG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB2YWx1ZUVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHZhbHVlRW5kUG9zaXRpb24uY29sdW1uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMSkge1xuXHRcdFx0XHRcdG92ZXJyaWRlU2V0dGluZyA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSBzZXR0aW5nc1Byb3BlcnR5SW5kZXgpIHtcblx0XHRcdFx0Ly8gc2V0dGluZ3MgZW5kZWRcblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0XHRcdHJhbmdlLmVuZExpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0XHRyYW5nZS5lbmRDb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cdFx0XHRcdHNldHRpbmdzUHJvcGVydHlJbmRleCA9IC0xO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25BcnJheUJlZ2luOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBhcnJheTogYW55W10gPSBbXTtcblx0XHRcdG9uVmFsdWUoYXJyYXksIG9mZnNldCwgbGVuZ3RoKTtcblx0XHRcdHByZXZpb3VzUGFyZW50cy5wdXNoKGN1cnJlbnRQYXJlbnQpO1xuXHRcdFx0Y3VycmVudFBhcmVudCA9IGFycmF5O1xuXHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbnVsbDtcblx0XHR9LFxuXHRcdG9uQXJyYXlFbmQ6IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBwcmV2aW91c1BhcmVudHMucG9wKCk7XG5cdFx0XHRpZiAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMSB8fCAocHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gc2V0dGluZ3NQcm9wZXJ0eUluZGV4ICsgMiAmJiBvdmVycmlkZVNldHRpbmcgIT09IG51bGwpKSB7XG5cdFx0XHRcdC8vIHNldHRpbmcgdmFsdWUgZW5kZWRcblx0XHRcdFx0Y29uc3Qgc2V0dGluZyA9IHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IHNldHRpbmdzUHJvcGVydHlJbmRleCArIDEgPyBzZXR0aW5nc1tzZXR0aW5ncy5sZW5ndGggLSAxXSA6IG92ZXJyaWRlU2V0dGluZyEub3ZlcnJpZGVzIVtvdmVycmlkZVNldHRpbmchLm92ZXJyaWRlcyEubGVuZ3RoIC0gMV07XG5cdFx0XHRcdGlmIChzZXR0aW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWVFbmRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0ICsgbGVuZ3RoKTtcblx0XHRcdFx0XHRzZXR0aW5nLnZhbHVlUmFuZ2UgPSBPYmplY3QuYXNzaWduKHNldHRpbmcudmFsdWVSYW5nZSwge1xuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdmFsdWVFbmRQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB2YWx1ZUVuZFBvc2l0aW9uLmNvbHVtblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHNldHRpbmcucmFuZ2UgPSBPYmplY3QuYXNzaWduKHNldHRpbmcucmFuZ2UsIHtcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHZhbHVlRW5kUG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdmFsdWVFbmRQb3NpdGlvbi5jb2x1bW5cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25MaXRlcmFsVmFsdWU6IG9uVmFsdWUsXG5cdFx0b25FcnJvcjogKGVycm9yKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gc2V0dGluZ3Nbc2V0dGluZ3MubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAoc2V0dGluZyAmJiAoaXNOdWxsUmFuZ2Uoc2V0dGluZy5yYW5nZSkgfHwgaXNOdWxsUmFuZ2Uoc2V0dGluZy5rZXlSYW5nZSkgfHwgaXNOdWxsUmFuZ2Uoc2V0dGluZy52YWx1ZVJhbmdlKSkpIHtcblx0XHRcdFx0c2V0dGluZ3MucG9wKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXHRpZiAoIW1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdHZpc2l0KG1vZGVsLmdldFZhbHVlKCksIHZpc2l0b3IpO1xuXHR9XG5cdHJldHVybiBzZXR0aW5ncy5sZW5ndGggPiAwID8gW3tcblx0XHRpZDogbW9kZWwuaXNEaXNwb3NlZCgpID8gJycgOiBtb2RlbC5pZCxcblx0XHRzZWN0aW9uczogW1xuXHRcdFx0e1xuXHRcdFx0XHRzZXR0aW5nc1xuXHRcdFx0fVxuXHRcdF0sXG5cdFx0dGl0bGU6ICcnLFxuXHRcdHRpdGxlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRyYW5nZVxuXHR9IHNhdGlzZmllcyBJU2V0dGluZ3NHcm91cF0gOiBbXTtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25FZGl0b3JNb2RlbCBleHRlbmRzIFNldHRpbmdzRWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb25Hcm91cHM6IElTZXR0aW5nc0dyb3VwW10gPSBbXTtcblxuXHRnZXQgY29uZmlndXJhdGlvbkdyb3VwcygpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbkdyb3Vwcztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBwYXJzZSgpOiB2b2lkIHtcblx0XHRzdXBlci5wYXJzZSgpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Hcm91cHMgPSBwYXJzZSh0aGlzLnNldHRpbmdzTW9kZWwsIChwcm9wZXJ0eTogc3RyaW5nLCBwcmV2aW91c1BhcmVudHM6IHN0cmluZ1tdKTogYm9vbGVhbiA9PiBwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSAwKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc1NldHRpbmdzUHJvcGVydHkocHJvcGVydHk6IHN0cmluZywgcHJldmlvdXNQYXJlbnRzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBwcm9wZXJ0eSA9PT0gJ3NldHRpbmdzJyAmJiBwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSAxO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRTZXR0aW5ncyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX2FsbFNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbnRlbnRXaXRob3V0TW9zdENvbW1vbmx5VXNlZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZXR0aW5nc0J5TmFtZSA9IG5ldyBNYXA8c3RyaW5nLCBJU2V0dGluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9tb3N0Q29tbW9ubHlVc2VkU2V0dGluZ3NLZXlzOiBzdHJpbmdbXSxcblx0XHRyZWFkb25seSB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsXG5cdFx0cmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLnNvdXJjZSA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKSB7XG5cdFx0XHRcdHRoaXMucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGdldENvbnRlbnQoZm9yY2VVcGRhdGUgPSBmYWxzZSk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9jb250ZW50IHx8IGZvcmNlVXBkYXRlKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY29udGVudCE7XG5cdH1cblxuXHRnZXRDb250ZW50V2l0aG91dE1vc3RDb21tb25seVVzZWQoZm9yY2VVcGRhdGUgPSBmYWxzZSk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9jb250ZW50V2l0aG91dE1vc3RDb21tb25seVVzZWQgfHwgZm9yY2VVcGRhdGUpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jb250ZW50V2l0aG91dE1vc3RDb21tb25seVVzZWQhO1xuXHR9XG5cblx0Z2V0U2V0dGluZ3NHcm91cHMoZm9yY2VVcGRhdGUgPSBmYWxzZSk6IElTZXR0aW5nc0dyb3VwW10ge1xuXHRcdGlmICghdGhpcy5fYWxsU2V0dGluZ3NHcm91cHMgfHwgZm9yY2VVcGRhdGUpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9hbGxTZXR0aW5nc0dyb3VwcyE7XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemUoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWxsU2V0dGluZ3NHcm91cHMgPSB0aGlzLnBhcnNlKCk7XG5cdFx0dGhpcy5fY29udGVudCA9IHRoaXMudG9Db250ZW50KHRoaXMuX2FsbFNldHRpbmdzR3JvdXBzLCAwKTtcblx0XHR0aGlzLl9jb250ZW50V2l0aG91dE1vc3RDb21tb25seVVzZWQgPSB0aGlzLnRvQ29udGVudCh0aGlzLl9hbGxTZXR0aW5nc0dyb3VwcywgMSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29udGVudFdpdGhvdXRNb3N0Q29tbW9ubHlVc2VkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2FsbFNldHRpbmdzR3JvdXBzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZSgpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRjb25zdCBzZXR0aW5nc0dyb3VwcyA9IHRoaXMuZ2V0UmVnaXN0ZXJlZEdyb3VwcygpO1xuXHRcdHRoaXMuaW5pdEFsbFNldHRpbmdzTWFwKHNldHRpbmdzR3JvdXBzKTtcblx0XHRjb25zdCBtb3N0Q29tbW9ubHlVc2VkID0gdGhpcy5nZXRNb3N0Q29tbW9ubHlVc2VkU2V0dGluZ3MoKTtcblx0XHRyZXR1cm4gW21vc3RDb21tb25seVVzZWQsIC4uLnNldHRpbmdzR3JvdXBzXTtcblx0fVxuXG5cdGdldFJlZ2lzdGVyZWRHcm91cHMoKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGFsbENvbmZpZ3VyYXRpb25zOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gPSB7IC4uLnJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCkgfTtcblx0XHRjb25zdCBleGNsdWRlZENvbmZpZ3VyYXRpb25zID0gcmVnaXN0cnkuZ2V0RXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXG5cdFx0Zm9yIChjb25zdCBwb2xpY3lLZXkgb2YgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5rZXlzKCkucG9saWN5ID8/IFtdKSB7XG5cdFx0XHRjb25zdCBwb2xpY3lDb25maWd1cmF0aW9uID0gZXhjbHVkZWRDb25maWd1cmF0aW9uc1twb2xpY3lLZXldO1xuXHRcdFx0aWYgKHBvbGljeUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0YWxsQ29uZmlndXJhdGlvbnNbcG9saWN5S2V5XSA9IHBvbGljeUNvbmZpZ3VyYXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5yZW1vdmVFbXB0eVNldHRpbmdzR3JvdXBzKHRoaXMucGFyc2VQcm9wZXJ0aWVzKGFsbENvbmZpZ3VyYXRpb25zKS5zb3J0KHRoaXMuY29tcGFyZUdyb3VwcykpO1xuXHRcdHJldHVybiB0aGlzLnNvcnRHcm91cHMoZ3JvdXBzKTtcblx0fVxuXG5cdHByaXZhdGUgc29ydEdyb3Vwcyhncm91cHM6IElTZXR0aW5nc0dyb3VwW10pOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRncm91cHMuZm9yRWFjaChncm91cCA9PiB7XG5cdFx0XHRncm91cC5zZWN0aW9ucy5mb3JFYWNoKHNlY3Rpb24gPT4ge1xuXHRcdFx0XHRzZWN0aW9uLnNldHRpbmdzLnNvcnQoKGEsIGIpID0+IGEua2V5LmxvY2FsZUNvbXBhcmUoYi5rZXkpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGdyb3Vwcztcblx0fVxuXG5cdHByaXZhdGUgaW5pdEFsbFNldHRpbmdzTWFwKGFsbFNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0dGluZ3NCeU5hbWUgPSBuZXcgTWFwPHN0cmluZywgSVNldHRpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBhbGxTZXR0aW5nc0dyb3Vwcykge1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGdyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZWN0aW9uLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0dGluZ3NCeU5hbWUuc2V0KHNldHRpbmcua2V5LCBzZXR0aW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9zdENvbW1vbmx5VXNlZFNldHRpbmdzKCk6IElTZXR0aW5nc0dyb3VwIHtcblx0XHRjb25zdCBzZXR0aW5ncyA9IGNvYWxlc2NlKHRoaXMuX21vc3RDb21tb25seVVzZWRTZXR0aW5nc0tleXMubWFwKGtleSA9PiB7XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5fc2V0dGluZ3NCeU5hbWUuZ2V0KGtleSk7XG5cdFx0XHRpZiAoc2V0dGluZykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzZXR0aW5nLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGtleTogc2V0dGluZy5rZXksXG5cdFx0XHRcdFx0dmFsdWU6IHNldHRpbmcudmFsdWUsXG5cdFx0XHRcdFx0a2V5UmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdHZhbHVlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdFx0XHRvdmVycmlkZXM6IFtdLFxuXHRcdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHRcdFx0dHlwZTogc2V0dGluZy50eXBlLFxuXHRcdFx0XHRcdGVudW06IHNldHRpbmcuZW51bSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBzZXR0aW5nLmVudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25SYW5nZXM6IFtdXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTZXR0aW5nO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiAnbW9zdENvbW1vbmx5VXNlZCcsXG5cdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY29tbW9ubHlVc2VkJywgXCJDb21tb25seSBVc2VkXCIpLFxuXHRcdFx0dGl0bGVSYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0c2VjdGlvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNldHRpbmdzXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9IHNhdGlzZmllcyBJU2V0dGluZ3NHcm91cDtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VQcm9wZXJ0aWVzKHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPik6IElTZXR0aW5nc0dyb3VwW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVNldHRpbmdzR3JvdXBbXSA9IFtdO1xuXHRcdGNvbnN0IGJ5VGl0bGUgPSBuZXcgTWFwPHN0cmluZywgSVNldHRpbmdzR3JvdXBbXT4oKTtcblx0XHRjb25zdCBieUlkID0gbmV3IE1hcDxzdHJpbmcsIElTZXR0aW5nc0dyb3VwW10+KCk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBwcm9wZXJ0eV0gb2YgT2JqZWN0LmVudHJpZXMocHJvcGVydGllcykpIHtcblx0XHRcdGlmICghcHJvcGVydHkuc2VjdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHNldHRpbmdzR3JvdXA6IElTZXR0aW5nc0dyb3VwIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAocHJvcGVydHkuc2VjdGlvbi50aXRsZSkge1xuXHRcdFx0XHRjb25zdCBncm91cHMgPSBieVRpdGxlLmdldChwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlKTtcblx0XHRcdFx0aWYgKGdyb3Vwcykge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gcHJvcGVydHkuc2VjdGlvbi5leHRlbnNpb25JbmZvPy5pZDtcblx0XHRcdFx0XHRzZXR0aW5nc0dyb3VwID0gZ3JvdXBzLmZpbmQoZyA9PiBnLmV4dGVuc2lvbkluZm8/LmlkID09PSBleHRlbnNpb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzZXR0aW5nc0dyb3VwICYmIHByb3BlcnR5LnNlY3Rpb24uaWQpIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBzID0gYnlJZC5nZXQocHJvcGVydHkuc2VjdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChncm91cHMpIHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IHByb3BlcnR5LnNlY3Rpb24uZXh0ZW5zaW9uSW5mbz8uaWQ7XG5cdFx0XHRcdFx0c2V0dGluZ3NHcm91cCA9IGdyb3Vwcy5maW5kKGcgPT4gZy5leHRlbnNpb25JbmZvPy5pZCA9PT0gZXh0ZW5zaW9uSWQgJiYgIWcudGl0bGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZXR0aW5nc0dyb3VwICYmICFzZXR0aW5nc0dyb3VwPy50aXRsZSAmJiBwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlKSB7XG5cdFx0XHRcdFx0c2V0dGluZ3NHcm91cC50aXRsZSA9IHByb3BlcnR5LnNlY3Rpb24udGl0bGU7XG5cdFx0XHRcdFx0Y29uc3QgYnlUaXRsZUdyb3VwcyA9IGJ5VGl0bGUuZ2V0KHByb3BlcnR5LnNlY3Rpb24udGl0bGUpO1xuXHRcdFx0XHRcdGlmIChieVRpdGxlR3JvdXBzKSB7XG5cdFx0XHRcdFx0XHRieVRpdGxlR3JvdXBzLnB1c2goc2V0dGluZ3NHcm91cCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGJ5VGl0bGUuc2V0KHByb3BlcnR5LnNlY3Rpb24udGl0bGUsIFtzZXR0aW5nc0dyb3VwXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc2V0dGluZ3NHcm91cCkge1xuXHRcdFx0XHRzZXR0aW5nc0dyb3VwID0geyBzZWN0aW9uczogW3sgdGl0bGU6IHByb3BlcnR5LnNlY3Rpb24udGl0bGUsIHNldHRpbmdzOiBbXSB9XSwgaWQ6IHByb3BlcnR5LnNlY3Rpb24uaWQgfHwgJycsIHRpdGxlOiBwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlID8/ICcnLCB0aXRsZVJhbmdlOiBudWxsUmFuZ2UsIG9yZGVyOiBwcm9wZXJ0eS5zZWN0aW9uLm9yZGVyLCByYW5nZTogbnVsbFJhbmdlLCBleHRlbnNpb25JbmZvOiBpc1N0cmluZyhwcm9wZXJ0eS5zb3VyY2UpID8gdW5kZWZpbmVkIDogcHJvcGVydHkuc291cmNlIH07XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHNldHRpbmdzR3JvdXApO1xuXHRcdFx0XHRpZiAocHJvcGVydHkuc2VjdGlvbi50aXRsZSkge1xuXHRcdFx0XHRcdGNvbnN0IGJ5VGl0bGVHcm91cHMgPSBieVRpdGxlLmdldChwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlKTtcblx0XHRcdFx0XHRpZiAoYnlUaXRsZUdyb3Vwcykge1xuXHRcdFx0XHRcdFx0YnlUaXRsZUdyb3Vwcy5wdXNoKHNldHRpbmdzR3JvdXApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRieVRpdGxlLnNldChwcm9wZXJ0eS5zZWN0aW9uLnRpdGxlLCBbc2V0dGluZ3NHcm91cF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJvcGVydHkuc2VjdGlvbi5pZCkge1xuXHRcdFx0XHRcdGNvbnN0IGJ5SWRHcm91cHMgPSBieUlkLmdldChwcm9wZXJ0eS5zZWN0aW9uLmlkKTtcblx0XHRcdFx0XHRpZiAoYnlJZEdyb3Vwcykge1xuXHRcdFx0XHRcdFx0YnlJZEdyb3Vwcy5wdXNoKHNldHRpbmdzR3JvdXApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRieUlkLnNldChwcm9wZXJ0eS5zZWN0aW9uLmlkLCBbc2V0dGluZ3NHcm91cF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5wYXJzZVNldHRpbmcoa2V5LCBwcm9wZXJ0eSk7XG5cdFx0XHRpZiAoc2V0dGluZykge1xuXHRcdFx0XHRzZXR0aW5nc0dyb3VwLnNlY3Rpb25zWzBdLnNldHRpbmdzLnB1c2goc2V0dGluZyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUVtcHR5U2V0dGluZ3NHcm91cHMoc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW10pOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElTZXR0aW5nc0dyb3VwW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNldHRpbmdzR3JvdXAgb2Ygc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdHNldHRpbmdzR3JvdXAuc2VjdGlvbnMgPSBzZXR0aW5nc0dyb3VwLnNlY3Rpb25zLmZpbHRlcihzZWN0aW9uID0+IHNlY3Rpb24uc2V0dGluZ3MubGVuZ3RoID4gMCk7XG5cdFx0XHRpZiAoc2V0dGluZ3NHcm91cC5zZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goc2V0dGluZ3NHcm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlU2V0dGluZyhrZXk6IHN0cmluZywgcHJvcDogSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiBJU2V0dGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLm1hdGNoZXNTY29wZShwcm9wKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IHByb3AuZGVmYXVsdDtcblx0XHRsZXQgZGVzY3JpcHRpb24gPSAocHJvcC5tYXJrZG93bkRlc2NyaXB0aW9uIHx8IHByb3AuZGVzY3JpcHRpb24gfHwgJycpO1xuXHRcdGlmICh0eXBlb2YgZGVzY3JpcHRpb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9ICcnO1xuXHRcdH1cblx0XHRjb25zdCBkZXNjcmlwdGlvbkxpbmVzID0gZGVzY3JpcHRpb24uc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IG92ZXJyaWRlcyA9IE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSA/IHRoaXMucGFyc2VPdmVycmlkZVNldHRpbmdzKHByb3AuZGVmYXVsdCkgOiBbXTtcblx0XHRsZXQgbGlzdEl0ZW1UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zICYmICFBcnJheS5pc0FycmF5KHByb3AuaXRlbXMpICYmIHByb3AuaXRlbXMudHlwZSkge1xuXHRcdFx0aWYgKHByb3AuaXRlbXMuZW51bSkge1xuXHRcdFx0XHRsaXN0SXRlbVR5cGUgPSAnZW51bSc7XG5cdFx0XHR9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHByb3AuaXRlbXMudHlwZSkpIHtcblx0XHRcdFx0bGlzdEl0ZW1UeXBlID0gcHJvcC5pdGVtcy50eXBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG9iamVjdFByb3BlcnRpZXMgPSBwcm9wLnR5cGUgPT09ICdvYmplY3QnID8gcHJvcC5wcm9wZXJ0aWVzIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9iamVjdFBhdHRlcm5Qcm9wZXJ0aWVzID0gcHJvcC50eXBlID09PSAnb2JqZWN0JyA/IHByb3AucGF0dGVyblByb3BlcnRpZXMgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgPSBwcm9wLnR5cGUgPT09ICdvYmplY3QnID8gcHJvcC5hZGRpdGlvbmFsUHJvcGVydGllcyA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcm9wZXJ0eU5hbWVzID0gcHJvcC50eXBlID09PSAnb2JqZWN0JyA/IHByb3AucHJvcGVydHlOYW1lcyA6IHVuZGVmaW5lZDtcblxuXHRcdGxldCBlbnVtVG9Vc2UgPSBwcm9wLmVudW07XG5cdFx0bGV0IGVudW1EZXNjcmlwdGlvbnMgPSBwcm9wLm1hcmtkb3duRW51bURlc2NyaXB0aW9ucyA/PyBwcm9wLmVudW1EZXNjcmlwdGlvbnM7XG5cdFx0bGV0IGVudW1EZXNjcmlwdGlvbnNBcmVNYXJrZG93biA9ICEhcHJvcC5tYXJrZG93bkVudW1EZXNjcmlwdGlvbnM7XG5cdFx0aWYgKGxpc3RJdGVtVHlwZSA9PT0gJ2VudW0nICYmICFBcnJheS5pc0FycmF5KHByb3AuaXRlbXMpKSB7XG5cdFx0XHRlbnVtVG9Vc2UgPSBwcm9wLml0ZW1zIS5lbnVtO1xuXHRcdFx0ZW51bURlc2NyaXB0aW9ucyA9IHByb3AuaXRlbXMhLm1hcmtkb3duRW51bURlc2NyaXB0aW9ucyA/PyBwcm9wLml0ZW1zIS5lbnVtRGVzY3JpcHRpb25zO1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uc0FyZU1hcmtkb3duID0gISFwcm9wLml0ZW1zIS5tYXJrZG93bkVudW1EZXNjcmlwdGlvbnM7XG5cdFx0fVxuXG5cdFx0bGV0IGFsbEtleXNBcmVCb29sZWFuID0gZmFsc2U7XG5cdFx0aWYgKHByb3AudHlwZSA9PT0gJ29iamVjdCcgJiYgIXByb3AuYWRkaXRpb25hbFByb3BlcnRpZXMgJiYgcHJvcC5wcm9wZXJ0aWVzICYmIE9iamVjdC5rZXlzKHByb3AucHJvcGVydGllcykubGVuZ3RoKSB7XG5cdFx0XHRhbGxLZXlzQXJlQm9vbGVhbiA9IE9iamVjdC5rZXlzKHByb3AucHJvcGVydGllcykuZXZlcnkoa2V5ID0+IHtcblx0XHRcdFx0cmV0dXJuIHByb3AucHJvcGVydGllcyFba2V5XS50eXBlID09PSAnYm9vbGVhbic7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRsZXQgaXNMYW5ndWFnZVRhZ1NldHRpbmcgPSBmYWxzZTtcblx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRpc0xhbmd1YWdlVGFnU2V0dGluZyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0bGV0IGRlZmF1bHRWYWx1ZVNvdXJjZTogQ29uZmlndXJhdGlvbkRlZmF1bHRWYWx1ZVNvdXJjZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWlzTGFuZ3VhZ2VUYWdTZXR0aW5nKSB7XG5cdFx0XHRjb25zdCByZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3AgPSBwcm9wIGFzIElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hO1xuXHRcdFx0aWYgKHJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcCAmJiByZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3AuZGVmYXVsdFZhbHVlU291cmNlKSB7XG5cdFx0XHRcdGRlZmF1bHRWYWx1ZVNvdXJjZSA9IHJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcC5kZWZhdWx0VmFsdWVTb3VyY2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFlbnVtVG9Vc2UgJiYgKHByb3AuZW51bUl0ZW1MYWJlbHMgfHwgZW51bURlc2NyaXB0aW9ucyB8fCBlbnVtRGVzY3JpcHRpb25zQXJlTWFya2Rvd24pKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGBUaGUgc2V0dGluZyAke2tleX0gaGFzIGVudW0tcmVsYXRlZCBmaWVsZHMsIGJ1dCBkb2Vzbid0IGhhdmUgYW4gZW51bSBmaWVsZC4gVGhpcyBzZXR0aW5nIG1heSByZW5kZXIgaW1wcm9wZXJseSBpbiB0aGUgU2V0dGluZ3MgZWRpdG9yLmApO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRrZXksXG5cdFx0XHR2YWx1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbkxpbmVzLFxuXHRcdFx0ZGVzY3JpcHRpb25Jc01hcmtkb3duOiAhIXByb3AubWFya2Rvd25EZXNjcmlwdGlvbixcblx0XHRcdGtleXdvcmRzOiBwcm9wLmtleXdvcmRzLFxuXHRcdFx0cmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdGtleVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHR2YWx1ZVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRkZXNjcmlwdGlvblJhbmdlczogW10sXG5cdFx0XHRvdmVycmlkZXMsXG5cdFx0XHRzY29wZTogcHJvcC5zY29wZSxcblx0XHRcdHR5cGU6IHByb3AudHlwZSxcblx0XHRcdGFycmF5SXRlbVR5cGU6IGxpc3RJdGVtVHlwZSxcblx0XHRcdG9iamVjdFByb3BlcnRpZXMsXG5cdFx0XHRvYmplY3RQYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzLFxuXHRcdFx0cHJvcGVydHlOYW1lcyxcblx0XHRcdGVudW06IGVudW1Ub1VzZSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IGVudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zQXJlTWFya2Rvd246IGVudW1EZXNjcmlwdGlvbnNBcmVNYXJrZG93bixcblx0XHRcdGVudW1JdGVtTGFiZWxzOiBwcm9wLmVudW1JdGVtTGFiZWxzLFxuXHRcdFx0dW5pcXVlSXRlbXM6IHByb3AudW5pcXVlSXRlbXMsXG5cdFx0XHR0YWdzOiBwcm9wLnRhZ3MsXG5cdFx0XHRkaXNhbGxvd1N5bmNJZ25vcmU6IHByb3AuZGlzYWxsb3dTeW5jSWdub3JlLFxuXHRcdFx0cmVzdHJpY3RlZDogcHJvcC5yZXN0cmljdGVkLFxuXHRcdFx0ZXh0ZW5zaW9uSW5mbzogaXNTdHJpbmcocHJvcC5zb3VyY2UpID8gdW5kZWZpbmVkIDogcHJvcC5zb3VyY2UsXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IHByb3AubWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UgfHwgcHJvcC5kZXByZWNhdGlvbk1lc3NhZ2UsXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2VJc01hcmtkb3duOiAhIXByb3AubWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UsXG5cdFx0XHR2YWxpZGF0b3I6IGNyZWF0ZVZhbGlkYXRvcihwcm9wKSxcblx0XHRcdGFsbEtleXNBcmVCb29sZWFuLFxuXHRcdFx0ZWRpdFByZXNlbnRhdGlvbjogcHJvcC5lZGl0UHJlc2VudGF0aW9uLFxuXHRcdFx0b3JkZXI6IHByb3Aub3JkZXIsXG5cdFx0XHRub25MYW5ndWFnZVNwZWNpZmljRGVmYXVsdFZhbHVlU291cmNlOiBkZWZhdWx0VmFsdWVTb3VyY2UsXG5cdFx0XHRpc0xhbmd1YWdlVGFnU2V0dGluZyxcblx0XHRcdGNhdGVnb3J5TGFiZWw6IChpc1N0cmluZyhwcm9wLnNvdXJjZSkgPyB1bmRlZmluZWQgOiBwcm9wLnNvdXJjZT8uaWQpID09PSBwcm9wLnNlY3Rpb24/LmlkID8gcHJvcC50aXRsZSA6IHByb3Auc2VjdGlvbj8uaWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZU92ZXJyaWRlU2V0dGluZ3Mob3ZlcnJpZGVTZXR0aW5nczogYW55KTogSVNldHRpbmdbXSB7XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKG92ZXJyaWRlU2V0dGluZ3MpLm1hcCgoa2V5KSA9PiAoe1xuXHRcdFx0a2V5LFxuXHRcdFx0dmFsdWU6IG92ZXJyaWRlU2V0dGluZ3Nba2V5XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBbXSxcblx0XHRcdGRlc2NyaXB0aW9uSXNNYXJrZG93bjogZmFsc2UsXG5cdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0a2V5UmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdHZhbHVlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdGRlc2NyaXB0aW9uUmFuZ2VzOiBbXSxcblx0XHRcdG92ZXJyaWRlczogW11cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNTY29wZShwcm9wZXJ0eTogSUNvbmZpZ3VyYXRpb25Ob2RlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFwcm9wZXJ0eS5zY29wZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKSB7XG5cdFx0XHRyZXR1cm4gRk9MREVSX1NDT1BFUy5pbmRleE9mKHByb3BlcnR5LnNjb3BlKSAhPT0gLTE7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpIHtcblx0XHRcdHJldHVybiBXT1JLU1BBQ0VfU0NPUEVTLmluZGV4T2YocHJvcGVydHkuc2NvcGUpICE9PSAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGNvbXBhcmVHcm91cHMoYzE6IElTZXR0aW5nc0dyb3VwLCBjMjogSVNldHRpbmdzR3JvdXApOiBudW1iZXIge1xuXHRcdGlmICh0eXBlb2YgYzE/Lm9yZGVyICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYzI/Lm9yZGVyICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRpZiAoYzEub3JkZXIgPT09IGMyLm9yZGVyKSB7XG5cdFx0XHRjb25zdCB0aXRsZTEgPSBjMS50aXRsZSB8fCAnJztcblx0XHRcdGNvbnN0IHRpdGxlMiA9IGMyLnRpdGxlIHx8ICcnO1xuXHRcdFx0cmV0dXJuIHRpdGxlMS5sb2NhbGVDb21wYXJlKHRpdGxlMik7XG5cdFx0fVxuXHRcdHJldHVybiBjMS5vcmRlciAtIGMyLm9yZGVyO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0NvbnRlbnQoc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW10sIHN0YXJ0SW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBTZXR0aW5nc0NvbnRlbnRCdWlsZGVyKCk7XG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0SW5kZXg7IGkgPCBzZXR0aW5nc0dyb3Vwcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YnVpbGRlci5wdXNoR3JvdXAoc2V0dGluZ3NHcm91cHNbaV0sIGkgPT09IHN0YXJ0SW5kZXgsIGkgPT09IHNldHRpbmdzR3JvdXBzLmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gYnVpbGRlci5nZXRDb250ZW50KCk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdzTW9kZWwgaW1wbGVtZW50cyBJU2V0dGluZ3NFZGl0b3JNb2RlbCB7XG5cblx0cHJpdmF0ZSBfbW9kZWw6IElUZXh0TW9kZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cHM6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cHM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cHMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfdXJpOiBVUkksXG5cdFx0cmVmZXJlbmNlOiBJUmVmZXJlbmNlPElUZXh0RWRpdG9yTW9kZWw+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFNldHRpbmdzOiBEZWZhdWx0U2V0dGluZ3Ncblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRlZmF1bHRTZXR0aW5ncy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUdyb3Vwcy5maXJlKCkpKTtcblx0XHR0aGlzLl9tb2RlbCA9IHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsITtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uV2lsbERpc3Bvc2UoKCkgPT4gcmVmZXJlbmNlLmRpc3Bvc2UoKSkpO1xuXHR9XG5cblx0Z2V0IHVyaSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl91cmk7XG5cdH1cblxuXHRnZXQgdGFyZ2V0KCk6IENvbmZpZ3VyYXRpb25UYXJnZXQge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRTZXR0aW5ncy50YXJnZXQ7XG5cdH1cblxuXHRnZXQgc2V0dGluZ3NHcm91cHMoKTogSVNldHRpbmdzR3JvdXBbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFNldHRpbmdzLmdldFNldHRpbmdzR3JvdXBzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IGZpbHRlckdyb3VwcygpOiBJU2V0dGluZ3NHcm91cFtdIHtcblx0XHQvLyBEb24ndCBsb29rIGF0IFwiY29tbW9ubHkgdXNlZFwiIGZvciBmaWx0ZXJcblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5nc0dyb3Vwcy5zbGljZSgxKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGUoKTogSUZpbHRlclJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBHcmFiIGN1cnJlbnQgcmVzdWx0IGdyb3Vwcywgb25seSByZW5kZXIgbm9uLWVtcHR5IGdyb3Vwc1xuXHRcdGNvbnN0IHJlc3VsdEdyb3VwcyA9IFsuLi50aGlzLl9jdXJyZW50UmVzdWx0R3JvdXBzLnZhbHVlcygpXVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKTtcblx0XHRjb25zdCBub25FbXB0eVJlc3VsdEdyb3VwcyA9IHJlc3VsdEdyb3Vwcy5maWx0ZXIoZ3JvdXAgPT4gZ3JvdXAucmVzdWx0LmZpbHRlck1hdGNoZXMubGVuZ3RoKTtcblxuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHRoaXMuc2V0dGluZ3NHcm91cHMuYXQoLTEpIS5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMjtcblx0XHRjb25zdCB7IHNldHRpbmdzR3JvdXBzOiBmaWx0ZXJlZEdyb3VwcywgbWF0Y2hlcyB9ID0gdGhpcy53cml0ZVJlc3VsdEdyb3Vwcyhub25FbXB0eVJlc3VsdEdyb3Vwcywgc3RhcnRMaW5lKTtcblxuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5jb2xsZWN0TWV0YWRhdGEocmVzdWx0R3JvdXBzKTtcblx0XHRyZXR1cm4gcmVzdWx0R3JvdXBzLmxlbmd0aCA/XG5cdFx0XHR7XG5cdFx0XHRcdGFsbEdyb3VwczogdGhpcy5zZXR0aW5nc0dyb3Vwcyxcblx0XHRcdFx0ZmlsdGVyZWRHcm91cHMsXG5cdFx0XHRcdG1hdGNoZXMsXG5cdFx0XHRcdG1ldGFkYXRhOiBtZXRhZGF0YSA/PyB1bmRlZmluZWRcblx0XHRcdH0gOlxuXHRcdFx0dW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zbGF0ZSB0aGUgSVNlYXJjaFJlc3VsdEdyb3VwcyB0byB0ZXh0LCBhbmQgd3JpdGUgaXQgdG8gdGhlIGVkaXRvciBtb2RlbFxuXHQgKi9cblx0cHJpdmF0ZSB3cml0ZVJlc3VsdEdyb3Vwcyhncm91cHM6IElTZWFyY2hSZXN1bHRHcm91cFtdLCBzdGFydExpbmU6IG51bWJlcik6IHsgbWF0Y2hlczogSVJhbmdlW107IHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdIH0ge1xuXHRcdGNvbnN0IGNvbnRlbnRCdWlsZGVyT2Zmc2V0ID0gc3RhcnRMaW5lIC0gMTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IFNldHRpbmdzQ29udGVudEJ1aWxkZXIoY29udGVudEJ1aWxkZXJPZmZzZXQpO1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwW10gPSBbXTtcblx0XHRjb25zdCBtYXRjaGVzOiBJUmFuZ2VbXSA9IFtdO1xuXHRcdGlmIChncm91cHMubGVuZ3RoKSB7XG5cdFx0XHRidWlsZGVyLnB1c2hMaW5lKCcsJyk7XG5cdFx0XHRncm91cHMuZm9yRWFjaChyZXN1bHRHcm91cCA9PiB7XG5cdFx0XHRcdGNvbnN0IHNldHRpbmdzR3JvdXAgPSB0aGlzLmdldEdyb3VwKHJlc3VsdEdyb3VwKTtcblx0XHRcdFx0c2V0dGluZ3NHcm91cHMucHVzaChzZXR0aW5nc0dyb3VwKTtcblx0XHRcdFx0bWF0Y2hlcy5wdXNoKC4uLnRoaXMud3JpdGVTZXR0aW5nc0dyb3VwVG9CdWlsZGVyKGJ1aWxkZXIsIHNldHRpbmdzR3JvdXAsIHJlc3VsdEdyb3VwLnJlc3VsdC5maWx0ZXJNYXRjaGVzKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBub3RlOiAxLWluZGV4ZWQgbGluZSBudW1iZXJzIGhlcmVcblx0XHRjb25zdCBncm91cENvbnRlbnQgPSBidWlsZGVyLmdldENvbnRlbnQoKSArICdcXG4nO1xuXHRcdGNvbnN0IGdyb3VwRW5kTGluZSA9IHRoaXMuX21vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gbmV3IFNlbGVjdGlvbihzdGFydExpbmUsIDEsIHN0YXJ0TGluZSwgMSk7XG5cdFx0Y29uc3QgZWRpdDogSVNpbmdsZUVkaXRPcGVyYXRpb24gPSB7XG5cdFx0XHR0ZXh0OiBncm91cENvbnRlbnQsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiB0cnVlLFxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShzdGFydExpbmUsIDEsIGdyb3VwRW5kTGluZSwgMSlcblx0XHR9O1xuXG5cdFx0dGhpcy5fbW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtjdXJzb3JQb3NpdGlvbl0sIFtlZGl0XSwgKCkgPT4gW2N1cnNvclBvc2l0aW9uXSk7XG5cblx0XHQvLyBGb3JjZSB0b2tlbml6YXRpb24gbm93IC0gb3RoZXJ3aXNlIGl0IG1heSBiZSBzbGlnaHRseSBkZWxheWVkLCBjYXVzaW5nIGEgZmxhc2ggb2Ygd2hpdGUgdGV4dFxuXHRcdGNvbnN0IHRva2VuaXplVG8gPSBNYXRoLm1pbihzdGFydExpbmUgKyA2MCwgdGhpcy5fbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdHRoaXMuX21vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbih0b2tlbml6ZVRvKTtcblxuXHRcdHJldHVybiB7IG1hdGNoZXMsIHNldHRpbmdzR3JvdXBzIH07XG5cdH1cblxuXHRwcml2YXRlIHdyaXRlU2V0dGluZ3NHcm91cFRvQnVpbGRlcihidWlsZGVyOiBTZXR0aW5nc0NvbnRlbnRCdWlsZGVyLCBzZXR0aW5nc0dyb3VwOiBJU2V0dGluZ3NHcm91cCwgZmlsdGVyTWF0Y2hlczogSVNldHRpbmdNYXRjaFtdKTogSVJhbmdlW10ge1xuXHRcdGZpbHRlck1hdGNoZXMgPSBmaWx0ZXJNYXRjaGVzXG5cdFx0XHQubWFwKGZpbHRlcmVkTWF0Y2ggPT4ge1xuXHRcdFx0XHQvLyBGaXggbWF0Y2ggcmFuZ2VzIHRvIG9mZnNldCBmcm9tIHNldHRpbmcgc3RhcnQgbGluZVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHNldHRpbmc6IGZpbHRlcmVkTWF0Y2guc2V0dGluZyxcblx0XHRcdFx0XHRzY29yZTogZmlsdGVyZWRNYXRjaC5zY29yZSxcblx0XHRcdFx0XHRtYXRjaFR5cGU6IGZpbHRlcmVkTWF0Y2gubWF0Y2hUeXBlLFxuXHRcdFx0XHRcdGtleU1hdGNoU2NvcmU6IGZpbHRlcmVkTWF0Y2gua2V5TWF0Y2hTY29yZSxcblx0XHRcdFx0XHRtYXRjaGVzOiBmaWx0ZXJlZE1hdGNoLm1hdGNoZXMgJiYgZmlsdGVyZWRNYXRjaC5tYXRjaGVzLm1hcChtYXRjaCA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKFxuXHRcdFx0XHRcdFx0XHRtYXRjaC5zdGFydExpbmVOdW1iZXIgLSBmaWx0ZXJlZE1hdGNoLnNldHRpbmcucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRtYXRjaC5zdGFydENvbHVtbixcblx0XHRcdFx0XHRcdFx0bWF0Y2guZW5kTGluZU51bWJlciAtIGZpbHRlcmVkTWF0Y2guc2V0dGluZy5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdG1hdGNoLmVuZENvbHVtbik7XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXG5cdFx0YnVpbGRlci5wdXNoR3JvdXAoc2V0dGluZ3NHcm91cCk7XG5cblx0XHQvLyBidWlsZGVyIGhhcyByZXdyaXR0ZW4gc2V0dGluZ3MgcmFuZ2VzLCBmaXggbWF0Y2ggcmFuZ2VzXG5cdFx0Y29uc3QgZml4ZWRNYXRjaGVzID0gZmlsdGVyTWF0Y2hlc1xuXHRcdFx0Lm1hcChtID0+IG0ubWF0Y2hlcyB8fCBbXSlcblx0XHRcdC5mbGF0TWFwKChzZXR0aW5nTWF0Y2hlcywgaSkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nID0gc2V0dGluZ3NHcm91cC5zZWN0aW9uc1swXS5zZXR0aW5nc1tpXTtcblx0XHRcdFx0cmV0dXJuIHNldHRpbmdNYXRjaGVzLm1hcChyYW5nZSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShcblx0XHRcdFx0XHRcdHJhbmdlLnN0YXJ0TGluZU51bWJlciArIHNldHRpbmcucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0cmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRyYW5nZS5lbmRMaW5lTnVtYmVyICsgc2V0dGluZy5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRyYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIGZpeGVkTWF0Y2hlcztcblx0fVxuXG5cdHByaXZhdGUgY29weVNldHRpbmcoc2V0dGluZzogSVNldHRpbmcpOiBJU2V0dGluZyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlc2NyaXB0aW9uOiBzZXR0aW5nLmRlc2NyaXB0aW9uLFxuXHRcdFx0c2NvcGU6IHNldHRpbmcuc2NvcGUsXG5cdFx0XHR0eXBlOiBzZXR0aW5nLnR5cGUsXG5cdFx0XHRlbnVtOiBzZXR0aW5nLmVudW0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBzZXR0aW5nLmVudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHRrZXk6IHNldHRpbmcua2V5LFxuXHRcdFx0dmFsdWU6IHNldHRpbmcudmFsdWUsXG5cdFx0XHRyYW5nZTogc2V0dGluZy5yYW5nZSxcblx0XHRcdG92ZXJyaWRlczogW10sXG5cdFx0XHRvdmVycmlkZU9mOiBzZXR0aW5nLm92ZXJyaWRlT2YsXG5cdFx0XHR0YWdzOiBzZXR0aW5nLnRhZ3MsXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IHNldHRpbmcuZGVwcmVjYXRpb25NZXNzYWdlLFxuXHRcdFx0a2V5UmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdHZhbHVlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdGRlc2NyaXB0aW9uSXNNYXJrZG93bjogdW5kZWZpbmVkLFxuXHRcdFx0ZGVzY3JpcHRpb25SYW5nZXM6IFtdXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFByZWZlcmVuY2Uoa2V5OiBzdHJpbmcpOiBJU2V0dGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLnNldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRpZiAoc2V0dGluZy5rZXkgPT09IGtleSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNldHRpbmc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEdyb3VwKHJlc3VsdEdyb3VwOiBJU2VhcmNoUmVzdWx0R3JvdXApOiBJU2V0dGluZ3NHcm91cCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiByZXN1bHRHcm91cC5pZCxcblx0XHRcdHJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHR0aXRsZTogcmVzdWx0R3JvdXAubGFiZWwsXG5cdFx0XHR0aXRsZVJhbmdlOiBudWxsUmFuZ2UsXG5cdFx0XHRzZWN0aW9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2V0dGluZ3M6IHJlc3VsdEdyb3VwLnJlc3VsdC5maWx0ZXJNYXRjaGVzLm1hcChtID0+IHRoaXMuY29weVNldHRpbmcobS5zZXR0aW5nKSlcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ3NDb250ZW50QnVpbGRlciB7XG5cdHByaXZhdGUgX2NvbnRlbnRCeUxpbmVzOiBzdHJpbmdbXTtcblxuXHRwcml2YXRlIGdldCBsaW5lQ291bnRXaXRoT2Zmc2V0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRCeUxpbmVzLmxlbmd0aCArIHRoaXMuX3JhbmdlT2Zmc2V0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbGFzdExpbmUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEJ5TGluZXNbdGhpcy5fY29udGVudEJ5TGluZXMubGVuZ3RoIC0gMV0gfHwgJyc7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9yYW5nZU9mZnNldCA9IDApIHtcblx0XHR0aGlzLl9jb250ZW50QnlMaW5lcyA9IFtdO1xuXHR9XG5cblx0cHVzaExpbmUoLi4ubGluZVRleHQ6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudEJ5TGluZXMucHVzaCguLi5saW5lVGV4dCk7XG5cdH1cblxuXHRwdXNoR3JvdXAoc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwLCBpc0ZpcnN0PzogYm9vbGVhbiwgaXNMYXN0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRCeUxpbmVzLnB1c2goaXNGaXJzdCA/ICdbeycgOiAneycpO1xuXHRcdGNvbnN0IGxhc3RTZXR0aW5nID0gdGhpcy5fcHVzaEdyb3VwKHNldHRpbmdzR3JvdXBzLCAnICAnKTtcblxuXHRcdGlmIChsYXN0U2V0dGluZykge1xuXHRcdFx0Ly8gU3RyaXAgdGhlIGNvbW1hIGZyb20gdGhlIGxhc3Qgc2V0dGluZ1xuXHRcdFx0Y29uc3QgbGluZUlkeCA9IGxhc3RTZXR0aW5nLnJhbmdlLmVuZExpbmVOdW1iZXIgLSB0aGlzLl9yYW5nZU9mZnNldDtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLl9jb250ZW50QnlMaW5lc1tsaW5lSWR4IC0gMl07XG5cdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lc1tsaW5lSWR4IC0gMl0gPSBjb250ZW50LnN1YnN0cmluZygwLCBjb250ZW50Lmxlbmd0aCAtIDEpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRlbnRCeUxpbmVzLnB1c2goaXNMYXN0ID8gJ31dJyA6ICd9LCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9wdXNoR3JvdXAoZ3JvdXA6IElTZXR0aW5nc0dyb3VwLCBpbmRlbnQ6IHN0cmluZyk6IElTZXR0aW5nIHwgbnVsbCB7XG5cdFx0bGV0IGxhc3RTZXR0aW5nOiBJU2V0dGluZyB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IGdyb3VwU3RhcnQgPSB0aGlzLmxpbmVDb3VudFdpdGhPZmZzZXQgKyAxO1xuXHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBncm91cC5zZWN0aW9ucykge1xuXHRcdFx0aWYgKHNlY3Rpb24udGl0bGUpIHtcblx0XHRcdFx0dGhpcy5hZGREZXNjcmlwdGlvbihbc2VjdGlvbi50aXRsZV0sIGluZGVudCwgdGhpcy5fY29udGVudEJ5TGluZXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VjdGlvbi5zZXR0aW5ncy5sZW5ndGgpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHR0aGlzLnB1c2hTZXR0aW5nKHNldHRpbmcsIGluZGVudCk7XG5cdFx0XHRcdFx0bGFzdFNldHRpbmcgPSBzZXR0aW5nO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9XG5cdFx0Z3JvdXAucmFuZ2UgPSB7IHN0YXJ0TGluZU51bWJlcjogZ3JvdXBTdGFydCwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCwgZW5kQ29sdW1uOiB0aGlzLmxhc3RMaW5lLmxlbmd0aCB9O1xuXHRcdHJldHVybiBsYXN0U2V0dGluZztcblx0fVxuXG5cdGdldENvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEJ5TGluZXMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIHB1c2hTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nLCBpbmRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHNldHRpbmdTdGFydCA9IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCArIDE7XG5cblx0XHR0aGlzLnB1c2hTZXR0aW5nRGVzY3JpcHRpb24oc2V0dGluZywgaW5kZW50KTtcblxuXHRcdGxldCBwcmVWYWx1ZUNvbnRlbnQgPSBpbmRlbnQ7XG5cdFx0Y29uc3Qga2V5U3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoc2V0dGluZy5rZXkpO1xuXHRcdHByZVZhbHVlQ29udGVudCArPSBrZXlTdHJpbmc7XG5cdFx0c2V0dGluZy5rZXlSYW5nZSA9IHsgc3RhcnRMaW5lTnVtYmVyOiB0aGlzLmxpbmVDb3VudFdpdGhPZmZzZXQgKyAxLCBzdGFydENvbHVtbjogcHJlVmFsdWVDb250ZW50LmluZGV4T2Yoc2V0dGluZy5rZXkpICsgMSwgZW5kTGluZU51bWJlcjogdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0ICsgMSwgZW5kQ29sdW1uOiBzZXR0aW5nLmtleS5sZW5ndGggfTtcblxuXHRcdHByZVZhbHVlQ29udGVudCArPSAnOiAnO1xuXHRcdGNvbnN0IHZhbHVlU3RhcnQgPSB0aGlzLmxpbmVDb3VudFdpdGhPZmZzZXQgKyAxO1xuXHRcdHRoaXMucHVzaFZhbHVlKHNldHRpbmcsIHByZVZhbHVlQ29udGVudCwgaW5kZW50KTtcblxuXHRcdHNldHRpbmcudmFsdWVSYW5nZSA9IHsgc3RhcnRMaW5lTnVtYmVyOiB2YWx1ZVN0YXJ0LCBzdGFydENvbHVtbjogcHJlVmFsdWVDb250ZW50Lmxlbmd0aCArIDEsIGVuZExpbmVOdW1iZXI6IHRoaXMubGluZUNvdW50V2l0aE9mZnNldCwgZW5kQ29sdW1uOiB0aGlzLmxhc3RMaW5lLmxlbmd0aCArIDEgfTtcblx0XHR0aGlzLl9jb250ZW50QnlMaW5lc1t0aGlzLl9jb250ZW50QnlMaW5lcy5sZW5ndGggLSAxXSArPSAnLCc7XG5cdFx0dGhpcy5fY29udGVudEJ5TGluZXMucHVzaCgnJyk7XG5cdFx0c2V0dGluZy5yYW5nZSA9IHsgc3RhcnRMaW5lTnVtYmVyOiBzZXR0aW5nU3RhcnQsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiB0aGlzLmxpbmVDb3VudFdpdGhPZmZzZXQsIGVuZENvbHVtbjogdGhpcy5sYXN0TGluZS5sZW5ndGggfTtcblx0fVxuXG5cdHByaXZhdGUgcHVzaFNldHRpbmdEZXNjcmlwdGlvbihzZXR0aW5nOiBJU2V0dGluZywgaW5kZW50OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzZXR0aW5nLmRlc2NyaXB0aW9uUmFuZ2VzID0gW107XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25QcmVWYWx1ZSA9IGluZGVudCArICcvLyAnO1xuXHRcdGNvbnN0IGRlcHJlY2F0aW9uTWVzc2FnZUxpbmVzID0gc2V0dGluZy5kZXByZWNhdGlvbk1lc3NhZ2U/LnNwbGl0KC9cXG4vZykgPz8gW107XG5cdFx0Zm9yIChsZXQgbGluZSBvZiBbLi4uZGVwcmVjYXRpb25NZXNzYWdlTGluZXMsIC4uLnNldHRpbmcuZGVzY3JpcHRpb25dKSB7XG5cdFx0XHRsaW5lID0gZml4U2V0dGluZ0xpbmtzKGxpbmUpO1xuXG5cdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKGRlc2NyaXB0aW9uUHJlVmFsdWUgKyBsaW5lKTtcblx0XHRcdHNldHRpbmcuZGVzY3JpcHRpb25SYW5nZXMucHVzaCh7IHN0YXJ0TGluZU51bWJlcjogdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0LCBzdGFydENvbHVtbjogdGhpcy5sYXN0TGluZS5pbmRleE9mKGxpbmUpICsgMSwgZW5kTGluZU51bWJlcjogdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0LCBlbmRDb2x1bW46IHRoaXMubGFzdExpbmUubGVuZ3RoIH0pO1xuXHRcdH1cblxuXHRcdGlmIChzZXR0aW5nLmVudW0gJiYgc2V0dGluZy5lbnVtRGVzY3JpcHRpb25zPy5zb21lKGRlc2MgPT4gISFkZXNjKSkge1xuXHRcdFx0c2V0dGluZy5lbnVtRGVzY3JpcHRpb25zLmZvckVhY2goKGRlc2MsIGkpID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzcGxheUVudW0gPSBlc2NhcGVJbnZpc2libGVDaGFycyhTdHJpbmcoc2V0dGluZy5lbnVtIVtpXSkpO1xuXHRcdFx0XHRjb25zdCBsaW5lID0gZGVzYyA/XG5cdFx0XHRcdFx0YCR7ZGlzcGxheUVudW19OiAke2ZpeFNldHRpbmdMaW5rcyhkZXNjKX1gIDpcblx0XHRcdFx0XHRkaXNwbGF5RW51bTtcblxuXHRcdFx0XHRjb25zdCBsaW5lcyA9IGxpbmUuc3BsaXQoL1xcbi9nKTtcblx0XHRcdFx0bGluZXNbMF0gPSAnIC0gJyArIGxpbmVzWzBdO1xuXHRcdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKC4uLmxpbmVzLm1hcChsID0+IGAke2luZGVudH0vLyAke2x9YCkpO1xuXG5cdFx0XHRcdHNldHRpbmcuZGVzY3JpcHRpb25SYW5nZXMucHVzaCh7IHN0YXJ0TGluZU51bWJlcjogdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0LCBzdGFydENvbHVtbjogdGhpcy5sYXN0TGluZS5pbmRleE9mKGxpbmUpICsgMSwgZW5kTGluZU51bWJlcjogdGhpcy5saW5lQ291bnRXaXRoT2Zmc2V0LCBlbmRDb2x1bW46IHRoaXMubGFzdExpbmUubGVuZ3RoIH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwdXNoVmFsdWUoc2V0dGluZzogSVNldHRpbmcsIHByZVZhbHVlQ29uZW50OiBzdHJpbmcsIGluZGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWVTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShzZXR0aW5nLnZhbHVlLCBudWxsLCBpbmRlbnQpO1xuXHRcdGlmICh2YWx1ZVN0cmluZyAmJiAodHlwZW9mIHNldHRpbmcudmFsdWUgPT09ICdvYmplY3QnKSkge1xuXHRcdFx0aWYgKHNldHRpbmcub3ZlcnJpZGVzICYmIHNldHRpbmcub3ZlcnJpZGVzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKHByZVZhbHVlQ29uZW50ICsgJyB7Jyk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc3ViU2V0dGluZyBvZiBzZXR0aW5nLm92ZXJyaWRlcykge1xuXHRcdFx0XHRcdHRoaXMucHVzaFNldHRpbmcoc3ViU2V0dGluZywgaW5kZW50ICsgaW5kZW50KTtcblx0XHRcdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wb3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsYXN0U2V0dGluZyA9IHNldHRpbmcub3ZlcnJpZGVzW3NldHRpbmcub3ZlcnJpZGVzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fY29udGVudEJ5TGluZXNbbGFzdFNldHRpbmcucmFuZ2UuZW5kTGluZU51bWJlciAtIDJdO1xuXHRcdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lc1tsYXN0U2V0dGluZy5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gMl0gPSBjb250ZW50LnN1YnN0cmluZygwLCBjb250ZW50Lmxlbmd0aCAtIDEpO1xuXHRcdFx0XHR0aGlzLl9jb250ZW50QnlMaW5lcy5wdXNoKGluZGVudCArICd9Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtdWxpdExpbmVWYWx1ZSA9IHZhbHVlU3RyaW5nLnNwbGl0KCdcXG4nKTtcblx0XHRcdFx0dGhpcy5fY29udGVudEJ5TGluZXMucHVzaChwcmVWYWx1ZUNvbmVudCArIG11bGl0TGluZVZhbHVlWzBdKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBtdWxpdExpbmVWYWx1ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRlbnRCeUxpbmVzLnB1c2goaW5kZW50ICsgbXVsaXRMaW5lVmFsdWVbaV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbnRlbnRCeUxpbmVzLnB1c2gocHJlVmFsdWVDb25lbnQgKyB2YWx1ZVN0cmluZyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGREZXNjcmlwdGlvbihkZXNjcmlwdGlvbjogc3RyaW5nW10sIGluZGVudDogc3RyaW5nLCByZXN1bHQ6IHN0cmluZ1tdKSB7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXN1bHQucHVzaChpbmRlbnQgKyAnLy8gJyArIGxpbmUpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSYXdTZXR0aW5nc0NvbnRlbnRCdWlsZGVyIGV4dGVuZHMgU2V0dGluZ3NDb250ZW50QnVpbGRlciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBpbmRlbnQ6IHN0cmluZyA9ICdcXHQnKSB7XG5cdFx0c3VwZXIoMCk7XG5cdH1cblxuXHRvdmVycmlkZSBwdXNoR3JvdXAoc2V0dGluZ3NHcm91cHM6IElTZXR0aW5nc0dyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5fcHVzaEdyb3VwKHNldHRpbmdzR3JvdXBzLCB0aGlzLmluZGVudCk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdFJhd1NldHRpbmdzRWRpdG9yTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9jb250ZW50OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENvbnRlbnRDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ29udGVudENoYW5nZWQgPSB0aGlzLl9vbkRpZENvbnRlbnRDaGFuZ2VkLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZGVmYXVsdFNldHRpbmdzOiBEZWZhdWx0U2V0dGluZ3MpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRlZmF1bHRTZXR0aW5ncy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZW50ID0gbnVsbDtcblx0XHRcdHRoaXMuX29uRGlkQ29udGVudENoYW5nZWQuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBjb250ZW50KCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX2NvbnRlbnQgPT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgUmF3U2V0dGluZ3NDb250ZW50QnVpbGRlcigpO1xuXHRcdFx0YnVpbGRlci5wdXNoTGluZSgneycpO1xuXHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nc0dyb3VwIG9mIHRoaXMuZGVmYXVsdFNldHRpbmdzLmdldFJlZ2lzdGVyZWRHcm91cHMoKSkge1xuXHRcdFx0XHRidWlsZGVyLnB1c2hHcm91cChzZXR0aW5nc0dyb3VwKTtcblx0XHRcdH1cblx0XHRcdGJ1aWxkZXIucHVzaExpbmUoJ30nKTtcblx0XHRcdHRoaXMuX2NvbnRlbnQgPSBidWlsZGVyLmdldENvbnRlbnQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXNjYXBlSW52aXNpYmxlQ2hhcnMoZW51bVZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gZW51bVZhbHVlICYmIGVudW1WYWx1ZVxuXHRcdC5yZXBsYWNlKC9cXG4vZywgJ1xcXFxuJylcblx0XHQucmVwbGFjZSgvXFxyL2csICdcXFxccicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmYXVsdEtleWJpbmRpbmdzQ29udGVudHMoa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSk6IHN0cmluZyB7XG5cdGNvbnN0IGRlZmF1bHRzSGVhZGVyID0gJy8vICcgKyBubHMubG9jYWxpemUoJ2RlZmF1bHRLZXliaW5kaW5nc0hlYWRlcicsIFwiT3ZlcnJpZGUga2V5IGJpbmRpbmdzIGJ5IHBsYWNpbmcgdGhlbSBpbnRvIHlvdXIga2V5IGJpbmRpbmdzIGZpbGUuXCIpO1xuXHRyZXR1cm4gZGVmYXVsdHNIZWFkZXIgKyAnXFxuJyArIGtleWJpbmRpbmdTZXJ2aWNlLmdldERlZmF1bHRLZXliaW5kaW5nc0NvbnRlbnQoKTtcbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRLZXliaW5kaW5nc0VkaXRvck1vZGVsIGltcGxlbWVudHMgSUtleWJpbmRpbmdzRWRpdG9yTW9kZWw8YW55PiB7XG5cblx0cHJpdmF0ZSBfY29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX3VyaTogVVJJLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlKSB7XG5cdH1cblxuXHRnZXQgdXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX3VyaTtcblx0fVxuXG5cdGdldCBjb250ZW50KCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9jb250ZW50KSB7XG5cdFx0XHR0aGlzLl9jb250ZW50ID0gZGVmYXVsdEtleWJpbmRpbmdzQ29udGVudHModGhpcy5rZXliaW5kaW5nU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb250ZW50O1xuXHR9XG5cblx0Z2V0UHJlZmVyZW5jZSgpOiBhbnkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBOb3QgZGlzcG9zYWJsZVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsZUFBc0I7QUFDL0IsU0FBc0IsYUFBYTtBQUNuQyxTQUFTLGtCQUE4QjtBQUV2QyxTQUFpQixhQUFhO0FBQzlCLFNBQVMsaUJBQWlCO0FBSTFCLFlBQVksU0FBUztBQUNyQixTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBMEMsb0JBQW9CLFlBQWdHLCtCQUErQjtBQUM3TCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFvTCx3QkFBd0I7QUFDNU0sU0FBUyxlQUFlLHdCQUF3QjtBQUNoRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUVsQixNQUFNLFlBQW9CLEVBQUUsaUJB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TUFBTTtBQUFBLEVBQzVDO0FBRUQ7QUFFTyxNQUFNLHNDQUFzQyxXQUFXO0FBQUEsRUFPN0QsWUFBb0IsaUJBQWtDO0FBQ3JELFVBQU07QUFEYTtBQUxwQixTQUFRLFdBQTBCO0FBRWxDLFNBQWlCLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDMUUsU0FBUyxzQkFBc0IsS0FBSyxxQkFBcUI7QUFJeEQsU0FBSyxVQUFVLGdCQUFnQixZQUFZLE1BQU07QUFDaEQsV0FBSyxXQUFXO0FBQ2hCLFdBQUsscUJBQXFCLEtBQUs7QUFBQSxJQUNoQyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxJQUFJLFVBQWtCO0FBQ3JCLFFBQUksS0FBSyxhQUFhLE1BQU07QUFDM0IsWUFBTSxVQUFVLElBQUksMEJBQTBCO0FBQzlDLGNBQVEsU0FBUyxHQUFHO0FBQ3BCLGlCQUFXLGlCQUFpQixLQUFLLGdCQUFnQixvQkFBb0IsR0FBRztBQUN2RSxnQkFBUSxVQUFVLGFBQWE7QUFBQSxNQUNoQztBQUNBLGNBQVEsU0FBUyxHQUFHO0FBQ3BCLFdBQUssV0FBVyxRQUFRLFdBQVc7QUFBQSxJQUNwQztBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQUVBLFNBQVMscUJBQXFCLFdBQTJCO0FBQ3hELFNBQU8sYUFBYSxVQUNsQixRQUFRLE9BQU8sS0FBSyxFQUNwQixRQUFRLE9BQU8sS0FBSztBQUN2QjtBQUVPLFNBQVMsMkJBQTJCLG1CQUErQztBQUN6RixRQUFNLGlCQUFpQixRQUFRLElBQUksU0FBUyw0QkFBNEIsb0VBQW9FO0FBQzVJLFNBQU8saUJBQWlCLE9BQU8sa0JBQWtCLDZCQUE2QjtBQUMvRTtBQUVPLElBQU0sZ0NBQU4sTUFBNEU7QUFBQSxFQUlsRixZQUFvQixNQUNrQixtQkFBdUM7QUFEekQ7QUFDa0I7QUFBQSxFQUN0QztBQUFBLEVBRUEsSUFBSSxNQUFXO0FBQ2QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxVQUFrQjtBQUNyQixRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CLFdBQUssV0FBVywyQkFBMkIsS0FBSyxpQkFBaUI7QUFBQSxJQUNsRTtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGdCQUFxQjtBQUNwQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsVUFBZ0I7QUFBQSxFQUVoQjtBQUNEO0FBMUJhLGdDQUFOO0FBQUEsRUFLSjtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbImtleSJdCn0K
