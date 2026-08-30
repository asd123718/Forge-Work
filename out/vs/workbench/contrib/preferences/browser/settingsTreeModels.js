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
import * as arrays from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters, isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { isUndefinedOrNull } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ConfigurationTarget, getLanguageTagSettingPlainKey } from "../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, EditPresentationTypes, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { USER_LOCAL_AND_REMOTE_SETTINGS } from "../../../../platform/request/common/request.js";
import { APPLICATION_SCOPES, FOLDER_SCOPES, IWorkbenchConfigurationService, LOCAL_MACHINE_SCOPES, REMOTE_MACHINE_SCOPES, WORKSPACE_SCOPES } from "../../../services/configuration/common/configuration.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { SettingMatchType, SettingValueType } from "../../../services/preferences/common/preferences.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { AGENTS_WINDOW_SETTING_TAG, ENABLE_EXTENSION_TOGGLE_SETTINGS, ENABLE_LANGUAGE_FILTER, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, compareTwoNullableNumbers, wordifyKey } from "../common/preferences.js";
import { tocData } from "./settingsLayout.js";
const ONLINE_SERVICES_SETTING_TAG = "usesOnlineServices";
class SettingsTreeElement extends Disposable {
  constructor(_id) {
    super();
    this._tabbable = false;
    this._onDidChangeTabbable = this._register(new Emitter());
    this.id = _id;
  }
  get onDidChangeTabbable() {
    return this._onDidChangeTabbable.event;
  }
  get tabbable() {
    return this._tabbable;
  }
  set tabbable(value) {
    this._tabbable = value;
    this._onDidChangeTabbable.fire();
  }
}
class SettingsTreeGroupElement extends SettingsTreeElement {
  constructor(_id, count, label, level, isFirstGroup) {
    super(_id);
    this._childSettingKeys = /* @__PURE__ */ new Set();
    this._children = [];
    this.count = count;
    this.label = label;
    this.level = level;
    this.isFirstGroup = isFirstGroup;
  }
  get children() {
    return this._children;
  }
  set children(newChildren) {
    this._children = newChildren;
    this._childSettingKeys = /* @__PURE__ */ new Set();
    this._children.forEach((child) => {
      if (child instanceof SettingsTreeSettingElement) {
        this._childSettingKeys.add(child.setting.key);
      }
    });
  }
  /**
   * Returns whether this group contains the given child key (to a depth of 1 only)
   */
  containsSetting(key) {
    return this._childSettingKeys.has(key);
  }
}
class SettingsTreeNewExtensionsElement extends SettingsTreeElement {
  constructor(_id, extensionIds) {
    super(_id);
    this.extensionIds = extensionIds;
  }
}
const _SettingsTreeSettingElement = class _SettingsTreeSettingElement extends SettingsTreeElement {
  constructor(setting, parent, settingsTarget, isWorkspaceTrusted, languageFilter, languageService, productService, userDataProfileService, configurationService, isSessionsWindow) {
    super(sanitizeId(parent.id + "_" + setting.key));
    this.settingsTarget = settingsTarget;
    this.isWorkspaceTrusted = isWorkspaceTrusted;
    this.languageFilter = languageFilter;
    this.languageService = languageService;
    this.productService = productService;
    this.userDataProfileService = userDataProfileService;
    this.configurationService = configurationService;
    this.isSessionsWindow = isSessionsWindow;
    this._displayCategory = null;
    this._displayLabel = null;
    /**
     * Whether the setting is configured in the selected scope.
     */
    this.isConfigured = false;
    /**
     * Whether the setting requires trusted target
     */
    this.isUntrusted = false;
    /**
     * Whether the setting is under a policy that blocks all changes.
     */
    this.hasPolicyValue = false;
    /**
     * Whether the setting is read-only in the Agents window.
     */
    this.isAgentsWindowReadOnly = false;
    this.overriddenScopeList = [];
    this.overriddenDefaultsLanguageList = [];
    /**
     * For each language that contributes setting values or default overrides, we can see those values here.
     */
    this.languageOverrideValues = /* @__PURE__ */ new Map();
    this.setting = setting;
    this.parent = parent;
    this.initSettingDescription();
    this.initSettingValueType();
  }
  get displayCategory() {
    if (!this._displayCategory) {
      this.initLabels();
    }
    return this._displayCategory;
  }
  get displayLabel() {
    if (!this._displayLabel) {
      this.initLabels();
    }
    return this._displayLabel;
  }
  initLabels() {
    if (this.setting.title) {
      this._displayLabel = this.setting.title;
      this._displayCategory = this.setting.categoryLabel ?? null;
      return;
    }
    const displayKeyFormat = settingKeyToDisplayFormat(this.setting.key, this.parent.id, this.setting.isLanguageTagSetting);
    this._displayLabel = displayKeyFormat.label;
    this._displayCategory = displayKeyFormat.category;
  }
  initSettingDescription() {
    if (this.setting.description.length > _SettingsTreeSettingElement.MAX_DESC_LINES) {
      const truncatedDescLines = this.setting.description.slice(0, _SettingsTreeSettingElement.MAX_DESC_LINES);
      truncatedDescLines.push("[...]");
      this.description = truncatedDescLines.join("\n");
    } else {
      this.description = this.setting.description.join("\n");
    }
  }
  initSettingValueType() {
    if (isExtensionToggleSetting(this.setting, this.productService)) {
      this.valueType = SettingValueType.ExtensionToggle;
    } else if (this.setting.enum && (!this.setting.type || settingTypeEnumRenderable(this.setting.type))) {
      this.valueType = SettingValueType.Enum;
    } else if (this.setting.type === "string") {
      if (this.setting.editPresentation === EditPresentationTypes.Multiline) {
        this.valueType = SettingValueType.MultilineString;
      } else {
        this.valueType = SettingValueType.String;
      }
    } else if (isExcludeSetting(this.setting)) {
      this.valueType = SettingValueType.Exclude;
    } else if (isIncludeSetting(this.setting)) {
      this.valueType = SettingValueType.Include;
    } else if (this.setting.type === "integer") {
      this.valueType = SettingValueType.Integer;
    } else if (this.setting.type === "number") {
      this.valueType = SettingValueType.Number;
    } else if (this.setting.type === "boolean") {
      this.valueType = SettingValueType.Boolean;
    } else if (this.setting.type === "array" && this.setting.arrayItemType && ["string", "enum", "number", "integer"].includes(this.setting.arrayItemType)) {
      this.valueType = SettingValueType.Array;
    } else if (Array.isArray(this.setting.type) && this.setting.type.includes(SettingValueType.Null) && this.setting.type.length === 2) {
      if (this.setting.type.includes(SettingValueType.Integer)) {
        this.valueType = SettingValueType.NullableInteger;
      } else if (this.setting.type.includes(SettingValueType.Number)) {
        this.valueType = SettingValueType.NullableNumber;
      } else {
        this.valueType = SettingValueType.Complex;
      }
    } else {
      const schemaType = getObjectSettingSchemaType(this.setting);
      if (schemaType) {
        if (this.setting.allKeysAreBoolean) {
          this.valueType = SettingValueType.BooleanObject;
        } else if (schemaType === "simple") {
          this.valueType = SettingValueType.Object;
        } else {
          this.valueType = SettingValueType.ComplexObject;
        }
      } else if (this.setting.isLanguageTagSetting) {
        this.valueType = SettingValueType.LanguageTag;
      } else {
        this.valueType = SettingValueType.Complex;
      }
    }
  }
  inspectSelf() {
    const targetToInspect = this.getTargetToInspect(this.setting);
    const inspectResult = inspectSetting(this.setting.key, targetToInspect, this.languageFilter, this.configurationService);
    this.update(inspectResult, this.isWorkspaceTrusted);
  }
  getTargetToInspect(setting) {
    if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
      if (setting.scope === ConfigurationScope.APPLICATION) {
        return ConfigurationTarget.APPLICATION;
      }
      if (this.configurationService.isSettingAppliedForAllProfiles(setting.key) && this.settingsTarget === ConfigurationTarget.USER_LOCAL) {
        return ConfigurationTarget.APPLICATION;
      }
    }
    return this.settingsTarget;
  }
  update(inspectResult, isWorkspaceTrusted) {
    let { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector } = inspectResult;
    switch (targetSelector) {
      case "workspaceFolderValue":
      case "workspaceValue":
        this.isUntrusted = !!this.setting.restricted && !isWorkspaceTrusted;
        break;
    }
    let displayValue = isConfigured ? inspected[targetSelector] : inspected.defaultValue;
    const overriddenScopeList = [];
    const overriddenDefaultsLanguageList = [];
    if ((languageSelector || targetSelector !== "workspaceValue") && typeof inspected.workspaceValue !== "undefined") {
      overriddenScopeList.push("workspace:");
    }
    if ((languageSelector || targetSelector !== "userRemoteValue") && typeof inspected.userRemoteValue !== "undefined") {
      overriddenScopeList.push("remote:");
    }
    if ((languageSelector || targetSelector !== "userLocalValue") && typeof inspected.userLocalValue !== "undefined") {
      overriddenScopeList.push("user:");
    }
    if (inspected.overrideIdentifiers) {
      for (const overrideIdentifier of inspected.overrideIdentifiers) {
        const inspectedOverride = inspectedLanguageOverrides.get(overrideIdentifier);
        if (inspectedOverride) {
          if (this.languageService.isRegisteredLanguageId(overrideIdentifier)) {
            if (languageSelector !== overrideIdentifier && typeof inspectedOverride.default?.override !== "undefined") {
              overriddenDefaultsLanguageList.push(overrideIdentifier);
            }
            if ((languageSelector !== overrideIdentifier || targetSelector !== "workspaceValue") && typeof inspectedOverride.workspace?.override !== "undefined") {
              overriddenScopeList.push(`workspace:${overrideIdentifier}`);
            }
            if ((languageSelector !== overrideIdentifier || targetSelector !== "userRemoteValue") && typeof inspectedOverride.userRemote?.override !== "undefined") {
              overriddenScopeList.push(`remote:${overrideIdentifier}`);
            }
            if ((languageSelector !== overrideIdentifier || targetSelector !== "userLocalValue") && typeof inspectedOverride.userLocal?.override !== "undefined") {
              overriddenScopeList.push(`user:${overrideIdentifier}`);
            }
          }
          this.languageOverrideValues.set(overrideIdentifier, inspectedOverride);
        }
      }
    }
    this.overriddenScopeList = overriddenScopeList;
    this.overriddenDefaultsLanguageList = overriddenDefaultsLanguageList;
    this.defaultValueSource = this.setting.nonLanguageSpecificDefaultValueSource;
    if (inspected.policyValue !== void 0) {
      this.hasPolicyValue = true;
      isConfigured = false;
      displayValue = inspected.policyValue;
      this.scopeValue = inspected.policyValue;
      this.defaultValue = inspected.defaultValue;
    } else if (languageSelector && this.languageOverrideValues.has(languageSelector)) {
      const overrideValues = this.languageOverrideValues.get(languageSelector);
      displayValue = (isConfigured ? overrideValues[targetSelector] : overrideValues.defaultValue) ?? displayValue;
      this.scopeValue = isConfigured && overrideValues[targetSelector];
      this.defaultValue = overrideValues.defaultValue ?? inspected.defaultValue;
      const registryValues = Registry.as(Extensions.Configuration).getConfigurationDefaultsOverrides();
      const source = registryValues.get(`[${languageSelector}]`)?.source;
      const overrideValueSource = source instanceof Map ? source.get(this.setting.key) : void 0;
      if (overrideValueSource) {
        this.defaultValueSource = overrideValueSource;
      }
    } else {
      this.scopeValue = isConfigured && inspected[targetSelector];
      this.defaultValue = inspected.defaultValue;
    }
    let hasAgentsWindowOverride = false;
    if (this.isSessionsWindow) {
      const property = Registry.as(Extensions.Configuration).getConfigurationProperties()[this.setting.key];
      hasAgentsWindowOverride = !!property?.agentsWindow;
      this.isAgentsWindowReadOnly = !!property?.agentsWindow?.readOnly;
      if (this.isAgentsWindowReadOnly) {
        isConfigured = false;
      }
    }
    this.value = displayValue;
    this.isConfigured = isConfigured;
    if (isConfigured || this.setting.tags || this.tags || this.setting.restricted || this.hasPolicyValue || hasAgentsWindowOverride) {
      this.tags = /* @__PURE__ */ new Set();
      if (isConfigured) {
        this.tags.add(MODIFIED_SETTING_TAG);
      }
      this.setting.tags?.forEach((tag) => this.tags.add(tag));
      if (this.setting.restricted) {
        this.tags.add(REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG);
      }
      if (this.hasPolicyValue) {
        this.tags.add(POLICY_SETTING_TAG);
      }
      if (hasAgentsWindowOverride) {
        this.tags.add(AGENTS_WINDOW_SETTING_TAG);
      }
    }
  }
  matchesAllTags(tagFilters) {
    if (!tagFilters?.size) {
      return true;
    }
    if (!this.tags) {
      this.inspectSelf();
    }
    if (tagFilters.has("stable")) {
      if (this.tags?.has("preview") || this.tags?.has("experimental")) {
        return false;
      }
      const otherFilters = new Set(Array.from(tagFilters).filter((tag) => tag !== "stable"));
      if (otherFilters.size === 0) {
        return true;
      }
      return !!this.tags?.size && Array.from(otherFilters).every((tag) => this.tags.has(tag));
    }
    return !!this.tags?.size && Array.from(tagFilters).every((tag) => this.tags.has(tag));
  }
  matchesScope(scope, isRemote) {
    const configTarget = URI.isUri(scope) ? ConfigurationTarget.WORKSPACE_FOLDER : scope;
    if (!this.setting.scope) {
      return true;
    }
    if (configTarget === ConfigurationTarget.APPLICATION) {
      return APPLICATION_SCOPES.includes(this.setting.scope);
    }
    if (configTarget === ConfigurationTarget.WORKSPACE_FOLDER) {
      return FOLDER_SCOPES.includes(this.setting.scope);
    }
    if (configTarget === ConfigurationTarget.WORKSPACE) {
      return WORKSPACE_SCOPES.includes(this.setting.scope);
    }
    if (configTarget === ConfigurationTarget.USER_REMOTE) {
      return REMOTE_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
    }
    if (configTarget === ConfigurationTarget.USER_LOCAL) {
      if (isRemote) {
        return LOCAL_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
      }
    }
    return true;
  }
  matchesAnyExtension(extensionFilters) {
    if (!extensionFilters || !extensionFilters.size) {
      return true;
    }
    if (!this.setting.extensionInfo) {
      return false;
    }
    return Array.from(extensionFilters).some((extensionId) => extensionId.toLowerCase() === this.setting.extensionInfo.id.toLowerCase());
  }
  matchesAnyFeature(featureFilters) {
    if (!featureFilters || !featureFilters.size) {
      return true;
    }
    if (this.setting.extensionInfo) {
      return false;
    }
    if (featureFilters.has("chat")) {
      const chatFeatures = tocData.children.find((child) => child.id === "chat");
      if (chatFeatures?.children) {
        const patterns = chatFeatures.children.flatMap((feature) => feature.settings ?? []).map((setting) => createSettingMatchRegExp(setting));
        if (patterns.some((pattern) => pattern.test(this.setting.key))) {
          return true;
        }
      }
    }
    const features = tocData.children.find((child) => child.id === "features");
    return Array.from(featureFilters).some((filter) => {
      if (features?.children) {
        const feature = features.children.find((feature2) => "features/" + filter === feature2.id);
        if (feature?.settings) {
          const patterns = feature.settings.map((setting) => createSettingMatchRegExp(setting));
          return patterns.some((pattern) => pattern.test(this.setting.key));
        } else {
          return false;
        }
      } else {
        return false;
      }
    });
  }
  matchesAnyId(idFilters) {
    if (!idFilters || !idFilters.size) {
      return true;
    }
    if (idFilters.has(this.setting.key)) {
      return true;
    }
    for (const filter of idFilters) {
      if (filter.endsWith("*")) {
        const prefix = filter.slice(0, -1);
        if (this.setting.key.startsWith(prefix)) {
          return true;
        }
      }
    }
    return false;
  }
  matchesAllLanguages(languageFilter) {
    if (!languageFilter) {
      return true;
    }
    if (!this.languageService.isRegisteredLanguageId(languageFilter)) {
      return false;
    }
    if (this.setting.scope === ConfigurationScope.LANGUAGE_OVERRIDABLE) {
      return true;
    }
    return false;
  }
};
_SettingsTreeSettingElement.MAX_DESC_LINES = 20;
let SettingsTreeSettingElement = _SettingsTreeSettingElement;
function createSettingMatchRegExp(pattern) {
  pattern = escapeRegExpCharacters(pattern).replace(/\\\*/g, ".*");
  return new RegExp(`^${pattern}$`, "i");
}
let SettingsTreeModel = class {
  constructor(_viewState, _isWorkspaceTrusted, _configurationService, _languageService, _userDataProfileService, _productService, _environmentService) {
    this._viewState = _viewState;
    this._isWorkspaceTrusted = _isWorkspaceTrusted;
    this._configurationService = _configurationService;
    this._languageService = _languageService;
    this._userDataProfileService = _userDataProfileService;
    this._productService = _productService;
    this._environmentService = _environmentService;
    this._treeElementsBySettingName = /* @__PURE__ */ new Map();
  }
  get root() {
    return this._root;
  }
  update(newTocRoot = this._tocRoot) {
    this._treeElementsBySettingName.clear();
    const newRoot = this.createSettingsTreeGroupElement(newTocRoot);
    if (newRoot.children[0] instanceof SettingsTreeGroupElement) {
      newRoot.children[0].isFirstGroup = true;
    }
    if (this._root) {
      this.disposeChildren(this._root.children);
      this._root.children = newRoot.children;
      newRoot.dispose();
    } else {
      this._root = newRoot;
    }
  }
  updateWorkspaceTrust(workspaceTrusted) {
    this._isWorkspaceTrusted = workspaceTrusted;
    this.updateRequireTrustedTargetElements();
  }
  disposeChildren(children) {
    for (const child of children) {
      this.disposeChildAndRecurse(child);
    }
  }
  disposeChildAndRecurse(element) {
    if (element instanceof SettingsTreeGroupElement) {
      this.disposeChildren(element.children);
    }
    element.dispose();
  }
  getElementsByName(name) {
    return this._treeElementsBySettingName.get(name) ?? null;
  }
  updateElementsByName(name) {
    if (!this._treeElementsBySettingName.has(name)) {
      return;
    }
    this.reinspectSettings(this._treeElementsBySettingName.get(name));
  }
  updateRequireTrustedTargetElements() {
    this.reinspectSettings([...this._treeElementsBySettingName.values()].flat().filter((s) => s.isUntrusted));
  }
  reinspectSettings(settings) {
    for (const element of settings) {
      element.inspectSelf();
    }
  }
  createSettingsTreeGroupElement(tocEntry, parent) {
    const depth = parent ? this.getDepth(parent) + 1 : 0;
    const element = new SettingsTreeGroupElement(tocEntry.id, void 0, tocEntry.label, depth, false);
    element.parent = parent;
    const children = [];
    if (tocEntry.settings) {
      const settingChildren = tocEntry.settings.map((s) => this.createSettingsTreeSettingElement(s, element));
      for (const child of settingChildren) {
        if (!child.setting.deprecationMessage) {
          children.push(child);
        } else {
          child.inspectSelf();
          if (child.isConfigured) {
            children.push(child);
          } else {
            child.dispose();
          }
        }
      }
    }
    if (tocEntry.children) {
      const groupChildren = tocEntry.children.map((child) => this.createSettingsTreeGroupElement(child, element));
      children.push(...groupChildren);
    }
    element.children = children;
    return element;
  }
  getDepth(element) {
    if (element.parent) {
      return 1 + this.getDepth(element.parent);
    } else {
      return 0;
    }
  }
  createSettingsTreeSettingElement(setting, parent) {
    const element = new SettingsTreeSettingElement(
      setting,
      parent,
      this._viewState.settingsTarget,
      this._isWorkspaceTrusted,
      this._viewState.languageFilter,
      this._languageService,
      this._productService,
      this._userDataProfileService,
      this._configurationService,
      this._environmentService.isSessionsWindow
    );
    const nameElements = this._treeElementsBySettingName.get(setting.key) ?? [];
    nameElements.push(element);
    this._treeElementsBySettingName.set(setting.key, nameElements);
    return element;
  }
  dispose() {
    this._treeElementsBySettingName.clear();
    this.disposeChildAndRecurse(this._root);
  }
};
SettingsTreeModel = __decorateClass([
  __decorateParam(2, IWorkbenchConfigurationService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IUserDataProfileService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IWorkbenchEnvironmentService)
], SettingsTreeModel);
function inspectSetting(key, target, languageFilter, configurationService) {
  const inspectOverrides = URI.isUri(target) ? { resource: target } : void 0;
  const inspected = configurationService.inspect(key, inspectOverrides);
  const targetSelector = target === ConfigurationTarget.APPLICATION ? "applicationValue" : target === ConfigurationTarget.USER_LOCAL ? "userLocalValue" : target === ConfigurationTarget.USER_REMOTE ? "userRemoteValue" : target === ConfigurationTarget.WORKSPACE ? "workspaceValue" : "workspaceFolderValue";
  const targetOverrideSelector = target === ConfigurationTarget.APPLICATION ? "application" : target === ConfigurationTarget.USER_LOCAL ? "userLocal" : target === ConfigurationTarget.USER_REMOTE ? "userRemote" : target === ConfigurationTarget.WORKSPACE ? "workspace" : "workspaceFolder";
  let isConfigured = typeof inspected[targetSelector] !== "undefined";
  const overrideIdentifiers = inspected.overrideIdentifiers;
  const inspectedLanguageOverrides = /* @__PURE__ */ new Map();
  if (languageFilter) {
    isConfigured = false;
  }
  if (overrideIdentifiers) {
    for (const overrideIdentifier of overrideIdentifiers) {
      inspectedLanguageOverrides.set(overrideIdentifier, configurationService.inspect(key, { overrideIdentifier }));
    }
    if (languageFilter) {
      if (inspectedLanguageOverrides.has(languageFilter)) {
        const overrideValue = inspectedLanguageOverrides.get(languageFilter)[targetOverrideSelector]?.override;
        if (typeof overrideValue !== "undefined") {
          isConfigured = true;
        }
      }
    }
  }
  return { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector: languageFilter };
}
function sanitizeId(id) {
  return id.replace(/[\.\/]/g, "_");
}
function settingKeyToDisplayFormat(key, groupId = "", isLanguageTagSetting = false) {
  const lastDotIdx = key.lastIndexOf(".");
  let category = "";
  if (lastDotIdx >= 0) {
    category = key.substring(0, lastDotIdx);
    key = key.substring(lastDotIdx + 1);
  }
  groupId = groupId.replace(/\//g, ".");
  category = trimCategoryForGroup(category, groupId);
  category = wordifyKey(category);
  if (isLanguageTagSetting) {
    key = getLanguageTagSettingPlainKey(key);
    key = "$(bracket) " + key;
  }
  const label = wordifyKey(key);
  return { category, label };
}
function trimCategoryForGroup(category, groupId) {
  const doTrim = (forward) => {
    if (!/insiders$/i.test(category)) {
      groupId = groupId.replace(/-?insiders$/i, "");
    }
    const parts = groupId.split(".").map((part) => {
      if (part.replace(/-/g, "").toLowerCase() === category.toLowerCase()) {
        return part.replace(/-/g, "");
      } else {
        return part;
      }
    });
    while (parts.length) {
      const reg = new RegExp(`^${parts.join("\\.")}(\\.|$)`, "i");
      if (reg.test(category)) {
        return category.replace(reg, "");
      }
      if (forward) {
        parts.pop();
      } else {
        parts.shift();
      }
    }
    return null;
  };
  let trimmed = doTrim(true);
  if (trimmed === null) {
    trimmed = doTrim(false);
  }
  if (trimmed === null) {
    trimmed = category;
  }
  return trimmed;
}
function isExtensionToggleSetting(setting, productService) {
  return ENABLE_EXTENSION_TOGGLE_SETTINGS && !!productService.extensionRecommendations && !!setting.displayExtensionId;
}
function isExcludeSetting(setting) {
  return setting.key === "files.exclude" || setting.key === "search.exclude" || setting.key === "workbench.localHistory.exclude" || setting.key === "explorer.autoRevealExclude" || setting.key === "files.readonlyExclude" || setting.key === "files.watcherExclude";
}
function isIncludeSetting(setting) {
  return setting.key === "files.readonlyInclude";
}
function objectSettingSupportsRemoveDefaultValue(key) {
  return key === "workbench.editor.customLabels.patterns";
}
function isSimpleType(type) {
  return type === "string" || type === "boolean" || type === "integer" || type === "number";
}
function getObjectRenderableSchemaType(schema, key) {
  const { type } = schema;
  if (Array.isArray(type)) {
    if (objectSettingSupportsRemoveDefaultValue(key) && type.length === 2) {
      if (type.includes("null") && (type.includes("string") || type.includes("boolean") || type.includes("integer") || type.includes("number"))) {
        return "simple";
      }
    }
    for (const t of type) {
      if (!isSimpleType(t)) {
        return false;
      }
    }
    return "complex";
  }
  if (isSimpleType(type)) {
    return "simple";
  }
  if (type === "array") {
    if (schema.items) {
      const itemSchemas = Array.isArray(schema.items) ? schema.items : [schema.items];
      for (const { type: type2 } of itemSchemas) {
        if (Array.isArray(type2)) {
          for (const t of type2) {
            if (!isSimpleType(t)) {
              return false;
            }
          }
          return "complex";
        }
        if (!isSimpleType(type2)) {
          return false;
        }
        return "complex";
      }
    }
    return false;
  }
  return false;
}
function getObjectSettingSchemaType({
  key,
  type,
  objectProperties,
  objectPatternProperties,
  objectAdditionalProperties
}) {
  if (type !== "object") {
    return false;
  }
  if (isUndefinedOrNull(objectProperties) && isUndefinedOrNull(objectPatternProperties) && isUndefinedOrNull(objectAdditionalProperties)) {
    return false;
  }
  if ((objectAdditionalProperties === true || objectAdditionalProperties === void 0) && !Object.keys(objectPatternProperties ?? {}).includes(".*")) {
    return false;
  }
  const schemas = [...Object.values(objectProperties ?? {}), ...Object.values(objectPatternProperties ?? {})];
  if (objectAdditionalProperties && typeof objectAdditionalProperties === "object") {
    schemas.push(objectAdditionalProperties);
  }
  let schemaType = "simple";
  for (const schema of schemas) {
    for (const subSchema of Array.isArray(schema.anyOf) ? schema.anyOf : [schema]) {
      const subSchemaType = getObjectRenderableSchemaType(subSchema, key);
      if (subSchemaType === false) {
        return false;
      }
      if (subSchemaType === "complex") {
        schemaType = "complex";
      }
    }
  }
  return schemaType;
}
function settingTypeEnumRenderable(_type) {
  const enumRenderableSettingTypes = ["string", "boolean", "null", "integer", "number"];
  const type = Array.isArray(_type) ? _type : [_type];
  return type.every((type2) => enumRenderableSettingTypes.includes(type2));
}
var SearchResultIdx = /* @__PURE__ */ ((SearchResultIdx2) => {
  SearchResultIdx2[SearchResultIdx2["Local"] = 0] = "Local";
  SearchResultIdx2[SearchResultIdx2["Remote"] = 1] = "Remote";
  SearchResultIdx2[SearchResultIdx2["NewExtensions"] = 2] = "NewExtensions";
  SearchResultIdx2[SearchResultIdx2["Embeddings"] = 3] = "Embeddings";
  SearchResultIdx2[SearchResultIdx2["AiSelected"] = 4] = "AiSelected";
  return SearchResultIdx2;
})(SearchResultIdx || {});
let SearchResultModel = class extends SettingsTreeModel {
  constructor(viewState, settingsOrderByTocIndex, isWorkspaceTrusted, configurationService, environmentService, languageService, userDataProfileService, productService) {
    super(viewState, isWorkspaceTrusted, configurationService, languageService, userDataProfileService, productService, environmentService);
    this.environmentService = environmentService;
    this.rawSearchResults = null;
    this.newExtensionSearchResults = null;
    this.searchResultCount = null;
    this.aiFilterEnabled = false;
    this.id = "searchResultModel";
    this.settingsOrderByTocIndex = settingsOrderByTocIndex;
    this.cachedUniqueSearchResults = /* @__PURE__ */ new Map();
    this.update({ id: "searchResultModel", label: "" });
  }
  set showAiResults(show) {
    this.aiFilterEnabled = show;
    this.updateChildren();
  }
  sortResults(filterMatches) {
    if (this.settingsOrderByTocIndex) {
      for (const match of filterMatches) {
        match.setting.internalOrder = this.settingsOrderByTocIndex.get(match.setting.key);
      }
    }
    if (!this._viewState.query) {
      return filterMatches.sort((a, b) => compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder));
    }
    filterMatches.sort((a, b) => {
      if (a.matchType !== b.matchType) {
        return b.matchType - a.matchType;
      } else if (a.matchType & SettingMatchType.NonContiguousWordsInSettingsLabel || a.matchType & SettingMatchType.ContiguousWordsInSettingsLabel) {
        return b.keyMatchScore - a.keyMatchScore || compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
      } else if (a.matchType === SettingMatchType.RemoteMatch) {
        return b.score - a.score;
      } else {
        return compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
      }
    });
    return arrays.distinct(filterMatches, (match) => match.setting.key);
  }
  getUniqueSearchResults() {
    const cachedResults = this.cachedUniqueSearchResults.get(this.aiFilterEnabled);
    if (cachedResults) {
      return cachedResults;
    }
    if (!this.rawSearchResults) {
      return null;
    }
    let combinedFilterMatches = [];
    if (this.aiFilterEnabled) {
      const aiSelectedKeys = /* @__PURE__ */ new Set();
      const aiSelectedResult = this.rawSearchResults[4 /* AiSelected */];
      if (aiSelectedResult) {
        aiSelectedResult.filterMatches.forEach((m) => aiSelectedKeys.add(m.setting.key));
        combinedFilterMatches = aiSelectedResult.filterMatches;
      }
      const embeddingsResult = this.rawSearchResults[3 /* Embeddings */];
      if (embeddingsResult) {
        embeddingsResult.filterMatches = embeddingsResult.filterMatches.filter((m) => !aiSelectedKeys.has(m.setting.key));
        combinedFilterMatches = combinedFilterMatches.concat(embeddingsResult.filterMatches);
      }
      const result2 = {
        filterMatches: combinedFilterMatches,
        exactMatch: false
      };
      this.cachedUniqueSearchResults.set(true, result2);
      return result2;
    }
    const localMatchKeys = /* @__PURE__ */ new Set();
    const localResult = this.rawSearchResults[0 /* Local */];
    if (localResult) {
      localResult.filterMatches.forEach((m) => localMatchKeys.add(m.setting.key));
      combinedFilterMatches = localResult.filterMatches;
    }
    const remoteResult = this.rawSearchResults[1 /* Remote */];
    if (remoteResult) {
      remoteResult.filterMatches = remoteResult.filterMatches.filter((m) => !localMatchKeys.has(m.setting.key));
      combinedFilterMatches = combinedFilterMatches.concat(remoteResult.filterMatches);
      this.newExtensionSearchResults = this.rawSearchResults[2 /* NewExtensions */];
    }
    combinedFilterMatches = this.sortResults(combinedFilterMatches);
    const result = {
      filterMatches: combinedFilterMatches,
      exactMatch: localResult.exactMatch
      // remote results should never have an exact match
    };
    this.cachedUniqueSearchResults.set(false, result);
    return result;
  }
  getRawResults() {
    return this.rawSearchResults ?? [];
  }
  getUniqueSearchResultSettings() {
    return this.getUniqueSearchResults()?.filterMatches.map((m) => m.setting) ?? [];
  }
  updateChildren() {
    this.update({
      id: "searchResultModel",
      label: "searchResultModel",
      settings: this.getUniqueSearchResultSettings()
    });
    const isRemote = !!this.environmentService.remoteAuthority;
    const newChildren = [];
    for (const child of this.root.children) {
      if (child instanceof SettingsTreeSettingElement && child.matchesAllTags(this._viewState.tagFilters) && child.matchesScope(this._viewState.settingsTarget, isRemote) && child.matchesAnyExtension(this._viewState.extensionFilters) && child.matchesAnyId(this._viewState.idFilters) && child.matchesAnyFeature(this._viewState.featureFilters) && child.matchesAllLanguages(this._viewState.languageFilter)) {
        newChildren.push(child);
      } else {
        child.dispose();
      }
    }
    this.root.children = newChildren;
    this.searchResultCount = this.root.children.length;
    if (this.newExtensionSearchResults?.filterMatches.length) {
      let resultExtensionIds = this.newExtensionSearchResults.filterMatches.map((result) => result.setting).filter((setting) => setting.extensionName && setting.extensionPublisher).map((setting) => `${setting.extensionPublisher}.${setting.extensionName}`);
      resultExtensionIds = arrays.distinct(resultExtensionIds);
      if (resultExtensionIds.length) {
        const newExtElement = new SettingsTreeNewExtensionsElement("newExtensions", resultExtensionIds);
        newExtElement.parent = this._root;
        this._root.children.push(newExtElement);
      }
    }
  }
  setResult(order, result) {
    this.cachedUniqueSearchResults.clear();
    this.newExtensionSearchResults = null;
    if (this.rawSearchResults && order === 0 /* Local */) {
      delete this.rawSearchResults[1 /* Remote */];
    }
    this.rawSearchResults ??= [];
    if (!result) {
      delete this.rawSearchResults[order];
      return;
    }
    this.rawSearchResults[order] = result;
    this.updateChildren();
  }
  getUniqueResultsCount() {
    return this.searchResultCount ?? 0;
  }
};
SearchResultModel = __decorateClass([
  __decorateParam(3, IWorkbenchConfigurationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ILanguageService),
  __decorateParam(6, IUserDataProfileService),
  __decorateParam(7, IProductService)
], SearchResultModel);
const tagRegex = /(^|\s)@tag:("([^"]*)"|[^"]\S*)/g;
const extensionRegex = /(^|\s)@ext:("([^"]*)"|[^"]\S*)?/g;
const featureRegex = /(^|\s)@feature:("([^"]*)"|[^"]\S*)?/g;
const idRegex = /(^|\s)@id:("([^"]*)"|[^"]\S*)?/g;
const languageRegex = /(^|\s)@lang:("([^"]*)"|[^"]\S*)?/g;
function parseQuery(query) {
  function getTagsForType(query2, filterRegex, parsedParts) {
    return query2.replace(filterRegex, (_, __, quotedParsedElement, unquotedParsedElement) => {
      const parsedElement = unquotedParsedElement || quotedParsedElement;
      if (parsedElement) {
        parsedParts.push(...parsedElement.split(",").map((s) => s.trim()).filter((s) => !isFalsyOrWhitespace(s)));
      }
      return "";
    });
  }
  const tags = [];
  query = query.replace(tagRegex, (_, __, quotedTag, tag) => {
    tags.push(tag || quotedTag);
    return "";
  });
  query = query.replace(`@${MODIFIED_SETTING_TAG}`, () => {
    tags.push(MODIFIED_SETTING_TAG);
    return "";
  });
  query = query.replace(`@${POLICY_SETTING_TAG}`, () => {
    tags.push(POLICY_SETTING_TAG);
    return "";
  });
  query = query.replace(`@${AGENTS_WINDOW_SETTING_TAG}`, () => {
    tags.push(AGENTS_WINDOW_SETTING_TAG);
    return "";
  });
  query = query.replace(/@stable/g, () => {
    tags.push("stable");
    return "";
  });
  const extensions = [];
  const features = [];
  const ids = [];
  const langs = [];
  query = getTagsForType(query, extensionRegex, extensions);
  query = getTagsForType(query, featureRegex, features);
  query = getTagsForType(query, idRegex, ids);
  if (ENABLE_LANGUAGE_FILTER) {
    query = getTagsForType(query, languageRegex, langs);
  }
  query = query.trim();
  return {
    tags,
    extensionFilters: extensions,
    featureFilters: features,
    idFilters: ids,
    languageFilter: langs.length ? langs[0] : void 0,
    query
  };
}
export {
  ONLINE_SERVICES_SETTING_TAG,
  SearchResultIdx,
  SearchResultModel,
  SettingsTreeElement,
  SettingsTreeGroupElement,
  SettingsTreeModel,
  SettingsTreeNewExtensionsElement,
  SettingsTreeSettingElement,
  inspectSetting,
  objectSettingSupportsRemoveDefaultValue,
  parseQuery,
  sanitizeId,
  settingKeyToDisplayFormat
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxzZXR0aW5nc1RyZWVNb2RlbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycywgaXNGYWxzeU9yV2hpdGVzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWRPck51bGwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIGdldExhbmd1YWdlVGFnU2V0dGluZ1BsYWluS2V5LCBJQ29uZmlndXJhdGlvblZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uRGVmYXVsdFZhbHVlU291cmNlLCBDb25maWd1cmF0aW9uU2NvcGUsIEVkaXRQcmVzZW50YXRpb25UeXBlcywgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVU0VSX0xPQ0FMX0FORF9SRU1PVEVfU0VUVElOR1MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IEFQUExJQ0FUSU9OX1NDT1BFUywgRk9MREVSX1NDT1BFUywgSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBMT0NBTF9NQUNISU5FX1NDT1BFUywgUkVNT1RFX01BQ0hJTkVfU0NPUEVTLCBXT1JLU1BBQ0VfU0NPUEVTIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2V0dGluZywgSVNlYXJjaFJlc3VsdCwgSVNldHRpbmcsIElTZXR0aW5nTWF0Y2gsIFNldHRpbmdNYXRjaFR5cGUsIFNldHRpbmdWYWx1ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfV0lORE9XX1NFVFRJTkdfVEFHLCBFTkFCTEVfRVhURU5TSU9OX1RPR0dMRV9TRVRUSU5HUywgRU5BQkxFX0xBTkdVQUdFX0ZJTFRFUiwgTU9ESUZJRURfU0VUVElOR19UQUcsIFBPTElDWV9TRVRUSU5HX1RBRywgUkVRVUlSRV9UUlVTVEVEX1dPUktTUEFDRV9TRVRUSU5HX1RBRywgY29tcGFyZVR3b051bGxhYmxlTnVtYmVycywgd29yZGlmeUtleSB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc1RhcmdldCB9IGZyb20gJy4vcHJlZmVyZW5jZXNXaWRnZXRzLmpzJztcbmltcG9ydCB7IElUT0NFbnRyeSwgdG9jRGF0YSB9IGZyb20gJy4vc2V0dGluZ3NMYXlvdXQuanMnO1xuXG5leHBvcnQgY29uc3QgT05MSU5FX1NFUlZJQ0VTX1NFVFRJTkdfVEFHID0gJ3VzZXNPbmxpbmVTZXJ2aWNlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdzRWRpdG9yVmlld1N0YXRlIHtcblx0c2V0dGluZ3NUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0O1xuXHRxdWVyeT86IHN0cmluZzsgLy8gdXNlZCB0byBrZWVwIHRyYWNrIG9mIGxvYWRpbmcgZnJvbSBzZXRJbnB1dCB2cyBsb2FkaW5nIGZyb20gY2FjaGVcblx0dGFnRmlsdGVycz86IFNldDxzdHJpbmc+O1xuXHRleHRlbnNpb25GaWx0ZXJzPzogU2V0PHN0cmluZz47XG5cdGZlYXR1cmVGaWx0ZXJzPzogU2V0PHN0cmluZz47XG5cdGlkRmlsdGVycz86IFNldDxzdHJpbmc+O1xuXHRsYW5ndWFnZUZpbHRlcj86IHN0cmluZztcblx0Y2F0ZWdvcnlGaWx0ZXI/OiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQ7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBTZXR0aW5nc1RyZWVFbGVtZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGlkOiBzdHJpbmc7XG5cdHBhcmVudD86IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudDtcblxuXHRwcml2YXRlIF90YWJiYWJsZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGFiYmFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlVGFiYmFibGUoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVRhYmJhYmxlLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoX2lkOiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuaWQgPSBfaWQ7XG5cdH1cblxuXHRnZXQgdGFiYmFibGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RhYmJhYmxlO1xuXHR9XG5cblx0c2V0IHRhYmJhYmxlKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fdGFiYmFibGUgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRhYmJhYmxlLmZpcmUoKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBTZXR0aW5nc1RyZWVHcm91cENoaWxkID0gKFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCB8IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50IHwgU2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQpO1xuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50IGV4dGVuZHMgU2V0dGluZ3NUcmVlRWxlbWVudCB7XG5cdGNvdW50PzogbnVtYmVyO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRsZXZlbDogbnVtYmVyO1xuXHRpc0ZpcnN0R3JvdXA6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfY2hpbGRTZXR0aW5nS2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdHByaXZhdGUgX2NoaWxkcmVuOiBTZXR0aW5nc1RyZWVHcm91cENoaWxkW10gPSBbXTtcblxuXHRnZXQgY2hpbGRyZW4oKTogU2V0dGluZ3NUcmVlR3JvdXBDaGlsZFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hpbGRyZW47XG5cdH1cblxuXHRzZXQgY2hpbGRyZW4obmV3Q2hpbGRyZW46IFNldHRpbmdzVHJlZUdyb3VwQ2hpbGRbXSkge1xuXHRcdHRoaXMuX2NoaWxkcmVuID0gbmV3Q2hpbGRyZW47XG5cblx0XHR0aGlzLl9jaGlsZFNldHRpbmdLZXlzID0gbmV3IFNldCgpO1xuXHRcdHRoaXMuX2NoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4ge1xuXHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fY2hpbGRTZXR0aW5nS2V5cy5hZGQoY2hpbGQuc2V0dGluZy5rZXkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoX2lkOiBzdHJpbmcsIGNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQsIGxhYmVsOiBzdHJpbmcsIGxldmVsOiBudW1iZXIsIGlzRmlyc3RHcm91cDogYm9vbGVhbikge1xuXHRcdHN1cGVyKF9pZCk7XG5cblx0XHR0aGlzLmNvdW50ID0gY291bnQ7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMubGV2ZWwgPSBsZXZlbDtcblx0XHR0aGlzLmlzRmlyc3RHcm91cCA9IGlzRmlyc3RHcm91cDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhpcyBncm91cCBjb250YWlucyB0aGUgZ2l2ZW4gY2hpbGQga2V5ICh0byBhIGRlcHRoIG9mIDEgb25seSlcblx0ICovXG5cdGNvbnRhaW5zU2V0dGluZyhrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGlsZFNldHRpbmdLZXlzLmhhcyhrZXkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RyZWVOZXdFeHRlbnNpb25zRWxlbWVudCBleHRlbmRzIFNldHRpbmdzVHJlZUVsZW1lbnQge1xuXHRjb25zdHJ1Y3RvcihfaWQ6IHN0cmluZywgcHVibGljIHJlYWRvbmx5IGV4dGVuc2lvbklkczogc3RyaW5nW10pIHtcblx0XHRzdXBlcihfaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCBleHRlbmRzIFNldHRpbmdzVHJlZUVsZW1lbnQge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfREVTQ19MSU5FUyA9IDIwO1xuXG5cdHNldHRpbmc6IElTZXR0aW5nO1xuXG5cdHByaXZhdGUgX2Rpc3BsYXlDYXRlZ29yeTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2Rpc3BsYXlMYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0LyoqXG5cdCAqIHNjb3BlVmFsdWUgfHwgZGVmYXVsdFZhbHVlLCBmb3IgcmVuZGVyaW5nIGNvbnZlbmllbmNlLlxuXHQgKi9cblx0dmFsdWU6IGFueTtcblxuXHQvKipcblx0ICogVGhlIHZhbHVlIGluIHRoZSBjdXJyZW50IHNldHRpbmdzIHNjb3BlLlxuXHQgKi9cblx0c2NvcGVWYWx1ZTogYW55O1xuXG5cdC8qKlxuXHQgKiBUaGUgZGVmYXVsdCB2YWx1ZVxuXHQgKi9cblx0ZGVmYXVsdFZhbHVlPzogYW55O1xuXG5cdC8qKlxuXHQgKiBUaGUgc291cmNlIG9mIHRoZSBkZWZhdWx0IHZhbHVlIHRvIGRpc3BsYXkuXG5cdCAqIFRoaXMgdmFsdWUgYWxzbyBhY2NvdW50cyBmb3IgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIGxhbmd1YWdlLXNwZWNpZmljIGRlZmF1bHQgdmFsdWUgb3ZlcnJpZGVzLlxuXHQgKi9cblx0ZGVmYXVsdFZhbHVlU291cmNlOiBDb25maWd1cmF0aW9uRGVmYXVsdFZhbHVlU291cmNlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzZXR0aW5nIGlzIGNvbmZpZ3VyZWQgaW4gdGhlIHNlbGVjdGVkIHNjb3BlLlxuXHQgKi9cblx0aXNDb25maWd1cmVkID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHNldHRpbmcgcmVxdWlyZXMgdHJ1c3RlZCB0YXJnZXRcblx0ICovXG5cdGlzVW50cnVzdGVkID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHNldHRpbmcgaXMgdW5kZXIgYSBwb2xpY3kgdGhhdCBibG9ja3MgYWxsIGNoYW5nZXMuXG5cdCAqL1xuXHRoYXNQb2xpY3lWYWx1ZSA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzZXR0aW5nIGlzIHJlYWQtb25seSBpbiB0aGUgQWdlbnRzIHdpbmRvdy5cblx0ICovXG5cdGlzQWdlbnRzV2luZG93UmVhZE9ubHkgPSBmYWxzZTtcblxuXHR0YWdzPzogU2V0PHN0cmluZz47XG5cdG92ZXJyaWRkZW5TY29wZUxpc3Q6IHN0cmluZ1tdID0gW107XG5cdG92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdDogc3RyaW5nW10gPSBbXTtcblxuXHQvKipcblx0ICogRm9yIGVhY2ggbGFuZ3VhZ2UgdGhhdCBjb250cmlidXRlcyBzZXR0aW5nIHZhbHVlcyBvciBkZWZhdWx0IG92ZXJyaWRlcywgd2UgY2FuIHNlZSB0aG9zZSB2YWx1ZXMgaGVyZS5cblx0ICovXG5cdGxhbmd1YWdlT3ZlcnJpZGVWYWx1ZXM6IE1hcDxzdHJpbmcsIElDb25maWd1cmF0aW9uVmFsdWU8dW5rbm93bj4+ID0gbmV3IE1hcDxzdHJpbmcsIElDb25maWd1cmF0aW9uVmFsdWU8dW5rbm93bj4+KCk7XG5cblx0ZGVzY3JpcHRpb24hOiBzdHJpbmc7XG5cdHZhbHVlVHlwZSE6IFNldHRpbmdWYWx1ZVR5cGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c2V0dGluZzogSVNldHRpbmcsXG5cdFx0cGFyZW50OiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQsXG5cdFx0cmVhZG9ubHkgc2V0dGluZ3NUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNXb3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGaWx0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpc1Nlc3Npb25zV2luZG93OiBib29sZWFuLFxuXHQpIHtcblx0XHRzdXBlcihzYW5pdGl6ZUlkKHBhcmVudC5pZCArICdfJyArIHNldHRpbmcua2V5KSk7XG5cdFx0dGhpcy5zZXR0aW5nID0gc2V0dGluZztcblx0XHR0aGlzLnBhcmVudCA9IHBhcmVudDtcblxuXHRcdC8vIE1ha2Ugc3VyZSBkZXNjcmlwdGlvbiBhbmQgdmFsdWVUeXBlIGFyZSBpbml0aWFsaXplZFxuXHRcdHRoaXMuaW5pdFNldHRpbmdEZXNjcmlwdGlvbigpO1xuXHRcdHRoaXMuaW5pdFNldHRpbmdWYWx1ZVR5cGUoKTtcblx0fVxuXG5cdGdldCBkaXNwbGF5Q2F0ZWdvcnkoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX2Rpc3BsYXlDYXRlZ29yeSkge1xuXHRcdFx0dGhpcy5pbml0TGFiZWxzKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3BsYXlDYXRlZ29yeSE7XG5cdH1cblxuXHRnZXQgZGlzcGxheUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9kaXNwbGF5TGFiZWwpIHtcblx0XHRcdHRoaXMuaW5pdExhYmVscygpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9kaXNwbGF5TGFiZWwhO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0TGFiZWxzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNldHRpbmcudGl0bGUpIHtcblx0XHRcdHRoaXMuX2Rpc3BsYXlMYWJlbCA9IHRoaXMuc2V0dGluZy50aXRsZTtcblx0XHRcdHRoaXMuX2Rpc3BsYXlDYXRlZ29yeSA9IHRoaXMuc2V0dGluZy5jYXRlZ29yeUxhYmVsID8/IG51bGw7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3BsYXlLZXlGb3JtYXQgPSBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KHRoaXMuc2V0dGluZy5rZXksIHRoaXMucGFyZW50IS5pZCwgdGhpcy5zZXR0aW5nLmlzTGFuZ3VhZ2VUYWdTZXR0aW5nKTtcblx0XHR0aGlzLl9kaXNwbGF5TGFiZWwgPSBkaXNwbGF5S2V5Rm9ybWF0LmxhYmVsO1xuXHRcdHRoaXMuX2Rpc3BsYXlDYXRlZ29yeSA9IGRpc3BsYXlLZXlGb3JtYXQuY2F0ZWdvcnk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRTZXR0aW5nRGVzY3JpcHRpb24oKSB7XG5cdFx0aWYgKHRoaXMuc2V0dGluZy5kZXNjcmlwdGlvbi5sZW5ndGggPiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudC5NQVhfREVTQ19MSU5FUykge1xuXHRcdFx0Y29uc3QgdHJ1bmNhdGVkRGVzY0xpbmVzID0gdGhpcy5zZXR0aW5nLmRlc2NyaXB0aW9uLnNsaWNlKDAsIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50Lk1BWF9ERVNDX0xJTkVTKTtcblx0XHRcdHRydW5jYXRlZERlc2NMaW5lcy5wdXNoKCdbLi4uXScpO1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvbiA9IHRydW5jYXRlZERlc2NMaW5lcy5qb2luKCdcXG4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvbiA9IHRoaXMuc2V0dGluZy5kZXNjcmlwdGlvbi5qb2luKCdcXG4nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluaXRTZXR0aW5nVmFsdWVUeXBlKCkge1xuXHRcdGlmIChpc0V4dGVuc2lvblRvZ2dsZVNldHRpbmcodGhpcy5zZXR0aW5nLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKSkge1xuXHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkV4dGVuc2lvblRvZ2dsZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2V0dGluZy5lbnVtICYmICghdGhpcy5zZXR0aW5nLnR5cGUgfHwgc2V0dGluZ1R5cGVFbnVtUmVuZGVyYWJsZSh0aGlzLnNldHRpbmcudHlwZSkpKSB7XG5cdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuRW51bTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2V0dGluZy50eXBlID09PSAnc3RyaW5nJykge1xuXHRcdFx0aWYgKHRoaXMuc2V0dGluZy5lZGl0UHJlc2VudGF0aW9uID09PSBFZGl0UHJlc2VudGF0aW9uVHlwZXMuTXVsdGlsaW5lKSB7XG5cdFx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5NdWx0aWxpbmVTdHJpbmc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuU3RyaW5nO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNFeGNsdWRlU2V0dGluZyh0aGlzLnNldHRpbmcpKSB7XG5cdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuRXhjbHVkZTtcblx0XHR9IGVsc2UgaWYgKGlzSW5jbHVkZVNldHRpbmcodGhpcy5zZXR0aW5nKSkge1xuXHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkluY2x1ZGU7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNldHRpbmcudHlwZSA9PT0gJ2ludGVnZXInKSB7XG5cdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuSW50ZWdlcjtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2V0dGluZy50eXBlID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLk51bWJlcjtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2V0dGluZy50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5Cb29sZWFuO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZXR0aW5nLnR5cGUgPT09ICdhcnJheScgJiYgdGhpcy5zZXR0aW5nLmFycmF5SXRlbVR5cGUgJiZcblx0XHRcdFsnc3RyaW5nJywgJ2VudW0nLCAnbnVtYmVyJywgJ2ludGVnZXInXS5pbmNsdWRlcyh0aGlzLnNldHRpbmcuYXJyYXlJdGVtVHlwZSkpIHtcblx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5BcnJheTtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodGhpcy5zZXR0aW5nLnR5cGUpICYmIHRoaXMuc2V0dGluZy50eXBlLmluY2x1ZGVzKFNldHRpbmdWYWx1ZVR5cGUuTnVsbCkgJiYgdGhpcy5zZXR0aW5nLnR5cGUubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRpZiAodGhpcy5zZXR0aW5nLnR5cGUuaW5jbHVkZXMoU2V0dGluZ1ZhbHVlVHlwZS5JbnRlZ2VyKSkge1xuXHRcdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuTnVsbGFibGVJbnRlZ2VyO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnNldHRpbmcudHlwZS5pbmNsdWRlcyhTZXR0aW5nVmFsdWVUeXBlLk51bWJlcikpIHtcblx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLk51bGxhYmxlTnVtYmVyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkNvbXBsZXg7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNjaGVtYVR5cGUgPSBnZXRPYmplY3RTZXR0aW5nU2NoZW1hVHlwZSh0aGlzLnNldHRpbmcpO1xuXHRcdFx0aWYgKHNjaGVtYVR5cGUpIHtcblx0XHRcdFx0aWYgKHRoaXMuc2V0dGluZy5hbGxLZXlzQXJlQm9vbGVhbikge1xuXHRcdFx0XHRcdHRoaXMudmFsdWVUeXBlID0gU2V0dGluZ1ZhbHVlVHlwZS5Cb29sZWFuT2JqZWN0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNjaGVtYVR5cGUgPT09ICdzaW1wbGUnKSB7XG5cdFx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLk9iamVjdDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnZhbHVlVHlwZSA9IFNldHRpbmdWYWx1ZVR5cGUuQ29tcGxleE9iamVjdDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnNldHRpbmcuaXNMYW5ndWFnZVRhZ1NldHRpbmcpIHtcblx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkxhbmd1YWdlVGFnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52YWx1ZVR5cGUgPSBTZXR0aW5nVmFsdWVUeXBlLkNvbXBsZXg7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aW5zcGVjdFNlbGYoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0VG9JbnNwZWN0ID0gdGhpcy5nZXRUYXJnZXRUb0luc3BlY3QodGhpcy5zZXR0aW5nKTtcblx0XHRjb25zdCBpbnNwZWN0UmVzdWx0ID0gaW5zcGVjdFNldHRpbmcodGhpcy5zZXR0aW5nLmtleSwgdGFyZ2V0VG9JbnNwZWN0LCB0aGlzLmxhbmd1YWdlRmlsdGVyLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLnVwZGF0ZShpbnNwZWN0UmVzdWx0LCB0aGlzLmlzV29ya3NwYWNlVHJ1c3RlZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhcmdldFRvSW5zcGVjdChzZXR0aW5nOiBJU2V0dGluZyk6IFNldHRpbmdzVGFyZ2V0IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQgJiYgIXRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LnNldHRpbmdzKSB7XG5cdFx0XHRpZiAoc2V0dGluZy5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OKSB7XG5cdFx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaXNTZXR0aW5nQXBwbGllZEZvckFsbFByb2ZpbGVzKHNldHRpbmcua2V5KSAmJiB0aGlzLnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpIHtcblx0XHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT047XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnNldHRpbmdzVGFyZ2V0O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoaW5zcGVjdFJlc3VsdDogSUluc3BlY3RSZXN1bHQsIGlzV29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCB7IGlzQ29uZmlndXJlZCwgaW5zcGVjdGVkLCB0YXJnZXRTZWxlY3RvciwgaW5zcGVjdGVkTGFuZ3VhZ2VPdmVycmlkZXMsIGxhbmd1YWdlU2VsZWN0b3IgfSA9IGluc3BlY3RSZXN1bHQ7XG5cblx0XHRzd2l0Y2ggKHRhcmdldFNlbGVjdG9yKSB7XG5cdFx0XHRjYXNlICd3b3Jrc3BhY2VGb2xkZXJWYWx1ZSc6XG5cdFx0XHRjYXNlICd3b3Jrc3BhY2VWYWx1ZSc6XG5cdFx0XHRcdHRoaXMuaXNVbnRydXN0ZWQgPSAhIXRoaXMuc2V0dGluZy5yZXN0cmljdGVkICYmICFpc1dvcmtzcGFjZVRydXN0ZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGxldCBkaXNwbGF5VmFsdWUgPSBpc0NvbmZpZ3VyZWQgPyBpbnNwZWN0ZWRbdGFyZ2V0U2VsZWN0b3JdIDogaW5zcGVjdGVkLmRlZmF1bHRWYWx1ZTtcblx0XHRjb25zdCBvdmVycmlkZGVuU2NvcGVMaXN0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdDogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoKGxhbmd1YWdlU2VsZWN0b3IgfHwgdGFyZ2V0U2VsZWN0b3IgIT09ICd3b3Jrc3BhY2VWYWx1ZScpICYmIHR5cGVvZiBpbnNwZWN0ZWQud29ya3NwYWNlVmFsdWUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRvdmVycmlkZGVuU2NvcGVMaXN0LnB1c2goJ3dvcmtzcGFjZTonKTtcblx0XHR9XG5cdFx0aWYgKChsYW5ndWFnZVNlbGVjdG9yIHx8IHRhcmdldFNlbGVjdG9yICE9PSAndXNlclJlbW90ZVZhbHVlJykgJiYgdHlwZW9mIGluc3BlY3RlZC51c2VyUmVtb3RlVmFsdWUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRvdmVycmlkZGVuU2NvcGVMaXN0LnB1c2goJ3JlbW90ZTonKTtcblx0XHR9XG5cdFx0aWYgKChsYW5ndWFnZVNlbGVjdG9yIHx8IHRhcmdldFNlbGVjdG9yICE9PSAndXNlckxvY2FsVmFsdWUnKSAmJiB0eXBlb2YgaW5zcGVjdGVkLnVzZXJMb2NhbFZhbHVlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0b3ZlcnJpZGRlblNjb3BlTGlzdC5wdXNoKCd1c2VyOicpO1xuXHRcdH1cblxuXHRcdGlmIChpbnNwZWN0ZWQub3ZlcnJpZGVJZGVudGlmaWVycykge1xuXHRcdFx0Zm9yIChjb25zdCBvdmVycmlkZUlkZW50aWZpZXIgb2YgaW5zcGVjdGVkLm92ZXJyaWRlSWRlbnRpZmllcnMpIHtcblx0XHRcdFx0Y29uc3QgaW5zcGVjdGVkT3ZlcnJpZGUgPSBpbnNwZWN0ZWRMYW5ndWFnZU92ZXJyaWRlcy5nZXQob3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHRcdFx0aWYgKGluc3BlY3RlZE92ZXJyaWRlKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQob3ZlcnJpZGVJZGVudGlmaWVyKSkge1xuXHRcdFx0XHRcdFx0aWYgKGxhbmd1YWdlU2VsZWN0b3IgIT09IG92ZXJyaWRlSWRlbnRpZmllciAmJiB0eXBlb2YgaW5zcGVjdGVkT3ZlcnJpZGUuZGVmYXVsdD8ub3ZlcnJpZGUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRcdG92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdC5wdXNoKG92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoKGxhbmd1YWdlU2VsZWN0b3IgIT09IG92ZXJyaWRlSWRlbnRpZmllciB8fCB0YXJnZXRTZWxlY3RvciAhPT0gJ3dvcmtzcGFjZVZhbHVlJykgJiYgdHlwZW9mIGluc3BlY3RlZE92ZXJyaWRlLndvcmtzcGFjZT8ub3ZlcnJpZGUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRcdG92ZXJyaWRkZW5TY29wZUxpc3QucHVzaChgd29ya3NwYWNlOiR7b3ZlcnJpZGVJZGVudGlmaWVyfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKChsYW5ndWFnZVNlbGVjdG9yICE9PSBvdmVycmlkZUlkZW50aWZpZXIgfHwgdGFyZ2V0U2VsZWN0b3IgIT09ICd1c2VyUmVtb3RlVmFsdWUnKSAmJiB0eXBlb2YgaW5zcGVjdGVkT3ZlcnJpZGUudXNlclJlbW90ZT8ub3ZlcnJpZGUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHRcdG92ZXJyaWRkZW5TY29wZUxpc3QucHVzaChgcmVtb3RlOiR7b3ZlcnJpZGVJZGVudGlmaWVyfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKChsYW5ndWFnZVNlbGVjdG9yICE9PSBvdmVycmlkZUlkZW50aWZpZXIgfHwgdGFyZ2V0U2VsZWN0b3IgIT09ICd1c2VyTG9jYWxWYWx1ZScpICYmIHR5cGVvZiBpbnNwZWN0ZWRPdmVycmlkZS51c2VyTG9jYWw/Lm92ZXJyaWRlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0XHRvdmVycmlkZGVuU2NvcGVMaXN0LnB1c2goYHVzZXI6JHtvdmVycmlkZUlkZW50aWZpZXJ9YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMubGFuZ3VhZ2VPdmVycmlkZVZhbHVlcy5zZXQob3ZlcnJpZGVJZGVudGlmaWVyLCBpbnNwZWN0ZWRPdmVycmlkZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5vdmVycmlkZGVuU2NvcGVMaXN0ID0gb3ZlcnJpZGRlblNjb3BlTGlzdDtcblx0XHR0aGlzLm92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdCA9IG92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdDtcblxuXHRcdC8vIFRoZSB1c2VyIG1pZ2h0IGhhdmUgYWRkZWQsIHJlbW92ZWQsIG9yIG1vZGlmaWVkIGEgbGFuZ3VhZ2UgZmlsdGVyLFxuXHRcdC8vIHNvIHdlIHJlc2V0IHRoZSBkZWZhdWx0IHZhbHVlIHNvdXJjZSB0byB0aGUgbm9uLWxhbmd1YWdlLXNwZWNpZmljIGRlZmF1bHQgdmFsdWUgc291cmNlIGZvciBub3cuXG5cdFx0dGhpcy5kZWZhdWx0VmFsdWVTb3VyY2UgPSB0aGlzLnNldHRpbmcubm9uTGFuZ3VhZ2VTcGVjaWZpY0RlZmF1bHRWYWx1ZVNvdXJjZTtcblxuXHRcdGlmIChpbnNwZWN0ZWQucG9saWN5VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5oYXNQb2xpY3lWYWx1ZSA9IHRydWU7XG5cdFx0XHRpc0NvbmZpZ3VyZWQgPSBmYWxzZTsgLy8gVGhlIHVzZXIgZGlkIG5vdCBtYW51YWxseSBjb25maWd1cmUgdGhlIHNldHRpbmcgdGhlbXNlbHZlcy5cblx0XHRcdGRpc3BsYXlWYWx1ZSA9IGluc3BlY3RlZC5wb2xpY3lWYWx1ZTtcblx0XHRcdHRoaXMuc2NvcGVWYWx1ZSA9IGluc3BlY3RlZC5wb2xpY3lWYWx1ZTtcblx0XHRcdHRoaXMuZGVmYXVsdFZhbHVlID0gaW5zcGVjdGVkLmRlZmF1bHRWYWx1ZTtcblx0XHR9IGVsc2UgaWYgKGxhbmd1YWdlU2VsZWN0b3IgJiYgdGhpcy5sYW5ndWFnZU92ZXJyaWRlVmFsdWVzLmhhcyhsYW5ndWFnZVNlbGVjdG9yKSkge1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVWYWx1ZXMgPSB0aGlzLmxhbmd1YWdlT3ZlcnJpZGVWYWx1ZXMuZ2V0KGxhbmd1YWdlU2VsZWN0b3IpITtcblx0XHRcdC8vIEluIHRoZSB3b3JzdCBjYXNlLCBnbyBiYWNrIHRvIHVzaW5nIHRoZSBwcmV2aW91cyBkaXNwbGF5IHZhbHVlLlxuXHRcdFx0Ly8gQWxzbywgc29tZXRpbWVzIHRoZSBvdmVycmlkZSBpcyBpbiB0aGUgZm9ybSBvZiBhIGRlZmF1bHQgdmFsdWUgb3ZlcnJpZGUsIHNvIGNvbnNpZGVyIHRoYXQgc2Vjb25kLlxuXHRcdFx0ZGlzcGxheVZhbHVlID0gKGlzQ29uZmlndXJlZCA/IG92ZXJyaWRlVmFsdWVzW3RhcmdldFNlbGVjdG9yXSA6IG92ZXJyaWRlVmFsdWVzLmRlZmF1bHRWYWx1ZSkgPz8gZGlzcGxheVZhbHVlO1xuXHRcdFx0dGhpcy5zY29wZVZhbHVlID0gaXNDb25maWd1cmVkICYmIG92ZXJyaWRlVmFsdWVzW3RhcmdldFNlbGVjdG9yXTtcblx0XHRcdHRoaXMuZGVmYXVsdFZhbHVlID0gb3ZlcnJpZGVWYWx1ZXMuZGVmYXVsdFZhbHVlID8/IGluc3BlY3RlZC5kZWZhdWx0VmFsdWU7XG5cblx0XHRcdGNvbnN0IHJlZ2lzdHJ5VmFsdWVzID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMoKTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IHJlZ2lzdHJ5VmFsdWVzLmdldChgWyR7bGFuZ3VhZ2VTZWxlY3Rvcn1dYCk/LnNvdXJjZTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlVmFsdWVTb3VyY2UgPSBzb3VyY2UgaW5zdGFuY2VvZiBNYXAgPyBzb3VyY2UuZ2V0KHRoaXMuc2V0dGluZy5rZXkpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG92ZXJyaWRlVmFsdWVTb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5kZWZhdWx0VmFsdWVTb3VyY2UgPSBvdmVycmlkZVZhbHVlU291cmNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNjb3BlVmFsdWUgPSBpc0NvbmZpZ3VyZWQgJiYgaW5zcGVjdGVkW3RhcmdldFNlbGVjdG9yXTtcblx0XHRcdHRoaXMuZGVmYXVsdFZhbHVlID0gaW5zcGVjdGVkLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cblx0XHRsZXQgaGFzQWdlbnRzV2luZG93T3ZlcnJpZGUgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0eSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVt0aGlzLnNldHRpbmcua2V5XTtcblx0XHRcdGhhc0FnZW50c1dpbmRvd092ZXJyaWRlID0gISFwcm9wZXJ0eT8uYWdlbnRzV2luZG93O1xuXHRcdFx0dGhpcy5pc0FnZW50c1dpbmRvd1JlYWRPbmx5ID0gISFwcm9wZXJ0eT8uYWdlbnRzV2luZG93Py5yZWFkT25seTtcblx0XHRcdGlmICh0aGlzLmlzQWdlbnRzV2luZG93UmVhZE9ubHkpIHtcblx0XHRcdFx0aXNDb25maWd1cmVkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZSA9IGRpc3BsYXlWYWx1ZTtcblx0XHR0aGlzLmlzQ29uZmlndXJlZCA9IGlzQ29uZmlndXJlZDtcblx0XHRpZiAoaXNDb25maWd1cmVkIHx8IHRoaXMuc2V0dGluZy50YWdzIHx8IHRoaXMudGFncyB8fCB0aGlzLnNldHRpbmcucmVzdHJpY3RlZCB8fCB0aGlzLmhhc1BvbGljeVZhbHVlIHx8IGhhc0FnZW50c1dpbmRvd092ZXJyaWRlKSB7XG5cdFx0XHQvLyBEb24ndCBjcmVhdGUgYW4gZW1wdHkgU2V0IGZvciBhbGwgMTAwMCBzZXR0aW5ncywgb25seSBpZiBuZWVkZWRcblx0XHRcdHRoaXMudGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0aWYgKGlzQ29uZmlndXJlZCkge1xuXHRcdFx0XHR0aGlzLnRhZ3MuYWRkKE1PRElGSUVEX1NFVFRJTkdfVEFHKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXR0aW5nLnRhZ3M/LmZvckVhY2godGFnID0+IHRoaXMudGFncyEuYWRkKHRhZykpO1xuXG5cdFx0XHRpZiAodGhpcy5zZXR0aW5nLnJlc3RyaWN0ZWQpIHtcblx0XHRcdFx0dGhpcy50YWdzLmFkZChSRVFVSVJFX1RSVVNURURfV09SS1NQQUNFX1NFVFRJTkdfVEFHKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaGFzUG9saWN5VmFsdWUpIHtcblx0XHRcdFx0dGhpcy50YWdzLmFkZChQT0xJQ1lfU0VUVElOR19UQUcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFzQWdlbnRzV2luZG93T3ZlcnJpZGUpIHtcblx0XHRcdFx0dGhpcy50YWdzLmFkZChBR0VOVFNfV0lORE9XX1NFVFRJTkdfVEFHKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRtYXRjaGVzQWxsVGFncyh0YWdGaWx0ZXJzPzogU2V0PHN0cmluZz4pOiBib29sZWFuIHtcblx0XHRpZiAoIXRhZ0ZpbHRlcnM/LnNpemUpIHtcblx0XHRcdC8vIFRoaXMgc2V0dGluZywgd2hpY2ggbWF5IGhhdmUgdGFncyxcblx0XHRcdC8vIG1hdGNoZXMgYWdhaW5zdCBhIHF1ZXJ5IHdpdGggbm8gdGFncy5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy50YWdzKSB7XG5cdFx0XHQvLyBUaGUgc2V0dGluZyBtdXN0IGluc3BlY3QgaXRzZWxmIHRvIGdldCB0YWcgaW5mb3JtYXRpb25cblx0XHRcdC8vIGluY2x1ZGluZyBmb3IgdGhlIGhhc1BvbGljeSB0YWcuXG5cdFx0XHR0aGlzLmluc3BlY3RTZWxmKCk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIHRoZSBzcGVjaWFsICdzdGFibGUnIHRhZyBmaWx0ZXJcblx0XHRpZiAodGFnRmlsdGVycy5oYXMoJ3N0YWJsZScpKSB7XG5cdFx0XHQvLyBGb3Igc3RhYmxlIGZpbHRlciwgZXhjbHVkZSBwcmV2aWV3IGFuZCBleHBlcmltZW50YWwgc2V0dGluZ3Ncblx0XHRcdGlmICh0aGlzLnRhZ3M/LmhhcygncHJldmlldycpIHx8IHRoaXMudGFncz8uaGFzKCdleHBlcmltZW50YWwnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHQvLyBDaGVjayBvdGhlciBmaWx0ZXJzIChleGNsdWRpbmcgJ3N0YWJsZScgaXRzZWxmKVxuXHRcdFx0Y29uc3Qgb3RoZXJGaWx0ZXJzID0gbmV3IFNldChBcnJheS5mcm9tKHRhZ0ZpbHRlcnMpLmZpbHRlcih0YWcgPT4gdGFnICE9PSAnc3RhYmxlJykpO1xuXHRcdFx0aWYgKG90aGVyRmlsdGVycy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICEhdGhpcy50YWdzPy5zaXplICYmXG5cdFx0XHRcdEFycmF5LmZyb20ob3RoZXJGaWx0ZXJzKS5ldmVyeSh0YWcgPT4gdGhpcy50YWdzIS5oYXModGFnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhhdCB0aGUgZmlsdGVyIHRhZ3MgYXJlIGEgc3Vic2V0IG9mIHRoaXMgc2V0dGluZydzIHRhZ3Ncblx0XHRyZXR1cm4gISF0aGlzLnRhZ3M/LnNpemUgJiZcblx0XHRcdEFycmF5LmZyb20odGFnRmlsdGVycykuZXZlcnkodGFnID0+IHRoaXMudGFncyEuaGFzKHRhZykpO1xuXHR9XG5cblx0bWF0Y2hlc1Njb3BlKHNjb3BlOiBTZXR0aW5nc1RhcmdldCwgaXNSZW1vdGU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBjb25maWdUYXJnZXQgPSBVUkkuaXNVcmkoc2NvcGUpID8gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIDogc2NvcGU7XG5cblx0XHRpZiAoIXRoaXMuc2V0dGluZy5zY29wZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5BUFBMSUNBVElPTikge1xuXHRcdFx0cmV0dXJuIEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyh0aGlzLnNldHRpbmcuc2NvcGUpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWdUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUikge1xuXHRcdFx0cmV0dXJuIEZPTERFUl9TQ09QRVMuaW5jbHVkZXModGhpcy5zZXR0aW5nLnNjb3BlKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlnVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0cmV0dXJuIFdPUktTUEFDRV9TQ09QRVMuaW5jbHVkZXModGhpcy5zZXR0aW5nLnNjb3BlKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlnVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFKSB7XG5cdFx0XHRyZXR1cm4gUkVNT1RFX01BQ0hJTkVfU0NPUEVTLmluY2x1ZGVzKHRoaXMuc2V0dGluZy5zY29wZSkgfHwgVVNFUl9MT0NBTF9BTkRfUkVNT1RFX1NFVFRJTkdTLmluY2x1ZGVzKHRoaXMuc2V0dGluZy5rZXkpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWdUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkge1xuXHRcdFx0aWYgKGlzUmVtb3RlKSB7XG5cdFx0XHRcdHJldHVybiBMT0NBTF9NQUNISU5FX1NDT1BFUy5pbmNsdWRlcyh0aGlzLnNldHRpbmcuc2NvcGUpIHx8IFVTRVJfTE9DQUxfQU5EX1JFTU9URV9TRVRUSU5HUy5pbmNsdWRlcyh0aGlzLnNldHRpbmcua2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG1hdGNoZXNBbnlFeHRlbnNpb24oZXh0ZW5zaW9uRmlsdGVycz86IFNldDxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCFleHRlbnNpb25GaWx0ZXJzIHx8ICFleHRlbnNpb25GaWx0ZXJzLnNpemUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zZXR0aW5nLmV4dGVuc2lvbkluZm8pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gQXJyYXkuZnJvbShleHRlbnNpb25GaWx0ZXJzKS5zb21lKGV4dGVuc2lvbklkID0+IGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCkgPT09IHRoaXMuc2V0dGluZy5leHRlbnNpb25JbmZvIS5pZC50b0xvd2VyQ2FzZSgpKTtcblx0fVxuXG5cdG1hdGNoZXNBbnlGZWF0dXJlKGZlYXR1cmVGaWx0ZXJzPzogU2V0PHN0cmluZz4pOiBib29sZWFuIHtcblx0XHRpZiAoIWZlYXR1cmVGaWx0ZXJzIHx8ICFmZWF0dXJlRmlsdGVycy5zaXplKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBSZXN0cmljdCB0byBjb3JlIHNldHRpbmdzXG5cdFx0aWYgKHRoaXMuc2V0dGluZy5leHRlbnNpb25JbmZvKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hhdCBzZXR0aW5ncyBhcmUgbm93IGluIHRoZWlyIG93biB0b3AtbGV2ZWwgY2F0ZWdvcnlcblx0XHRpZiAoZmVhdHVyZUZpbHRlcnMuaGFzKCdjaGF0JykpIHtcblx0XHRcdGNvbnN0IGNoYXRGZWF0dXJlcyA9IHRvY0RhdGEuY2hpbGRyZW4hLmZpbmQoY2hpbGQgPT4gY2hpbGQuaWQgPT09ICdjaGF0Jyk7XG5cdFx0XHRpZiAoY2hhdEZlYXR1cmVzPy5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCBwYXR0ZXJucyA9IGNoYXRGZWF0dXJlcy5jaGlsZHJlblxuXHRcdFx0XHRcdC5mbGF0TWFwKGZlYXR1cmUgPT4gZmVhdHVyZS5zZXR0aW5ncyA/PyBbXSlcblx0XHRcdFx0XHQubWFwKHNldHRpbmcgPT4gY3JlYXRlU2V0dGluZ01hdGNoUmVnRXhwKHNldHRpbmcpKTtcblx0XHRcdFx0aWYgKHBhdHRlcm5zLnNvbWUocGF0dGVybiA9PiBwYXR0ZXJuLnRlc3QodGhpcy5zZXR0aW5nLmtleSkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmZWF0dXJlcyA9IHRvY0RhdGEuY2hpbGRyZW4hLmZpbmQoY2hpbGQgPT4gY2hpbGQuaWQgPT09ICdmZWF0dXJlcycpO1xuXHRcdHJldHVybiBBcnJheS5mcm9tKGZlYXR1cmVGaWx0ZXJzKS5zb21lKGZpbHRlciA9PiB7XG5cdFx0XHRpZiAoZmVhdHVyZXM/LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnN0IGZlYXR1cmUgPSBmZWF0dXJlcy5jaGlsZHJlbi5maW5kKGZlYXR1cmUgPT4gJ2ZlYXR1cmVzLycgKyBmaWx0ZXIgPT09IGZlYXR1cmUuaWQpO1xuXHRcdFx0XHRpZiAoZmVhdHVyZT8uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRjb25zdCBwYXR0ZXJucyA9IGZlYXR1cmUuc2V0dGluZ3MubWFwKHNldHRpbmcgPT4gY3JlYXRlU2V0dGluZ01hdGNoUmVnRXhwKHNldHRpbmcpKTtcblx0XHRcdFx0XHRyZXR1cm4gcGF0dGVybnMuc29tZShwYXR0ZXJuID0+IHBhdHRlcm4udGVzdCh0aGlzLnNldHRpbmcua2V5KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRtYXRjaGVzQW55SWQoaWRGaWx0ZXJzPzogU2V0PHN0cmluZz4pOiBib29sZWFuIHtcblx0XHRpZiAoIWlkRmlsdGVycyB8fCAhaWRGaWx0ZXJzLnNpemUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBleGFjdCBtYXRjaCBmaXJzdFxuXHRcdGlmIChpZEZpbHRlcnMuaGFzKHRoaXMuc2V0dGluZy5rZXkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3Igd2lsZGNhcmQgcGF0dGVybnMgKGVuZGluZyB3aXRoIC4qKVxuXHRcdGZvciAoY29uc3QgZmlsdGVyIG9mIGlkRmlsdGVycykge1xuXHRcdFx0aWYgKGZpbHRlci5lbmRzV2l0aCgnKicpKSB7XG5cdFx0XHRcdGNvbnN0IHByZWZpeCA9IGZpbHRlci5zbGljZSgwLCAtMSk7IC8vIFJlbW92ZSAnKicgc3VmZml4XG5cdFx0XHRcdGlmICh0aGlzLnNldHRpbmcua2V5LnN0YXJ0c1dpdGgocHJlZml4KSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0bWF0Y2hlc0FsbExhbmd1YWdlcyhsYW5ndWFnZUZpbHRlcj86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghbGFuZ3VhZ2VGaWx0ZXIpIHtcblx0XHRcdC8vIFdlJ3JlIG5vdCBmaWx0ZXJpbmcgYnkgbGFuZ3VhZ2UuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VGaWx0ZXIpKSB7XG5cdFx0XHQvLyBXZSdyZSB0cnlpbmcgdG8gZmlsdGVyIGJ5IGFuIGludmFsaWQgbGFuZ3VhZ2UuXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgaGF2ZSBhIGxhbmd1YWdlIGZpbHRlciBpbiB0aGUgc2VhcmNoIHdpZGdldCBhdCB0aGlzIHBvaW50LlxuXHRcdC8vIFdlIGRlY2lkZSB0byBzaG93IGFsbCBsYW5ndWFnZSBvdmVycmlkYWJsZSBzZXR0aW5ncyB0byBtYWtlIHRoZVxuXHRcdC8vIGxhbmcgZmlsdGVyIGFjdCBtb3JlIGxpa2UgYSBzY29wZSBmaWx0ZXIsXG5cdFx0Ly8gcmF0aGVyIHRoYW4gYWRkaW5nIG9uIGFuIGltcGxpY2l0IEBtb2RpZmllZCBhcyB3ZWxsLlxuXHRcdGlmICh0aGlzLnNldHRpbmcuc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cblxuZnVuY3Rpb24gY3JlYXRlU2V0dGluZ01hdGNoUmVnRXhwKHBhdHRlcm46IHN0cmluZyk6IFJlZ0V4cCB7XG5cdHBhdHRlcm4gPSBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHBhdHRlcm4pXG5cdFx0LnJlcGxhY2UoL1xcXFxcXCovZywgJy4qJyk7XG5cblx0cmV0dXJuIG5ldyBSZWdFeHAoYF4ke3BhdHRlcm59JGAsICdpJyk7XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RyZWVNb2RlbCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJvdGVjdGVkIF9yb290ITogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50O1xuXHRwcml2YXRlIF90b2NSb290ITogSVRPQ0VudHJ5PElTZXR0aW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJlZUVsZW1lbnRzQnlTZXR0aW5nTmFtZSA9IG5ldyBNYXA8c3RyaW5nLCBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudFtdPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfdmlld1N0YXRlOiBJU2V0dGluZ3NFZGl0b3JWaWV3U3RhdGUsXG5cdFx0cHJpdmF0ZSBfaXNXb3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuLFxuXHRcdEBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0IHJvb3QoKTogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fcm9vdDtcblx0fVxuXG5cdHVwZGF0ZShuZXdUb2NSb290ID0gdGhpcy5fdG9jUm9vdCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWVFbGVtZW50c0J5U2V0dGluZ05hbWUuY2xlYXIoKTtcblxuXHRcdGNvbnN0IG5ld1Jvb3QgPSB0aGlzLmNyZWF0ZVNldHRpbmdzVHJlZUdyb3VwRWxlbWVudChuZXdUb2NSb290KTtcblx0XHRpZiAobmV3Um9vdC5jaGlsZHJlblswXSBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCkge1xuXHRcdFx0KDxTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQ+bmV3Um9vdC5jaGlsZHJlblswXSkuaXNGaXJzdEdyb3VwID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcm9vdCkge1xuXHRcdFx0dGhpcy5kaXNwb3NlQ2hpbGRyZW4odGhpcy5fcm9vdC5jaGlsZHJlbik7XG5cdFx0XHR0aGlzLl9yb290LmNoaWxkcmVuID0gbmV3Um9vdC5jaGlsZHJlbjtcblx0XHRcdG5ld1Jvb3QuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yb290ID0gbmV3Um9vdDtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVXb3Jrc3BhY2VUcnVzdCh3b3Jrc3BhY2VUcnVzdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNXb3Jrc3BhY2VUcnVzdGVkID0gd29ya3NwYWNlVHJ1c3RlZDtcblx0XHR0aGlzLnVwZGF0ZVJlcXVpcmVUcnVzdGVkVGFyZ2V0RWxlbWVudHMoKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUNoaWxkcmVuKGNoaWxkcmVuOiBTZXR0aW5nc1RyZWVHcm91cENoaWxkW10pIHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHR0aGlzLmRpc3Bvc2VDaGlsZEFuZFJlY3Vyc2UoY2hpbGQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUNoaWxkQW5kUmVjdXJzZShlbGVtZW50OiBTZXR0aW5nc1RyZWVFbGVtZW50KSB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdHRoaXMuZGlzcG9zZUNoaWxkcmVuKGVsZW1lbnQuY2hpbGRyZW4pO1xuXHRcdH1cblxuXHRcdGVsZW1lbnQuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0RWxlbWVudHNCeU5hbWUobmFtZTogc3RyaW5nKTogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnRbXSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl90cmVlRWxlbWVudHNCeVNldHRpbmdOYW1lLmdldChuYW1lKSA/PyBudWxsO1xuXHR9XG5cblx0dXBkYXRlRWxlbWVudHNCeU5hbWUobmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmVlRWxlbWVudHNCeVNldHRpbmdOYW1lLmhhcyhuYW1lKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVpbnNwZWN0U2V0dGluZ3ModGhpcy5fdHJlZUVsZW1lbnRzQnlTZXR0aW5nTmFtZS5nZXQobmFtZSkhKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVxdWlyZVRydXN0ZWRUYXJnZXRFbGVtZW50cygpOiB2b2lkIHtcblx0XHR0aGlzLnJlaW5zcGVjdFNldHRpbmdzKFsuLi50aGlzLl90cmVlRWxlbWVudHNCeVNldHRpbmdOYW1lLnZhbHVlcygpXS5mbGF0KCkuZmlsdGVyKHMgPT4gcy5pc1VudHJ1c3RlZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWluc3BlY3RTZXR0aW5ncyhzZXR0aW5nczogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnRbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBzZXR0aW5ncykge1xuXHRcdFx0ZWxlbWVudC5pbnNwZWN0U2VsZigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KHRvY0VudHJ5OiBJVE9DRW50cnk8SVNldHRpbmc+LCBwYXJlbnQ/OiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpOiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQge1xuXHRcdGNvbnN0IGRlcHRoID0gcGFyZW50ID8gdGhpcy5nZXREZXB0aChwYXJlbnQpICsgMSA6IDA7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5ldyBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQodG9jRW50cnkuaWQsIHVuZGVmaW5lZCwgdG9jRW50cnkubGFiZWwsIGRlcHRoLCBmYWxzZSk7XG5cdFx0ZWxlbWVudC5wYXJlbnQgPSBwYXJlbnQ7XG5cblx0XHRjb25zdCBjaGlsZHJlbjogU2V0dGluZ3NUcmVlR3JvdXBDaGlsZFtdID0gW107XG5cdFx0aWYgKHRvY0VudHJ5LnNldHRpbmdzKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nQ2hpbGRyZW4gPSB0b2NFbnRyeS5zZXR0aW5ncy5tYXAocyA9PiB0aGlzLmNyZWF0ZVNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KHMsIGVsZW1lbnQpKTtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygc2V0dGluZ0NoaWxkcmVuKSB7XG5cdFx0XHRcdGlmICghY2hpbGQuc2V0dGluZy5kZXByZWNhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaGlsZC5pbnNwZWN0U2VsZigpO1xuXHRcdFx0XHRcdGlmIChjaGlsZC5pc0NvbmZpZ3VyZWQpIHtcblx0XHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjaGlsZC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRvY0VudHJ5LmNoaWxkcmVuKSB7XG5cdFx0XHRjb25zdCBncm91cENoaWxkcmVuID0gdG9jRW50cnkuY2hpbGRyZW4ubWFwKGNoaWxkID0+IHRoaXMuY3JlYXRlU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KGNoaWxkLCBlbGVtZW50KSk7XG5cdFx0XHRjaGlsZHJlbi5wdXNoKC4uLmdyb3VwQ2hpbGRyZW4pO1xuXHRcdH1cblxuXHRcdGVsZW1lbnQuY2hpbGRyZW4gPSBjaGlsZHJlbjtcblxuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZXB0aChlbGVtZW50OiBTZXR0aW5nc1RyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRpZiAoZWxlbWVudC5wYXJlbnQpIHtcblx0XHRcdHJldHVybiAxICsgdGhpcy5nZXREZXB0aChlbGVtZW50LnBhcmVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQoc2V0dGluZzogSVNldHRpbmcsIHBhcmVudDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KTogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBuZXcgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQoXG5cdFx0XHRzZXR0aW5nLFxuXHRcdFx0cGFyZW50LFxuXHRcdFx0dGhpcy5fdmlld1N0YXRlLnNldHRpbmdzVGFyZ2V0LFxuXHRcdFx0dGhpcy5faXNXb3Jrc3BhY2VUcnVzdGVkLFxuXHRcdFx0dGhpcy5fdmlld1N0YXRlLmxhbmd1YWdlRmlsdGVyLFxuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fcHJvZHVjdFNlcnZpY2UsXG5cdFx0XHR0aGlzLl91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHR0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyk7XG5cblx0XHRjb25zdCBuYW1lRWxlbWVudHMgPSB0aGlzLl90cmVlRWxlbWVudHNCeVNldHRpbmdOYW1lLmdldChzZXR0aW5nLmtleSkgPz8gW107XG5cdFx0bmFtZUVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG5cdFx0dGhpcy5fdHJlZUVsZW1lbnRzQnlTZXR0aW5nTmFtZS5zZXQoc2V0dGluZy5rZXksIG5hbWVFbGVtZW50cyk7XG5cdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX3RyZWVFbGVtZW50c0J5U2V0dGluZ05hbWUuY2xlYXIoKTtcblx0XHR0aGlzLmRpc3Bvc2VDaGlsZEFuZFJlY3Vyc2UodGhpcy5fcm9vdCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElJbnNwZWN0UmVzdWx0IHtcblx0aXNDb25maWd1cmVkOiBib29sZWFuO1xuXHRpbnNwZWN0ZWQ6IElDb25maWd1cmF0aW9uVmFsdWU8dW5rbm93bj47XG5cdHRhcmdldFNlbGVjdG9yOiAnYXBwbGljYXRpb25WYWx1ZScgfCAndXNlckxvY2FsVmFsdWUnIHwgJ3VzZXJSZW1vdGVWYWx1ZScgfCAnd29ya3NwYWNlVmFsdWUnIHwgJ3dvcmtzcGFjZUZvbGRlclZhbHVlJztcblx0aW5zcGVjdGVkTGFuZ3VhZ2VPdmVycmlkZXM6IE1hcDxzdHJpbmcsIElDb25maWd1cmF0aW9uVmFsdWU8dW5rbm93bj4+O1xuXHRsYW5ndWFnZVNlbGVjdG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNwZWN0U2V0dGluZyhrZXk6IHN0cmluZywgdGFyZ2V0OiBTZXR0aW5nc1RhcmdldCwgbGFuZ3VhZ2VGaWx0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSk6IElJbnNwZWN0UmVzdWx0IHtcblx0Y29uc3QgaW5zcGVjdE92ZXJyaWRlcyA9IFVSSS5pc1VyaSh0YXJnZXQpID8geyByZXNvdXJjZTogdGFyZ2V0IH0gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGluc3BlY3RlZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qoa2V5LCBpbnNwZWN0T3ZlcnJpZGVzKTtcblx0Y29uc3QgdGFyZ2V0U2VsZWN0b3IgPSB0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04gPyAnYXBwbGljYXRpb25WYWx1ZScgOlxuXHRcdHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMID8gJ3VzZXJMb2NhbFZhbHVlJyA6XG5cdFx0XHR0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUgPyAndXNlclJlbW90ZVZhbHVlJyA6XG5cdFx0XHRcdHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgPyAnd29ya3NwYWNlVmFsdWUnIDpcblx0XHRcdFx0XHQnd29ya3NwYWNlRm9sZGVyVmFsdWUnO1xuXHRjb25zdCB0YXJnZXRPdmVycmlkZVNlbGVjdG9yID0gdGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OID8gJ2FwcGxpY2F0aW9uJyA6XG5cdFx0dGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgPyAndXNlckxvY2FsJyA6XG5cdFx0XHR0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUgPyAndXNlclJlbW90ZScgOlxuXHRcdFx0XHR0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFID8gJ3dvcmtzcGFjZScgOlxuXHRcdFx0XHRcdCd3b3Jrc3BhY2VGb2xkZXInO1xuXHRsZXQgaXNDb25maWd1cmVkID0gdHlwZW9mIGluc3BlY3RlZFt0YXJnZXRTZWxlY3Rvcl0gIT09ICd1bmRlZmluZWQnO1xuXG5cdGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllcnMgPSBpbnNwZWN0ZWQub3ZlcnJpZGVJZGVudGlmaWVycztcblx0Y29uc3QgaW5zcGVjdGVkTGFuZ3VhZ2VPdmVycmlkZXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbmZpZ3VyYXRpb25WYWx1ZTx1bmtub3duPj4oKTtcblxuXHQvLyBXZSBtdXN0IHJlc2V0IGlzQ29uZmlndXJlZCB0byBiZSBmYWxzZSBpZiBsYW5ndWFnZUZpbHRlciBpcyBzZXQsIGFuZCBtYW51YWxseVxuXHQvLyBkZXRlcm1pbmUgd2hldGhlciBpdCBjYW4gYmUgc2V0IHRvIHRydWUgbGF0ZXIuXG5cdGlmIChsYW5ndWFnZUZpbHRlcikge1xuXHRcdGlzQ29uZmlndXJlZCA9IGZhbHNlO1xuXHR9XG5cdGlmIChvdmVycmlkZUlkZW50aWZpZXJzKSB7XG5cdFx0Ly8gVGhlIHNldHRpbmcgd2UncmUgbG9va2luZyBhdCBoYXMgbGFuZ3VhZ2Ugb3ZlcnJpZGVzLlxuXHRcdGZvciAoY29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyIG9mIG92ZXJyaWRlSWRlbnRpZmllcnMpIHtcblx0XHRcdGluc3BlY3RlZExhbmd1YWdlT3ZlcnJpZGVzLnNldChvdmVycmlkZUlkZW50aWZpZXIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qoa2V5LCB7IG92ZXJyaWRlSWRlbnRpZmllciB9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGFsbCBsYW5ndWFnZSBmaWx0ZXJzLCBzZWUgaWYgdGhlcmUncyBhbiBvdmVycmlkZSBmb3IgdGhhdCBmaWx0ZXIuXG5cdFx0aWYgKGxhbmd1YWdlRmlsdGVyKSB7XG5cdFx0XHRpZiAoaW5zcGVjdGVkTGFuZ3VhZ2VPdmVycmlkZXMuaGFzKGxhbmd1YWdlRmlsdGVyKSkge1xuXHRcdFx0XHRjb25zdCBvdmVycmlkZVZhbHVlID0gaW5zcGVjdGVkTGFuZ3VhZ2VPdmVycmlkZXMuZ2V0KGxhbmd1YWdlRmlsdGVyKSFbdGFyZ2V0T3ZlcnJpZGVTZWxlY3Rvcl0/Lm92ZXJyaWRlO1xuXHRcdFx0XHRpZiAodHlwZW9mIG92ZXJyaWRlVmFsdWUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0aXNDb25maWd1cmVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IGlzQ29uZmlndXJlZCwgaW5zcGVjdGVkLCB0YXJnZXRTZWxlY3RvciwgaW5zcGVjdGVkTGFuZ3VhZ2VPdmVycmlkZXMsIGxhbmd1YWdlU2VsZWN0b3I6IGxhbmd1YWdlRmlsdGVyIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZUlkKGlkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gaWQucmVwbGFjZSgvW1xcLlxcL10vZywgJ18nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoa2V5OiBzdHJpbmcsIGdyb3VwSWQ6IHN0cmluZyA9ICcnLCBpc0xhbmd1YWdlVGFnU2V0dGluZzogYm9vbGVhbiA9IGZhbHNlKTogeyBjYXRlZ29yeTogc3RyaW5nOyBsYWJlbDogc3RyaW5nIH0ge1xuXHRjb25zdCBsYXN0RG90SWR4ID0ga2V5Lmxhc3RJbmRleE9mKCcuJyk7XG5cdGxldCBjYXRlZ29yeSA9ICcnO1xuXHRpZiAobGFzdERvdElkeCA+PSAwKSB7XG5cdFx0Y2F0ZWdvcnkgPSBrZXkuc3Vic3RyaW5nKDAsIGxhc3REb3RJZHgpO1xuXHRcdGtleSA9IGtleS5zdWJzdHJpbmcobGFzdERvdElkeCArIDEpO1xuXHR9XG5cblx0Z3JvdXBJZCA9IGdyb3VwSWQucmVwbGFjZSgvXFwvL2csICcuJyk7XG5cdGNhdGVnb3J5ID0gdHJpbUNhdGVnb3J5Rm9yR3JvdXAoY2F0ZWdvcnksIGdyb3VwSWQpO1xuXHRjYXRlZ29yeSA9IHdvcmRpZnlLZXkoY2F0ZWdvcnkpO1xuXG5cdGlmIChpc0xhbmd1YWdlVGFnU2V0dGluZykge1xuXHRcdGtleSA9IGdldExhbmd1YWdlVGFnU2V0dGluZ1BsYWluS2V5KGtleSk7XG5cdFx0a2V5ID0gJyQoYnJhY2tldCkgJyArIGtleTtcblx0fVxuXG5cdGNvbnN0IGxhYmVsID0gd29yZGlmeUtleShrZXkpO1xuXHRyZXR1cm4geyBjYXRlZ29yeSwgbGFiZWwgfTtcbn1cblxuLyoqXG4gKiBSZW1vdmVzIHJlZHVuZGFudCBzZWN0aW9ucyBvZiB0aGUgY2F0ZWdvcnkgbGFiZWwuXG4gKiBBIHJlZHVuZGFudCBzZWN0aW9uIGlzIGEgc2VjdGlvbiBhbHJlYWR5IHJlZmxlY3RlZCBpbiB0aGUgZ3JvdXBJZC5cbiAqXG4gKiBAcGFyYW0gY2F0ZWdvcnkgVGhlIGNhdGVnb3J5IG9mIHRoZSBzcGVjaWZpYyBzZXR0aW5nLlxuICogQHBhcmFtIGdyb3VwSWQgVGhlIGF1dGhvciArIGV4dGVuc2lvbiBJRC5cbiAqIEByZXR1cm5zIFRoZSBuZXcgY2F0ZWdvcnkgbGFiZWwgdG8gdXNlLlxuICovXG5mdW5jdGlvbiB0cmltQ2F0ZWdvcnlGb3JHcm91cChjYXRlZ29yeTogc3RyaW5nLCBncm91cElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBkb1RyaW0gPSAoZm9yd2FyZDogYm9vbGVhbikgPT4ge1xuXHRcdC8vIFJlbW92ZSB0aGUgSW5zaWRlcnMgcG9ydGlvbiBpZiB0aGUgY2F0ZWdvcnkgZG9lc24ndCB1c2UgaXQuXG5cdFx0aWYgKCEvaW5zaWRlcnMkL2kudGVzdChjYXRlZ29yeSkpIHtcblx0XHRcdGdyb3VwSWQgPSBncm91cElkLnJlcGxhY2UoLy0/aW5zaWRlcnMkL2ksICcnKTtcblx0XHR9XG5cdFx0Y29uc3QgcGFydHMgPSBncm91cElkLnNwbGl0KCcuJylcblx0XHRcdC5tYXAocGFydCA9PiB7XG5cdFx0XHRcdC8vIFJlbW92ZSBoeXBoZW5zLCBidXQgb25seSBpZiB0aGF0IHJlc3VsdHMgaW4gYSBtYXRjaCB3aXRoIHRoZSBjYXRlZ29yeS5cblx0XHRcdFx0aWYgKHBhcnQucmVwbGFjZSgvLS9nLCAnJykudG9Mb3dlckNhc2UoKSA9PT0gY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0LnJlcGxhY2UoLy0vZywgJycpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR3aGlsZSAocGFydHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCByZWcgPSBuZXcgUmVnRXhwKGBeJHtwYXJ0cy5qb2luKCdcXFxcLicpfShcXFxcLnwkKWAsICdpJyk7XG5cdFx0XHRpZiAocmVnLnRlc3QoY2F0ZWdvcnkpKSB7XG5cdFx0XHRcdHJldHVybiBjYXRlZ29yeS5yZXBsYWNlKHJlZywgJycpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZm9yd2FyZCkge1xuXHRcdFx0XHRwYXJ0cy5wb3AoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBhcnRzLnNoaWZ0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH07XG5cblx0bGV0IHRyaW1tZWQgPSBkb1RyaW0odHJ1ZSk7XG5cdGlmICh0cmltbWVkID09PSBudWxsKSB7XG5cdFx0dHJpbW1lZCA9IGRvVHJpbShmYWxzZSk7XG5cdH1cblxuXHRpZiAodHJpbW1lZCA9PT0gbnVsbCkge1xuXHRcdHRyaW1tZWQgPSBjYXRlZ29yeTtcblx0fVxuXG5cdHJldHVybiB0cmltbWVkO1xufVxuXG5mdW5jdGlvbiBpc0V4dGVuc2lvblRvZ2dsZVNldHRpbmcoc2V0dGluZzogSVNldHRpbmcsIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UpOiBib29sZWFuIHtcblx0cmV0dXJuIEVOQUJMRV9FWFRFTlNJT05fVE9HR0xFX1NFVFRJTkdTICYmXG5cdFx0ISFwcm9kdWN0U2VydmljZS5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMgJiZcblx0XHQhIXNldHRpbmcuZGlzcGxheUV4dGVuc2lvbklkO1xufVxuXG5mdW5jdGlvbiBpc0V4Y2x1ZGVTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXR0aW5nLmtleSA9PT0gJ2ZpbGVzLmV4Y2x1ZGUnIHx8XG5cdFx0c2V0dGluZy5rZXkgPT09ICdzZWFyY2guZXhjbHVkZScgfHxcblx0XHRzZXR0aW5nLmtleSA9PT0gJ3dvcmtiZW5jaC5sb2NhbEhpc3RvcnkuZXhjbHVkZScgfHxcblx0XHRzZXR0aW5nLmtleSA9PT0gJ2V4cGxvcmVyLmF1dG9SZXZlYWxFeGNsdWRlJyB8fFxuXHRcdHNldHRpbmcua2V5ID09PSAnZmlsZXMucmVhZG9ubHlFeGNsdWRlJyB8fFxuXHRcdHNldHRpbmcua2V5ID09PSAnZmlsZXMud2F0Y2hlckV4Y2x1ZGUnO1xufVxuXG5mdW5jdGlvbiBpc0luY2x1ZGVTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXR0aW5nLmtleSA9PT0gJ2ZpbGVzLnJlYWRvbmx5SW5jbHVkZSc7XG59XG5cbi8vIFRoZSB2YWx1ZXMgb2YgdGhlIGZvbGxvd2luZyBzZXR0aW5ncyB3aGVuIGEgZGVmYXVsdCB2YWx1ZXMgaGFzIGJlZW4gcmVtb3ZlZFxuZXhwb3J0IGZ1bmN0aW9uIG9iamVjdFNldHRpbmdTdXBwb3J0c1JlbW92ZURlZmF1bHRWYWx1ZShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4ga2V5ID09PSAnd29ya2JlbmNoLmVkaXRvci5jdXN0b21MYWJlbHMucGF0dGVybnMnO1xufVxuXG5mdW5jdGlvbiBpc1NpbXBsZVR5cGUodHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiB0eXBlID09PSAnc3RyaW5nJyB8fCB0eXBlID09PSAnYm9vbGVhbicgfHwgdHlwZSA9PT0gJ2ludGVnZXInIHx8IHR5cGUgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBnZXRPYmplY3RSZW5kZXJhYmxlU2NoZW1hVHlwZShzY2hlbWE6IElKU09OU2NoZW1hLCBrZXk6IHN0cmluZyk6ICdzaW1wbGUnIHwgJ2NvbXBsZXgnIHwgZmFsc2Uge1xuXHRjb25zdCB7IHR5cGUgfSA9IHNjaGVtYTtcblxuXHRpZiAoQXJyYXkuaXNBcnJheSh0eXBlKSkge1xuXHRcdGlmIChvYmplY3RTZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0VmFsdWUoa2V5KSAmJiB0eXBlLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0aWYgKHR5cGUuaW5jbHVkZXMoJ251bGwnKSAmJiAodHlwZS5pbmNsdWRlcygnc3RyaW5nJykgfHwgdHlwZS5pbmNsdWRlcygnYm9vbGVhbicpIHx8IHR5cGUuaW5jbHVkZXMoJ2ludGVnZXInKSB8fCB0eXBlLmluY2x1ZGVzKCdudW1iZXInKSkpIHtcblx0XHRcdFx0cmV0dXJuICdzaW1wbGUnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdCBvZiB0eXBlKSB7XG5cdFx0XHRpZiAoIWlzU2ltcGxlVHlwZSh0KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAnY29tcGxleCc7XG5cdH1cblxuXHRpZiAoaXNTaW1wbGVUeXBlKHR5cGUpKSB7XG5cdFx0cmV0dXJuICdzaW1wbGUnO1xuXHR9XG5cblx0aWYgKHR5cGUgPT09ICdhcnJheScpIHtcblx0XHRpZiAoc2NoZW1hLml0ZW1zKSB7XG5cdFx0XHRjb25zdCBpdGVtU2NoZW1hcyA9IEFycmF5LmlzQXJyYXkoc2NoZW1hLml0ZW1zKSA/IHNjaGVtYS5pdGVtcyA6IFtzY2hlbWEuaXRlbXNdO1xuXHRcdFx0Zm9yIChjb25zdCB7IHR5cGUgfSBvZiBpdGVtU2NoZW1hcykge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh0eXBlKSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdCBvZiB0eXBlKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWlzU2ltcGxlVHlwZSh0KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiAnY29tcGxleCc7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFpc1NpbXBsZVR5cGUodHlwZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuICdjb21wbGV4Jztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBnZXRPYmplY3RTZXR0aW5nU2NoZW1hVHlwZSh7XG5cdGtleSxcblx0dHlwZSxcblx0b2JqZWN0UHJvcGVydGllcyxcblx0b2JqZWN0UGF0dGVyblByb3BlcnRpZXMsXG5cdG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzXG59OiBJU2V0dGluZyk6ICdzaW1wbGUnIHwgJ2NvbXBsZXgnIHwgZmFsc2Uge1xuXHRpZiAodHlwZSAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBvYmplY3QgY2FuIGhhdmUgYW55IHNoYXBlXG5cdGlmIChcblx0XHRpc1VuZGVmaW5lZE9yTnVsbChvYmplY3RQcm9wZXJ0aWVzKSAmJlxuXHRcdGlzVW5kZWZpbmVkT3JOdWxsKG9iamVjdFBhdHRlcm5Qcm9wZXJ0aWVzKSAmJlxuXHRcdGlzVW5kZWZpbmVkT3JOdWxsKG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzKVxuXHQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyBhbGxvdyB0aGUgc2V0dGluZyB0byBoYXZlIGFueSBzaGFwZSxcblx0Ly8gYnV0IGlmIHRoZXJlJ3MgYSBwYXR0ZXJuIHByb3BlcnR5IHRoYXQgaGFuZGxlcyBldmVyeXRoaW5nLCB0aGVuIGV2ZXJ5XG5cdC8vIHByb3BlcnR5IHdpbGwgbWF0Y2ggdGhhdCBwYXR0ZXJuUHJvcGVydHksIHNvIHdlIGRvbid0IG5lZWQgdG8gbG9vayBhdFxuXHQvLyB0aGUgdmFsdWUgb2Ygb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgaW4gdGhhdCBjYXNlLlxuXHRpZiAoKG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzID09PSB0cnVlIHx8IG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzID09PSB1bmRlZmluZWQpXG5cdFx0JiYgIU9iamVjdC5rZXlzKG9iamVjdFBhdHRlcm5Qcm9wZXJ0aWVzID8/IHt9KS5pbmNsdWRlcygnLionKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IHNjaGVtYXMgPSBbLi4uT2JqZWN0LnZhbHVlcyhvYmplY3RQcm9wZXJ0aWVzID8/IHt9KSwgLi4uT2JqZWN0LnZhbHVlcyhvYmplY3RQYXR0ZXJuUHJvcGVydGllcyA/PyB7fSldO1xuXG5cdGlmIChvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyAmJiB0eXBlb2Ygb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdvYmplY3QnKSB7XG5cdFx0c2NoZW1hcy5wdXNoKG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGxldCBzY2hlbWFUeXBlOiAnc2ltcGxlJyB8ICdjb21wbGV4JyB8IGZhbHNlID0gJ3NpbXBsZSc7XG5cdGZvciAoY29uc3Qgc2NoZW1hIG9mIHNjaGVtYXMpIHtcblx0XHRmb3IgKGNvbnN0IHN1YlNjaGVtYSBvZiBBcnJheS5pc0FycmF5KHNjaGVtYS5hbnlPZikgPyBzY2hlbWEuYW55T2YgOiBbc2NoZW1hXSkge1xuXHRcdFx0Y29uc3Qgc3ViU2NoZW1hVHlwZSA9IGdldE9iamVjdFJlbmRlcmFibGVTY2hlbWFUeXBlKHN1YlNjaGVtYSwga2V5KTtcblx0XHRcdGlmIChzdWJTY2hlbWFUeXBlID09PSBmYWxzZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3ViU2NoZW1hVHlwZSA9PT0gJ2NvbXBsZXgnKSB7XG5cdFx0XHRcdHNjaGVtYVR5cGUgPSAnY29tcGxleCc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHNjaGVtYVR5cGU7XG59XG5cbmZ1bmN0aW9uIHNldHRpbmdUeXBlRW51bVJlbmRlcmFibGUoX3R5cGU6IHN0cmluZyB8IHN0cmluZ1tdKSB7XG5cdGNvbnN0IGVudW1SZW5kZXJhYmxlU2V0dGluZ1R5cGVzID0gWydzdHJpbmcnLCAnYm9vbGVhbicsICdudWxsJywgJ2ludGVnZXInLCAnbnVtYmVyJ107XG5cdGNvbnN0IHR5cGUgPSBBcnJheS5pc0FycmF5KF90eXBlKSA/IF90eXBlIDogW190eXBlXTtcblx0cmV0dXJuIHR5cGUuZXZlcnkodHlwZSA9PiBlbnVtUmVuZGVyYWJsZVNldHRpbmdUeXBlcy5pbmNsdWRlcyh0eXBlKSk7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNlYXJjaFJlc3VsdElkeCB7XG5cdExvY2FsID0gMCxcblx0UmVtb3RlID0gMSxcblx0TmV3RXh0ZW5zaW9ucyA9IDIsXG5cdEVtYmVkZGluZ3MgPSAzLFxuXHRBaVNlbGVjdGVkID0gNFxufVxuXG5leHBvcnQgY2xhc3MgU2VhcmNoUmVzdWx0TW9kZWwgZXh0ZW5kcyBTZXR0aW5nc1RyZWVNb2RlbCB7XG5cdHByaXZhdGUgcmF3U2VhcmNoUmVzdWx0czogSVNlYXJjaFJlc3VsdFtdIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgY2FjaGVkVW5pcXVlU2VhcmNoUmVzdWx0czogTWFwPGJvb2xlYW4sIElTZWFyY2hSZXN1bHQgfCBudWxsPjtcblx0cHJpdmF0ZSBuZXdFeHRlbnNpb25TZWFyY2hSZXN1bHRzOiBJU2VhcmNoUmVzdWx0IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgc2VhcmNoUmVzdWx0Q291bnQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHNldHRpbmdzT3JkZXJCeVRvY0luZGV4OiBNYXA8c3RyaW5nLCBudW1iZXI+IHwgbnVsbDtcblx0cHJpdmF0ZSBhaUZpbHRlckVuYWJsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRyZWFkb25seSBpZCA9ICdzZWFyY2hSZXN1bHRNb2RlbCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dmlld1N0YXRlOiBJU2V0dGluZ3NFZGl0b3JWaWV3U3RhdGUsXG5cdFx0c2V0dGluZ3NPcmRlckJ5VG9jSW5kZXg6IE1hcDxzdHJpbmcsIG51bWJlcj4gfCBudWxsLFxuXHRcdGlzV29ya3NwYWNlVHJ1c3RlZDogYm9vbGVhbixcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIodmlld1N0YXRlLCBpc1dvcmtzcGFjZVRydXN0ZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdHRoaXMuc2V0dGluZ3NPcmRlckJ5VG9jSW5kZXggPSBzZXR0aW5nc09yZGVyQnlUb2NJbmRleDtcblx0XHR0aGlzLmNhY2hlZFVuaXF1ZVNlYXJjaFJlc3VsdHMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy51cGRhdGUoeyBpZDogJ3NlYXJjaFJlc3VsdE1vZGVsJywgbGFiZWw6ICcnIH0pO1xuXHR9XG5cblx0c2V0IHNob3dBaVJlc3VsdHMoc2hvdzogYm9vbGVhbikge1xuXHRcdHRoaXMuYWlGaWx0ZXJFbmFibGVkID0gc2hvdztcblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdH1cblxuXHRwcml2YXRlIHNvcnRSZXN1bHRzKGZpbHRlck1hdGNoZXM6IElTZXR0aW5nTWF0Y2hbXSk6IElTZXR0aW5nTWF0Y2hbXSB7XG5cdFx0aWYgKHRoaXMuc2V0dGluZ3NPcmRlckJ5VG9jSW5kZXgpIHtcblx0XHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgZmlsdGVyTWF0Y2hlcykge1xuXHRcdFx0XHRtYXRjaC5zZXR0aW5nLmludGVybmFsT3JkZXIgPSB0aGlzLnNldHRpbmdzT3JkZXJCeVRvY0luZGV4LmdldChtYXRjaC5zZXR0aW5nLmtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHNlYXJjaCBvbmx5IGhhcyBmaWx0ZXJzLCBzbyB3ZSBjYW4gc29ydCBieSB0aGUgb3JkZXIgaW4gdGhlIFRPQy5cblx0XHRpZiAoIXRoaXMuX3ZpZXdTdGF0ZS5xdWVyeSkge1xuXHRcdFx0cmV0dXJuIGZpbHRlck1hdGNoZXMuc29ydCgoYSwgYikgPT4gY29tcGFyZVR3b051bGxhYmxlTnVtYmVycyhhLnNldHRpbmcuaW50ZXJuYWxPcmRlciwgYi5zZXR0aW5nLmludGVybmFsT3JkZXIpKTtcblx0XHR9XG5cblx0XHQvLyBTb3J0IHRoZSBzZXR0aW5ncyBhY2NvcmRpbmcgdG8gdGhlaXIgcmVsZXZhbmN5LlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTc3NzNcblx0XHRmaWx0ZXJNYXRjaGVzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLm1hdGNoVHlwZSAhPT0gYi5tYXRjaFR5cGUpIHtcblx0XHRcdFx0Ly8gU29ydCBieSBtYXRjaCB0eXBlIGlmIHRoZSBtYXRjaCB0eXBlcyBhcmUgbm90IHRoZSBzYW1lLlxuXHRcdFx0XHQvLyBUaGUgcHJpb3JpdHkgb2YgdGhlIG1hdGNoIHR5cGUgaXMgZ2l2ZW4gYnkgdGhlIFNldHRpbmdNYXRjaFR5cGUgZW51bS5cblx0XHRcdFx0cmV0dXJuIGIubWF0Y2hUeXBlIC0gYS5tYXRjaFR5cGU7XG5cdFx0XHR9IGVsc2UgaWYgKChhLm1hdGNoVHlwZSAmIFNldHRpbmdNYXRjaFR5cGUuTm9uQ29udGlndW91c1dvcmRzSW5TZXR0aW5nc0xhYmVsKSB8fCAoYS5tYXRjaFR5cGUgJiBTZXR0aW5nTWF0Y2hUeXBlLkNvbnRpZ3VvdXNXb3Jkc0luU2V0dGluZ3NMYWJlbCkpIHtcblx0XHRcdFx0Ly8gVGhlIG1hdGNoIHR5cGVzIG9mIGEgYW5kIGIgYXJlIHRoZSBzYW1lIGFuZCBjYW4gYmUgc29ydGVkIGJ5IHRoZWlyIG51bWJlciBvZiBtYXRjaGVkIHdvcmRzLlxuXHRcdFx0XHQvLyBJZiB0aG9zZSBudW1iZXJzIGFyZSB0aGUgc2FtZSwgc29ydCBieSB0aGUgb3JkZXIgaW4gdGhlIHRhYmxlIG9mIGNvbnRlbnRzLlxuXHRcdFx0XHRyZXR1cm4gKGIua2V5TWF0Y2hTY29yZSAtIGEua2V5TWF0Y2hTY29yZSkgfHwgY29tcGFyZVR3b051bGxhYmxlTnVtYmVycyhhLnNldHRpbmcuaW50ZXJuYWxPcmRlciwgYi5zZXR0aW5nLmludGVybmFsT3JkZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChhLm1hdGNoVHlwZSA9PT0gU2V0dGluZ01hdGNoVHlwZS5SZW1vdGVNYXRjaCkge1xuXHRcdFx0XHQvLyBUaGUgbWF0Y2ggdHlwZXMgYXJlIHRoZSBzYW1lIGFuZCBhcmUgUmVtb3RlTWF0Y2guXG5cdFx0XHRcdC8vIFNvcnQgYnkgc2NvcmUuXG5cdFx0XHRcdHJldHVybiBiLnNjb3JlIC0gYS5zY29yZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoZSBtYXRjaCB0eXBlcyBhcmUgdGhlIHNhbWUgYnV0IGFyZSBub3QgUmVtb3RlTWF0Y2guXG5cdFx0XHRcdC8vIFNvcnQgYnkgdGhlaXIgb3JkZXIgaW4gdGhlIHRhYmxlIG9mIGNvbnRlbnRzLlxuXHRcdFx0XHRyZXR1cm4gY29tcGFyZVR3b051bGxhYmxlTnVtYmVycyhhLnNldHRpbmcuaW50ZXJuYWxPcmRlciwgYi5zZXR0aW5nLmludGVybmFsT3JkZXIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVtb3ZlIGR1cGxpY2F0ZXMsIHdoaWNoIHNvbWV0aW1lcyBvY2N1ciB3aXRoIHNldHRpbmdzXG5cdFx0Ly8gc3VjaCBhcyB0aGUgZXhwZXJpbWVudGFsIHRvZ2dsZSBzZXR0aW5nLlxuXHRcdHJldHVybiBhcnJheXMuZGlzdGluY3QoZmlsdGVyTWF0Y2hlcywgKG1hdGNoKSA9PiBtYXRjaC5zZXR0aW5nLmtleSk7XG5cdH1cblxuXHRnZXRVbmlxdWVTZWFyY2hSZXN1bHRzKCk6IElTZWFyY2hSZXN1bHQgfCBudWxsIHtcblx0XHRjb25zdCBjYWNoZWRSZXN1bHRzID0gdGhpcy5jYWNoZWRVbmlxdWVTZWFyY2hSZXN1bHRzLmdldCh0aGlzLmFpRmlsdGVyRW5hYmxlZCk7XG5cdFx0aWYgKGNhY2hlZFJlc3VsdHMpIHtcblx0XHRcdHJldHVybiBjYWNoZWRSZXN1bHRzO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5yYXdTZWFyY2hSZXN1bHRzKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgY29tYmluZWRGaWx0ZXJNYXRjaGVzOiBJU2V0dGluZ01hdGNoW10gPSBbXTtcblxuXHRcdGlmICh0aGlzLmFpRmlsdGVyRW5hYmxlZCkge1xuXHRcdFx0Y29uc3QgYWlTZWxlY3RlZEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IGFpU2VsZWN0ZWRSZXN1bHQgPSB0aGlzLnJhd1NlYXJjaFJlc3VsdHNbU2VhcmNoUmVzdWx0SWR4LkFpU2VsZWN0ZWRdO1xuXHRcdFx0aWYgKGFpU2VsZWN0ZWRSZXN1bHQpIHtcblx0XHRcdFx0YWlTZWxlY3RlZFJlc3VsdC5maWx0ZXJNYXRjaGVzLmZvckVhY2gobSA9PiBhaVNlbGVjdGVkS2V5cy5hZGQobS5zZXR0aW5nLmtleSkpO1xuXHRcdFx0XHRjb21iaW5lZEZpbHRlck1hdGNoZXMgPSBhaVNlbGVjdGVkUmVzdWx0LmZpbHRlck1hdGNoZXM7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVtYmVkZGluZ3NSZXN1bHQgPSB0aGlzLnJhd1NlYXJjaFJlc3VsdHNbU2VhcmNoUmVzdWx0SWR4LkVtYmVkZGluZ3NdO1xuXHRcdFx0aWYgKGVtYmVkZGluZ3NSZXN1bHQpIHtcblx0XHRcdFx0ZW1iZWRkaW5nc1Jlc3VsdC5maWx0ZXJNYXRjaGVzID0gZW1iZWRkaW5nc1Jlc3VsdC5maWx0ZXJNYXRjaGVzLmZpbHRlcihtID0+ICFhaVNlbGVjdGVkS2V5cy5oYXMobS5zZXR0aW5nLmtleSkpO1xuXHRcdFx0XHRjb21iaW5lZEZpbHRlck1hdGNoZXMgPSBjb21iaW5lZEZpbHRlck1hdGNoZXMuY29uY2F0KGVtYmVkZGluZ3NSZXN1bHQuZmlsdGVyTWF0Y2hlcyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSB7XG5cdFx0XHRcdGZpbHRlck1hdGNoZXM6IGNvbWJpbmVkRmlsdGVyTWF0Y2hlcyxcblx0XHRcdFx0ZXhhY3RNYXRjaDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHR0aGlzLmNhY2hlZFVuaXF1ZVNlYXJjaFJlc3VsdHMuc2V0KHRydWUsIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2FsTWF0Y2hLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgbG9jYWxSZXN1bHQgPSB0aGlzLnJhd1NlYXJjaFJlc3VsdHNbU2VhcmNoUmVzdWx0SWR4LkxvY2FsXTtcblx0XHRpZiAobG9jYWxSZXN1bHQpIHtcblx0XHRcdGxvY2FsUmVzdWx0LmZpbHRlck1hdGNoZXMuZm9yRWFjaChtID0+IGxvY2FsTWF0Y2hLZXlzLmFkZChtLnNldHRpbmcua2V5KSk7XG5cdFx0XHRjb21iaW5lZEZpbHRlck1hdGNoZXMgPSBsb2NhbFJlc3VsdC5maWx0ZXJNYXRjaGVzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW90ZVJlc3VsdCA9IHRoaXMucmF3U2VhcmNoUmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguUmVtb3RlXTtcblx0XHRpZiAocmVtb3RlUmVzdWx0KSB7XG5cdFx0XHRyZW1vdGVSZXN1bHQuZmlsdGVyTWF0Y2hlcyA9IHJlbW90ZVJlc3VsdC5maWx0ZXJNYXRjaGVzLmZpbHRlcihtID0+ICFsb2NhbE1hdGNoS2V5cy5oYXMobS5zZXR0aW5nLmtleSkpO1xuXHRcdFx0Y29tYmluZWRGaWx0ZXJNYXRjaGVzID0gY29tYmluZWRGaWx0ZXJNYXRjaGVzLmNvbmNhdChyZW1vdGVSZXN1bHQuZmlsdGVyTWF0Y2hlcyk7XG5cblx0XHRcdHRoaXMubmV3RXh0ZW5zaW9uU2VhcmNoUmVzdWx0cyA9IHRoaXMucmF3U2VhcmNoUmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguTmV3RXh0ZW5zaW9uc107XG5cdFx0fVxuXHRcdGNvbWJpbmVkRmlsdGVyTWF0Y2hlcyA9IHRoaXMuc29ydFJlc3VsdHMoY29tYmluZWRGaWx0ZXJNYXRjaGVzKTtcblx0XHRjb25zdCByZXN1bHQgPSB7XG5cdFx0XHRmaWx0ZXJNYXRjaGVzOiBjb21iaW5lZEZpbHRlck1hdGNoZXMsXG5cdFx0XHRleGFjdE1hdGNoOiBsb2NhbFJlc3VsdC5leGFjdE1hdGNoIC8vIHJlbW90ZSByZXN1bHRzIHNob3VsZCBuZXZlciBoYXZlIGFuIGV4YWN0IG1hdGNoXG5cdFx0fTtcblx0XHR0aGlzLmNhY2hlZFVuaXF1ZVNlYXJjaFJlc3VsdHMuc2V0KGZhbHNlLCByZXN1bHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRSYXdSZXN1bHRzKCk6IElTZWFyY2hSZXN1bHRbXSB7XG5cdFx0cmV0dXJuIHRoaXMucmF3U2VhcmNoUmVzdWx0cyA/PyBbXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VW5pcXVlU2VhcmNoUmVzdWx0U2V0dGluZ3MoKTogSVNldHRpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VW5pcXVlU2VhcmNoUmVzdWx0cygpPy5maWx0ZXJNYXRjaGVzLm1hcChtID0+IG0uc2V0dGluZykgPz8gW107XG5cdH1cblxuXHR1cGRhdGVDaGlsZHJlbigpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZSh7XG5cdFx0XHRpZDogJ3NlYXJjaFJlc3VsdE1vZGVsJyxcblx0XHRcdGxhYmVsOiAnc2VhcmNoUmVzdWx0TW9kZWwnLFxuXHRcdFx0c2V0dGluZ3M6IHRoaXMuZ2V0VW5pcXVlU2VhcmNoUmVzdWx0U2V0dGluZ3MoKVxuXHRcdH0pO1xuXG5cdFx0Ly8gU2F2ZSB0aW1lIGJ5IGZpbHRlcmluZyBjaGlsZHJlbiBpbiB0aGUgc2VhcmNoIG1vZGVsIGluc3RlYWQgb2YgcmVseWluZyBvbiB0aGUgdHJlZSBmaWx0ZXIsIHdoaWNoIHN0aWxsIHJlcXVpcmVzIGhlaWdodHMgdG8gYmUgY2FsY3VsYXRlZC5cblx0XHRjb25zdCBpc1JlbW90ZSA9ICEhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXG5cdFx0Y29uc3QgbmV3Q2hpbGRyZW4gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMucm9vdC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnRcblx0XHRcdFx0JiYgY2hpbGQubWF0Y2hlc0FsbFRhZ3ModGhpcy5fdmlld1N0YXRlLnRhZ0ZpbHRlcnMpXG5cdFx0XHRcdCYmIGNoaWxkLm1hdGNoZXNTY29wZSh0aGlzLl92aWV3U3RhdGUuc2V0dGluZ3NUYXJnZXQsIGlzUmVtb3RlKVxuXHRcdFx0XHQmJiBjaGlsZC5tYXRjaGVzQW55RXh0ZW5zaW9uKHRoaXMuX3ZpZXdTdGF0ZS5leHRlbnNpb25GaWx0ZXJzKVxuXHRcdFx0XHQmJiBjaGlsZC5tYXRjaGVzQW55SWQodGhpcy5fdmlld1N0YXRlLmlkRmlsdGVycylcblx0XHRcdFx0JiYgY2hpbGQubWF0Y2hlc0FueUZlYXR1cmUodGhpcy5fdmlld1N0YXRlLmZlYXR1cmVGaWx0ZXJzKVxuXHRcdFx0XHQmJiBjaGlsZC5tYXRjaGVzQWxsTGFuZ3VhZ2VzKHRoaXMuX3ZpZXdTdGF0ZS5sYW5ndWFnZUZpbHRlcikpIHtcblx0XHRcdFx0bmV3Q2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjaGlsZC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMucm9vdC5jaGlsZHJlbiA9IG5ld0NoaWxkcmVuO1xuXHRcdHRoaXMuc2VhcmNoUmVzdWx0Q291bnQgPSB0aGlzLnJvb3QuY2hpbGRyZW4ubGVuZ3RoO1xuXG5cdFx0aWYgKHRoaXMubmV3RXh0ZW5zaW9uU2VhcmNoUmVzdWx0cz8uZmlsdGVyTWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdGxldCByZXN1bHRFeHRlbnNpb25JZHMgPSB0aGlzLm5ld0V4dGVuc2lvblNlYXJjaFJlc3VsdHMuZmlsdGVyTWF0Y2hlc1xuXHRcdFx0XHQubWFwKHJlc3VsdCA9PiAoPElFeHRlbnNpb25TZXR0aW5nPnJlc3VsdC5zZXR0aW5nKSlcblx0XHRcdFx0LmZpbHRlcihzZXR0aW5nID0+IHNldHRpbmcuZXh0ZW5zaW9uTmFtZSAmJiBzZXR0aW5nLmV4dGVuc2lvblB1Ymxpc2hlcilcblx0XHRcdFx0Lm1hcChzZXR0aW5nID0+IGAke3NldHRpbmcuZXh0ZW5zaW9uUHVibGlzaGVyfS4ke3NldHRpbmcuZXh0ZW5zaW9uTmFtZX1gKTtcblx0XHRcdHJlc3VsdEV4dGVuc2lvbklkcyA9IGFycmF5cy5kaXN0aW5jdChyZXN1bHRFeHRlbnNpb25JZHMpO1xuXG5cdFx0XHRpZiAocmVzdWx0RXh0ZW5zaW9uSWRzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBuZXdFeHRFbGVtZW50ID0gbmV3IFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50KCduZXdFeHRlbnNpb25zJywgcmVzdWx0RXh0ZW5zaW9uSWRzKTtcblx0XHRcdFx0bmV3RXh0RWxlbWVudC5wYXJlbnQgPSB0aGlzLl9yb290O1xuXHRcdFx0XHR0aGlzLl9yb290LmNoaWxkcmVuLnB1c2gobmV3RXh0RWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2V0UmVzdWx0KG9yZGVyOiBTZWFyY2hSZXN1bHRJZHgsIHJlc3VsdDogSVNlYXJjaFJlc3VsdCB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlZFVuaXF1ZVNlYXJjaFJlc3VsdHMuY2xlYXIoKTtcblx0XHR0aGlzLm5ld0V4dGVuc2lvblNlYXJjaFJlc3VsdHMgPSBudWxsO1xuXG5cdFx0aWYgKHRoaXMucmF3U2VhcmNoUmVzdWx0cyAmJiBvcmRlciA9PT0gU2VhcmNoUmVzdWx0SWR4LkxvY2FsKSB7XG5cdFx0XHQvLyBUbyBwcmV2ZW50IHRoZSBTZXR0aW5ncyBlZGl0b3IgZnJvbSBzaG93aW5nXG5cdFx0XHQvLyBzdGFsZSByZW1vdGUgcmVzdWx0cyBtaWQtc2VhcmNoLlxuXHRcdFx0ZGVsZXRlIHRoaXMucmF3U2VhcmNoUmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguUmVtb3RlXTtcblx0XHR9XG5cblx0XHR0aGlzLnJhd1NlYXJjaFJlc3VsdHMgPz89IFtdO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRkZWxldGUgdGhpcy5yYXdTZWFyY2hSZXN1bHRzW29yZGVyXTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJhd1NlYXJjaFJlc3VsdHNbb3JkZXJdID0gcmVzdWx0O1xuXHRcdHRoaXMudXBkYXRlQ2hpbGRyZW4oKTtcblx0fVxuXG5cdGdldFVuaXF1ZVJlc3VsdHNDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaFJlc3VsdENvdW50ID8/IDA7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VkUXVlcnkge1xuXHR0YWdzOiBzdHJpbmdbXTtcblx0cXVlcnk6IHN0cmluZztcblx0ZXh0ZW5zaW9uRmlsdGVyczogc3RyaW5nW107XG5cdGlkRmlsdGVyczogc3RyaW5nW107XG5cdGZlYXR1cmVGaWx0ZXJzOiBzdHJpbmdbXTtcblx0bGFuZ3VhZ2VGaWx0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgdGFnUmVnZXggPSAvKF58XFxzKUB0YWc6KFwiKFteXCJdKilcInxbXlwiXVxcUyopL2c7XG5jb25zdCBleHRlbnNpb25SZWdleCA9IC8oXnxcXHMpQGV4dDooXCIoW15cIl0qKVwifFteXCJdXFxTKik/L2c7XG5jb25zdCBmZWF0dXJlUmVnZXggPSAvKF58XFxzKUBmZWF0dXJlOihcIihbXlwiXSopXCJ8W15cIl1cXFMqKT8vZztcbmNvbnN0IGlkUmVnZXggPSAvKF58XFxzKUBpZDooXCIoW15cIl0qKVwifFteXCJdXFxTKik/L2c7XG5jb25zdCBsYW5ndWFnZVJlZ2V4ID0gLyhefFxccylAbGFuZzooXCIoW15cIl0qKVwifFteXCJdXFxTKik/L2c7XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBJUGFyc2VkUXVlcnkge1xuXHQvKipcblx0ICogQSBoZWxwZXIgZnVuY3Rpb24gdG8gcGFyc2UgdGhlIHF1ZXJ5IG9uIG9uZSB0eXBlIG9mIHJlZ2V4LlxuXHQgKlxuXHQgKiBAcGFyYW0gcXVlcnkgVGhlIHNlYXJjaCBxdWVyeVxuXHQgKiBAcGFyYW0gZmlsdGVyUmVnZXggVGhlIHJlZ2V4IHRvIHVzZSBvbiB0aGUgcXVlcnlcblx0ICogQHBhcmFtIHBhcnNlZFBhcnRzIFRoZSBwYXJ0cyB0aGF0IHRoZSByZWdleCBwYXJzZXMgb3V0IHdpbGwgYmUgYXBwZW5kZWQgdG8gdGhlIGFycmF5IHBhc3NlZCBpbiBoZXJlLlxuXHQgKiBAcmV0dXJucyBUaGUgcXVlcnkgd2l0aCB0aGUgcGFyc2VkIHBhcnRzIHJlbW92ZWRcblx0ICovXG5cdGZ1bmN0aW9uIGdldFRhZ3NGb3JUeXBlKHF1ZXJ5OiBzdHJpbmcsIGZpbHRlclJlZ2V4OiBSZWdFeHAsIHBhcnNlZFBhcnRzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHF1ZXJ5LnJlcGxhY2UoZmlsdGVyUmVnZXgsIChfLCBfXywgcXVvdGVkUGFyc2VkRWxlbWVudCwgdW5xdW90ZWRQYXJzZWRFbGVtZW50KSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWRFbGVtZW50OiBzdHJpbmcgPSB1bnF1b3RlZFBhcnNlZEVsZW1lbnQgfHwgcXVvdGVkUGFyc2VkRWxlbWVudDtcblx0XHRcdGlmIChwYXJzZWRFbGVtZW50KSB7XG5cdFx0XHRcdHBhcnNlZFBhcnRzLnB1c2goLi4ucGFyc2VkRWxlbWVudC5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIocyA9PiAhaXNGYWxzeU9yV2hpdGVzcGFjZShzKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgdGFnczogc3RyaW5nW10gPSBbXTtcblx0cXVlcnkgPSBxdWVyeS5yZXBsYWNlKHRhZ1JlZ2V4LCAoXywgX18sIHF1b3RlZFRhZywgdGFnKSA9PiB7XG5cdFx0dGFncy5wdXNoKHRhZyB8fCBxdW90ZWRUYWcpO1xuXHRcdHJldHVybiAnJztcblx0fSk7XG5cblx0cXVlcnkgPSBxdWVyeS5yZXBsYWNlKGBAJHtNT0RJRklFRF9TRVRUSU5HX1RBR31gLCAoKSA9PiB7XG5cdFx0dGFncy5wdXNoKE1PRElGSUVEX1NFVFRJTkdfVEFHKTtcblx0XHRyZXR1cm4gJyc7XG5cdH0pO1xuXG5cdHF1ZXJ5ID0gcXVlcnkucmVwbGFjZShgQCR7UE9MSUNZX1NFVFRJTkdfVEFHfWAsICgpID0+IHtcblx0XHR0YWdzLnB1c2goUE9MSUNZX1NFVFRJTkdfVEFHKTtcblx0XHRyZXR1cm4gJyc7XG5cdH0pO1xuXG5cdHF1ZXJ5ID0gcXVlcnkucmVwbGFjZShgQCR7QUdFTlRTX1dJTkRPV19TRVRUSU5HX1RBR31gLCAoKSA9PiB7XG5cdFx0dGFncy5wdXNoKEFHRU5UU19XSU5ET1dfU0VUVElOR19UQUcpO1xuXHRcdHJldHVybiAnJztcblx0fSk7XG5cblx0Ly8gSGFuZGxlIEBzdGFibGUgYnkgZXhjbHVkaW5nIHByZXZpZXcgYW5kIGV4cGVyaW1lbnRhbCB0YWdzXG5cdHF1ZXJ5ID0gcXVlcnkucmVwbGFjZSgvQHN0YWJsZS9nLCAoKSA9PiB7XG5cdFx0dGFncy5wdXNoKCdzdGFibGUnKTtcblx0XHRyZXR1cm4gJyc7XG5cdH0pO1xuXG5cdGNvbnN0IGV4dGVuc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGZlYXR1cmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBpZHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGxhbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRxdWVyeSA9IGdldFRhZ3NGb3JUeXBlKHF1ZXJ5LCBleHRlbnNpb25SZWdleCwgZXh0ZW5zaW9ucyk7XG5cdHF1ZXJ5ID0gZ2V0VGFnc0ZvclR5cGUocXVlcnksIGZlYXR1cmVSZWdleCwgZmVhdHVyZXMpO1xuXHRxdWVyeSA9IGdldFRhZ3NGb3JUeXBlKHF1ZXJ5LCBpZFJlZ2V4LCBpZHMpO1xuXG5cdGlmIChFTkFCTEVfTEFOR1VBR0VfRklMVEVSKSB7XG5cdFx0cXVlcnkgPSBnZXRUYWdzRm9yVHlwZShxdWVyeSwgbGFuZ3VhZ2VSZWdleCwgbGFuZ3MpO1xuXHR9XG5cblx0cXVlcnkgPSBxdWVyeS50cmltKCk7XG5cblx0Ly8gRm9yIG5vdywgb25seSByZXR1cm4gdGhlIGZpcnN0IGZvdW5kIGxhbmd1YWdlIGZpbHRlclxuXHRyZXR1cm4ge1xuXHRcdHRhZ3MsXG5cdFx0ZXh0ZW5zaW9uRmlsdGVyczogZXh0ZW5zaW9ucyxcblx0XHRmZWF0dXJlRmlsdGVyczogZmVhdHVyZXMsXG5cdFx0aWRGaWx0ZXJzOiBpZHMsXG5cdFx0bGFuZ3VhZ2VGaWx0ZXI6IGxhbmdzLmxlbmd0aCA/IGxhbmdzWzBdIDogdW5kZWZpbmVkLFxuXHRcdHF1ZXJ5LFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFlO0FBRXhCLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsd0JBQXdCLDJCQUEyQjtBQUM1RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUIscUNBQTBEO0FBQ3hGLFNBQTBDLG9CQUFvQix1QkFBdUIsa0JBQTBDO0FBQy9ILFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsb0JBQW9CLGVBQWUsZ0NBQWdDLHNCQUFzQix1QkFBdUIsd0JBQXdCO0FBQ2pKLFNBQVMsb0NBQW9DO0FBQzdDLFNBQW9FLGtCQUFrQix3QkFBd0I7QUFDOUcsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkIsa0NBQWtDLHdCQUF3QixzQkFBc0Isb0JBQW9CLHVDQUF1QywyQkFBMkIsa0JBQWtCO0FBRTVOLFNBQW9CLGVBQWU7QUFFNUIsTUFBTSw4QkFBOEI7QUFhcEMsTUFBZSw0QkFBNEIsV0FBVztBQUFBLEVBUzVELFlBQVksS0FBYTtBQUN4QixVQUFNO0FBTlAsU0FBUSxZQUFZO0FBRXBCLFNBQWlCLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFLekUsU0FBSyxLQUFLO0FBQUEsRUFDWDtBQUFBLEVBTEEsSUFBSSxzQkFBc0I7QUFBRSxXQUFPLEtBQUsscUJBQXFCO0FBQUEsRUFBTztBQUFBLEVBT3BFLElBQUksV0FBb0I7QUFDdkIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxTQUFTLE9BQWdCO0FBQzVCLFNBQUssWUFBWTtBQUNqQixTQUFLLHFCQUFxQixLQUFLO0FBQUEsRUFDaEM7QUFDRDtBQUlPLE1B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LE1BQU0sVUFBVTtBQUNoQixNQUFNLGdCQUFnQjtBQUVmLFNBQVMsV0FBVyxPQUE2QjtBQVN2RCxXQUFTLGVBQWVDLFFBQWUsYUFBcUIsYUFBK0I7QUFDMUYsV0FBT0EsT0FBTSxRQUFRLGFBQWEsQ0FBQyxHQUFHLElBQUkscUJBQXFCLDBCQUEwQjtBQUN4RixZQUFNLGdCQUF3Qix5QkFBeUI7QUFDdkQsVUFBSSxlQUFlO0FBQ2xCLG9CQUFZLEtBQUssR0FBRyxjQUFjLE1BQU0sR0FBRyxFQUFFLElBQUksT0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLE9BQU8sT0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3JHO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxRQUFNLE9BQWlCLENBQUM7QUFDeEIsVUFBUSxNQUFNLFFBQVEsVUFBVSxDQUFDLEdBQUcsSUFBSSxXQUFXLFFBQVE7QUFDMUQsU0FBSyxLQUFLLE9BQU8sU0FBUztBQUMxQixXQUFPO0FBQUEsRUFDUixDQUFDO0FBRUQsVUFBUSxNQUFNLFFBQVEsSUFBSSxvQkFBb0IsSUFBSSxNQUFNO0FBQ3ZELFNBQUssS0FBSyxvQkFBb0I7QUFDOUIsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUVELFVBQVEsTUFBTSxRQUFRLElBQUksa0JBQWtCLElBQUksTUFBTTtBQUNyRCxTQUFLLEtBQUssa0JBQWtCO0FBQzVCLFdBQU87QUFBQSxFQUNSLENBQUM7QUFFRCxVQUFRLE1BQU0sUUFBUSxJQUFJLHlCQUF5QixJQUFJLE1BQU07QUFDNUQsU0FBSyxLQUFLLHlCQUF5QjtBQUNuQyxXQUFPO0FBQUEsRUFDUixDQUFDO0FBR0QsVUFBUSxNQUFNLFFBQVEsWUFBWSxNQUFNO0FBQ3ZDLFNBQUssS0FBSyxRQUFRO0FBQ2xCLFdBQU87QUFBQSxFQUNSLENBQUM7QUFFRCxRQUFNLGFBQXVCLENBQUM7QUFDOUIsUUFBTSxXQUFxQixDQUFDO0FBQzVCLFFBQU0sTUFBZ0IsQ0FBQztBQUN2QixRQUFNLFFBQWtCLENBQUM7QUFDekIsVUFBUSxlQUFlLE9BQU8sZ0JBQWdCLFVBQVU7QUFDeEQsVUFBUSxlQUFlLE9BQU8sY0FBYyxRQUFRO0FBQ3BELFVBQVEsZUFBZSxPQUFPLFNBQVMsR0FBRztBQUUxQyxNQUFJLHdCQUF3QjtBQUMzQixZQUFRLGVBQWUsT0FBTyxlQUFlLEtBQUs7QUFBQSxFQUNuRDtBQUVBLFVBQVEsTUFBTSxLQUFLO0FBR25CLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxrQkFBa0I7QUFBQSxJQUNsQixnQkFBZ0I7QUFBQSxJQUNoQixXQUFXO0FBQUEsSUFDWCxnQkFBZ0IsTUFBTSxTQUFTLE1BQU0sQ0FBQyxJQUFJO0FBQUEsSUFDMUM7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbImZlYXR1cmUiLCAidHlwZSIsICJTZWFyY2hSZXN1bHRJZHgiLCAicmVzdWx0IiwgInF1ZXJ5Il0KfQo=
