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
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import * as DOM from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { SimpleIconLabel } from "../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { CachedListVirtualDelegate } from "../../../../base/browser/ui/list/list.js";
import { DefaultStyleController } from "../../../../base/browser/ui/list/listWidget.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { Toggle, unthemedToggleStyles } from "../../../../base/browser/ui/toggle/toggle.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { ObjectTreeModel } from "../../../../base/browser/ui/tree/objectTreeModel.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { distinct } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, isDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isIOS } from "../../../../base/common/platform.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { isDefined, isUndefinedOrNull } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService, getLanguageTagSettingPlainKey } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IListService, WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles, getInputBoxStyle, getListStyles, getSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { editorBackground, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { getIgnoredSettings } from "../../../../platform/userDataSync/common/settingsMerge.js";
import { IUserDataSyncEnablementService, getDefaultIgnoredSettings } from "../../../../platform/userDataSync/common/userDataSync.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { SETTINGS_AUTHORITY, SettingValueType } from "../../../services/preferences/common/preferences.js";
import { getInvalidTypeError } from "../../../services/preferences/common/preferencesValidation.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { LANGUAGE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU, compareTwoNullableNumbers } from "../common/preferences.js";
import { settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from "../common/settingsEditorColorRegistry.js";
import { settingsMoreActionIcon } from "./preferencesIcons.js";
import { SettingsTreeIndicatorsLabel, getIndicatorsLabelAriaLabel } from "./settingsEditorSettingIndicators.js";
import { SettingsTreeGroupElement, SettingsTreeNewExtensionsElement, SettingsTreeSettingElement, inspectSetting, objectSettingSupportsRemoveDefaultValue, settingKeyToDisplayFormat } from "./settingsTreeModels.js";
import { ExcludeSettingWidget, IncludeSettingWidget, ListSettingWidget, ObjectSettingCheckboxWidget, ObjectSettingDropdownWidget } from "./settingsWidgets.js";
const $ = DOM.$;
const multiGroupTocSettings = /* @__PURE__ */ new Set([
  "accessibility.signals.chatUserActionRequired",
  "accessibility.signals.chatResponseReceived"
]);
function getIncludeExcludeDisplayValue(element) {
  const elementDefaultValue = typeof element.defaultValue === "object" ? element.defaultValue ?? {} : {};
  const data = element.isConfigured ? { ...elementDefaultValue, ...element.scopeValue } : elementDefaultValue;
  return Object.keys(data).filter((key) => !!data[key]).map((key) => {
    const defaultValue = elementDefaultValue[key];
    let source;
    if (defaultValue === data[key] && element.setting.type === "object" && element.defaultValueSource instanceof Map) {
      const defaultSource = element.defaultValueSource.get(`${element.setting.key}.${key}`);
      source = typeof defaultSource === "string" ? defaultSource : defaultSource?.displayName;
    }
    const value = data[key];
    const sibling = typeof value === "boolean" ? void 0 : value.when;
    return {
      value: {
        type: "string",
        data: key
      },
      sibling,
      elementType: element.valueType,
      source
    };
  });
}
function areAllPropertiesDefined(properties, itemsToDisplay) {
  const staticProperties = new Set(properties);
  itemsToDisplay.forEach(({ key }) => staticProperties.delete(key.data));
  return staticProperties.size === 0;
}
function getEnumOptionsFromSchema(schema) {
  if (schema.anyOf) {
    return schema.anyOf.map(getEnumOptionsFromSchema).flat();
  }
  const enumDescriptions = schema.enumDescriptions ?? [];
  return (schema.enum ?? []).map((value, idx) => {
    const description = idx < enumDescriptions.length ? enumDescriptions[idx] : void 0;
    return { value, description };
  });
}
function getObjectValueType(schema) {
  if (schema.anyOf) {
    const subTypes = schema.anyOf.map(getObjectValueType);
    if (subTypes.some((type) => type === "enum")) {
      return "enum";
    }
    return "string";
  }
  if (schema.type === "boolean") {
    return "boolean";
  } else if (schema.type === "string" && isDefined(schema.enum) && schema.enum.length > 0) {
    return "enum";
  } else {
    return "string";
  }
}
function getObjectEntryValueDisplayValue(type, data, options) {
  if (type === "boolean") {
    return { type, data: !!data };
  } else if (type === "enum") {
    return { type, data: "" + data, options };
  } else {
    return { type, data: "" + data };
  }
}
function getObjectDisplayValue(element) {
  const elementDefaultValue = typeof element.defaultValue === "object" ? element.defaultValue ?? {} : {};
  const elementScopeValue = typeof element.scopeValue === "object" ? element.scopeValue ?? {} : {};
  const data = element.isConfigured ? { ...elementDefaultValue, ...elementScopeValue } : element.hasPolicyValue || element.isAgentsWindowReadOnly ? element.scopeValue : elementDefaultValue;
  const { objectProperties, objectPatternProperties, objectAdditionalProperties } = element.setting;
  const patternsAndSchemas = Object.entries(objectPatternProperties ?? {}).map(([pattern, schema]) => ({
    pattern: new RegExp(pattern),
    schema
  }));
  const wellDefinedKeyEnumOptions = Object.entries(objectProperties ?? {}).map(
    ([key, schema]) => ({ value: key, description: schema.description })
  );
  return Object.keys(data).map((key) => {
    const defaultValue = elementDefaultValue[key];
    let source;
    if (defaultValue === data[key] && element.setting.type === "object" && element.defaultValueSource instanceof Map) {
      const defaultSource = element.defaultValueSource.get(`${element.setting.key}.${key}`);
      source = typeof defaultSource === "string" ? defaultSource : defaultSource?.displayName;
    }
    if (isDefined(objectProperties) && key in objectProperties) {
      const valueEnumOptions = getEnumOptionsFromSchema(objectProperties[key]);
      return {
        key: {
          type: "enum",
          data: key,
          options: wellDefinedKeyEnumOptions
        },
        value: getObjectEntryValueDisplayValue(getObjectValueType(objectProperties[key]), data[key], valueEnumOptions),
        keyDescription: objectProperties[key].description,
        removable: isUndefinedOrNull(defaultValue),
        resetable: !isUndefinedOrNull(defaultValue),
        source
      };
    }
    const removable = defaultValue === void 0 || objectSettingSupportsRemoveDefaultValue(element.setting.key);
    const resetable = !!defaultValue && defaultValue !== data[key];
    const schema = patternsAndSchemas.find(({ pattern }) => pattern.test(key))?.schema;
    if (schema) {
      const valueEnumOptions = getEnumOptionsFromSchema(schema);
      return {
        key: { type: "string", data: key },
        value: getObjectEntryValueDisplayValue(getObjectValueType(schema), data[key], valueEnumOptions),
        keyDescription: schema.description,
        removable,
        resetable,
        source
      };
    }
    const additionalValueEnums = getEnumOptionsFromSchema(
      typeof objectAdditionalProperties === "boolean" ? {} : objectAdditionalProperties ?? {}
    );
    return {
      key: { type: "string", data: key },
      value: getObjectEntryValueDisplayValue(
        typeof objectAdditionalProperties === "object" ? getObjectValueType(objectAdditionalProperties) : "string",
        data[key],
        additionalValueEnums
      ),
      keyDescription: typeof objectAdditionalProperties === "object" ? objectAdditionalProperties.description : void 0,
      removable,
      resetable,
      source
    };
  }).filter((item) => !isUndefinedOrNull(item.value.data));
}
function getBoolObjectDisplayValue(element) {
  const elementDefaultValue = typeof element.defaultValue === "object" ? element.defaultValue ?? {} : {};
  const elementScopeValue = typeof element.scopeValue === "object" ? element.scopeValue ?? {} : {};
  const data = element.isConfigured ? { ...elementDefaultValue, ...elementScopeValue } : elementDefaultValue;
  const { objectProperties } = element.setting;
  const displayValues = [];
  for (const key in objectProperties) {
    const defaultValue = elementDefaultValue[key];
    let source;
    if (defaultValue === data[key] && element.setting.type === "object" && element.defaultValueSource instanceof Map) {
      const defaultSource = element.defaultValueSource.get(key);
      source = typeof defaultSource === "string" ? defaultSource : defaultSource?.displayName;
    }
    displayValues.push({
      key: {
        type: "string",
        data: key
      },
      value: {
        type: "boolean",
        data: !!data[key]
      },
      keyDescription: objectProperties[key].description,
      removable: false,
      resetable: true,
      source
    });
  }
  return displayValues;
}
function createArraySuggester(element) {
  return (keys, idx) => {
    const enumOptions = [];
    if (element.setting.enum) {
      element.setting.enum.forEach((key, i) => {
        if (!element.setting.uniqueItems || idx !== void 0 && key === keys[idx] || !keys.includes(key)) {
          const description = element.setting.enumDescriptions?.[i];
          enumOptions.push({ value: key, description });
        }
      });
    }
    return enumOptions.length > 0 ? { type: "enum", data: enumOptions[0].value, options: enumOptions } : void 0;
  };
}
function createObjectKeySuggester(element) {
  const { objectProperties } = element.setting;
  const allStaticKeys = Object.keys(objectProperties ?? {});
  return (keys) => {
    const existingKeys = new Set(keys);
    const enumOptions = [];
    allStaticKeys.forEach((staticKey) => {
      if (!existingKeys.has(staticKey)) {
        enumOptions.push({ value: staticKey, description: objectProperties[staticKey].description });
      }
    });
    return enumOptions.length > 0 ? { type: "enum", data: enumOptions[0].value, options: enumOptions } : void 0;
  };
}
function createObjectValueSuggester(element) {
  const { objectProperties, objectPatternProperties, objectAdditionalProperties } = element.setting;
  const patternsAndSchemas = Object.entries(objectPatternProperties ?? {}).map(([pattern, schema]) => ({
    pattern: new RegExp(pattern),
    schema
  }));
  return (key) => {
    let suggestedSchema;
    if (isDefined(objectProperties) && key in objectProperties) {
      suggestedSchema = objectProperties[key];
    }
    const patternSchema = suggestedSchema ?? patternsAndSchemas.find(({ pattern }) => pattern.test(key))?.schema;
    if (isDefined(patternSchema)) {
      suggestedSchema = patternSchema;
    } else if (isDefined(objectAdditionalProperties) && typeof objectAdditionalProperties === "object") {
      suggestedSchema = objectAdditionalProperties;
    }
    if (isDefined(suggestedSchema)) {
      const type = getObjectValueType(suggestedSchema);
      if (type === "boolean") {
        return { type, data: suggestedSchema.default ?? true };
      } else if (type === "enum") {
        const options = getEnumOptionsFromSchema(suggestedSchema);
        return { type, data: suggestedSchema.default ?? options[0].value, options };
      } else {
        return { type, data: suggestedSchema.default ?? "" };
      }
    }
    return;
  };
}
function isNonNullableNumericType(type) {
  return type === "number" || type === "integer";
}
function parseNumericObjectValues(dataElement, v) {
  const newRecord = {};
  for (const key in v) {
    let keyMatchesNumericProperty;
    const patternProperties = dataElement.setting.objectPatternProperties;
    const properties = dataElement.setting.objectProperties;
    const additionalProperties = dataElement.setting.objectAdditionalProperties;
    if (properties) {
      for (const propKey in properties) {
        if (propKey === key) {
          keyMatchesNumericProperty = isNonNullableNumericType(properties[propKey].type);
          break;
        }
      }
    }
    if (keyMatchesNumericProperty === void 0 && patternProperties) {
      for (const patternKey in patternProperties) {
        if (key.match(patternKey)) {
          keyMatchesNumericProperty = isNonNullableNumericType(patternProperties[patternKey].type);
          break;
        }
      }
    }
    if (keyMatchesNumericProperty === void 0 && additionalProperties && typeof additionalProperties !== "boolean") {
      if (isNonNullableNumericType(additionalProperties.type)) {
        keyMatchesNumericProperty = true;
      }
    }
    newRecord[key] = keyMatchesNumericProperty ? Number(v[key]) : v[key];
  }
  return newRecord;
}
function getListDisplayValue(element) {
  if (!element.value || !Array.isArray(element.value)) {
    return [];
  }
  if (element.setting.arrayItemType === "enum") {
    let enumOptions = [];
    if (element.setting.enum) {
      enumOptions = element.setting.enum.map((setting, i) => {
        return {
          value: setting,
          description: element.setting.enumDescriptions?.[i]
        };
      });
    }
    return element.value.map((key) => {
      return {
        value: {
          type: "enum",
          data: key,
          options: enumOptions
        }
      };
    });
  } else {
    return element.value.map((key) => {
      return {
        value: {
          type: "string",
          data: key
        }
      };
    });
  }
}
function getShowAddButtonList(dataElement, listDisplayValue) {
  if (dataElement.setting.enum && dataElement.setting.uniqueItems) {
    return dataElement.setting.enum.length - listDisplayValue.length > 0;
  } else {
    return true;
  }
}
function resolveSettingsTree(tocData, coreSettingsGroups, filter, logService) {
  const allSettings = getFlatSettings(coreSettingsGroups);
  return {
    tree: _resolveSettingsTree(tocData, allSettings, filter, logService),
    leftoverSettings: allSettings
  };
}
function resolveConfiguredUntrustedSettings(groups, target, languageFilter, configurationService) {
  const allSettings = getFlatSettings(groups);
  return [...allSettings].filter((setting) => setting.restricted && inspectSetting(setting.key, target, languageFilter, configurationService).isConfigured);
}
async function createTocTreeForExtensionSettings(extensionService, groups, filter) {
  const extGroupTree = /* @__PURE__ */ new Map();
  const addEntryToTree = (extensionId, extensionName, childEntry) => {
    if (!extGroupTree.has(extensionId)) {
      const rootEntry = {
        id: extensionId,
        label: extensionName,
        children: []
      };
      extGroupTree.set(extensionId, rootEntry);
    }
    extGroupTree.get(extensionId).children.push(childEntry);
  };
  const processGroupEntry = async (group) => {
    const flatSettings = group.sections.map((section) => section.settings).flat();
    const settings = filter ? getMatchingSettings(new Set(flatSettings), filter) : flatSettings;
    sortSettings(settings);
    const extensionId = group.extensionInfo.id;
    const extension = await extensionService.getExtension(extensionId);
    const extensionName = extension?.displayName ?? extension?.name ?? extensionId;
    const settingGroupId = group.id && group.id !== extensionId ? group.id : group.title;
    const childEntry = {
      id: settingGroupId,
      label: group.title,
      order: group.order,
      settings
    };
    addEntryToTree(extensionId, extensionName, childEntry);
  };
  const processPromises = groups.map((g) => processGroupEntry(g));
  return Promise.all(processPromises).then(() => {
    const extGroups = [];
    for (const extensionRootEntry of extGroupTree.values()) {
      if (extensionRootEntry.children.length === 1) {
        extGroups.push({
          id: extensionRootEntry.id,
          label: extensionRootEntry.children[0].label,
          settings: extensionRootEntry.children[0].settings
        });
      } else {
        extensionRootEntry.children.sort((a, b) => {
          return compareTwoNullableNumbers(a.order, b.order);
        });
        const ungroupedChild = extensionRootEntry.children.find((child) => child.label === extensionRootEntry.label);
        if (ungroupedChild && !ungroupedChild.children) {
          const groupedChildren = extensionRootEntry.children.filter((child) => child !== ungroupedChild);
          extGroups.push({
            id: extensionRootEntry.id,
            label: extensionRootEntry.label,
            settings: ungroupedChild.settings,
            children: groupedChildren
          });
        } else {
          extGroups.push(extensionRootEntry);
        }
      }
    }
    extGroups.sort((a, b) => a.label.localeCompare(b.label));
    return {
      id: "extensions",
      label: localize("extensions", "Extensions"),
      children: extGroups
    };
  });
}
function _resolveSettingsTree(tocData, allSettings, filter, logService) {
  let children;
  if (tocData.children) {
    children = tocData.children.filter((child) => child.hide !== true).map((child) => _resolveSettingsTree(child, allSettings, filter, logService)).filter((child) => child.children?.length || child.settings?.length);
  }
  let settings;
  if (filter || tocData.settings) {
    settings = getMatchingSettings(allSettings, {
      include: {
        keyPatterns: [...filter?.include?.keyPatterns ?? [], ...tocData.settings ?? []],
        tags: filter?.include?.tags ? [...filter.include.tags] : []
      },
      exclude: filter?.exclude ?? {}
    });
    sortSettings(settings);
  }
  if (!children && !settings) {
    throw new Error(`TOC node has no child groups or settings: ${tocData.id}`);
  }
  return {
    id: tocData.id,
    label: tocData.label,
    children,
    settings
  };
}
function sortSettings(settings) {
  const SETTING_STATUS_NORMAL = 0;
  const SETTING_STATUS_PREVIEW = 1;
  const SETTING_STATUS_EXPERIMENTAL = 2;
  const getExperimentalStatus = (setting) => {
    if (setting.tags?.includes("experimental")) {
      return SETTING_STATUS_EXPERIMENTAL;
    } else if (setting.tags?.includes("preview")) {
      return SETTING_STATUS_PREVIEW;
    }
    return SETTING_STATUS_NORMAL;
  };
  settings.sort((a, b) => {
    const experimentalStatusA = getExperimentalStatus(a);
    const experimentalStatusB = getExperimentalStatus(b);
    if (experimentalStatusA !== experimentalStatusB) {
      return experimentalStatusA - experimentalStatusB;
    }
    const orderComparison = compareTwoNullableNumbers(a.order, b.order);
    return orderComparison !== 0 ? orderComparison : a.key.localeCompare(b.key);
  });
}
function getMatchingSettings(allSettings, filter) {
  const result = [];
  allSettings.forEach((setting) => {
    let shouldInclude = false;
    let shouldExclude = false;
    if (filter.include?.keyPatterns) {
      shouldInclude = filter.include.keyPatterns.some((pattern) => {
        if (pattern.startsWith("@tag:")) {
          const tagName = pattern.substring(5);
          return setting.tags?.includes(tagName);
        } else {
          return settingMatches(setting, pattern);
        }
      });
    } else {
      shouldInclude = true;
    }
    if (shouldInclude && filter.include?.tags?.length) {
      shouldInclude = filter.include.tags.some((tag) => setting.tags?.includes(tag));
    }
    if (filter.exclude?.keyPatterns) {
      shouldExclude = filter.exclude.keyPatterns.some((pattern) => {
        if (pattern.startsWith("@tag:")) {
          const tagName = pattern.substring(5);
          return setting.tags?.includes(tagName);
        } else {
          return settingMatches(setting, pattern);
        }
      });
    }
    if (!shouldExclude && filter.exclude?.tags?.length) {
      shouldExclude = filter.exclude.tags.some((tag) => setting.tags?.includes(tag));
    }
    if (shouldInclude && !shouldExclude) {
      result.push(setting);
      if (!multiGroupTocSettings.has(setting.key)) {
        allSettings.delete(setting);
      }
    }
  });
  return result;
}
const settingPatternCache = /* @__PURE__ */ new Map();
function createSettingMatchRegExp(pattern) {
  pattern = escapeRegExpCharacters(pattern).replace(/\\\*/g, ".*");
  return new RegExp(`^${pattern}$`, "i");
}
function settingMatches(s, pattern) {
  let regExp = settingPatternCache.get(pattern);
  if (!regExp) {
    regExp = createSettingMatchRegExp(pattern);
    settingPatternCache.set(pattern, regExp);
  }
  return regExp.test(s.key);
}
function getFlatSettings(settingsGroups) {
  const result = /* @__PURE__ */ new Set();
  for (const group of settingsGroups) {
    for (const section of group.sections) {
      for (const s of section.settings) {
        if (!s.overrides || !s.overrides.length) {
          result.add(s);
        }
      }
    }
  }
  return result;
}
const SETTINGS_TEXT_TEMPLATE_ID = "settings.text.template";
const SETTINGS_MULTILINE_TEXT_TEMPLATE_ID = "settings.multilineText.template";
const SETTINGS_NUMBER_TEMPLATE_ID = "settings.number.template";
const SETTINGS_ENUM_TEMPLATE_ID = "settings.enum.template";
const SETTINGS_BOOL_TEMPLATE_ID = "settings.bool.template";
const SETTINGS_ARRAY_TEMPLATE_ID = "settings.array.template";
const SETTINGS_EXCLUDE_TEMPLATE_ID = "settings.exclude.template";
const SETTINGS_INCLUDE_TEMPLATE_ID = "settings.include.template";
const SETTINGS_OBJECT_TEMPLATE_ID = "settings.object.template";
const SETTINGS_BOOL_OBJECT_TEMPLATE_ID = "settings.boolObject.template";
const SETTINGS_COMPLEX_TEMPLATE_ID = "settings.complex.template";
const SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID = "settings.complexObject.template";
const SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID = "settings.newExtensions.template";
const SETTINGS_ELEMENT_TEMPLATE_ID = "settings.group.template";
const SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID = "settings.extensionToggle.template";
function removeChildrenFromTabOrder(node) {
  const focusableElements = node.querySelectorAll(`
		[tabindex="0"],
		input:not([tabindex="-1"]),
		select:not([tabindex="-1"]),
		textarea:not([tabindex="-1"]),
		a:not([tabindex="-1"]),
		button:not([tabindex="-1"]),
		area:not([tabindex="-1"])
	`);
  focusableElements.forEach((element) => {
    element.setAttribute(AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR, "true");
    element.setAttribute("tabindex", "-1");
  });
}
function addChildrenToTabOrder(node) {
  const focusableElements = node.querySelectorAll(
    `[${AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR}="true"]`
  );
  focusableElements.forEach((element) => {
    element.removeAttribute(AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR);
    element.setAttribute("tabindex", "0");
  });
}
let AbstractSettingRenderer = class extends Disposable {
  constructor(settingActions, disposableActionFactory, _themeService, _contextViewService, _openerService, _instantiationService, _commandService, _contextMenuService, _keybindingService, _configService, _extensionsService, _extensionsWorkbenchService, _productService, _telemetryService, _hoverService, _markdownRendererService) {
    super();
    this.settingActions = settingActions;
    this.disposableActionFactory = disposableActionFactory;
    this._themeService = _themeService;
    this._contextViewService = _contextViewService;
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._commandService = _commandService;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._configService = _configService;
    this._extensionsService = _extensionsService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._productService = _productService;
    this._telemetryService = _telemetryService;
    this._hoverService = _hoverService;
    this._markdownRendererService = _markdownRendererService;
    this._onDidClickOverrideElement = this._register(new Emitter());
    this.onDidClickOverrideElement = this._onDidClickOverrideElement.event;
    this._onDidChangeSetting = this._register(new Emitter());
    this.onDidChangeSetting = this._onDidChangeSetting.event;
    this._onDidOpenSettings = this._register(new Emitter());
    this.onDidOpenSettings = this._onDidOpenSettings.event;
    this._onDidClickSettingLink = this._register(new Emitter());
    this.onDidClickSettingLink = this._onDidClickSettingLink.event;
    this._onDidFocusSetting = this._register(new Emitter());
    this.onDidFocusSetting = this._onDidFocusSetting.event;
    this._onDidChangeIgnoredSettings = this._register(new Emitter());
    this.onDidChangeIgnoredSettings = this._onDidChangeIgnoredSettings.event;
    this._onDidChangeSettingHeight = this._register(new Emitter());
    this.onDidChangeSettingHeight = this._onDidChangeSettingHeight.event;
    this._onApplyFilter = this._register(new Emitter());
    this.onApplyFilter = this._onApplyFilter.event;
    this.ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this._configService);
    this._register(this._configService.onDidChangeConfiguration((e) => {
      this.ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this._configService);
      this._onDidChangeIgnoredSettings.fire();
    }));
  }
  renderCommonTemplate(tree, _container, typeClass) {
    _container.classList.add("setting-item");
    _container.classList.add("setting-item-" + typeClass);
    const toDispose = new DisposableStore();
    const container = DOM.append(_container, $(AbstractSettingRenderer.CONTENTS_SELECTOR));
    container.classList.add("settings-row-inner-container");
    const titleElement = DOM.append(container, $(".setting-item-title"));
    const labelCategoryContainer = DOM.append(titleElement, $(".setting-item-cat-label-container"));
    const categoryElement = DOM.append(labelCategoryContainer, $("span.setting-item-category"));
    const labelElementContainer = DOM.append(labelCategoryContainer, $("span.setting-item-label"));
    const labelElement = toDispose.add(new SimpleIconLabel(labelElementContainer));
    const indicatorsLabel = toDispose.add(this._instantiationService.createInstance(SettingsTreeIndicatorsLabel, titleElement));
    const descriptionElement = DOM.append(container, $(".setting-item-description"));
    const modifiedIndicatorElement = DOM.append(container, $(".setting-item-modified-indicator"));
    toDispose.add(this._hoverService.setupDelayedHover(modifiedIndicatorElement, {
      content: localize("modified", "The setting has been configured in the current scope.")
    }));
    const valueElement = DOM.append(container, $(".setting-item-value"));
    const controlElement = DOM.append(valueElement, $("div.setting-item-control"));
    const deprecationWarningElement = DOM.append(container, $(".setting-item-deprecation-message"));
    const toolbarContainer = DOM.append(container, $(".setting-toolbar-container"));
    const toolbar = toDispose.add(this.renderSettingToolbar(toolbarContainer));
    const template = {
      toDispose,
      elementDisposables: toDispose.add(new DisposableStore()),
      containerElement: container,
      categoryElement,
      labelElement,
      descriptionElement,
      controlElement,
      deprecationWarningElement,
      indicatorsLabel,
      toolbar
    };
    toDispose.add(DOM.addDisposableListener(controlElement, DOM.EventType.MOUSE_DOWN, (e) => e.stopPropagation()));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, (e) => container.classList.add("mouseover")));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, (e) => container.classList.remove("mouseover")));
    return template;
  }
  addSettingElementFocusHandler(template) {
    const focusTracker = DOM.trackFocus(template.containerElement);
    template.toDispose.add(focusTracker);
    template.toDispose.add(focusTracker.onDidBlur(() => {
      if (template.containerElement.classList.contains("focused")) {
        template.containerElement.classList.remove("focused");
      }
    }));
    template.toDispose.add(focusTracker.onDidFocus(() => {
      template.containerElement.classList.add("focused");
      if (template.context) {
        this._onDidFocusSetting.fire(template.context);
      }
    }));
  }
  renderSettingToolbar(container) {
    const toggleMenuTitle = this._keybindingService.appendKeybinding(
      localize("settingsContextMenuTitle", "More Actions... "),
      SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU
    );
    const toolbar = new ToolBar(container, this._contextMenuService, {
      toggleMenuTitle,
      renderDropdownAsChildElement: !isIOS,
      moreIcon: settingsMoreActionIcon
    });
    return toolbar;
  }
  renderSettingElement(node, index, template) {
    const element = node.element;
    element.inspectSelf();
    template.context = element;
    template.toolbar.context = element;
    const actions = this.disposableActionFactory(element.setting, element.settingsTarget);
    actions.forEach((a) => isDisposable(a) && template.elementDisposables.add(a));
    template.toolbar.setActions([], [...this.settingActions, ...actions]);
    const setting = element.setting;
    template.containerElement.classList.toggle("is-configured", element.isConfigured);
    template.containerElement.setAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR, element.setting.key);
    template.containerElement.setAttribute(AbstractSettingRenderer.SETTING_ID_ATTR, element.id);
    const titleTooltip = setting.key + (element.isConfigured ? " - Modified" : "");
    template.categoryElement.textContent = element.displayCategory ? element.displayCategory + ": " : "";
    template.elementDisposables.add(this._hoverService.setupDelayedHover(template.categoryElement, { content: titleTooltip }));
    template.labelElement.text = element.displayLabel;
    template.labelElement.title = titleTooltip;
    template.descriptionElement.innerText = "";
    if (element.setting.descriptionIsMarkdown) {
      const renderedDescription = this.renderSettingMarkdown(element, template.containerElement, element.description, template.elementDisposables);
      template.descriptionElement.appendChild(renderedDescription);
    } else {
      template.descriptionElement.innerText = element.description;
    }
    template.indicatorsLabel.updateScopeOverrides(element, this._onDidClickOverrideElement, this._onApplyFilter);
    template.elementDisposables.add(this._configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(APPLY_ALL_PROFILES_SETTING)) {
        template.indicatorsLabel.updateScopeOverrides(element, this._onDidClickOverrideElement, this._onApplyFilter);
      }
    }));
    const onChange = (value) => this._onDidChangeSetting.fire({
      key: element.setting.key,
      value,
      type: template.context.valueType,
      manualReset: false,
      scope: element.setting.scope
    });
    const deprecationText = element.setting.deprecationMessage || "";
    if (deprecationText && element.setting.deprecationMessageIsMarkdown) {
      template.deprecationWarningElement.innerText = "";
      template.deprecationWarningElement.appendChild(this.renderSettingMarkdown(element, template.containerElement, element.setting.deprecationMessage, template.elementDisposables));
    } else {
      template.deprecationWarningElement.innerText = deprecationText;
    }
    template.deprecationWarningElement.prepend($(".codicon.codicon-error"));
    template.containerElement.classList.toggle("is-deprecated", !!deprecationText);
    this.renderValue(element, template, onChange);
    template.indicatorsLabel.updateWorkspaceTrust(element);
    template.indicatorsLabel.updateSyncIgnored(element, this.ignoredSettings);
    template.indicatorsLabel.updateDefaultOverrideIndicator(element);
    template.indicatorsLabel.updatePreviewIndicator(element);
    template.indicatorsLabel.updateAdvancedIndicator(element);
    template.elementDisposables.add(this.onDidChangeIgnoredSettings(() => {
      template.indicatorsLabel.updateSyncIgnored(element, this.ignoredSettings);
    }));
    this.updateSettingTabbable(element, template);
    template.elementDisposables.add(element.onDidChangeTabbable(() => {
      this.updateSettingTabbable(element, template);
    }));
  }
  updateSettingTabbable(element, template) {
    if (element.tabbable) {
      addChildrenToTabOrder(template.containerElement);
    } else {
      removeChildrenFromTabOrder(template.containerElement);
    }
  }
  renderSettingMarkdown(element, container, text, disposables) {
    text = fixSettingLinks(text);
    const renderedMarkdown = disposables.add(this._markdownRendererService.render({ value: text, isTrusted: true }, {
      actionHandler: (content) => {
        if (content.startsWith("#")) {
          const e = {
            source: element,
            targetKey: content.substring(1)
          };
          this._onDidClickSettingLink.fire(e);
        } else {
          this._openerService.open(content, { allowCommands: true }).catch(onUnexpectedError);
        }
      },
      asyncRenderCallback: () => {
        const height = container.clientHeight;
        if (height) {
          this._onDidChangeSettingHeight.fire({ element, height });
        }
      }
    }));
    renderedMarkdown.element.classList.add("setting-item-markdown");
    cleanRenderedMarkdown(renderedMarkdown.element);
    return renderedMarkdown.element;
  }
  disposeTemplate(template) {
    template.toDispose.dispose();
  }
  disposeElement(_element, _index, template) {
    template.elementDisposables?.clear();
  }
};
AbstractSettingRenderer.CONTROL_CLASS = "setting-control-focus-target";
AbstractSettingRenderer.CONTROL_SELECTOR = "." + AbstractSettingRenderer.CONTROL_CLASS;
AbstractSettingRenderer.CONTENTS_CLASS = "setting-item-contents";
AbstractSettingRenderer.CONTENTS_SELECTOR = "." + AbstractSettingRenderer.CONTENTS_CLASS;
AbstractSettingRenderer.ALL_ROWS_SELECTOR = ".monaco-list-row";
AbstractSettingRenderer.SETTING_KEY_ATTR = "data-key";
AbstractSettingRenderer.SETTING_ID_ATTR = "data-id";
AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR = "data-focusable";
AbstractSettingRenderer = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IExtensionsWorkbenchService),
  __decorateParam(12, IProductService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IMarkdownRendererService)
], AbstractSettingRenderer);
class SettingGroupRenderer {
  constructor() {
    this.templateId = SETTINGS_ELEMENT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.classList.add("group-title");
    const template = {
      parent: container,
      toDispose: new DisposableStore()
    };
    return template;
  }
  renderElement(element, index, templateData) {
    templateData.parent.innerText = "";
    const labelElement = DOM.append(templateData.parent, $("div.settings-group-title-label.settings-row-inner-container"));
    labelElement.classList.add(`settings-group-level-${element.element.level}`);
    labelElement.textContent = element.element.label;
    if (element.element.isFirstGroup) {
      labelElement.classList.add("settings-group-first");
    }
  }
  disposeTemplate(templateData) {
    templateData.toDispose.dispose();
  }
}
let SettingNewExtensionsRenderer = class {
  constructor(_commandService) {
    this._commandService = _commandService;
    this.templateId = SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const toDispose = new DisposableStore();
    container.classList.add("setting-item-new-extensions");
    const button = new Button(container, { title: true, ...defaultButtonStyles });
    toDispose.add(button);
    toDispose.add(button.onDidClick(() => {
      if (template.context) {
        this._commandService.executeCommand("workbench.extensions.action.showExtensionsWithIds", template.context.extensionIds);
      }
    }));
    button.label = localize("newExtensionsButtonLabel", "Show matching extensions");
    button.element.classList.add("settings-new-extensions-button");
    const template = {
      button,
      toDispose
    };
    return template;
  }
  renderElement(element, index, templateData) {
    templateData.context = element.element;
  }
  disposeTemplate(template) {
    template.toDispose.dispose();
  }
};
SettingNewExtensionsRenderer = __decorateClass([
  __decorateParam(0, ICommandService)
], SettingNewExtensionsRenderer);
const _SettingComplexRenderer = class _SettingComplexRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_COMPLEX_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "complex");
    const openSettingsButton = DOM.append(common.controlElement, $("a.edit-in-settings-button"));
    openSettingsButton.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    openSettingsButton.role = "button";
    const validationErrorMessageElement = $(".setting-item-validation-message");
    common.containerElement.appendChild(validationErrorMessageElement);
    const template = {
      ...common,
      button: openSettingsButton,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const plainKey = getLanguageTagSettingPlainKey(dataElement.setting.key);
    const editLanguageSettingLabel = localize("editLanguageSettingLabel", "Edit settings for {0}", plainKey);
    const isLanguageTagSetting = dataElement.setting.isLanguageTagSetting;
    template.button.textContent = isLanguageTagSetting ? editLanguageSettingLabel : _SettingComplexRenderer.EDIT_IN_JSON_LABEL;
    const onClickOrKeydown = (e) => {
      if (isLanguageTagSetting) {
        this._onApplyFilter.fire(`@${LANGUAGE_SETTING_TAG}${plainKey.replaceAll(" ", "")}`);
      } else {
        this._onDidOpenSettings.fire(dataElement.setting.key);
      }
      e.preventDefault();
      e.stopPropagation();
    };
    template.elementDisposables.add(DOM.addDisposableListener(template.button, DOM.EventType.CLICK, (e) => {
      onClickOrKeydown(e);
    }));
    template.elementDisposables.add(DOM.addDisposableListener(template.button, DOM.EventType.KEY_DOWN, (e) => {
      const ev = new StandardKeyboardEvent(e);
      if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
        onClickOrKeydown(e);
      }
    }));
    this.renderValidations(dataElement, template);
    if (isLanguageTagSetting) {
      template.button.setAttribute("aria-label", editLanguageSettingLabel);
    } else {
      template.button.setAttribute("aria-label", `${_SettingComplexRenderer.EDIT_IN_JSON_LABEL}: ${dataElement.setting.key}`);
    }
  }
  renderValidations(dataElement, template) {
    const errMsg = dataElement.isConfigured && getInvalidTypeError(dataElement.value, dataElement.setting.type);
    if (errMsg) {
      template.containerElement.classList.add("invalid-input");
      template.validationErrorMessageElement.innerText = errMsg;
      return;
    }
    template.containerElement.classList.remove("invalid-input");
  }
};
_SettingComplexRenderer.EDIT_IN_JSON_LABEL = localize("editInSettingsJson", "Edit in settings.json");
let SettingComplexRenderer = _SettingComplexRenderer;
class SettingComplexObjectRenderer extends SettingComplexRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const objectSettingWidget = common.toDispose.add(this._instantiationService.createInstance(ObjectSettingDropdownWidget, common.controlElement));
    objectSettingWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    const openSettingsButton = DOM.append(DOM.append(common.controlElement, $(".complex-object-edit-in-settings-button-container")), $("a.complex-object.edit-in-settings-button"));
    openSettingsButton.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    openSettingsButton.role = "button";
    const validationErrorMessageElement = $(".setting-item-validation-message");
    common.containerElement.appendChild(validationErrorMessageElement);
    const template = {
      ...common,
      button: openSettingsButton,
      validationErrorMessageElement,
      objectSettingWidget
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderValue(dataElement, template, onChange) {
    const items = getObjectDisplayValue(dataElement);
    template.objectSettingWidget.setValue(items, {
      settingKey: dataElement.setting.key,
      showAddButton: false,
      isReadOnly: true
    });
    template.button.parentElement?.classList.toggle("hide", dataElement.hasPolicyValue || dataElement.isAgentsWindowReadOnly);
    super.renderValue(dataElement, template, onChange);
  }
}
class SettingArrayRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_ARRAY_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const descriptionElement = common.containerElement.querySelector(".setting-item-description");
    const validationErrorMessageElement = $(".setting-item-validation-message");
    descriptionElement.after(validationErrorMessageElement);
    const listWidget = this._instantiationService.createInstance(ListSettingWidget, common.controlElement);
    listWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    common.toDispose.add(listWidget);
    const template = {
      ...common,
      listWidget,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    common.toDispose.add(
      listWidget.onDidChangeList((e) => {
        const newList = this.computeNewList(template, e);
        template.onChange?.(newList);
      })
    );
    return template;
  }
  computeNewList(template, e) {
    if (template.context) {
      let newValue = [];
      if (Array.isArray(template.context.scopeValue)) {
        newValue = [...template.context.scopeValue];
      } else if (Array.isArray(template.context.value)) {
        newValue = [...template.context.value];
      }
      if (e.type === "move") {
        const sourceIndex = e.sourceIndex;
        const targetIndex = e.targetIndex;
        const splicedElem = newValue.splice(sourceIndex, 1)[0];
        newValue.splice(targetIndex, 0, splicedElem);
      } else if (e.type === "remove" || e.type === "reset") {
        newValue.splice(e.targetIndex, 1);
      } else if (e.type === "change") {
        const itemValueData = e.newItem.value.data.toString();
        if (e.targetIndex > -1) {
          newValue[e.targetIndex] = itemValueData;
        } else {
          newValue.push(itemValueData);
        }
      } else if (e.type === "add") {
        newValue.push(e.newItem.value.data.toString());
      }
      if (template.context.defaultValue && Array.isArray(template.context.defaultValue) && template.context.defaultValue.length === newValue.length && template.context.defaultValue.join() === newValue.join()) {
        return void 0;
      }
      return newValue;
    }
    return void 0;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const value = getListDisplayValue(dataElement);
    const keySuggester = dataElement.setting.enum ? createArraySuggester(dataElement) : void 0;
    template.listWidget.setValue(value, {
      showAddButton: getShowAddButtonList(dataElement, value),
      keySuggester
    });
    template.context = dataElement;
    template.elementDisposables.add(toDisposable(() => {
      template.listWidget.cancelEdit();
    }));
    template.onChange = (v) => {
      if (v && !renderArrayValidations(dataElement, template, v, false)) {
        const itemType = dataElement.setting.arrayItemType;
        const arrToSave = isNonNullableNumericType(itemType) ? v.map((a) => +a) : v;
        onChange(arrToSave);
      } else {
        onChange(v);
      }
    };
    renderArrayValidations(dataElement, template, value.map((v) => v.value.data.toString()), true);
  }
}
class AbstractSettingObjectRenderer extends AbstractSettingRenderer {
  renderTemplateWithWidget(common, widget) {
    widget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    common.toDispose.add(widget);
    const descriptionElement = common.containerElement.querySelector(".setting-item-description");
    const validationErrorMessageElement = $(".setting-item-validation-message");
    descriptionElement.after(validationErrorMessageElement);
    const template = {
      ...common,
      validationErrorMessageElement
    };
    if (widget instanceof ObjectSettingCheckboxWidget) {
      template.objectCheckboxWidget = widget;
    } else {
      template.objectDropdownWidget = widget;
    }
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
}
class SettingObjectRenderer extends AbstractSettingObjectRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_OBJECT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const widget = this._instantiationService.createInstance(ObjectSettingDropdownWidget, common.controlElement);
    const template = this.renderTemplateWithWidget(common, widget);
    common.toDispose.add(widget.onDidChangeList((e) => {
      this.onDidChangeObject(template, e);
    }));
    return template;
  }
  onDidChangeObject(template, e) {
    const widget = template.objectDropdownWidget;
    if (template.context) {
      const settingSupportsRemoveDefault = objectSettingSupportsRemoveDefaultValue(template.context.setting.key);
      const defaultValue = typeof template.context.defaultValue === "object" ? template.context.defaultValue ?? {} : {};
      const scopeValue = typeof template.context.scopeValue === "object" ? template.context.scopeValue ?? {} : {};
      const newValue = { ...template.context.scopeValue };
      const newItems = [];
      widget.items.forEach((item, idx) => {
        if ((e.type === "change" || e.type === "move") && e.targetIndex === idx) {
          if (e.originalItem.key.data !== e.newItem.key.data && settingSupportsRemoveDefault && e.originalItem.key.data in defaultValue) {
            newValue[e.originalItem.key.data] = null;
          } else {
            delete newValue[e.originalItem.key.data];
          }
          newValue[e.newItem.key.data] = e.newItem.value.data;
          newItems.push(e.newItem);
        } else if (e.type !== "change" && e.type !== "move" || e.newItem.key.data !== item.key.data) {
          newValue[item.key.data] = item.value.data;
          newItems.push(item);
        }
      });
      if (e.type === "remove" || e.type === "reset") {
        const objectKey = e.originalItem.key.data;
        const removingDefaultValue = e.type === "remove" && settingSupportsRemoveDefault && defaultValue[objectKey] === e.originalItem.value.data;
        if (removingDefaultValue) {
          newValue[objectKey] = null;
        } else {
          delete newValue[objectKey];
        }
        const itemToDelete = newItems.findIndex((item) => item.key.data === objectKey);
        const defaultItemValue = defaultValue[objectKey];
        if (removingDefaultValue || isUndefinedOrNull(defaultValue[objectKey]) && itemToDelete > -1) {
          newItems.splice(itemToDelete, 1);
        } else if (!removingDefaultValue && itemToDelete > -1) {
          newItems[itemToDelete].value.data = defaultItemValue;
        }
      } else if (e.type === "add") {
        newValue[e.newItem.key.data] = e.newItem.value.data;
        newItems.push(e.newItem);
      }
      Object.entries(newValue).forEach(([key, value]) => {
        if (scopeValue[key] !== value && defaultValue[key] === value && !(settingSupportsRemoveDefault && value === null)) {
          delete newValue[key];
        }
      });
      const newObject = Object.keys(newValue).length === 0 ? void 0 : newValue;
      template.objectDropdownWidget.setValue(newItems);
      template.onChange?.(newObject);
    }
  }
  renderValue(dataElement, template, onChange) {
    const items = getObjectDisplayValue(dataElement);
    const { key, objectProperties, objectPatternProperties, objectAdditionalProperties, propertyNames } = dataElement.setting;
    template.objectDropdownWidget.setValue(items, {
      settingKey: key,
      showAddButton: objectAdditionalProperties === false ? !areAllPropertiesDefined(Object.keys(objectProperties ?? {}), items) || isDefined(objectPatternProperties) : true,
      keySuggester: createObjectKeySuggester(dataElement),
      valueSuggester: createObjectValueSuggester(dataElement),
      propertyNames
    });
    template.context = dataElement;
    template.elementDisposables.add(toDisposable(() => {
      template.objectDropdownWidget.cancelEdit();
    }));
    template.onChange = (v) => {
      if (v && !renderArrayValidations(dataElement, template, v, false)) {
        const parsedRecord = parseNumericObjectValues(dataElement, v);
        onChange(parsedRecord);
      } else {
        onChange(v);
      }
    };
    renderArrayValidations(dataElement, template, dataElement.value, true);
  }
}
class SettingBoolObjectRenderer extends AbstractSettingObjectRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_BOOL_OBJECT_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const widget = this._instantiationService.createInstance(ObjectSettingCheckboxWidget, common.controlElement);
    const template = this.renderTemplateWithWidget(common, widget);
    common.toDispose.add(widget.onDidChangeList((e) => {
      this.onDidChangeObject(template, e);
    }));
    return template;
  }
  onDidChangeObject(template, e) {
    if (template.context) {
      const widget = template.objectCheckboxWidget;
      const defaultValue = typeof template.context.defaultValue === "object" ? template.context.defaultValue ?? {} : {};
      const scopeValue = typeof template.context.scopeValue === "object" ? template.context.scopeValue ?? {} : {};
      const newValue = { ...template.context.scopeValue };
      const newItems = [];
      if (e.type !== "change") {
        console.warn("Unexpected event type", e.type, "for bool object setting", template.context.setting.key);
        return;
      }
      widget.items.forEach((item, idx) => {
        if (e.targetIndex === idx) {
          newValue[e.newItem.key.data] = e.newItem.value.data;
          newItems.push(e.newItem);
        } else if (e.newItem.key.data !== item.key.data) {
          newValue[item.key.data] = item.value.data;
          newItems.push(item);
        }
      });
      Object.entries(newValue).forEach(([key, value]) => {
        if (scopeValue[key] !== value && defaultValue[key] === value) {
          delete newValue[key];
        }
      });
      const newObject = Object.keys(newValue).length === 0 ? void 0 : newValue;
      template.objectCheckboxWidget.setValue(newItems);
      template.onChange?.(newObject);
      this._onDidFocusSetting.fire(template.context);
    }
  }
  renderValue(dataElement, template, onChange) {
    const items = getBoolObjectDisplayValue(dataElement);
    const { key } = dataElement.setting;
    template.objectCheckboxWidget.setValue(items, {
      settingKey: key
    });
    template.context = dataElement;
    template.onChange = (v) => {
      onChange(v);
    };
  }
}
class SettingIncludeExcludeRenderer extends AbstractSettingRenderer {
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "list");
    const includeExcludeWidget = this._instantiationService.createInstance(this.isExclude() ? ExcludeSettingWidget : IncludeSettingWidget, common.controlElement);
    includeExcludeWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    common.toDispose.add(includeExcludeWidget);
    const template = {
      ...common,
      includeExcludeWidget
    };
    this.addSettingElementFocusHandler(template);
    common.toDispose.add(includeExcludeWidget.onDidChangeList((e) => this.onDidChangeIncludeExclude(template, e)));
    return template;
  }
  onDidChangeIncludeExclude(template, e) {
    if (template.context) {
      let sortKeys2 = function(obj) {
        const sortedKeys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
        const retVal = {};
        for (const key of sortedKeys) {
          retVal[key] = obj[key];
        }
        return retVal;
      };
      var sortKeys = sortKeys2;
      const newValue = { ...template.context.scopeValue };
      if (e.type !== "add") {
        if (e.originalItem.value.data.toString() in template.context.defaultValue) {
          newValue[e.originalItem.value.data.toString()] = false;
        } else {
          delete newValue[e.originalItem.value.data.toString()];
        }
      }
      if (e.type === "change" || e.type === "add" || e.type === "move") {
        if (e.newItem.value.data.toString() in template.context.defaultValue && !e.newItem.sibling) {
          delete newValue[e.newItem.value.data.toString()];
        } else {
          newValue[e.newItem.value.data.toString()] = e.newItem.sibling ? { when: e.newItem.sibling } : true;
        }
      }
      this._onDidChangeSetting.fire({
        key: template.context.setting.key,
        value: Object.keys(newValue).length === 0 ? void 0 : sortKeys2(newValue),
        type: template.context.valueType,
        manualReset: false,
        scope: template.context.setting.scope
      });
    }
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const value = getIncludeExcludeDisplayValue(dataElement);
    template.includeExcludeWidget.setValue(value, { isReadOnly: dataElement.hasPolicyValue || dataElement.isAgentsWindowReadOnly });
    template.context = dataElement;
    template.elementDisposables.add(toDisposable(() => {
      template.includeExcludeWidget.cancelEdit();
    }));
  }
}
class SettingExcludeRenderer extends SettingIncludeExcludeRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_EXCLUDE_TEMPLATE_ID;
  }
  isExclude() {
    return true;
  }
}
class SettingIncludeRenderer extends SettingIncludeExcludeRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_INCLUDE_TEMPLATE_ID;
  }
  isExclude() {
    return false;
  }
}
const settingsInputBoxStyles = getInputBoxStyle({
  inputBackground: settingsTextInputBackground,
  inputForeground: settingsTextInputForeground,
  inputBorder: settingsTextInputBorder
});
class AbstractSettingTextRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.MULTILINE_MAX_HEIGHT = 150;
  }
  renderTemplate(_container, useMultiline) {
    const common = this.renderCommonTemplate(null, _container, "text");
    const validationErrorMessageElement = DOM.append(common.containerElement, $(".setting-item-validation-message"));
    const inputBoxOptions = {
      flexibleHeight: useMultiline,
      flexibleWidth: false,
      flexibleMaxHeight: this.MULTILINE_MAX_HEIGHT,
      inputBoxStyles: settingsInputBoxStyles
    };
    const inputBox = new InputBox(common.controlElement, this._contextViewService, inputBoxOptions);
    common.toDispose.add(inputBox);
    common.toDispose.add(
      inputBox.onDidChange((e) => {
        template.onChange?.(e);
      })
    );
    common.toDispose.add(inputBox);
    inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    inputBox.inputElement.tabIndex = 0;
    const template = {
      ...common,
      inputBox,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    template.onChange = void 0;
    template.inputBox.value = dataElement.value;
    template.inputBox.setEnabled(!dataElement.hasPolicyValue && !dataElement.isAgentsWindowReadOnly);
    template.inputBox.setAriaLabel(dataElement.setting.key);
    template.onChange = (value) => {
      if (!renderValidations(dataElement, template, false)) {
        onChange(value);
      }
    };
    renderValidations(dataElement, template, true);
  }
}
class SettingTextRenderer extends AbstractSettingTextRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_TEXT_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    const template = super.renderTemplate(_container, false);
    template.toDispose.add(DOM.addStandardDisposableListener(template.inputBox.inputElement, DOM.EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.UpArrow) || e.equals(KeyCode.DownArrow)) {
        e.preventDefault();
      }
    }));
    return template;
  }
}
class SettingMultilineTextRenderer extends AbstractSettingTextRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_MULTILINE_TEXT_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    return super.renderTemplate(_container, true);
  }
  renderValue(dataElement, template, onChange) {
    const onChangeOverride = (value) => {
      dataElement.value = value;
      onChange(value);
    };
    super.renderValue(dataElement, template, onChangeOverride);
    template.elementDisposables.add(
      template.inputBox.onDidHeightChange((e) => {
        const height = template.containerElement.clientHeight;
        if (height) {
          this._onDidChangeSettingHeight.fire({
            element: dataElement,
            height: template.containerElement.clientHeight
          });
        }
      })
    );
    template.inputBox.layout();
  }
}
class SettingEnumRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_ENUM_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const common = this.renderCommonTemplate(null, container, "enum");
    const styles = getSelectBoxStyles({
      selectBackground: settingsSelectBackground,
      selectForeground: settingsSelectForeground,
      selectBorder: settingsSelectBorder,
      selectListBorder: settingsSelectListBorder
    });
    const selectBox = new SelectBox([], 0, this._contextViewService, styles, {
      useCustomDrawn: !hasNativeContextMenu(this._configService) || !(isIOS && BrowserFeatures.pointerEvents)
    });
    common.toDispose.add(selectBox);
    selectBox.render(common.controlElement);
    const selectElement = common.controlElement.querySelector("select");
    if (selectElement) {
      selectElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
      selectElement.tabIndex = 0;
    }
    common.toDispose.add(
      selectBox.onDidSelect((e) => {
        template.onChange?.(e.index);
      })
    );
    const enumDescriptionElement = common.containerElement.insertBefore($(".setting-item-enumDescription"), common.descriptionElement.nextSibling);
    const template = {
      ...common,
      selectBox,
      selectElement,
      enumDescriptionElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const enumItemLabels = dataElement.setting.enumItemLabels ? [...dataElement.setting.enumItemLabels] : [];
    const enumDescriptions = dataElement.setting.enumDescriptions ? [...dataElement.setting.enumDescriptions] : [];
    const settingEnum = [...dataElement.setting.enum];
    const enumDescriptionsAreMarkdown = dataElement.setting.enumDescriptionsAreMarkdown;
    const disposables = new DisposableStore();
    template.elementDisposables.add(disposables);
    let createdDefault = false;
    if (!settingEnum.includes(dataElement.defaultValue)) {
      settingEnum.unshift(dataElement.defaultValue);
      enumDescriptions.unshift("");
      enumItemLabels.unshift("");
      createdDefault = true;
    }
    const stringifiedDefaultValue = escapeInvisibleChars(String(dataElement.defaultValue));
    const displayOptions = settingEnum.map(String).map(escapeInvisibleChars).map((data, index) => {
      const description = enumDescriptions[index] && (enumDescriptionsAreMarkdown ? fixSettingLinks(enumDescriptions[index], false) : enumDescriptions[index]);
      return {
        text: enumItemLabels[index] ? enumItemLabels[index] : data,
        detail: enumItemLabels[index] ? data : "",
        description,
        descriptionIsMarkdown: enumDescriptionsAreMarkdown,
        descriptionMarkdownActionHandler: (content) => {
          this._openerService.open(content).catch(onUnexpectedError);
        },
        decoratorRight: data === stringifiedDefaultValue || createdDefault && index === 0 ? localize("settings.Default", "default") : ""
      };
    });
    template.selectBox.setOptions(displayOptions);
    template.selectBox.setAriaLabel(dataElement.setting.key);
    template.selectBox.setEnabled(!dataElement.hasPolicyValue && !dataElement.isAgentsWindowReadOnly);
    let idx = settingEnum.indexOf(dataElement.value);
    if (idx === -1) {
      idx = 0;
    }
    template.onChange = void 0;
    template.selectBox.select(idx);
    template.onChange = (idx2) => {
      if (createdDefault && idx2 === 0) {
        onChange(dataElement.defaultValue);
      } else {
        onChange(settingEnum[idx2]);
      }
    };
    template.enumDescriptionElement.innerText = "";
  }
}
const settingsNumberInputBoxStyles = getInputBoxStyle({
  inputBackground: settingsNumberInputBackground,
  inputForeground: settingsNumberInputForeground,
  inputBorder: settingsNumberInputBorder
});
class SettingNumberRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_NUMBER_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    const common = super.renderCommonTemplate(null, _container, "number");
    const validationErrorMessageElement = DOM.append(common.containerElement, $(".setting-item-validation-message"));
    const inputBox = new InputBox(common.controlElement, this._contextViewService, { type: "number", inputBoxStyles: settingsNumberInputBoxStyles });
    common.toDispose.add(inputBox);
    common.toDispose.add(
      inputBox.onDidChange((e) => {
        template.onChange?.(e);
      })
    );
    common.toDispose.add(inputBox);
    inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    inputBox.inputElement.tabIndex = 0;
    const template = {
      ...common,
      inputBox,
      validationErrorMessageElement
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    const numParseFn = dataElement.valueType === "integer" || dataElement.valueType === "nullable-integer" ? parseInt : parseFloat;
    const nullNumParseFn = dataElement.valueType === "nullable-integer" || dataElement.valueType === "nullable-number" ? ((v) => v === "" ? null : numParseFn(v)) : numParseFn;
    template.onChange = void 0;
    template.inputBox.value = typeof dataElement.value === "number" ? dataElement.value.toString() : "";
    template.inputBox.step = dataElement.valueType.includes("integer") ? "1" : "any";
    template.inputBox.setAriaLabel(dataElement.setting.key);
    template.inputBox.setEnabled(!dataElement.hasPolicyValue && !dataElement.isAgentsWindowReadOnly);
    template.onChange = (value) => {
      if (!renderValidations(dataElement, template, false)) {
        onChange(nullNumParseFn(value));
      }
    };
    renderValidations(dataElement, template, true);
  }
}
class SettingBoolRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_BOOL_TEMPLATE_ID;
  }
  renderTemplate(_container) {
    _container.classList.add("setting-item");
    _container.classList.add("setting-item-bool");
    const toDispose = new DisposableStore();
    const container = DOM.append(_container, $(AbstractSettingRenderer.CONTENTS_SELECTOR));
    container.classList.add("settings-row-inner-container");
    const titleElement = DOM.append(container, $(".setting-item-title"));
    const categoryElement = DOM.append(titleElement, $("span.setting-item-category"));
    const labelElementContainer = DOM.append(titleElement, $("span.setting-item-label"));
    const labelElement = toDispose.add(new SimpleIconLabel(labelElementContainer));
    const indicatorsLabel = toDispose.add(this._instantiationService.createInstance(SettingsTreeIndicatorsLabel, titleElement));
    const descriptionAndValueElement = DOM.append(container, $(".setting-item-value-description"));
    const controlElement = DOM.append(descriptionAndValueElement, $(".setting-item-bool-control"));
    const descriptionElement = DOM.append(descriptionAndValueElement, $(".setting-item-description"));
    const modifiedIndicatorElement = DOM.append(container, $(".setting-item-modified-indicator"));
    toDispose.add(this._hoverService.setupDelayedHover(modifiedIndicatorElement, {
      content: localize("modified", "The setting has been configured in the current scope.")
    }));
    const deprecationWarningElement = DOM.append(container, $(".setting-item-deprecation-message"));
    const checkbox = new Toggle({ icon: Codicon.check, actionClassName: "setting-value-checkbox", isChecked: true, title: "", ...unthemedToggleStyles });
    controlElement.appendChild(checkbox.domNode);
    toDispose.add(checkbox);
    toDispose.add(checkbox.onChange(() => {
      template.onChange(checkbox.checked);
    }));
    checkbox.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
    const toolbarContainer = DOM.append(container, $(".setting-toolbar-container"));
    const toolbar = this.renderSettingToolbar(toolbarContainer);
    toDispose.add(toolbar);
    const template = {
      toDispose,
      elementDisposables: toDispose.add(new DisposableStore()),
      containerElement: container,
      categoryElement,
      labelElement,
      controlElement,
      checkbox,
      descriptionElement,
      deprecationWarningElement,
      indicatorsLabel,
      toolbar
    };
    this.addSettingElementFocusHandler(template);
    toDispose.add(DOM.addDisposableListener(controlElement, "mousedown", (e) => e.stopPropagation()));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, (e) => container.classList.add("mouseover")));
    toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, (e) => container.classList.remove("mouseover")));
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    template.onChange = void 0;
    template.checkbox.checked = dataElement.value;
    if (dataElement.hasPolicyValue || dataElement.isAgentsWindowReadOnly) {
      template.checkbox.disable();
      template.descriptionElement.classList.add("disabled");
    } else {
      template.checkbox.enable();
      template.descriptionElement.classList.remove("disabled");
      template.elementDisposables.add(DOM.addDisposableListener(template.descriptionElement, DOM.EventType.MOUSE_DOWN, (e) => {
        const targetElement = e.target instanceof Element ? e.target : null;
        if (!targetElement || !targetElement.closest("a")) {
          template.checkbox.checked = !template.checkbox.checked;
          template.onChange(template.checkbox.checked);
        }
        DOM.EventHelper.stop(e);
      }));
    }
    template.checkbox.setTitle(dataElement.setting.key);
    template.onChange = onChange;
  }
}
class SettingsExtensionToggleRenderer extends AbstractSettingRenderer {
  constructor() {
    super(...arguments);
    this.templateId = SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID;
    this._onDidDismissExtensionSetting = this._register(new Emitter());
    this.onDidDismissExtensionSetting = this._onDidDismissExtensionSetting.event;
  }
  renderTemplate(_container) {
    const common = super.renderCommonTemplate(null, _container, "extension-toggle");
    const actionButton = new Button(common.containerElement, {
      title: false,
      ...defaultButtonStyles
    });
    actionButton.element.classList.add("setting-item-extension-toggle-button");
    actionButton.label = localize("showExtension", "Show Extension");
    const dismissButton = new Button(common.containerElement, {
      title: false,
      secondary: true,
      ...defaultButtonStyles
    });
    dismissButton.element.classList.add("setting-item-extension-dismiss-button");
    dismissButton.label = localize("dismiss", "Dismiss");
    const template = {
      ...common,
      actionButton,
      dismissButton
    };
    this.addSettingElementFocusHandler(template);
    return template;
  }
  renderElement(element, index, templateData) {
    super.renderSettingElement(element, index, templateData);
  }
  renderValue(dataElement, template, onChange) {
    template.elementDisposables.clear();
    const extensionId = dataElement.setting.displayExtensionId;
    template.elementDisposables.add(template.actionButton.onDidClick(async () => {
      this._telemetryService.publicLog2("ManageExtensionClick", { extensionId });
      this._commandService.executeCommand("extension.open", extensionId);
    }));
    template.elementDisposables.add(template.dismissButton.onDidClick(async () => {
      this._telemetryService.publicLog2("DismissExtensionClick", { extensionId });
      this._onDidDismissExtensionSetting.fire(extensionId);
    }));
  }
}
let SettingTreeRenderers = class extends Disposable {
  constructor(_instantiationService, _contextMenuService, _contextViewService, _userDataSyncEnablementService) {
    super();
    this._instantiationService = _instantiationService;
    this._contextMenuService = _contextMenuService;
    this._contextViewService = _contextViewService;
    this._userDataSyncEnablementService = _userDataSyncEnablementService;
    this._onDidChangeSetting = this._register(new Emitter());
    this.settingActions = [
      new Action("settings.resetSetting", localize("resetSettingLabel", "Reset Setting"), void 0, void 0, async (context) => {
        if (context instanceof SettingsTreeSettingElement) {
          if (!context.isUntrusted) {
            this._onDidChangeSetting.fire({
              key: context.setting.key,
              value: void 0,
              type: context.setting.type,
              manualReset: true,
              scope: context.setting.scope
            });
          }
        }
      }),
      new Separator(),
      this._instantiationService.createInstance(CopySettingIdAction),
      this._instantiationService.createInstance(CopySettingAsJSONAction),
      this._instantiationService.createInstance(CopySettingAsURLAction)
    ];
    const actionFactory = (setting, settingTarget) => this.getActionsForSetting(setting, settingTarget);
    const emptyActionFactory = (_) => [];
    const extensionRenderer = this._instantiationService.createInstance(SettingsExtensionToggleRenderer, [], emptyActionFactory);
    const settingRenderers = [
      this._instantiationService.createInstance(SettingBoolRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingNumberRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingArrayRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingComplexRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingComplexObjectRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingTextRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingMultilineTextRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingExcludeRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingIncludeRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingEnumRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingObjectRenderer, this.settingActions, actionFactory),
      this._instantiationService.createInstance(SettingBoolObjectRenderer, this.settingActions, actionFactory),
      extensionRenderer
    ];
    this.onDidClickOverrideElement = Event.any(...settingRenderers.map((r) => r.onDidClickOverrideElement));
    this.onDidChangeSetting = Event.any(
      ...settingRenderers.map((r) => r.onDidChangeSetting),
      this._onDidChangeSetting.event
    );
    this.onDidDismissExtensionSetting = extensionRenderer.onDidDismissExtensionSetting;
    this.onDidOpenSettings = Event.any(...settingRenderers.map((r) => r.onDidOpenSettings));
    this.onDidClickSettingLink = Event.any(...settingRenderers.map((r) => r.onDidClickSettingLink));
    this.onDidFocusSetting = Event.any(...settingRenderers.map((r) => r.onDidFocusSetting));
    this.onDidChangeSettingHeight = Event.any(...settingRenderers.map((r) => r.onDidChangeSettingHeight));
    this.onApplyFilter = Event.any(...settingRenderers.map((r) => r.onApplyFilter));
    this.allRenderers = [
      ...settingRenderers,
      this._instantiationService.createInstance(SettingGroupRenderer),
      this._instantiationService.createInstance(SettingNewExtensionsRenderer)
    ];
  }
  getActionsForSetting(setting, settingTarget) {
    const actions = [];
    if (!(setting.scope && APPLICATION_SCOPES.includes(setting.scope)) && settingTarget === ConfigurationTarget.USER_LOCAL) {
      actions.push(this._instantiationService.createInstance(ApplySettingToAllProfilesAction, setting));
    }
    if (this._userDataSyncEnablementService.isEnabled() && !setting.disallowSyncIgnore) {
      actions.push(this._instantiationService.createInstance(SyncSettingAction, setting));
    }
    if (actions.length) {
      actions.splice(0, 0, new Separator());
    }
    return actions;
  }
  cancelSuggesters() {
    this._contextViewService.hideContextView();
  }
  showContextMenu(element, settingDOMElement) {
    const toolbarElement = settingDOMElement.querySelector(".monaco-toolbar");
    if (toolbarElement) {
      this._contextMenuService.showContextMenu({
        getActions: () => this.settingActions,
        getAnchor: () => toolbarElement,
        getActionsContext: () => element
      });
    }
  }
  getSettingDOMElementForDOMElement(domElement) {
    const parent = DOM.findParentWithClass(domElement, AbstractSettingRenderer.CONTENTS_CLASS);
    if (parent) {
      return parent;
    }
    return null;
  }
  getDOMElementsForSettingKey(treeContainer, key) {
    return treeContainer.querySelectorAll(`[${AbstractSettingRenderer.SETTING_KEY_ATTR}="${key}"]`);
  }
  getKeyForDOMElementInSetting(element) {
    const settingElement = this.getSettingDOMElementForDOMElement(element);
    return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
  }
  getIdForDOMElementInSetting(element) {
    const settingElement = this.getSettingDOMElementForDOMElement(element);
    return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_ID_ATTR);
  }
  dispose() {
    super.dispose();
    this.settingActions.forEach((action) => {
      if (isDisposable(action)) {
        action.dispose();
      }
    });
    this.allRenderers.forEach((renderer) => {
      if (isDisposable(renderer)) {
        renderer.dispose();
      }
    });
  }
};
SettingTreeRenderers = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IUserDataSyncEnablementService)
], SettingTreeRenderers);
function renderValidations(dataElement, template, calledOnStartup) {
  if (dataElement.setting.validator) {
    const errMsg = dataElement.setting.validator(template.inputBox.value);
    if (errMsg) {
      template.containerElement.classList.add("invalid-input");
      template.validationErrorMessageElement.innerText = errMsg;
      const validationError = localize("validationError", "Validation Error.");
      template.inputBox.inputElement.parentElement.setAttribute("aria-label", [validationError, errMsg].join(" "));
      if (!calledOnStartup) {
        aria.status(validationError + " " + errMsg);
      }
      return true;
    } else {
      template.inputBox.inputElement.parentElement.removeAttribute("aria-label");
    }
  }
  template.containerElement.classList.remove("invalid-input");
  return false;
}
function renderArrayValidations(dataElement, template, value, calledOnStartup) {
  template.containerElement.classList.add("invalid-input");
  if (dataElement.setting.validator) {
    const errMsg = dataElement.setting.validator(value);
    if (errMsg && errMsg !== "") {
      template.containerElement.classList.add("invalid-input");
      template.validationErrorMessageElement.innerText = errMsg;
      const validationError = localize("validationError", "Validation Error.");
      template.containerElement.setAttribute("aria-label", [dataElement.setting.key, validationError, errMsg].join(" "));
      if (!calledOnStartup) {
        aria.status(validationError + " " + errMsg);
      }
      return true;
    } else {
      template.containerElement.setAttribute("aria-label", dataElement.setting.key);
      template.containerElement.classList.remove("invalid-input");
    }
  }
  return false;
}
function cleanRenderedMarkdown(element) {
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes.item(i);
    const tagName = child.tagName && child.tagName.toLowerCase();
    if (tagName === "img") {
      child.remove();
    } else {
      cleanRenderedMarkdown(child);
    }
  }
}
function fixSettingLinks(text, linkify = true) {
  return text.replace(/`#([^#\s`]+)#`|'#([^#\s']+)#'/g, (match, backticksGroup, quotesGroup) => {
    const settingKey = backticksGroup ?? quotesGroup;
    const targetDisplayFormat = settingKeyToDisplayFormat(settingKey);
    const targetName = `${targetDisplayFormat.category}: ${targetDisplayFormat.label}`;
    return linkify ? `[${targetName}](#${settingKey} "${settingKey}")` : `"${targetName}"`;
  });
}
function escapeInvisibleChars(enumValue) {
  return enumValue && enumValue.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
let SettingsTreeFilter = class {
  constructor(viewState, isFilteringGroups, environmentService) {
    this.viewState = viewState;
    this.isFilteringGroups = isFilteringGroups;
    this.environmentService = environmentService;
  }
  filter(element, parentVisibility) {
    if (this.viewState.categoryFilter && element instanceof SettingsTreeSettingElement) {
      if (!this.settingContainedInGroup(element.setting, this.viewState.categoryFilter)) {
        return false;
      }
    }
    if (element instanceof SettingsTreeSettingElement && this.viewState.settingsTarget !== ConfigurationTarget.USER_LOCAL) {
      const isRemote = !!this.environmentService.remoteAuthority;
      if (!element.matchesScope(this.viewState.settingsTarget, isRemote)) {
        return false;
      }
    }
    if (element instanceof SettingsTreeGroupElement) {
      if (this.isFilteringGroups && this.viewState.categoryFilter) {
        if (!this.groupIsRelatedToCategory(element, this.viewState.categoryFilter)) {
          return false;
        }
        return TreeVisibility.Recurse;
      }
      if (typeof element.count === "number") {
        return element.count > 0;
      }
      return TreeVisibility.Recurse;
    }
    if (element instanceof SettingsTreeNewExtensionsElement) {
      if (this.viewState.tagFilters?.size || this.viewState.categoryFilter) {
        return false;
      }
    }
    return true;
  }
  settingContainedInGroup(setting, group) {
    return group.children.some((child) => {
      if (child instanceof SettingsTreeGroupElement) {
        return this.settingContainedInGroup(setting, child);
      } else if (child instanceof SettingsTreeSettingElement) {
        return child.setting.key === setting.key;
      } else {
        return false;
      }
    });
  }
  /**
   * Checks if a group is related to the filtered category.
   * A group is related if it's the category itself, a descendant of it, or an ancestor of it.
   */
  groupIsRelatedToCategory(group, category) {
    if (group.id === category.id) {
      return true;
    }
    let parent = group.parent;
    while (parent) {
      if (parent.id === category.id) {
        return true;
      }
      parent = parent.parent;
    }
    let categoryParent = category.parent;
    while (categoryParent) {
      if (categoryParent.id === group.id) {
        return true;
      }
      categoryParent = categoryParent.parent;
    }
    return false;
  }
};
SettingsTreeFilter = __decorateClass([
  __decorateParam(2, IWorkbenchEnvironmentService)
], SettingsTreeFilter);
class SettingsTreeDelegate extends CachedListVirtualDelegate {
  getTemplateId(element) {
    if (element instanceof SettingsTreeGroupElement) {
      return SETTINGS_ELEMENT_TEMPLATE_ID;
    }
    if (element instanceof SettingsTreeSettingElement) {
      if (element.valueType === SettingValueType.ExtensionToggle) {
        return SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID;
      }
      const invalidTypeError = element.isConfigured && getInvalidTypeError(element.value, element.setting.type);
      if (invalidTypeError) {
        return SETTINGS_COMPLEX_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Boolean) {
        return SETTINGS_BOOL_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Integer || element.valueType === SettingValueType.Number || element.valueType === SettingValueType.NullableInteger || element.valueType === SettingValueType.NullableNumber) {
        return SETTINGS_NUMBER_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.MultilineString) {
        return SETTINGS_MULTILINE_TEXT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.String) {
        return SETTINGS_TEXT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Enum) {
        return SETTINGS_ENUM_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Array) {
        return SETTINGS_ARRAY_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Exclude) {
        return SETTINGS_EXCLUDE_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Include) {
        return SETTINGS_INCLUDE_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.Object) {
        return SETTINGS_OBJECT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.BooleanObject) {
        return SETTINGS_BOOL_OBJECT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.ComplexObject) {
        return SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID;
      }
      if (element.valueType === SettingValueType.LanguageTag) {
        return SETTINGS_COMPLEX_TEMPLATE_ID;
      }
      return SETTINGS_COMPLEX_TEMPLATE_ID;
    }
    if (element instanceof SettingsTreeNewExtensionsElement) {
      return SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
    }
    throw new Error("unknown element type: " + element);
  }
  hasDynamicHeight(element) {
    return !(element instanceof SettingsTreeGroupElement);
  }
  estimateHeight(element) {
    if (element instanceof SettingsTreeGroupElement) {
      return 42;
    }
    return element instanceof SettingsTreeSettingElement && element.valueType === SettingValueType.Boolean ? 78 : 104;
  }
}
class NonCollapsibleObjectTreeModel extends ObjectTreeModel {
  isCollapsible(element) {
    return false;
  }
  setCollapsed(element, collapsed, recursive) {
    return false;
  }
}
class SettingsTreeAccessibilityProvider {
  constructor(configurationService, languageService, userDataProfilesService) {
    this.configurationService = configurationService;
    this.languageService = languageService;
    this.userDataProfilesService = userDataProfilesService;
  }
  getAriaLabel(element) {
    if (element instanceof SettingsTreeSettingElement) {
      const ariaLabelSections = [];
      ariaLabelSections.push(`${element.displayCategory} ${element.displayLabel}.`);
      if (element.isConfigured) {
        const modifiedText = localize("settings.Modified", "Modified.");
        ariaLabelSections.push(modifiedText);
      }
      const indicatorsLabelAriaLabel = getIndicatorsLabelAriaLabel(element, this.configurationService, this.userDataProfilesService, this.languageService);
      if (indicatorsLabelAriaLabel.length) {
        ariaLabelSections.push(`${indicatorsLabelAriaLabel}.`);
      }
      const descriptionWithoutSettingLinks = renderAsPlaintext({ value: fixSettingLinks(element.description, false) });
      if (descriptionWithoutSettingLinks.length) {
        ariaLabelSections.push(descriptionWithoutSettingLinks);
      }
      return ariaLabelSections.join(" ");
    } else if (element instanceof SettingsTreeGroupElement) {
      return element.label;
    } else {
      return element.id;
    }
  }
  getWidgetAriaLabel() {
    return localize("settings", "Settings");
  }
}
let SettingsTree = class extends WorkbenchObjectTree {
  constructor(container, viewState, renderers, contextKeyService, listService, configurationService, instantiationService, languageService, userDataProfilesService) {
    super(
      "SettingsTree",
      container,
      new SettingsTreeDelegate(),
      renderers,
      {
        horizontalScrolling: false,
        supportDynamicHeights: true,
        scrollToActiveElement: true,
        identityProvider: {
          getId(e) {
            return e.id;
          }
        },
        accessibilityProvider: new SettingsTreeAccessibilityProvider(configurationService, languageService, userDataProfilesService),
        styleController: (id) => new DefaultStyleController(domStylesheetsJs.createStyleSheet(container), id),
        filter: instantiationService.createInstance(SettingsTreeFilter, viewState, true),
        smoothScrolling: configurationService.getValue("workbench.list.smoothScrolling"),
        multipleSelectionSupport: false,
        findWidgetEnabled: false,
        renderIndentGuides: RenderIndentGuides.None,
        transformOptimization: false
        // Disable transform optimization #177470
      },
      instantiationService,
      contextKeyService,
      listService,
      configurationService
    );
    this.getHTMLElement().classList.add("settings-editor-tree");
    this.style(getListStyles({
      listBackground: editorBackground,
      listActiveSelectionBackground: editorBackground,
      listActiveSelectionForeground: foreground,
      listFocusAndSelectionBackground: editorBackground,
      listFocusAndSelectionForeground: foreground,
      listFocusBackground: editorBackground,
      listFocusForeground: foreground,
      listHoverForeground: foreground,
      listHoverBackground: editorBackground,
      listHoverOutline: editorBackground,
      listFocusOutline: editorBackground,
      listInactiveSelectionBackground: editorBackground,
      listInactiveSelectionForeground: foreground,
      listInactiveFocusBackground: editorBackground,
      listInactiveFocusOutline: editorBackground,
      treeIndentGuidesStroke: void 0,
      treeInactiveIndentGuidesStroke: void 0
    }));
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("workbench.list.smoothScrolling")) {
        this.updateOptions({
          smoothScrolling: configurationService.getValue("workbench.list.smoothScrolling")
        });
      }
    }));
  }
  createModel(user, options) {
    return new NonCollapsibleObjectTreeModel(user, options);
  }
};
SettingsTree = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IListService),
  __decorateParam(5, IWorkbenchConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IUserDataProfilesService)
], SettingsTree);
let CopySettingIdAction = class extends Action {
  constructor(clipboardService) {
    super(CopySettingIdAction.ID, CopySettingIdAction.LABEL);
    this.clipboardService = clipboardService;
  }
  async run(context) {
    if (context) {
      await this.clipboardService.writeText(context.setting.key);
    }
    return Promise.resolve(void 0);
  }
};
CopySettingIdAction.ID = "settings.copySettingId";
CopySettingIdAction.LABEL = localize("copySettingIdLabel", "Copy Setting ID");
CopySettingIdAction = __decorateClass([
  __decorateParam(0, IClipboardService)
], CopySettingIdAction);
let CopySettingAsJSONAction = class extends Action {
  constructor(clipboardService) {
    super(CopySettingAsJSONAction.ID, CopySettingAsJSONAction.LABEL);
    this.clipboardService = clipboardService;
  }
  async run(context) {
    if (context) {
      const jsonResult = `"${context.setting.key}": ${JSON.stringify(context.value, void 0, "  ")}`;
      await this.clipboardService.writeText(jsonResult);
    }
    return Promise.resolve(void 0);
  }
};
CopySettingAsJSONAction.ID = "settings.copySettingAsJSON";
CopySettingAsJSONAction.LABEL = localize("copySettingAsJSONLabel", "Copy Setting as JSON");
CopySettingAsJSONAction = __decorateClass([
  __decorateParam(0, IClipboardService)
], CopySettingAsJSONAction);
let CopySettingAsURLAction = class extends Action {
  constructor(clipboardService, productService) {
    super(CopySettingAsURLAction.ID, CopySettingAsURLAction.LABEL);
    this.clipboardService = clipboardService;
    this.productService = productService;
  }
  async run(context) {
    if (context) {
      const settingKey = context.setting.key;
      const product = this.productService.urlProtocol;
      const uri = URI.from({ scheme: product, authority: SETTINGS_AUTHORITY, path: `/${settingKey}` }, true);
      await this.clipboardService.writeText(uri.toString());
    }
    return Promise.resolve(void 0);
  }
};
CopySettingAsURLAction.ID = "settings.copySettingAsURL";
CopySettingAsURLAction.LABEL = localize("copySettingAsURLLabel", "Copy Setting as URL");
CopySettingAsURLAction = __decorateClass([
  __decorateParam(0, IClipboardService),
  __decorateParam(1, IProductService)
], CopySettingAsURLAction);
let SyncSettingAction = class extends Action {
  constructor(setting, configService) {
    super(SyncSettingAction.ID, SyncSettingAction.LABEL);
    this.setting = setting;
    this.configService = configService;
    this._register(Event.filter(configService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.ignoredSettings"))(() => this.update()));
    this.update();
  }
  async update() {
    const ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this.configService);
    this.checked = !ignoredSettings.includes(this.setting.key);
  }
  async run() {
    let currentValue = [...this.configService.getValue("settingsSync.ignoredSettings")];
    currentValue = currentValue.filter((v) => v !== this.setting.key && v !== `-${this.setting.key}`);
    const defaultIgnoredSettings = getDefaultIgnoredSettings();
    const isDefaultIgnored = defaultIgnoredSettings.includes(this.setting.key);
    const askedToSync = !this.checked;
    if (askedToSync && isDefaultIgnored) {
      currentValue.push(`-${this.setting.key}`);
    }
    if (!askedToSync && !isDefaultIgnored) {
      currentValue.push(this.setting.key);
    }
    this.configService.updateValue("settingsSync.ignoredSettings", currentValue.length ? currentValue : void 0, ConfigurationTarget.USER);
    return Promise.resolve(void 0);
  }
};
SyncSettingAction.ID = "settings.stopSyncingSetting";
SyncSettingAction.LABEL = localize("stopSyncingSetting", "Sync This Setting");
SyncSettingAction = __decorateClass([
  __decorateParam(1, IConfigurationService)
], SyncSettingAction);
let ApplySettingToAllProfilesAction = class extends Action {
  constructor(setting, configService) {
    super(ApplySettingToAllProfilesAction.ID, ApplySettingToAllProfilesAction.LABEL);
    this.setting = setting;
    this.configService = configService;
    this._register(Event.filter(configService.onDidChangeConfiguration, (e) => e.affectsConfiguration(APPLY_ALL_PROFILES_SETTING))(() => this.update()));
    this.update();
  }
  update() {
    const allProfilesSettings = this.configService.getValue(APPLY_ALL_PROFILES_SETTING);
    this.checked = allProfilesSettings.includes(this.setting.key);
  }
  async run() {
    const value = this.configService.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    if (this.checked) {
      const idx = value.indexOf(this.setting.key);
      if (idx !== -1) {
        value.splice(idx, 1);
      }
    } else {
      value.push(this.setting.key);
    }
    const newValue = distinct(value);
    if (this.checked) {
      await this.configService.updateValue(this.setting.key, this.configService.inspect(this.setting.key).application?.value, ConfigurationTarget.USER_LOCAL);
      await this.configService.updateValue(APPLY_ALL_PROFILES_SETTING, newValue.length ? newValue : void 0, ConfigurationTarget.USER_LOCAL);
    } else {
      await this.configService.updateValue(APPLY_ALL_PROFILES_SETTING, newValue.length ? newValue : void 0, ConfigurationTarget.USER_LOCAL);
      await this.configService.updateValue(this.setting.key, this.configService.inspect(this.setting.key).userLocal?.value, ConfigurationTarget.USER_LOCAL);
    }
  }
};
ApplySettingToAllProfilesAction.ID = "settings.applyToAllProfiles";
ApplySettingToAllProfilesAction.LABEL = localize("applyToAllProfiles", "Apply Setting to all Profiles");
ApplySettingToAllProfilesAction = __decorateClass([
  __decorateParam(1, IWorkbenchConfigurationService)
], ApplySettingToAllProfilesAction);
export {
  AbstractSettingRenderer,
  NonCollapsibleObjectTreeModel,
  SettingComplexRenderer,
  SettingNewExtensionsRenderer,
  SettingTreeRenderers,
  SettingsTree,
  SettingsTreeFilter,
  createSettingMatchRegExp,
  createTocTreeForExtensionSettings,
  resolveConfiguredUntrustedSettings,
  resolveSettingsTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxzZXR0aW5nc1RyZWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCcm93c2VyRmVhdHVyZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY2FuSVVzZS5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0c0pzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IFNpbXBsZUljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvc2ltcGxlSWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IElJbnB1dE9wdGlvbnMsIElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IENhY2hlZExpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IERlZmF1bHRTdHlsZUNvbnRyb2xsZXIsIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0T3B0aW9uSXRlbSwgU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgVG9nZ2xlLCB1bnRoZW1lZFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLmpzJztcbmltcG9ydCB7IFJlbmRlckluZGVudEd1aWRlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2Fic3RyYWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJT2JqZWN0VHJlZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IE9iamVjdFRyZWVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVHJlZUZpbHRlciwgSVRyZWVNb2RlbCwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyLCBUcmVlRmlsdGVyUmVzdWx0LCBUcmVlVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBpc0Rpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0lPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCwgaXNVbmRlZmluZWRPck51bGwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBnZXRMYW5ndWFnZVRhZ1NldHRpbmdQbGFpbktleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgV29ya2JlbmNoT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBnZXRJbnB1dEJveFN0eWxlLCBnZXRMaXN0U3R5bGVzLCBnZXRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCwgZm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGdldElnbm9yZWRTZXR0aW5ncyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vc2V0dGluZ3NNZXJnZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIGdldERlZmF1bHRJZ25vcmVkU2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVDb250ZXh0TWVudSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IEFQUExJQ0FUSU9OX1NDT1BFUywgQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcsIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTZXR0aW5nLCBJU2V0dGluZ3NHcm91cCwgU0VUVElOR1NfQVVUSE9SSVRZLCBTZXR0aW5nVmFsdWVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IGdldEludmFsaWRUeXBlRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNWYWxpZGF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTEFOR1VBR0VfU0VUVElOR19UQUcsIFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NIT1dfQ09OVEVYVF9NRU5VLCBjb21wYXJlVHdvTnVsbGFibGVOdW1iZXJzIH0gZnJvbSAnLi4vY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IHNldHRpbmdzTnVtYmVySW5wdXRCYWNrZ3JvdW5kLCBzZXR0aW5nc051bWJlcklucHV0Qm9yZGVyLCBzZXR0aW5nc051bWJlcklucHV0Rm9yZWdyb3VuZCwgc2V0dGluZ3NTZWxlY3RCYWNrZ3JvdW5kLCBzZXR0aW5nc1NlbGVjdEJvcmRlciwgc2V0dGluZ3NTZWxlY3RGb3JlZ3JvdW5kLCBzZXR0aW5nc1NlbGVjdExpc3RCb3JkZXIsIHNldHRpbmdzVGV4dElucHV0QmFja2dyb3VuZCwgc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXIsIHNldHRpbmdzVGV4dElucHV0Rm9yZWdyb3VuZCB9IGZyb20gJy4uL2NvbW1vbi9zZXR0aW5nc0VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgc2V0dGluZ3NNb3JlQWN0aW9uSWNvbiB9IGZyb20gJy4vcHJlZmVyZW5jZXNJY29ucy5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc1RhcmdldCB9IGZyb20gJy4vcHJlZmVyZW5jZXNXaWRnZXRzLmpzJztcbmltcG9ydCB7IElTZXR0aW5nT3ZlcnJpZGVDbGlja0V2ZW50LCBTZXR0aW5nc1RyZWVJbmRpY2F0b3JzTGFiZWwsIGdldEluZGljYXRvcnNMYWJlbEFyaWFMYWJlbCB9IGZyb20gJy4vc2V0dGluZ3NFZGl0b3JTZXR0aW5nSW5kaWNhdG9ycy5qcyc7XG5pbXBvcnQgeyBJVE9DRW50cnksIElUT0NGaWx0ZXIgfSBmcm9tICcuL3NldHRpbmdzTGF5b3V0LmpzJztcbmltcG9ydCB7IElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZSwgU2V0dGluZ3NUcmVlRWxlbWVudCwgU2V0dGluZ3NUcmVlR3JvdXBDaGlsZCwgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50LCBTZXR0aW5nc1RyZWVOZXdFeHRlbnNpb25zRWxlbWVudCwgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIGluc3BlY3RTZXR0aW5nLCBvYmplY3RTZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0VmFsdWUsIHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQgfSBmcm9tICcuL3NldHRpbmdzVHJlZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBFeGNsdWRlU2V0dGluZ1dpZGdldCwgSUJvb2xPYmplY3REYXRhSXRlbSwgSUluY2x1ZGVFeGNsdWRlRGF0YUl0ZW0sIElMaXN0RGF0YUl0ZW0sIElPYmplY3REYXRhSXRlbSwgSU9iamVjdEVudW1PcHRpb24sIElPYmplY3RLZXlTdWdnZXN0ZXIsIElPYmplY3RWYWx1ZVN1Z2dlc3RlciwgSW5jbHVkZVNldHRpbmdXaWRnZXQsIExpc3RTZXR0aW5nV2lkZ2V0LCBPYmplY3RTZXR0aW5nQ2hlY2tib3hXaWRnZXQsIE9iamVjdFNldHRpbmdEcm9wZG93bldpZGdldCwgT2JqZWN0VmFsdWUsIFNldHRpbmdMaXN0RXZlbnQgfSBmcm9tICcuL3NldHRpbmdzV2lkZ2V0cy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgbXVsdGlHcm91cFRvY1NldHRpbmdzID0gbmV3IFNldChbXG5cdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsXG5cdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlc3BvbnNlUmVjZWl2ZWQnXG5dKTtcblxuZnVuY3Rpb24gZ2V0SW5jbHVkZUV4Y2x1ZGVEaXNwbGF5VmFsdWUoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpOiBJSW5jbHVkZUV4Y2x1ZGVEYXRhSXRlbVtdIHtcblx0Y29uc3QgZWxlbWVudERlZmF1bHRWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB0eXBlb2YgZWxlbWVudC5kZWZhdWx0VmFsdWUgPT09ICdvYmplY3QnXG5cdFx0PyBlbGVtZW50LmRlZmF1bHRWYWx1ZSA/PyB7fVxuXHRcdDoge307XG5cblx0Y29uc3QgZGF0YSA9IGVsZW1lbnQuaXNDb25maWd1cmVkID9cblx0XHR7IC4uLmVsZW1lbnREZWZhdWx0VmFsdWUsIC4uLmVsZW1lbnQuc2NvcGVWYWx1ZSB9IDpcblx0XHRlbGVtZW50RGVmYXVsdFZhbHVlO1xuXG5cdHJldHVybiBPYmplY3Qua2V5cyhkYXRhKVxuXHRcdC5maWx0ZXIoa2V5ID0+ICEhZGF0YVtrZXldKVxuXHRcdC5tYXAoa2V5ID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGVsZW1lbnREZWZhdWx0VmFsdWVba2V5XTtcblxuXHRcdFx0Ly8gR2V0IHNvdXJjZSBpZiBpdCdzIGEgZGVmYXVsdCB2YWx1ZVxuXHRcdFx0bGV0IHNvdXJjZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGRlZmF1bHRWYWx1ZSA9PT0gZGF0YVtrZXldICYmIGVsZW1lbnQuc2V0dGluZy50eXBlID09PSAnb2JqZWN0JyAmJiBlbGVtZW50LmRlZmF1bHRWYWx1ZVNvdXJjZSBpbnN0YW5jZW9mIE1hcCkge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0U291cmNlID0gZWxlbWVudC5kZWZhdWx0VmFsdWVTb3VyY2UuZ2V0KGAke2VsZW1lbnQuc2V0dGluZy5rZXl9LiR7a2V5fWApO1xuXHRcdFx0XHRzb3VyY2UgPSB0eXBlb2YgZGVmYXVsdFNvdXJjZSA9PT0gJ3N0cmluZycgPyBkZWZhdWx0U291cmNlIDogZGVmYXVsdFNvdXJjZT8uZGlzcGxheU5hbWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZhbHVlID0gZGF0YVtrZXldO1xuXHRcdFx0Y29uc3Qgc2libGluZyA9IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nID8gdW5kZWZpbmVkIDogdmFsdWUud2hlbjtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGF0YToga2V5XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNpYmxpbmcsXG5cdFx0XHRcdGVsZW1lbnRUeXBlOiBlbGVtZW50LnZhbHVlVHlwZSxcblx0XHRcdFx0c291cmNlXG5cdFx0XHR9O1xuXHRcdH0pO1xufVxuXG5mdW5jdGlvbiBhcmVBbGxQcm9wZXJ0aWVzRGVmaW5lZChwcm9wZXJ0aWVzOiBzdHJpbmdbXSwgaXRlbXNUb0Rpc3BsYXk6IElPYmplY3REYXRhSXRlbVtdKTogYm9vbGVhbiB7XG5cdGNvbnN0IHN0YXRpY1Byb3BlcnRpZXMgPSBuZXcgU2V0KHByb3BlcnRpZXMpO1xuXHRpdGVtc1RvRGlzcGxheS5mb3JFYWNoKCh7IGtleSB9KSA9PiBzdGF0aWNQcm9wZXJ0aWVzLmRlbGV0ZShrZXkuZGF0YSkpO1xuXHRyZXR1cm4gc3RhdGljUHJvcGVydGllcy5zaXplID09PSAwO1xufVxuXG5mdW5jdGlvbiBnZXRFbnVtT3B0aW9uc0Zyb21TY2hlbWEoc2NoZW1hOiBJSlNPTlNjaGVtYSk6IElPYmplY3RFbnVtT3B0aW9uW10ge1xuXHRpZiAoc2NoZW1hLmFueU9mKSB7XG5cdFx0cmV0dXJuIHNjaGVtYS5hbnlPZi5tYXAoZ2V0RW51bU9wdGlvbnNGcm9tU2NoZW1hKS5mbGF0KCk7XG5cdH1cblxuXHRjb25zdCBlbnVtRGVzY3JpcHRpb25zID0gc2NoZW1hLmVudW1EZXNjcmlwdGlvbnMgPz8gW107XG5cblx0cmV0dXJuIChzY2hlbWEuZW51bSA/PyBbXSkubWFwKCh2YWx1ZSwgaWR4KSA9PiB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBpZHggPCBlbnVtRGVzY3JpcHRpb25zLmxlbmd0aFxuXHRcdFx0PyBlbnVtRGVzY3JpcHRpb25zW2lkeF1cblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHsgdmFsdWUsIGRlc2NyaXB0aW9uIH07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBnZXRPYmplY3RWYWx1ZVR5cGUoc2NoZW1hOiBJSlNPTlNjaGVtYSk6IE9iamVjdFZhbHVlWyd0eXBlJ10ge1xuXHRpZiAoc2NoZW1hLmFueU9mKSB7XG5cdFx0Y29uc3Qgc3ViVHlwZXMgPSBzY2hlbWEuYW55T2YubWFwKGdldE9iamVjdFZhbHVlVHlwZSk7XG5cdFx0aWYgKHN1YlR5cGVzLnNvbWUodHlwZSA9PiB0eXBlID09PSAnZW51bScpKSB7XG5cdFx0XHRyZXR1cm4gJ2VudW0nO1xuXHRcdH1cblx0XHRyZXR1cm4gJ3N0cmluZyc7XG5cdH1cblxuXHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdHJldHVybiAnYm9vbGVhbic7XG5cdH0gZWxzZSBpZiAoc2NoZW1hLnR5cGUgPT09ICdzdHJpbmcnICYmIGlzRGVmaW5lZChzY2hlbWEuZW51bSkgJiYgc2NoZW1hLmVudW0ubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiAnZW51bSc7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuICdzdHJpbmcnO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE9iamVjdEVudHJ5VmFsdWVEaXNwbGF5VmFsdWUodHlwZTogT2JqZWN0VmFsdWVbJ3R5cGUnXSwgZGF0YTogdW5rbm93biwgb3B0aW9uczogSU9iamVjdEVudW1PcHRpb25bXSk6IE9iamVjdFZhbHVlIHtcblx0aWYgKHR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdHJldHVybiB7IHR5cGUsIGRhdGE6ICEhZGF0YSB9O1xuXHR9IGVsc2UgaWYgKHR5cGUgPT09ICdlbnVtJykge1xuXHRcdHJldHVybiB7IHR5cGUsIGRhdGE6ICcnICsgZGF0YSwgb3B0aW9ucyB9O1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB7IHR5cGUsIGRhdGE6ICcnICsgZGF0YSB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE9iamVjdERpc3BsYXlWYWx1ZShlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCk6IElPYmplY3REYXRhSXRlbVtdIHtcblx0Y29uc3QgZWxlbWVudERlZmF1bHRWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB0eXBlb2YgZWxlbWVudC5kZWZhdWx0VmFsdWUgPT09ICdvYmplY3QnXG5cdFx0PyBlbGVtZW50LmRlZmF1bHRWYWx1ZSA/PyB7fVxuXHRcdDoge307XG5cblx0Y29uc3QgZWxlbWVudFNjb3BlVmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIGVsZW1lbnQuc2NvcGVWYWx1ZSA9PT0gJ29iamVjdCdcblx0XHQ/IGVsZW1lbnQuc2NvcGVWYWx1ZSA/PyB7fVxuXHRcdDoge307XG5cblx0Y29uc3QgZGF0YSA9IGVsZW1lbnQuaXNDb25maWd1cmVkID9cblx0XHR7IC4uLmVsZW1lbnREZWZhdWx0VmFsdWUsIC4uLmVsZW1lbnRTY29wZVZhbHVlIH0gOlxuXHRcdGVsZW1lbnQuaGFzUG9saWN5VmFsdWUgfHwgZWxlbWVudC5pc0FnZW50c1dpbmRvd1JlYWRPbmx5ID8gZWxlbWVudC5zY29wZVZhbHVlIDpcblx0XHRcdGVsZW1lbnREZWZhdWx0VmFsdWU7XG5cblx0Y29uc3QgeyBvYmplY3RQcm9wZXJ0aWVzLCBvYmplY3RQYXR0ZXJuUHJvcGVydGllcywgb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgfSA9IGVsZW1lbnQuc2V0dGluZztcblx0Y29uc3QgcGF0dGVybnNBbmRTY2hlbWFzID0gT2JqZWN0XG5cdFx0LmVudHJpZXMob2JqZWN0UGF0dGVyblByb3BlcnRpZXMgPz8ge30pXG5cdFx0Lm1hcCgoW3BhdHRlcm4sIHNjaGVtYV0pID0+ICh7XG5cdFx0XHRwYXR0ZXJuOiBuZXcgUmVnRXhwKHBhdHRlcm4pLFxuXHRcdFx0c2NoZW1hXG5cdFx0fSkpO1xuXG5cdGNvbnN0IHdlbGxEZWZpbmVkS2V5RW51bU9wdGlvbnMgPSBPYmplY3QuZW50cmllcyhvYmplY3RQcm9wZXJ0aWVzID8/IHt9KS5tYXAoXG5cdFx0KFtrZXksIHNjaGVtYV0pID0+ICh7IHZhbHVlOiBrZXksIGRlc2NyaXB0aW9uOiBzY2hlbWEuZGVzY3JpcHRpb24gfSlcblx0KTtcblxuXHRyZXR1cm4gT2JqZWN0LmtleXMoZGF0YSkubWFwKGtleSA9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdFZhbHVlID0gZWxlbWVudERlZmF1bHRWYWx1ZVtrZXldO1xuXG5cdFx0Ly8gR2V0IHNvdXJjZSBpZiBpdCdzIGEgZGVmYXVsdCB2YWx1ZVxuXHRcdGxldCBzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZGVmYXVsdFZhbHVlID09PSBkYXRhW2tleV0gJiYgZWxlbWVudC5zZXR0aW5nLnR5cGUgPT09ICdvYmplY3QnICYmIGVsZW1lbnQuZGVmYXVsdFZhbHVlU291cmNlIGluc3RhbmNlb2YgTWFwKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0U291cmNlID0gZWxlbWVudC5kZWZhdWx0VmFsdWVTb3VyY2UuZ2V0KGAke2VsZW1lbnQuc2V0dGluZy5rZXl9LiR7a2V5fWApO1xuXHRcdFx0c291cmNlID0gdHlwZW9mIGRlZmF1bHRTb3VyY2UgPT09ICdzdHJpbmcnID8gZGVmYXVsdFNvdXJjZSA6IGRlZmF1bHRTb3VyY2U/LmRpc3BsYXlOYW1lO1xuXHRcdH1cblxuXHRcdGlmIChpc0RlZmluZWQob2JqZWN0UHJvcGVydGllcykgJiYga2V5IGluIG9iamVjdFByb3BlcnRpZXMpIHtcblx0XHRcdGNvbnN0IHZhbHVlRW51bU9wdGlvbnMgPSBnZXRFbnVtT3B0aW9uc0Zyb21TY2hlbWEob2JqZWN0UHJvcGVydGllc1trZXldKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtleToge1xuXHRcdFx0XHRcdHR5cGU6ICdlbnVtJyxcblx0XHRcdFx0XHRkYXRhOiBrZXksXG5cdFx0XHRcdFx0b3B0aW9uczogd2VsbERlZmluZWRLZXlFbnVtT3B0aW9ucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWU6IGdldE9iamVjdEVudHJ5VmFsdWVEaXNwbGF5VmFsdWUoZ2V0T2JqZWN0VmFsdWVUeXBlKG9iamVjdFByb3BlcnRpZXNba2V5XSksIGRhdGFba2V5XSwgdmFsdWVFbnVtT3B0aW9ucyksXG5cdFx0XHRcdGtleURlc2NyaXB0aW9uOiBvYmplY3RQcm9wZXJ0aWVzW2tleV0uZGVzY3JpcHRpb24sXG5cdFx0XHRcdHJlbW92YWJsZTogaXNVbmRlZmluZWRPck51bGwoZGVmYXVsdFZhbHVlKSxcblx0XHRcdFx0cmVzZXRhYmxlOiAhaXNVbmRlZmluZWRPck51bGwoZGVmYXVsdFZhbHVlKSxcblx0XHRcdFx0c291cmNlXG5cdFx0XHR9IHNhdGlzZmllcyBJT2JqZWN0RGF0YUl0ZW07XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHJvdyBpcyByZW1vdmFibGUgaWYgaXQgZG9lc24ndCBoYXZlIGEgZGVmYXVsdCB2YWx1ZSBhc3NpZ25lZCBvciB0aGUgc2V0dGluZyBzdXBwb3J0cyByZW1vdmluZyB0aGUgZGVmYXVsdCB2YWx1ZS5cblx0XHQvLyBJZiBhIGRlZmF1bHQgdmFsdWUgaXMgYXNzaWduZWQgYW5kIHRoZSB1c2VyIG1vZGlmaWVkIHRoZSBkZWZhdWx0LCBpdCBjYW4gYmUgcmVzZXQgYmFjayB0byB0aGUgZGVmYXVsdC5cblx0XHRjb25zdCByZW1vdmFibGUgPSBkZWZhdWx0VmFsdWUgPT09IHVuZGVmaW5lZCB8fCBvYmplY3RTZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0VmFsdWUoZWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0Y29uc3QgcmVzZXRhYmxlID0gISFkZWZhdWx0VmFsdWUgJiYgZGVmYXVsdFZhbHVlICE9PSBkYXRhW2tleV07XG5cdFx0Y29uc3Qgc2NoZW1hID0gcGF0dGVybnNBbmRTY2hlbWFzLmZpbmQoKHsgcGF0dGVybiB9KSA9PiBwYXR0ZXJuLnRlc3Qoa2V5KSk/LnNjaGVtYTtcblx0XHRpZiAoc2NoZW1hKSB7XG5cdFx0XHRjb25zdCB2YWx1ZUVudW1PcHRpb25zID0gZ2V0RW51bU9wdGlvbnNGcm9tU2NoZW1hKHNjaGVtYSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRrZXk6IHsgdHlwZTogJ3N0cmluZycsIGRhdGE6IGtleSB9LFxuXHRcdFx0XHR2YWx1ZTogZ2V0T2JqZWN0RW50cnlWYWx1ZURpc3BsYXlWYWx1ZShnZXRPYmplY3RWYWx1ZVR5cGUoc2NoZW1hKSwgZGF0YVtrZXldLCB2YWx1ZUVudW1PcHRpb25zKSxcblx0XHRcdFx0a2V5RGVzY3JpcHRpb246IHNjaGVtYS5kZXNjcmlwdGlvbixcblx0XHRcdFx0cmVtb3ZhYmxlLFxuXHRcdFx0XHRyZXNldGFibGUsXG5cdFx0XHRcdHNvdXJjZVxuXHRcdFx0fSBzYXRpc2ZpZXMgSU9iamVjdERhdGFJdGVtO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGl0aW9uYWxWYWx1ZUVudW1zID0gZ2V0RW51bU9wdGlvbnNGcm9tU2NoZW1hKFxuXHRcdFx0dHlwZW9mIG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzID09PSAnYm9vbGVhbidcblx0XHRcdFx0PyB7fVxuXHRcdFx0XHQ6IG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzID8/IHt9XG5cdFx0KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRrZXk6IHsgdHlwZTogJ3N0cmluZycsIGRhdGE6IGtleSB9LFxuXHRcdFx0dmFsdWU6IGdldE9iamVjdEVudHJ5VmFsdWVEaXNwbGF5VmFsdWUoXG5cdFx0XHRcdHR5cGVvZiBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gJ29iamVjdCcgPyBnZXRPYmplY3RWYWx1ZVR5cGUob2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMpIDogJ3N0cmluZycsXG5cdFx0XHRcdGRhdGFba2V5XSxcblx0XHRcdFx0YWRkaXRpb25hbFZhbHVlRW51bXMsXG5cdFx0XHQpLFxuXHRcdFx0a2V5RGVzY3JpcHRpb246IHR5cGVvZiBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gJ29iamVjdCcgPyBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcy5kZXNjcmlwdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHJlbW92YWJsZSxcblx0XHRcdHJlc2V0YWJsZSxcblx0XHRcdHNvdXJjZVxuXHRcdH0gc2F0aXNmaWVzIElPYmplY3REYXRhSXRlbTtcblx0fSkuZmlsdGVyKGl0ZW0gPT4gIWlzVW5kZWZpbmVkT3JOdWxsKGl0ZW0udmFsdWUuZGF0YSkpO1xufVxuXG5mdW5jdGlvbiBnZXRCb29sT2JqZWN0RGlzcGxheVZhbHVlKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogSUJvb2xPYmplY3REYXRhSXRlbVtdIHtcblx0Y29uc3QgZWxlbWVudERlZmF1bHRWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB0eXBlb2YgZWxlbWVudC5kZWZhdWx0VmFsdWUgPT09ICdvYmplY3QnXG5cdFx0PyBlbGVtZW50LmRlZmF1bHRWYWx1ZSA/PyB7fVxuXHRcdDoge307XG5cblx0Y29uc3QgZWxlbWVudFNjb3BlVmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIGVsZW1lbnQuc2NvcGVWYWx1ZSA9PT0gJ29iamVjdCdcblx0XHQ/IGVsZW1lbnQuc2NvcGVWYWx1ZSA/PyB7fVxuXHRcdDoge307XG5cblx0Y29uc3QgZGF0YSA9IGVsZW1lbnQuaXNDb25maWd1cmVkID9cblx0XHR7IC4uLmVsZW1lbnREZWZhdWx0VmFsdWUsIC4uLmVsZW1lbnRTY29wZVZhbHVlIH0gOlxuXHRcdGVsZW1lbnREZWZhdWx0VmFsdWU7XG5cblx0Y29uc3QgeyBvYmplY3RQcm9wZXJ0aWVzIH0gPSBlbGVtZW50LnNldHRpbmc7XG5cdGNvbnN0IGRpc3BsYXlWYWx1ZXM6IElCb29sT2JqZWN0RGF0YUl0ZW1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGtleSBpbiBvYmplY3RQcm9wZXJ0aWVzKSB7XG5cdFx0Y29uc3QgZGVmYXVsdFZhbHVlID0gZWxlbWVudERlZmF1bHRWYWx1ZVtrZXldO1xuXG5cdFx0Ly8gR2V0IHNvdXJjZSBpZiBpdCdzIGEgZGVmYXVsdCB2YWx1ZVxuXHRcdGxldCBzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZGVmYXVsdFZhbHVlID09PSBkYXRhW2tleV0gJiYgZWxlbWVudC5zZXR0aW5nLnR5cGUgPT09ICdvYmplY3QnICYmIGVsZW1lbnQuZGVmYXVsdFZhbHVlU291cmNlIGluc3RhbmNlb2YgTWFwKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0U291cmNlID0gZWxlbWVudC5kZWZhdWx0VmFsdWVTb3VyY2UuZ2V0KGtleSk7XG5cdFx0XHRzb3VyY2UgPSB0eXBlb2YgZGVmYXVsdFNvdXJjZSA9PT0gJ3N0cmluZycgPyBkZWZhdWx0U291cmNlIDogZGVmYXVsdFNvdXJjZT8uZGlzcGxheU5hbWU7XG5cdFx0fVxuXG5cdFx0ZGlzcGxheVZhbHVlcy5wdXNoKHtcblx0XHRcdGtleToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGF0YToga2V5XG5cdFx0XHR9LFxuXHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkYXRhOiAhIWRhdGFba2V5XVxuXHRcdFx0fSxcblx0XHRcdGtleURlc2NyaXB0aW9uOiBvYmplY3RQcm9wZXJ0aWVzW2tleV0uZGVzY3JpcHRpb24sXG5cdFx0XHRyZW1vdmFibGU6IGZhbHNlLFxuXHRcdFx0cmVzZXRhYmxlOiB0cnVlLFxuXHRcdFx0c291cmNlXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIGRpc3BsYXlWYWx1ZXM7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFycmF5U3VnZ2VzdGVyKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogSU9iamVjdEtleVN1Z2dlc3RlciB7XG5cdHJldHVybiAoa2V5cywgaWR4KSA9PiB7XG5cdFx0Y29uc3QgZW51bU9wdGlvbnM6IElPYmplY3RFbnVtT3B0aW9uW10gPSBbXTtcblxuXHRcdGlmIChlbGVtZW50LnNldHRpbmcuZW51bSkge1xuXHRcdFx0ZWxlbWVudC5zZXR0aW5nLmVudW0uZm9yRWFjaCgoa2V5LCBpKSA9PiB7XG5cdFx0XHRcdC8vIGluY2x1ZGUgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCB2YWx1ZSwgZXZlbiBpZiB1bmlxdWVJdGVtcyBpcyB0cnVlXG5cdFx0XHRcdGlmICghZWxlbWVudC5zZXR0aW5nLnVuaXF1ZUl0ZW1zIHx8IChpZHggIT09IHVuZGVmaW5lZCAmJiBrZXkgPT09IGtleXNbaWR4XSkgfHwgIWtleXMuaW5jbHVkZXMoa2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZWxlbWVudC5zZXR0aW5nLmVudW1EZXNjcmlwdGlvbnM/LltpXTtcblx0XHRcdFx0XHRlbnVtT3B0aW9ucy5wdXNoKHsgdmFsdWU6IGtleSwgZGVzY3JpcHRpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbnVtT3B0aW9ucy5sZW5ndGggPiAwXG5cdFx0XHQ/IHsgdHlwZTogJ2VudW0nLCBkYXRhOiBlbnVtT3B0aW9uc1swXS52YWx1ZSwgb3B0aW9uczogZW51bU9wdGlvbnMgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU9iamVjdEtleVN1Z2dlc3RlcihlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCk6IElPYmplY3RLZXlTdWdnZXN0ZXIge1xuXHRjb25zdCB7IG9iamVjdFByb3BlcnRpZXMgfSA9IGVsZW1lbnQuc2V0dGluZztcblx0Y29uc3QgYWxsU3RhdGljS2V5cyA9IE9iamVjdC5rZXlzKG9iamVjdFByb3BlcnRpZXMgPz8ge30pO1xuXG5cdHJldHVybiBrZXlzID0+IHtcblx0XHRjb25zdCBleGlzdGluZ0tleXMgPSBuZXcgU2V0KGtleXMpO1xuXHRcdGNvbnN0IGVudW1PcHRpb25zOiBJT2JqZWN0RW51bU9wdGlvbltdID0gW107XG5cblx0XHRhbGxTdGF0aWNLZXlzLmZvckVhY2goc3RhdGljS2V5ID0+IHtcblx0XHRcdGlmICghZXhpc3RpbmdLZXlzLmhhcyhzdGF0aWNLZXkpKSB7XG5cdFx0XHRcdGVudW1PcHRpb25zLnB1c2goeyB2YWx1ZTogc3RhdGljS2V5LCBkZXNjcmlwdGlvbjogb2JqZWN0UHJvcGVydGllcyFbc3RhdGljS2V5XS5kZXNjcmlwdGlvbiB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBlbnVtT3B0aW9ucy5sZW5ndGggPiAwXG5cdFx0XHQ/IHsgdHlwZTogJ2VudW0nLCBkYXRhOiBlbnVtT3B0aW9uc1swXS52YWx1ZSwgb3B0aW9uczogZW51bU9wdGlvbnMgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU9iamVjdFZhbHVlU3VnZ2VzdGVyKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogSU9iamVjdFZhbHVlU3VnZ2VzdGVyIHtcblx0Y29uc3QgeyBvYmplY3RQcm9wZXJ0aWVzLCBvYmplY3RQYXR0ZXJuUHJvcGVydGllcywgb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMgfSA9IGVsZW1lbnQuc2V0dGluZztcblxuXHRjb25zdCBwYXR0ZXJuc0FuZFNjaGVtYXMgPSBPYmplY3Rcblx0XHQuZW50cmllcyhvYmplY3RQYXR0ZXJuUHJvcGVydGllcyA/PyB7fSlcblx0XHQubWFwKChbcGF0dGVybiwgc2NoZW1hXSkgPT4gKHtcblx0XHRcdHBhdHRlcm46IG5ldyBSZWdFeHAocGF0dGVybiksXG5cdFx0XHRzY2hlbWFcblx0XHR9KSk7XG5cblx0cmV0dXJuIChrZXk6IHN0cmluZykgPT4ge1xuXHRcdGxldCBzdWdnZXN0ZWRTY2hlbWE6IElKU09OU2NoZW1hIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzRGVmaW5lZChvYmplY3RQcm9wZXJ0aWVzKSAmJiBrZXkgaW4gb2JqZWN0UHJvcGVydGllcykge1xuXHRcdFx0c3VnZ2VzdGVkU2NoZW1hID0gb2JqZWN0UHJvcGVydGllc1trZXldO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdHRlcm5TY2hlbWEgPSBzdWdnZXN0ZWRTY2hlbWEgPz8gcGF0dGVybnNBbmRTY2hlbWFzLmZpbmQoKHsgcGF0dGVybiB9KSA9PiBwYXR0ZXJuLnRlc3Qoa2V5KSk/LnNjaGVtYTtcblxuXHRcdGlmIChpc0RlZmluZWQocGF0dGVyblNjaGVtYSkpIHtcblx0XHRcdHN1Z2dlc3RlZFNjaGVtYSA9IHBhdHRlcm5TY2hlbWE7XG5cdFx0fSBlbHNlIGlmIChpc0RlZmluZWQob2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMpICYmIHR5cGVvZiBvYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHN1Z2dlc3RlZFNjaGVtYSA9IG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzO1xuXHRcdH1cblxuXHRcdGlmIChpc0RlZmluZWQoc3VnZ2VzdGVkU2NoZW1hKSkge1xuXHRcdFx0Y29uc3QgdHlwZSA9IGdldE9iamVjdFZhbHVlVHlwZShzdWdnZXN0ZWRTY2hlbWEpO1xuXG5cdFx0XHRpZiAodHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGUsIGRhdGE6IHN1Z2dlc3RlZFNjaGVtYS5kZWZhdWx0ID8/IHRydWUgfTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gJ2VudW0nKSB7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSBnZXRFbnVtT3B0aW9uc0Zyb21TY2hlbWEoc3VnZ2VzdGVkU2NoZW1hKTtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZSwgZGF0YTogc3VnZ2VzdGVkU2NoZW1hLmRlZmF1bHQgPz8gb3B0aW9uc1swXS52YWx1ZSwgb3B0aW9ucyB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZSwgZGF0YTogc3VnZ2VzdGVkU2NoZW1hLmRlZmF1bHQgPz8gJycgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH07XG59XG5cbmZ1bmN0aW9uIGlzTm9uTnVsbGFibGVOdW1lcmljVHlwZSh0eXBlOiB1bmtub3duKTogdHlwZSBpcyAnbnVtYmVyJyB8ICdpbnRlZ2VyJyB7XG5cdHJldHVybiB0eXBlID09PSAnbnVtYmVyJyB8fCB0eXBlID09PSAnaW50ZWdlcic7XG59XG5cbmZ1bmN0aW9uIHBhcnNlTnVtZXJpY09iamVjdFZhbHVlcyhkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHY6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRjb25zdCBuZXdSZWNvcmQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGZvciAoY29uc3Qga2V5IGluIHYpIHtcblx0XHQvLyBTZXQgdG8gdHJ1ZS9mYWxzZSBvbmNlIHdlJ3JlIHN1cmUgb2YgdGhlIGFuc3dlclxuXHRcdGxldCBrZXlNYXRjaGVzTnVtZXJpY1Byb3BlcnR5OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBhdHRlcm5Qcm9wZXJ0aWVzID0gZGF0YUVsZW1lbnQuc2V0dGluZy5vYmplY3RQYXR0ZXJuUHJvcGVydGllcztcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gZGF0YUVsZW1lbnQuc2V0dGluZy5vYmplY3RQcm9wZXJ0aWVzO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxQcm9wZXJ0aWVzID0gZGF0YUVsZW1lbnQuc2V0dGluZy5vYmplY3RBZGRpdGlvbmFsUHJvcGVydGllcztcblxuXHRcdC8vIE1hdGNoIHRoZSBjdXJyZW50IHJlY29yZCBrZXkgYWdhaW5zdCB0aGUgcHJvcGVydGllcyBvZiB0aGUgb2JqZWN0XG5cdFx0aWYgKHByb3BlcnRpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgcHJvcEtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGlmIChwcm9wS2V5ID09PSBrZXkpIHtcblx0XHRcdFx0XHRrZXlNYXRjaGVzTnVtZXJpY1Byb3BlcnR5ID0gaXNOb25OdWxsYWJsZU51bWVyaWNUeXBlKHByb3BlcnRpZXNbcHJvcEtleV0udHlwZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGtleU1hdGNoZXNOdW1lcmljUHJvcGVydHkgPT09IHVuZGVmaW5lZCAmJiBwYXR0ZXJuUHJvcGVydGllcykge1xuXHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuS2V5IGluIHBhdHRlcm5Qcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGlmIChrZXkubWF0Y2gocGF0dGVybktleSkpIHtcblx0XHRcdFx0XHRrZXlNYXRjaGVzTnVtZXJpY1Byb3BlcnR5ID0gaXNOb25OdWxsYWJsZU51bWVyaWNUeXBlKHBhdHRlcm5Qcm9wZXJ0aWVzW3BhdHRlcm5LZXldLnR5cGUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChrZXlNYXRjaGVzTnVtZXJpY1Byb3BlcnR5ID09PSB1bmRlZmluZWQgJiYgYWRkaXRpb25hbFByb3BlcnRpZXMgJiYgdHlwZW9mIGFkZGl0aW9uYWxQcm9wZXJ0aWVzICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdGlmIChpc05vbk51bGxhYmxlTnVtZXJpY1R5cGUoYWRkaXRpb25hbFByb3BlcnRpZXMudHlwZSkpIHtcblx0XHRcdFx0a2V5TWF0Y2hlc051bWVyaWNQcm9wZXJ0eSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG5ld1JlY29yZFtrZXldID0ga2V5TWF0Y2hlc051bWVyaWNQcm9wZXJ0eSA/IE51bWJlcih2W2tleV0pIDogdltrZXldO1xuXHR9XG5cdHJldHVybiBuZXdSZWNvcmQ7XG59XG5cbmZ1bmN0aW9uIGdldExpc3REaXNwbGF5VmFsdWUoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpOiBJTGlzdERhdGFJdGVtW10ge1xuXHRpZiAoIWVsZW1lbnQudmFsdWUgfHwgIUFycmF5LmlzQXJyYXkoZWxlbWVudC52YWx1ZSkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRpZiAoZWxlbWVudC5zZXR0aW5nLmFycmF5SXRlbVR5cGUgPT09ICdlbnVtJykge1xuXHRcdGxldCBlbnVtT3B0aW9uczogSU9iamVjdEVudW1PcHRpb25bXSA9IFtdO1xuXHRcdGlmIChlbGVtZW50LnNldHRpbmcuZW51bSkge1xuXHRcdFx0ZW51bU9wdGlvbnMgPSBlbGVtZW50LnNldHRpbmcuZW51bS5tYXAoKHNldHRpbmcsIGkpID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR2YWx1ZTogc2V0dGluZyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZWxlbWVudC5zZXR0aW5nLmVudW1EZXNjcmlwdGlvbnM/LltpXVxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50LnZhbHVlLm1hcCgoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2VudW0nLFxuXHRcdFx0XHRcdGRhdGE6IGtleSxcblx0XHRcdFx0XHRvcHRpb25zOiBlbnVtT3B0aW9uc1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBlbGVtZW50LnZhbHVlLm1hcCgoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGF0YToga2V5XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U2hvd0FkZEJ1dHRvbkxpc3QoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBsaXN0RGlzcGxheVZhbHVlOiBJTGlzdERhdGFJdGVtW10pOiBib29sZWFuIHtcblx0aWYgKGRhdGFFbGVtZW50LnNldHRpbmcuZW51bSAmJiBkYXRhRWxlbWVudC5zZXR0aW5nLnVuaXF1ZUl0ZW1zKSB7XG5cdFx0cmV0dXJuIGRhdGFFbGVtZW50LnNldHRpbmcuZW51bS5sZW5ndGggLSBsaXN0RGlzcGxheVZhbHVlLmxlbmd0aCA+IDA7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVTZXR0aW5nc1RyZWUodG9jRGF0YTogSVRPQ0VudHJ5PHN0cmluZz4sIGNvcmVTZXR0aW5nc0dyb3VwczogSVNldHRpbmdzR3JvdXBbXSwgZmlsdGVyOiBJVE9DRmlsdGVyIHwgdW5kZWZpbmVkLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IHsgdHJlZTogSVRPQ0VudHJ5PElTZXR0aW5nPjsgbGVmdG92ZXJTZXR0aW5nczogU2V0PElTZXR0aW5nPiB9IHtcblx0Y29uc3QgYWxsU2V0dGluZ3MgPSBnZXRGbGF0U2V0dGluZ3MoY29yZVNldHRpbmdzR3JvdXBzKTtcblx0cmV0dXJuIHtcblx0XHR0cmVlOiBfcmVzb2x2ZVNldHRpbmdzVHJlZSh0b2NEYXRhLCBhbGxTZXR0aW5ncywgZmlsdGVyLCBsb2dTZXJ2aWNlKSxcblx0XHRsZWZ0b3ZlclNldHRpbmdzOiBhbGxTZXR0aW5nc1xuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNvbmZpZ3VyZWRVbnRydXN0ZWRTZXR0aW5ncyhncm91cHM6IElTZXR0aW5nc0dyb3VwW10sIHRhcmdldDogU2V0dGluZ3NUYXJnZXQsIGxhbmd1YWdlRmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UpOiBJU2V0dGluZ1tdIHtcblx0Y29uc3QgYWxsU2V0dGluZ3MgPSBnZXRGbGF0U2V0dGluZ3MoZ3JvdXBzKTtcblx0cmV0dXJuIFsuLi5hbGxTZXR0aW5nc10uZmlsdGVyKHNldHRpbmcgPT4gc2V0dGluZy5yZXN0cmljdGVkICYmIGluc3BlY3RTZXR0aW5nKHNldHRpbmcua2V5LCB0YXJnZXQsIGxhbmd1YWdlRmlsdGVyLCBjb25maWd1cmF0aW9uU2VydmljZSkuaXNDb25maWd1cmVkKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVRvY1RyZWVGb3JFeHRlbnNpb25TZXR0aW5ncyhleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSwgZ3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdLCBmaWx0ZXI6IElUT0NGaWx0ZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPElUT0NFbnRyeTxJU2V0dGluZz4+IHtcblx0Y29uc3QgZXh0R3JvdXBUcmVlID0gbmV3IE1hcDxzdHJpbmcsIElUT0NFbnRyeTxJU2V0dGluZz4+KCk7XG5cdGNvbnN0IGFkZEVudHJ5VG9UcmVlID0gKGV4dGVuc2lvbklkOiBzdHJpbmcsIGV4dGVuc2lvbk5hbWU6IHN0cmluZywgY2hpbGRFbnRyeTogSVRPQ0VudHJ5PElTZXR0aW5nPikgPT4ge1xuXHRcdGlmICghZXh0R3JvdXBUcmVlLmhhcyhleHRlbnNpb25JZCkpIHtcblx0XHRcdGNvbnN0IHJvb3RFbnRyeSA9IHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbklkLFxuXHRcdFx0XHRsYWJlbDogZXh0ZW5zaW9uTmFtZSxcblx0XHRcdFx0Y2hpbGRyZW46IFtdXG5cdFx0XHR9O1xuXHRcdFx0ZXh0R3JvdXBUcmVlLnNldChleHRlbnNpb25JZCwgcm9vdEVudHJ5KTtcblx0XHR9XG5cdFx0ZXh0R3JvdXBUcmVlLmdldChleHRlbnNpb25JZCkhLmNoaWxkcmVuIS5wdXNoKGNoaWxkRW50cnkpO1xuXHR9O1xuXHRjb25zdCBwcm9jZXNzR3JvdXBFbnRyeSA9IGFzeW5jIChncm91cDogSVNldHRpbmdzR3JvdXApID0+IHtcblx0XHRjb25zdCBmbGF0U2V0dGluZ3MgPSBncm91cC5zZWN0aW9ucy5tYXAoc2VjdGlvbiA9PiBzZWN0aW9uLnNldHRpbmdzKS5mbGF0KCk7XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSBmaWx0ZXIgPyBnZXRNYXRjaGluZ1NldHRpbmdzKG5ldyBTZXQoZmxhdFNldHRpbmdzKSwgZmlsdGVyKSA6IGZsYXRTZXR0aW5ncztcblx0XHRzb3J0U2V0dGluZ3Moc2V0dGluZ3MpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBncm91cC5leHRlbnNpb25JbmZvIS5pZDtcblx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCBleHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihleHRlbnNpb25JZCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTmFtZSA9IGV4dGVuc2lvbj8uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uPy5uYW1lID8/IGV4dGVuc2lvbklkO1xuXG5cdFx0Ly8gVGhlcmUgY291bGQgYmUgbXVsdGlwbGUgZ3JvdXBzIHdpdGggdGhlIHNhbWUgZXh0ZW5zaW9uIGlkIHRoYXQgYWxsIGJlbG9uZyB0byB0aGUgc2FtZSBleHRlbnNpb24uXG5cdFx0Ly8gVG8gYXZvaWQgaGlnaGxpZ2h0aW5nIGFsbCBncm91cHMgdXBvbiBleHBhbmRpbmcgdGhlIGV4dGVuc2lvbidzIFRvQyBlbnRyeSxcblx0XHQvLyB1c2UgdGhlIGdyb3VwIElEIG9ubHkgaWYgaXQgaXMgbm9uLWVtcHR5IGFuZCBpc24ndCB0aGUgZXh0ZW5zaW9uIElELlxuXHRcdC8vIFJlZiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjQxNTIxLlxuXHRcdGNvbnN0IHNldHRpbmdHcm91cElkID0gKGdyb3VwLmlkICYmIGdyb3VwLmlkICE9PSBleHRlbnNpb25JZCkgPyBncm91cC5pZCA6IGdyb3VwLnRpdGxlO1xuXG5cdFx0Y29uc3QgY2hpbGRFbnRyeTogSVRPQ0VudHJ5PElTZXR0aW5nPiA9IHtcblx0XHRcdGlkOiBzZXR0aW5nR3JvdXBJZCxcblx0XHRcdGxhYmVsOiBncm91cC50aXRsZSxcblx0XHRcdG9yZGVyOiBncm91cC5vcmRlcixcblx0XHRcdHNldHRpbmdzXG5cdFx0fTtcblx0XHRhZGRFbnRyeVRvVHJlZShleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZSwgY2hpbGRFbnRyeSk7XG5cdH07XG5cblx0Y29uc3QgcHJvY2Vzc1Byb21pc2VzID0gZ3JvdXBzLm1hcChnID0+IHByb2Nlc3NHcm91cEVudHJ5KGcpKTtcblx0cmV0dXJuIFByb21pc2UuYWxsKHByb2Nlc3NQcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0Y29uc3QgZXh0R3JvdXBzOiBJVE9DRW50cnk8SVNldHRpbmc+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblJvb3RFbnRyeSBvZiBleHRHcm91cFRyZWUudmFsdWVzKCkpIHtcblx0XHRcdGlmIChleHRlbnNpb25Sb290RW50cnkuY2hpbGRyZW4hLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBUaGVyZSBpcyBhIHNpbmdsZSBjYXRlZ29yeSBmb3IgdGhpcyBleHRlbnNpb24uXG5cdFx0XHRcdC8vIFB1c2ggYSBmbGF0dGVuZWQgc2V0dGluZy5cblx0XHRcdFx0ZXh0R3JvdXBzLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBleHRlbnNpb25Sb290RW50cnkuaWQsXG5cdFx0XHRcdFx0bGFiZWw6IGV4dGVuc2lvblJvb3RFbnRyeS5jaGlsZHJlbiFbMF0ubGFiZWwsXG5cdFx0XHRcdFx0c2V0dGluZ3M6IGV4dGVuc2lvblJvb3RFbnRyeS5jaGlsZHJlbiFbMF0uc2V0dGluZ3Ncblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTb3J0IHRoZSBjYXRlZ29yaWVzLlxuXHRcdFx0XHQvLyBMZWF2ZSB0aGUgdW5kZWZpbmVkIG9yZGVyIGNhdGVnb3JpZXMgdW50b3VjaGVkLlxuXHRcdFx0XHRleHRlbnNpb25Sb290RW50cnkuY2hpbGRyZW4hLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gY29tcGFyZVR3b051bGxhYmxlTnVtYmVycyhhLm9yZGVyLCBiLm9yZGVyKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgYSBjYXRlZ29yeSB0aGF0IG1hdGNoZXMgdGhlIHNldHRpbmcgbmFtZSxcblx0XHRcdFx0Ly8gYWRkIHRoZSBzZXR0aW5ncyBpbiBtYW51YWxseSBhcyBcInVuZ3JvdXBlZFwiIHNldHRpbmdzLlxuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM3MjU5XG5cdFx0XHRcdGNvbnN0IHVuZ3JvdXBlZENoaWxkID0gZXh0ZW5zaW9uUm9vdEVudHJ5LmNoaWxkcmVuIS5maW5kKGNoaWxkID0+IGNoaWxkLmxhYmVsID09PSBleHRlbnNpb25Sb290RW50cnkubGFiZWwpO1xuXHRcdFx0XHRpZiAodW5ncm91cGVkQ2hpbGQgJiYgIXVuZ3JvdXBlZENoaWxkLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ3JvdXBlZENoaWxkcmVuID0gZXh0ZW5zaW9uUm9vdEVudHJ5LmNoaWxkcmVuIS5maWx0ZXIoY2hpbGQgPT4gY2hpbGQgIT09IHVuZ3JvdXBlZENoaWxkKTtcblx0XHRcdFx0XHRleHRHcm91cHMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogZXh0ZW5zaW9uUm9vdEVudHJ5LmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGV4dGVuc2lvblJvb3RFbnRyeS5sYWJlbCxcblx0XHRcdFx0XHRcdHNldHRpbmdzOiB1bmdyb3VwZWRDaGlsZC5zZXR0aW5ncyxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBncm91cGVkQ2hpbGRyZW5cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBQdXNoIGFsbCB0aGUgZ3JvdXBzIGFzLWlzLlxuXHRcdFx0XHRcdGV4dEdyb3Vwcy5wdXNoKGV4dGVuc2lvblJvb3RFbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTb3J0IHRoZSBvdXRlcm1vc3Qgc2V0dGluZ3MuXG5cdFx0ZXh0R3JvdXBzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6ICdleHRlbnNpb25zJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKSxcblx0XHRcdGNoaWxkcmVuOiBleHRHcm91cHNcblx0XHR9O1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gX3Jlc29sdmVTZXR0aW5nc1RyZWUodG9jRGF0YTogSVRPQ0VudHJ5PHN0cmluZz4sIGFsbFNldHRpbmdzOiBTZXQ8SVNldHRpbmc+LCBmaWx0ZXI6IElUT0NGaWx0ZXIgfCB1bmRlZmluZWQsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogSVRPQ0VudHJ5PElTZXR0aW5nPiB7XG5cdGxldCBjaGlsZHJlbjogSVRPQ0VudHJ5PElTZXR0aW5nPltdIHwgdW5kZWZpbmVkO1xuXHRpZiAodG9jRGF0YS5jaGlsZHJlbikge1xuXHRcdGNoaWxkcmVuID0gdG9jRGF0YS5jaGlsZHJlblxuXHRcdFx0LmZpbHRlcihjaGlsZCA9PiBjaGlsZC5oaWRlICE9PSB0cnVlKVxuXHRcdFx0Lm1hcChjaGlsZCA9PiBfcmVzb2x2ZVNldHRpbmdzVHJlZShjaGlsZCwgYWxsU2V0dGluZ3MsIGZpbHRlciwgbG9nU2VydmljZSkpXG5cdFx0XHQuZmlsdGVyKGNoaWxkID0+IGNoaWxkLmNoaWxkcmVuPy5sZW5ndGggfHwgY2hpbGQuc2V0dGluZ3M/Lmxlbmd0aCk7XG5cdH1cblxuXHRsZXQgc2V0dGluZ3M6IElTZXR0aW5nW10gfCB1bmRlZmluZWQ7XG5cdGlmIChmaWx0ZXIgfHwgdG9jRGF0YS5zZXR0aW5ncykge1xuXHRcdHNldHRpbmdzID0gZ2V0TWF0Y2hpbmdTZXR0aW5ncyhhbGxTZXR0aW5ncywge1xuXHRcdFx0aW5jbHVkZToge1xuXHRcdFx0XHRrZXlQYXR0ZXJuczogWy4uLmZpbHRlcj8uaW5jbHVkZT8ua2V5UGF0dGVybnMgPz8gW10sIC4uLnRvY0RhdGEuc2V0dGluZ3MgPz8gW11dLFxuXHRcdFx0XHR0YWdzOiBmaWx0ZXI/LmluY2x1ZGU/LnRhZ3MgPyBbLi4uZmlsdGVyLmluY2x1ZGUudGFnc10gOiBbXVxuXHRcdFx0fSxcblx0XHRcdGV4Y2x1ZGU6IGZpbHRlcj8uZXhjbHVkZSA/PyB7fVxuXHRcdH0pO1xuXHRcdHNvcnRTZXR0aW5ncyhzZXR0aW5ncyk7XG5cdH1cblxuXHRpZiAoIWNoaWxkcmVuICYmICFzZXR0aW5ncykge1xuXHRcdHRocm93IG5ldyBFcnJvcihgVE9DIG5vZGUgaGFzIG5vIGNoaWxkIGdyb3VwcyBvciBzZXR0aW5nczogJHt0b2NEYXRhLmlkfWApO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRpZDogdG9jRGF0YS5pZCxcblx0XHRsYWJlbDogdG9jRGF0YS5sYWJlbCxcblx0XHRjaGlsZHJlbixcblx0XHRzZXR0aW5nc1xuXHR9O1xufVxuXG4vKipcbiAqIFNvcnQgc2V0dGluZ3Mgc28gdGhhdCBwcmV2aWV3IGFuZCBleHBlcmltZW50YWwgc2V0dGluZ3MgYXJlIGRlcHJpb3JpdGl6ZWQuXG4gKiBXaXRoaW4gZWFjaCB0aWVyLCBzb3J0IHRoZSBzZXR0aW5ncyBieSBvcmRlciwgdGhlbiBhbHBoYWJldGljYWxseS5cbiAqL1xuZnVuY3Rpb24gc29ydFNldHRpbmdzKHNldHRpbmdzOiBJU2V0dGluZ1tdKTogdm9pZCB7XG5cdGNvbnN0IFNFVFRJTkdfU1RBVFVTX05PUk1BTCA9IDA7XG5cdGNvbnN0IFNFVFRJTkdfU1RBVFVTX1BSRVZJRVcgPSAxO1xuXHRjb25zdCBTRVRUSU5HX1NUQVRVU19FWFBFUklNRU5UQUwgPSAyO1xuXG5cdGNvbnN0IGdldEV4cGVyaW1lbnRhbFN0YXR1cyA9IChzZXR0aW5nOiBJU2V0dGluZykgPT4ge1xuXHRcdGlmIChzZXR0aW5nLnRhZ3M/LmluY2x1ZGVzKCdleHBlcmltZW50YWwnKSkge1xuXHRcdFx0cmV0dXJuIFNFVFRJTkdfU1RBVFVTX0VYUEVSSU1FTlRBTDtcblx0XHR9IGVsc2UgaWYgKHNldHRpbmcudGFncz8uaW5jbHVkZXMoJ3ByZXZpZXcnKSkge1xuXHRcdFx0cmV0dXJuIFNFVFRJTkdfU1RBVFVTX1BSRVZJRVc7XG5cdFx0fVxuXHRcdHJldHVybiBTRVRUSU5HX1NUQVRVU19OT1JNQUw7XG5cdH07XG5cblx0c2V0dGluZ3Muc29ydCgoYSwgYikgPT4ge1xuXHRcdGNvbnN0IGV4cGVyaW1lbnRhbFN0YXR1c0EgPSBnZXRFeHBlcmltZW50YWxTdGF0dXMoYSk7XG5cdFx0Y29uc3QgZXhwZXJpbWVudGFsU3RhdHVzQiA9IGdldEV4cGVyaW1lbnRhbFN0YXR1cyhiKTtcblx0XHRpZiAoZXhwZXJpbWVudGFsU3RhdHVzQSAhPT0gZXhwZXJpbWVudGFsU3RhdHVzQikge1xuXHRcdFx0cmV0dXJuIGV4cGVyaW1lbnRhbFN0YXR1c0EgLSBleHBlcmltZW50YWxTdGF0dXNCO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yZGVyQ29tcGFyaXNvbiA9IGNvbXBhcmVUd29OdWxsYWJsZU51bWJlcnMoYS5vcmRlciwgYi5vcmRlcik7XG5cdFx0cmV0dXJuIG9yZGVyQ29tcGFyaXNvbiAhPT0gMCA/IG9yZGVyQ29tcGFyaXNvbiA6IGEua2V5LmxvY2FsZUNvbXBhcmUoYi5rZXkpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZ2V0TWF0Y2hpbmdTZXR0aW5ncyhhbGxTZXR0aW5nczogU2V0PElTZXR0aW5nPiwgZmlsdGVyOiBJVE9DRmlsdGVyKTogSVNldHRpbmdbXSB7XG5cdGNvbnN0IHJlc3VsdDogSVNldHRpbmdbXSA9IFtdO1xuXG5cdGFsbFNldHRpbmdzLmZvckVhY2goc2V0dGluZyA9PiB7XG5cdFx0bGV0IHNob3VsZEluY2x1ZGUgPSBmYWxzZTtcblx0XHRsZXQgc2hvdWxkRXhjbHVkZSA9IGZhbHNlO1xuXG5cdFx0Ly8gQ2hlY2sgaW5jbHVkZSBmaWx0ZXJzXG5cdFx0aWYgKGZpbHRlci5pbmNsdWRlPy5rZXlQYXR0ZXJucykge1xuXHRcdFx0c2hvdWxkSW5jbHVkZSA9IGZpbHRlci5pbmNsdWRlLmtleVBhdHRlcm5zLnNvbWUocGF0dGVybiA9PiB7XG5cdFx0XHRcdGlmIChwYXR0ZXJuLnN0YXJ0c1dpdGgoJ0B0YWc6JykpIHtcblx0XHRcdFx0XHRjb25zdCB0YWdOYW1lID0gcGF0dGVybi5zdWJzdHJpbmcoNSk7XG5cdFx0XHRcdFx0cmV0dXJuIHNldHRpbmcudGFncz8uaW5jbHVkZXModGFnTmFtZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNldHRpbmdNYXRjaGVzKHNldHRpbmcsIHBhdHRlcm4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2hvdWxkSW5jbHVkZSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHNob3VsZEluY2x1ZGUgJiYgZmlsdGVyLmluY2x1ZGU/LnRhZ3M/Lmxlbmd0aCkge1xuXHRcdFx0c2hvdWxkSW5jbHVkZSA9IGZpbHRlci5pbmNsdWRlLnRhZ3Muc29tZSh0YWcgPT4gc2V0dGluZy50YWdzPy5pbmNsdWRlcyh0YWcpKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBleGNsdWRlIGZpbHRlcnMgKHRha2VzIHByZWNlZGVuY2UpXG5cdFx0aWYgKGZpbHRlci5leGNsdWRlPy5rZXlQYXR0ZXJucykge1xuXHRcdFx0c2hvdWxkRXhjbHVkZSA9IGZpbHRlci5leGNsdWRlLmtleVBhdHRlcm5zLnNvbWUocGF0dGVybiA9PiB7XG5cdFx0XHRcdGlmIChwYXR0ZXJuLnN0YXJ0c1dpdGgoJ0B0YWc6JykpIHtcblx0XHRcdFx0XHRjb25zdCB0YWdOYW1lID0gcGF0dGVybi5zdWJzdHJpbmcoNSk7XG5cdFx0XHRcdFx0cmV0dXJuIHNldHRpbmcudGFncz8uaW5jbHVkZXModGFnTmFtZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNldHRpbmdNYXRjaGVzKHNldHRpbmcsIHBhdHRlcm4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoIXNob3VsZEV4Y2x1ZGUgJiYgZmlsdGVyLmV4Y2x1ZGU/LnRhZ3M/Lmxlbmd0aCkge1xuXHRcdFx0c2hvdWxkRXhjbHVkZSA9IGZpbHRlci5leGNsdWRlLnRhZ3Muc29tZSh0YWcgPT4gc2V0dGluZy50YWdzPy5pbmNsdWRlcyh0YWcpKTtcblx0XHR9XG5cblx0XHQvLyBJbmNsdWRlIGlmIG1hdGNoZXMgaW5jbHVkZSBmaWx0ZXIgYW5kIGRvZXNuJ3QgbWF0Y2ggZXhjbHVkZSBmaWx0ZXJcblx0XHRpZiAoc2hvdWxkSW5jbHVkZSAmJiAhc2hvdWxkRXhjbHVkZSkge1xuXHRcdFx0cmVzdWx0LnB1c2goc2V0dGluZyk7XG5cdFx0XHRpZiAoIW11bHRpR3JvdXBUb2NTZXR0aW5ncy5oYXMoc2V0dGluZy5rZXkpKSB7XG5cdFx0XHRcdGFsbFNldHRpbmdzLmRlbGV0ZShzZXR0aW5nKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IHNldHRpbmdQYXR0ZXJuQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVnRXhwPigpO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2V0dGluZ01hdGNoUmVnRXhwKHBhdHRlcm46IHN0cmluZyk6IFJlZ0V4cCB7XG5cdHBhdHRlcm4gPSBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHBhdHRlcm4pXG5cdFx0LnJlcGxhY2UoL1xcXFxcXCovZywgJy4qJyk7XG5cblx0cmV0dXJuIG5ldyBSZWdFeHAoYF4ke3BhdHRlcm59JGAsICdpJyk7XG59XG5cbmZ1bmN0aW9uIHNldHRpbmdNYXRjaGVzKHM6IElTZXR0aW5nLCBwYXR0ZXJuOiBzdHJpbmcpOiBib29sZWFuIHtcblx0bGV0IHJlZ0V4cCA9IHNldHRpbmdQYXR0ZXJuQ2FjaGUuZ2V0KHBhdHRlcm4pO1xuXHRpZiAoIXJlZ0V4cCkge1xuXHRcdHJlZ0V4cCA9IGNyZWF0ZVNldHRpbmdNYXRjaFJlZ0V4cChwYXR0ZXJuKTtcblx0XHRzZXR0aW5nUGF0dGVybkNhY2hlLnNldChwYXR0ZXJuLCByZWdFeHApO1xuXHR9XG5cblx0cmV0dXJuIHJlZ0V4cC50ZXN0KHMua2V5KTtcbn1cblxuZnVuY3Rpb24gZ2V0RmxhdFNldHRpbmdzKHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdKSB7XG5cdGNvbnN0IHJlc3VsdDogU2V0PElTZXR0aW5nPiA9IG5ldyBTZXQoKTtcblxuXHRmb3IgKGNvbnN0IGdyb3VwIG9mIHNldHRpbmdzR3JvdXBzKSB7XG5cdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGdyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHMgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRpZiAoIXMub3ZlcnJpZGVzIHx8ICFzLm92ZXJyaWRlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXN1bHQuYWRkKHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuaW50ZXJmYWNlIElEaXNwb3NhYmxlVGVtcGxhdGUge1xuXHRyZWFkb25seSB0b0Rpc3Bvc2U6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuaW50ZXJmYWNlIElTZXR0aW5nSXRlbVRlbXBsYXRlPFQgPSBhbnk+IGV4dGVuZHMgSURpc3Bvc2FibGVUZW1wbGF0ZSB7XG5cdG9uQ2hhbmdlPzogKHZhbHVlOiBUKSA9PiB2b2lkO1xuXG5cdGNvbnRleHQ/OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudDtcblx0Y29udGFpbmVyRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGNhdGVnb3J5RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGxhYmVsRWxlbWVudDogU2ltcGxlSWNvbkxhYmVsO1xuXHRkZXNjcmlwdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRjb250cm9sRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGRlcHJlY2F0aW9uV2FybmluZ0VsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRpbmRpY2F0b3JzTGFiZWw6IFNldHRpbmdzVHJlZUluZGljYXRvcnNMYWJlbDtcblx0dG9vbGJhcjogVG9vbEJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJU2V0dGluZ0Jvb2xJdGVtVGVtcGxhdGUgZXh0ZW5kcyBJU2V0dGluZ0l0ZW1UZW1wbGF0ZTxib29sZWFuPiB7XG5cdGNoZWNrYm94OiBUb2dnbGU7XG59XG5cbmludGVyZmFjZSBJU2V0dGluZ0V4dGVuc2lvblRvZ2dsZUl0ZW1UZW1wbGF0ZSBleHRlbmRzIElTZXR0aW5nSXRlbVRlbXBsYXRlPHVuZGVmaW5lZD4ge1xuXHRhY3Rpb25CdXR0b246IEJ1dHRvbjtcblx0ZGlzbWlzc0J1dHRvbjogQnV0dG9uO1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdUZXh0SXRlbVRlbXBsYXRlIGV4dGVuZHMgSVNldHRpbmdJdGVtVGVtcGxhdGU8c3RyaW5nPiB7XG5cdGlucHV0Qm94OiBJbnB1dEJveDtcblx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG50eXBlIElTZXR0aW5nTnVtYmVySXRlbVRlbXBsYXRlID0gSVNldHRpbmdUZXh0SXRlbVRlbXBsYXRlO1xuXG5pbnRlcmZhY2UgSVNldHRpbmdFbnVtSXRlbVRlbXBsYXRlIGV4dGVuZHMgSVNldHRpbmdJdGVtVGVtcGxhdGU8bnVtYmVyPiB7XG5cdHNlbGVjdEJveDogU2VsZWN0Qm94O1xuXHRzZWxlY3RFbGVtZW50OiBIVE1MU2VsZWN0RWxlbWVudCB8IG51bGw7XG5cdGVudW1EZXNjcmlwdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdDb21wbGV4SXRlbVRlbXBsYXRlIGV4dGVuZHMgSVNldHRpbmdJdGVtVGVtcGxhdGU8dm9pZD4ge1xuXHRidXR0b246IEhUTUxFbGVtZW50O1xuXHR2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJU2V0dGluZ0NvbXBsZXhPYmplY3RJdGVtVGVtcGxhdGUgZXh0ZW5kcyBJU2V0dGluZ0NvbXBsZXhJdGVtVGVtcGxhdGUge1xuXHRvYmplY3RTZXR0aW5nV2lkZ2V0OiBPYmplY3RTZXR0aW5nRHJvcGRvd25XaWRnZXQ7XG59XG5cbmludGVyZmFjZSBJU2V0dGluZ0xpc3RJdGVtVGVtcGxhdGUgZXh0ZW5kcyBJU2V0dGluZ0l0ZW1UZW1wbGF0ZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRsaXN0V2lkZ2V0OiBMaXN0U2V0dGluZ1dpZGdldDxJTGlzdERhdGFJdGVtPjtcblx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdJbmNsdWRlRXhjbHVkZUl0ZW1UZW1wbGF0ZSBleHRlbmRzIElTZXR0aW5nSXRlbVRlbXBsYXRlPHZvaWQ+IHtcblx0aW5jbHVkZUV4Y2x1ZGVXaWRnZXQ6IExpc3RTZXR0aW5nV2lkZ2V0PElJbmNsdWRlRXhjbHVkZURhdGFJdGVtPjtcbn1cblxuaW50ZXJmYWNlIElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlIGV4dGVuZHMgSVNldHRpbmdJdGVtVGVtcGxhdGU8UmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+IHtcblx0b2JqZWN0RHJvcGRvd25XaWRnZXQ/OiBPYmplY3RTZXR0aW5nRHJvcGRvd25XaWRnZXQ7XG5cdG9iamVjdENoZWNrYm94V2lkZ2V0PzogT2JqZWN0U2V0dGluZ0NoZWNrYm94V2lkZ2V0O1xuXHR2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJU2V0dGluZ05ld0V4dGVuc2lvbnNUZW1wbGF0ZSBleHRlbmRzIElEaXNwb3NhYmxlVGVtcGxhdGUge1xuXHRidXR0b246IEJ1dHRvbjtcblx0Y29udGV4dD86IFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUdyb3VwVGl0bGVUZW1wbGF0ZSBleHRlbmRzIElEaXNwb3NhYmxlVGVtcGxhdGUge1xuXHRjb250ZXh0PzogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50O1xuXHRwYXJlbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5jb25zdCBTRVRUSU5HU19URVhUX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLnRleHQudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfTVVMVElMSU5FX1RFWFRfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MubXVsdGlsaW5lVGV4dC50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19OVU1CRVJfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MubnVtYmVyLnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0VOVU1fVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MuZW51bS50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19CT09MX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmJvb2wudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfQVJSQVlfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MuYXJyYXkudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfRVhDTFVERV9URU1QTEFURV9JRCA9ICdzZXR0aW5ncy5leGNsdWRlLnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0lOQ0xVREVfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MuaW5jbHVkZS50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19PQkpFQ1RfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3Mub2JqZWN0LnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0JPT0xfT0JKRUNUX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmJvb2xPYmplY3QudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfQ09NUExFWF9URU1QTEFURV9JRCA9ICdzZXR0aW5ncy5jb21wbGV4LnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0NPTVBMRVhfT0JKRUNUX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmNvbXBsZXhPYmplY3QudGVtcGxhdGUnO1xuY29uc3QgU0VUVElOR1NfTkVXX0VYVEVOU0lPTlNfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MubmV3RXh0ZW5zaW9ucy50ZW1wbGF0ZSc7XG5jb25zdCBTRVRUSU5HU19FTEVNRU5UX1RFTVBMQVRFX0lEID0gJ3NldHRpbmdzLmdyb3VwLnRlbXBsYXRlJztcbmNvbnN0IFNFVFRJTkdTX0VYVEVOU0lPTl9UT0dHTEVfVEVNUExBVEVfSUQgPSAnc2V0dGluZ3MuZXh0ZW5zaW9uVG9nZ2xlLnRlbXBsYXRlJztcblxuZXhwb3J0IGludGVyZmFjZSBJU2V0dGluZ0NoYW5nZUV2ZW50IHtcblx0a2V5OiBzdHJpbmc7XG5cdHZhbHVlOiB1bmtub3duOyAvLyB1bmRlZmluZWQgPT4gcmVzZXQvdW5jb25maWd1cmVcblx0dHlwZTogU2V0dGluZ1ZhbHVlVHlwZSB8IFNldHRpbmdWYWx1ZVR5cGVbXTtcblx0bWFudWFsUmVzZXQ6IGJvb2xlYW47XG5cdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdMaW5rQ2xpY2tFdmVudCB7XG5cdHNvdXJjZTogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQ7XG5cdHRhcmdldEtleTogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiByZW1vdmVDaGlsZHJlbkZyb21UYWJPcmRlcihub2RlOiBFbGVtZW50KTogdm9pZCB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRjb25zdCBmb2N1c2FibGVFbGVtZW50cyA9IG5vZGUucXVlcnlTZWxlY3RvckFsbChgXG5cdFx0W3RhYmluZGV4PVwiMFwiXSxcblx0XHRpbnB1dDpub3QoW3RhYmluZGV4PVwiLTFcIl0pLFxuXHRcdHNlbGVjdDpub3QoW3RhYmluZGV4PVwiLTFcIl0pLFxuXHRcdHRleHRhcmVhOm5vdChbdGFiaW5kZXg9XCItMVwiXSksXG5cdFx0YTpub3QoW3RhYmluZGV4PVwiLTFcIl0pLFxuXHRcdGJ1dHRvbjpub3QoW3RhYmluZGV4PVwiLTFcIl0pLFxuXHRcdGFyZWE6bm90KFt0YWJpbmRleD1cIi0xXCJdKVxuXHRgKTtcblxuXHRmb2N1c2FibGVFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkVMRU1FTlRfRk9DVVNBQkxFX0FUVFIsICd0cnVlJyk7XG5cdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJy0xJyk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBhZGRDaGlsZHJlblRvVGFiT3JkZXIobm9kZTogRWxlbWVudCk6IHZvaWQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0Y29uc3QgZm9jdXNhYmxlRWxlbWVudHMgPSBub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoXG5cdFx0YFske0Fic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkVMRU1FTlRfRk9DVVNBQkxFX0FUVFJ9PVwidHJ1ZVwiXWBcblx0KTtcblxuXHRmb2N1c2FibGVFbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkVMRU1FTlRfRk9DVVNBQkxFX0FUVFIpO1xuXHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhlaWdodENoYW5nZVBhcmFtcyB7XG5cdGVsZW1lbnQ6IFNldHRpbmdzVHJlZUVsZW1lbnQ7XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVFbGVtZW50LCBuZXZlciwgYW55PiB7XG5cdC8qKiBUbyBvdmVycmlkZSAqL1xuXHRhYnN0cmFjdCBnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmc7XG5cblx0c3RhdGljIHJlYWRvbmx5IENPTlRST0xfQ0xBU1MgPSAnc2V0dGluZy1jb250cm9sLWZvY3VzLXRhcmdldCc7XG5cdHN0YXRpYyByZWFkb25seSBDT05UUk9MX1NFTEVDVE9SID0gJy4nICsgdGhpcy5DT05UUk9MX0NMQVNTO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ09OVEVOVFNfQ0xBU1MgPSAnc2V0dGluZy1pdGVtLWNvbnRlbnRzJztcblx0c3RhdGljIHJlYWRvbmx5IENPTlRFTlRTX1NFTEVDVE9SID0gJy4nICsgdGhpcy5DT05URU5UU19DTEFTUztcblx0c3RhdGljIHJlYWRvbmx5IEFMTF9ST1dTX1NFTEVDVE9SID0gJy5tb25hY28tbGlzdC1yb3cnO1xuXG5cdHN0YXRpYyByZWFkb25seSBTRVRUSU5HX0tFWV9BVFRSID0gJ2RhdGEta2V5Jztcblx0c3RhdGljIHJlYWRvbmx5IFNFVFRJTkdfSURfQVRUUiA9ICdkYXRhLWlkJztcblx0c3RhdGljIHJlYWRvbmx5IEVMRU1FTlRfRk9DVVNBQkxFX0FUVFIgPSAnZGF0YS1mb2N1c2FibGUnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQ6IEV2ZW50PElTZXR0aW5nT3ZlcnJpZGVDbGlja0V2ZW50PiA9IHRoaXMuX29uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNldHRpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2V0dGluZ0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXR0aW5nOiBFdmVudDxJU2V0dGluZ0NoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlU2V0dGluZy5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkT3BlblNldHRpbmdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuU2V0dGluZ3M6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZE9wZW5TZXR0aW5ncy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrU2V0dGluZ0xpbmsgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2V0dGluZ0xpbmtDbGlja0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGlja1NldHRpbmdMaW5rOiBFdmVudDxJU2V0dGluZ0xpbmtDbGlja0V2ZW50PiA9IHRoaXMuX29uRGlkQ2xpY2tTZXR0aW5nTGluay5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkRm9jdXNTZXR0aW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzU2V0dGluZzogRXZlbnQ8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQ+ID0gdGhpcy5fb25EaWRGb2N1c1NldHRpbmcuZXZlbnQ7XG5cblx0cHJpdmF0ZSBpZ25vcmVkU2V0dGluZ3M6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUlnbm9yZWRTZXR0aW5ncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUlnbm9yZWRTZXR0aW5nczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUlnbm9yZWRTZXR0aW5ncy5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2V0dGluZ0hlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEhlaWdodENoYW5nZVBhcmFtcz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2V0dGluZ0hlaWdodDogRXZlbnQ8SGVpZ2h0Q2hhbmdlUGFyYW1zPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2V0dGluZ0hlaWdodC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uQXBwbHlGaWx0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkFwcGx5RmlsdGVyOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25BcHBseUZpbHRlci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNldHRpbmdBY3Rpb25zOiBJQWN0aW9uW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlQWN0aW9uRmFjdG9yeTogKHNldHRpbmc6IElTZXR0aW5nLCBzZXR0aW5nVGFyZ2V0OiBTZXR0aW5nc1RhcmdldCkgPT4gSUFjdGlvbltdLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZXh0ZW5zaW9uc1NlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaWdub3JlZFNldHRpbmdzID0gZ2V0SWdub3JlZFNldHRpbmdzKGdldERlZmF1bHRJZ25vcmVkU2V0dGluZ3MoKSwgdGhpcy5fY29uZmlnU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHR0aGlzLmlnbm9yZWRTZXR0aW5ncyA9IGdldElnbm9yZWRTZXR0aW5ncyhnZXREZWZhdWx0SWdub3JlZFNldHRpbmdzKCksIHRoaXMuX2NvbmZpZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJZ25vcmVkU2V0dGluZ3MuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFic3RyYWN0IHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBhbnk7XG5cblx0YWJzdHJhY3QgcmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiB1bmtub3duKTogdm9pZDtcblxuXHRwcm90ZWN0ZWQgcmVuZGVyQ29tbW9uVGVtcGxhdGUodHJlZTogdW5rbm93biwgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHR5cGVDbGFzczogc3RyaW5nKTogSVNldHRpbmdJdGVtVGVtcGxhdGUge1xuXHRcdF9jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1pdGVtJyk7XG5cdFx0X2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWl0ZW0tJyArIHR5cGVDbGFzcyk7XG5cblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBET00uYXBwZW5kKF9jb250YWluZXIsICQoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuQ09OVEVOVFNfU0VMRUNUT1IpKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2V0dGluZ3Mtcm93LWlubmVyLWNvbnRhaW5lcicpO1xuXHRcdGNvbnN0IHRpdGxlRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy1pdGVtLXRpdGxlJykpO1xuXHRcdGNvbnN0IGxhYmVsQ2F0ZWdvcnlDb250YWluZXIgPSBET00uYXBwZW5kKHRpdGxlRWxlbWVudCwgJCgnLnNldHRpbmctaXRlbS1jYXQtbGFiZWwtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGNhdGVnb3J5RWxlbWVudCA9IERPTS5hcHBlbmQobGFiZWxDYXRlZ29yeUNvbnRhaW5lciwgJCgnc3Bhbi5zZXR0aW5nLWl0ZW0tY2F0ZWdvcnknKSk7XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZChsYWJlbENhdGVnb3J5Q29udGFpbmVyLCAkKCdzcGFuLnNldHRpbmctaXRlbS1sYWJlbCcpKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0b0Rpc3Bvc2UuYWRkKG5ldyBTaW1wbGVJY29uTGFiZWwobGFiZWxFbGVtZW50Q29udGFpbmVyKSk7XG5cdFx0Y29uc3QgaW5kaWNhdG9yc0xhYmVsID0gdG9EaXNwb3NlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc1RyZWVJbmRpY2F0b3JzTGFiZWwsIHRpdGxlRWxlbWVudCkpO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb25FbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRJbmRpY2F0b3JFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWl0ZW0tbW9kaWZpZWQtaW5kaWNhdG9yJykpO1xuXHRcdHRvRGlzcG9zZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKG1vZGlmaWVkSW5kaWNhdG9yRWxlbWVudCwge1xuXHRcdFx0Y29udGVudDogbG9jYWxpemUoJ21vZGlmaWVkJywgXCJUaGUgc2V0dGluZyBoYXMgYmVlbiBjb25maWd1cmVkIGluIHRoZSBjdXJyZW50IHNjb3BlLlwiKVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZhbHVlRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy1pdGVtLXZhbHVlJykpO1xuXHRcdGNvbnN0IGNvbnRyb2xFbGVtZW50ID0gRE9NLmFwcGVuZCh2YWx1ZUVsZW1lbnQsICQoJ2Rpdi5zZXR0aW5nLWl0ZW0tY29udHJvbCcpKTtcblxuXHRcdGNvbnN0IGRlcHJlY2F0aW9uV2FybmluZ0VsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctaXRlbS1kZXByZWNhdGlvbi1tZXNzYWdlJykpO1xuXG5cdFx0Y29uc3QgdG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy10b29sYmFyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCB0b29sYmFyID0gdG9EaXNwb3NlLmFkZCh0aGlzLnJlbmRlclNldHRpbmdUb29sYmFyKHRvb2xiYXJDb250YWluZXIpKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0l0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdHRvRGlzcG9zZSxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlczogdG9EaXNwb3NlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpLFxuXG5cdFx0XHRjb250YWluZXJFbGVtZW50OiBjb250YWluZXIsXG5cdFx0XHRjYXRlZ29yeUVsZW1lbnQsXG5cdFx0XHRsYWJlbEVsZW1lbnQsXG5cdFx0XHRkZXNjcmlwdGlvbkVsZW1lbnQsXG5cdFx0XHRjb250cm9sRWxlbWVudCxcblx0XHRcdGRlcHJlY2F0aW9uV2FybmluZ0VsZW1lbnQsXG5cdFx0XHRpbmRpY2F0b3JzTGFiZWwsXG5cdFx0XHR0b29sYmFyXG5cdFx0fTtcblxuXHRcdC8vIFByZXZlbnQgY2xpY2tzIGZyb20gYmVpbmcgaGFuZGxlZCBieSBsaXN0XG5cdFx0dG9EaXNwb3NlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRyb2xFbGVtZW50LCBET00uRXZlbnRUeXBlLk1PVVNFX0RPV04sIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXG5cdFx0dG9EaXNwb3NlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgZSA9PiBjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW91c2VvdmVyJykpKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGl0bGVFbGVtZW50LCBET00uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCBlID0+IGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdtb3VzZW92ZXInKSkpO1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFkZFNldHRpbmdFbGVtZW50Rm9jdXNIYW5kbGVyKHRlbXBsYXRlOiBJU2V0dGluZ0l0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IERPTS50cmFja0ZvY3VzKHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQpO1xuXHRcdHRlbXBsYXRlLnRvRGlzcG9zZS5hZGQoZm9jdXNUcmFja2VyKTtcblx0XHR0ZW1wbGF0ZS50b0Rpc3Bvc2UuYWRkKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0aWYgKHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb2N1c2VkJykpIHtcblx0XHRcdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1c2VkJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGUudG9EaXNwb3NlLmFkZChmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZvY3VzZWQnKTtcblxuXHRcdFx0aWYgKHRlbXBsYXRlLmNvbnRleHQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRGb2N1c1NldHRpbmcuZmlyZSh0ZW1wbGF0ZS5jb250ZXh0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyU2V0dGluZ1Rvb2xiYXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFRvb2xCYXIge1xuXHRcdGNvbnN0IHRvZ2dsZU1lbnVUaXRsZSA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoXG5cdFx0XHRsb2NhbGl6ZSgnc2V0dGluZ3NDb250ZXh0TWVudVRpdGxlJywgXCJNb3JlIEFjdGlvbnMuLi4gXCIpLFxuXHRcdFx0U0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU0hPV19DT05URVhUX01FTlUpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IG5ldyBUb29sQmFyKGNvbnRhaW5lciwgdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHR0b2dnbGVNZW51VGl0bGUsXG5cdFx0XHRyZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50OiAhaXNJT1MsXG5cdFx0XHRtb3JlSWNvbjogc2V0dGluZ3NNb3JlQWN0aW9uSWNvblxuXHRcdH0pO1xuXHRcdHJldHVybiB0b29sYmFyO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclNldHRpbmdFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSVNldHRpbmdJdGVtVGVtcGxhdGUgfCBJU2V0dGluZ0Jvb2xJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXG5cdFx0Ly8gVGhlIGVsZW1lbnQgbXVzdCBpbnNwZWN0IGl0c2VsZiB0byBnZXQgaW5mb3JtYXRpb24gZm9yXG5cdFx0Ly8gdGhlIG1vZGlmaWVkIGluZGljYXRvciBhbmQgdGhlIG92ZXJyaWRkZW4gU2V0dGluZ3MgaW5kaWNhdG9ycy5cblx0XHRlbGVtZW50Lmluc3BlY3RTZWxmKCk7XG5cblx0XHR0ZW1wbGF0ZS5jb250ZXh0ID0gZWxlbWVudDtcblx0XHR0ZW1wbGF0ZS50b29sYmFyLmNvbnRleHQgPSBlbGVtZW50O1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmRpc3Bvc2FibGVBY3Rpb25GYWN0b3J5KGVsZW1lbnQuc2V0dGluZywgZWxlbWVudC5zZXR0aW5nc1RhcmdldCk7XG5cdFx0YWN0aW9ucy5mb3JFYWNoKGEgPT4gaXNEaXNwb3NhYmxlKGEpICYmIHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYSkpO1xuXHRcdHRlbXBsYXRlLnRvb2xiYXIuc2V0QWN0aW9ucyhbXSwgWy4uLnRoaXMuc2V0dGluZ0FjdGlvbnMsIC4uLmFjdGlvbnNdKTtcblxuXHRcdGNvbnN0IHNldHRpbmcgPSBlbGVtZW50LnNldHRpbmc7XG5cblx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2lzLWNvbmZpZ3VyZWQnLCBlbGVtZW50LmlzQ29uZmlndXJlZCk7XG5cdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5zZXRBdHRyaWJ1dGUoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuU0VUVElOR19LRVlfQVRUUiwgZWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5zZXRBdHRyaWJ1dGUoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuU0VUVElOR19JRF9BVFRSLCBlbGVtZW50LmlkKTtcblxuXHRcdGNvbnN0IHRpdGxlVG9vbHRpcCA9IHNldHRpbmcua2V5ICsgKGVsZW1lbnQuaXNDb25maWd1cmVkID8gJyAtIE1vZGlmaWVkJyA6ICcnKTtcblx0XHR0ZW1wbGF0ZS5jYXRlZ29yeUVsZW1lbnQudGV4dENvbnRlbnQgPSBlbGVtZW50LmRpc3BsYXlDYXRlZ29yeSA/IChlbGVtZW50LmRpc3BsYXlDYXRlZ29yeSArICc6ICcpIDogJyc7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGVtcGxhdGUuY2F0ZWdvcnlFbGVtZW50LCB7IGNvbnRlbnQ6IHRpdGxlVG9vbHRpcCB9KSk7XG5cblx0XHR0ZW1wbGF0ZS5sYWJlbEVsZW1lbnQudGV4dCA9IGVsZW1lbnQuZGlzcGxheUxhYmVsO1xuXHRcdHRlbXBsYXRlLmxhYmVsRWxlbWVudC50aXRsZSA9IHRpdGxlVG9vbHRpcDtcblxuXHRcdHRlbXBsYXRlLmRlc2NyaXB0aW9uRWxlbWVudC5pbm5lclRleHQgPSAnJztcblx0XHRpZiAoZWxlbWVudC5zZXR0aW5nLmRlc2NyaXB0aW9uSXNNYXJrZG93bikge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWREZXNjcmlwdGlvbiA9IHRoaXMucmVuZGVyU2V0dGluZ01hcmtkb3duKGVsZW1lbnQsIHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQsIGVsZW1lbnQuZGVzY3JpcHRpb24sIHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbkVsZW1lbnQuYXBwZW5kQ2hpbGQocmVuZGVyZWREZXNjcmlwdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLmRlc2NyaXB0aW9uRWxlbWVudC5pbm5lclRleHQgPSBlbGVtZW50LmRlc2NyaXB0aW9uO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLmluZGljYXRvcnNMYWJlbC51cGRhdGVTY29wZU92ZXJyaWRlcyhlbGVtZW50LCB0aGlzLl9vbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50LCB0aGlzLl9vbkFwcGx5RmlsdGVyKTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRlbXBsYXRlLmluZGljYXRvcnNMYWJlbC51cGRhdGVTY29wZU92ZXJyaWRlcyhlbGVtZW50LCB0aGlzLl9vbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50LCB0aGlzLl9vbkFwcGx5RmlsdGVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBvbkNoYW5nZSA9ICh2YWx1ZTogdW5rbm93bikgPT4gdGhpcy5fb25EaWRDaGFuZ2VTZXR0aW5nLmZpcmUoe1xuXHRcdFx0a2V5OiBlbGVtZW50LnNldHRpbmcua2V5LFxuXHRcdFx0dmFsdWUsXG5cdFx0XHR0eXBlOiB0ZW1wbGF0ZS5jb250ZXh0IS52YWx1ZVR5cGUsXG5cdFx0XHRtYW51YWxSZXNldDogZmFsc2UsXG5cdFx0XHRzY29wZTogZWxlbWVudC5zZXR0aW5nLnNjb3BlXG5cdFx0fSk7XG5cdFx0Y29uc3QgZGVwcmVjYXRpb25UZXh0ID0gZWxlbWVudC5zZXR0aW5nLmRlcHJlY2F0aW9uTWVzc2FnZSB8fCAnJztcblx0XHRpZiAoZGVwcmVjYXRpb25UZXh0ICYmIGVsZW1lbnQuc2V0dGluZy5kZXByZWNhdGlvbk1lc3NhZ2VJc01hcmtkb3duKSB7XG5cdFx0XHR0ZW1wbGF0ZS5kZXByZWNhdGlvbldhcm5pbmdFbGVtZW50LmlubmVyVGV4dCA9ICcnO1xuXHRcdFx0dGVtcGxhdGUuZGVwcmVjYXRpb25XYXJuaW5nRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnJlbmRlclNldHRpbmdNYXJrZG93bihlbGVtZW50LCB0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LCBlbGVtZW50LnNldHRpbmcuZGVwcmVjYXRpb25NZXNzYWdlISwgdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLmRlcHJlY2F0aW9uV2FybmluZ0VsZW1lbnQuaW5uZXJUZXh0ID0gZGVwcmVjYXRpb25UZXh0O1xuXHRcdH1cblx0XHR0ZW1wbGF0ZS5kZXByZWNhdGlvbldhcm5pbmdFbGVtZW50LnByZXBlbmQoJCgnLmNvZGljb24uY29kaWNvbi1lcnJvcicpKTtcblx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2lzLWRlcHJlY2F0ZWQnLCAhIWRlcHJlY2F0aW9uVGV4dCk7XG5cblx0XHR0aGlzLnJlbmRlclZhbHVlKGVsZW1lbnQsIDxJU2V0dGluZ0l0ZW1UZW1wbGF0ZT50ZW1wbGF0ZSwgb25DaGFuZ2UpO1xuXG5cdFx0dGVtcGxhdGUuaW5kaWNhdG9yc0xhYmVsLnVwZGF0ZVdvcmtzcGFjZVRydXN0KGVsZW1lbnQpO1xuXHRcdHRlbXBsYXRlLmluZGljYXRvcnNMYWJlbC51cGRhdGVTeW5jSWdub3JlZChlbGVtZW50LCB0aGlzLmlnbm9yZWRTZXR0aW5ncyk7XG5cdFx0dGVtcGxhdGUuaW5kaWNhdG9yc0xhYmVsLnVwZGF0ZURlZmF1bHRPdmVycmlkZUluZGljYXRvcihlbGVtZW50KTtcblx0XHR0ZW1wbGF0ZS5pbmRpY2F0b3JzTGFiZWwudXBkYXRlUHJldmlld0luZGljYXRvcihlbGVtZW50KTtcblx0XHR0ZW1wbGF0ZS5pbmRpY2F0b3JzTGFiZWwudXBkYXRlQWR2YW5jZWRJbmRpY2F0b3IoZWxlbWVudCk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlSWdub3JlZFNldHRpbmdzKCgpID0+IHtcblx0XHRcdHRlbXBsYXRlLmluZGljYXRvcnNMYWJlbC51cGRhdGVTeW5jSWdub3JlZChlbGVtZW50LCB0aGlzLmlnbm9yZWRTZXR0aW5ncyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVTZXR0aW5nVGFiYmFibGUoZWxlbWVudCwgdGVtcGxhdGUpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZWxlbWVudC5vbkRpZENoYW5nZVRhYmJhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlU2V0dGluZ1RhYmJhYmxlKGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNldHRpbmdUYWJiYWJsZShlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nSXRlbVRlbXBsYXRlIHwgSVNldHRpbmdCb29sSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0aWYgKGVsZW1lbnQudGFiYmFibGUpIHtcblx0XHRcdGFkZENoaWxkcmVuVG9UYWJPcmRlcih0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVtb3ZlQ2hpbGRyZW5Gcm9tVGFiT3JkZXIodGVtcGxhdGUuY29udGFpbmVyRWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZXR0aW5nTWFya2Rvd24oZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHtcblx0XHQvLyBSZXdyaXRlIGAjZWRpdG9yLmZvbnRTaXplI2AgdG8gbGluayBmb3JtYXRcblx0XHR0ZXh0ID0gZml4U2V0dGluZ0xpbmtzKHRleHQpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoeyB2YWx1ZTogdGV4dCwgaXNUcnVzdGVkOiB0cnVlIH0sIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IChjb250ZW50OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKGNvbnRlbnQuc3RhcnRzV2l0aCgnIycpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZTogSVNldHRpbmdMaW5rQ2xpY2tFdmVudCA9IHtcblx0XHRcdFx0XHRcdHNvdXJjZTogZWxlbWVudCxcblx0XHRcdFx0XHRcdHRhcmdldEtleTogY29udGVudC5zdWJzdHJpbmcoMSlcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2tTZXR0aW5nTGluay5maXJlKGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbihjb250ZW50LCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmNSZW5kZXJDYWxsYmFjazogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBoZWlnaHQgPSBjb250YWluZXIuY2xpZW50SGVpZ2h0O1xuXHRcdFx0XHRpZiAoaGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXR0aW5nSGVpZ2h0LmZpcmUoeyBlbGVtZW50LCBoZWlnaHQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0cmVuZGVyZWRNYXJrZG93bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaXRlbS1tYXJrZG93bicpO1xuXHRcdGNsZWFuUmVuZGVyZWRNYXJrZG93bihyZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQpO1xuXHRcdHJldHVybiByZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IHVua25vd24pID0+IHZvaWQpOiB2b2lkO1xuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZTogSURpc3Bvc2FibGVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLnRvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPFNldHRpbmdzVHJlZUVsZW1lbnQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElEaXNwb3NhYmxlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHQodGVtcGxhdGUgYXMgSVNldHRpbmdJdGVtVGVtcGxhdGUpLmVsZW1lbnREaXNwb3NhYmxlcz8uY2xlYXIoKTtcblx0fVxufVxuXG5jbGFzcyBTZXR0aW5nR3JvdXBSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50LCBuZXZlciwgSUdyb3VwVGl0bGVUZW1wbGF0ZT4ge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfRUxFTUVOVF9URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUdyb3VwVGl0bGVUZW1wbGF0ZSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2dyb3VwLXRpdGxlJyk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSUdyb3VwVGl0bGVUZW1wbGF0ZSA9IHtcblx0XHRcdHBhcmVudDogY29udGFpbmVyLFxuXHRcdFx0dG9EaXNwb3NlOiBuZXcgRGlzcG9zYWJsZVN0b3JlKClcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50LCBuZXZlcj4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUdyb3VwVGl0bGVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5wYXJlbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZURhdGEucGFyZW50LCAkKCdkaXYuc2V0dGluZ3MtZ3JvdXAtdGl0bGUtbGFiZWwuc2V0dGluZ3Mtcm93LWlubmVyLWNvbnRhaW5lcicpKTtcblx0XHRsYWJlbEVsZW1lbnQuY2xhc3NMaXN0LmFkZChgc2V0dGluZ3MtZ3JvdXAtbGV2ZWwtJHtlbGVtZW50LmVsZW1lbnQubGV2ZWx9YCk7XG5cdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gZWxlbWVudC5lbGVtZW50LmxhYmVsO1xuXG5cdFx0aWYgKGVsZW1lbnQuZWxlbWVudC5pc0ZpcnN0R3JvdXApIHtcblx0XHRcdGxhYmVsRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5ncy1ncm91cC1maXJzdCcpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElHcm91cFRpdGxlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ05ld0V4dGVuc2lvbnNSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ05ld0V4dGVuc2lvbnNUZW1wbGF0ZT4ge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfTkVXX0VYVEVOU0lPTlNfVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2V0dGluZ05ld0V4dGVuc2lvbnNUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaXRlbS1uZXctZXh0ZW5zaW9ucycpO1xuXG5cdFx0Y29uc3QgYnV0dG9uID0gbmV3IEJ1dHRvbihjb250YWluZXIsIHsgdGl0bGU6IHRydWUsIC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSk7XG5cdFx0dG9EaXNwb3NlLmFkZChidXR0b24pO1xuXHRcdHRvRGlzcG9zZS5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0aWYgKHRlbXBsYXRlLmNvbnRleHQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93RXh0ZW5zaW9uc1dpdGhJZHMnLCB0ZW1wbGF0ZS5jb250ZXh0LmV4dGVuc2lvbklkcyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCduZXdFeHRlbnNpb25zQnV0dG9uTGFiZWwnLCBcIlNob3cgbWF0Y2hpbmcgZXh0ZW5zaW9uc1wiKTtcblx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5ncy1uZXctZXh0ZW5zaW9ucy1idXR0b24nKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ05ld0V4dGVuc2lvbnNUZW1wbGF0ZSA9IHtcblx0XHRcdGJ1dHRvbixcblx0XHRcdHRvRGlzcG9zZVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVOZXdFeHRlbnNpb25zRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nTmV3RXh0ZW5zaW9uc1RlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRleHQgPSBlbGVtZW50LmVsZW1lbnQ7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IElEaXNwb3NhYmxlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS50b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nQ29tcGxleFJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdDb21wbGV4SXRlbVRlbXBsYXRlPiB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVESVRfSU5fSlNPTl9MQUJFTCA9IGxvY2FsaXplKCdlZGl0SW5TZXR0aW5nc0pzb24nLCBcIkVkaXQgaW4gc2V0dGluZ3MuanNvblwiKTtcblxuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfQ09NUExFWF9URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdDb21wbGV4SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSB0aGlzLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIGNvbnRhaW5lciwgJ2NvbXBsZXgnKTtcblxuXHRcdGNvbnN0IG9wZW5TZXR0aW5nc0J1dHRvbiA9IERPTS5hcHBlbmQoY29tbW9uLmNvbnRyb2xFbGVtZW50LCAkKCdhLmVkaXQtaW4tc2V0dGluZ3MtYnV0dG9uJykpO1xuXHRcdG9wZW5TZXR0aW5nc0J1dHRvbi5jbGFzc0xpc3QuYWRkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfQ0xBU1MpO1xuXHRcdG9wZW5TZXR0aW5nc0J1dHRvbi5yb2xlID0gJ2J1dHRvbic7XG5cblx0XHRjb25zdCB2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudCA9ICQoJy5zZXR0aW5nLWl0ZW0tdmFsaWRhdGlvbi1tZXNzYWdlJyk7XG5cdFx0Y29tbW9uLmNvbnRhaW5lckVsZW1lbnQuYXBwZW5kQ2hpbGQodmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElTZXR0aW5nQ29tcGxleEl0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdC4uLmNvbW1vbixcblx0XHRcdGJ1dHRvbjogb3BlblNldHRpbmdzQnV0dG9uLFxuXHRcdFx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnRcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nQ29tcGxleEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nQ29tcGxleEl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgcGxhaW5LZXkgPSBnZXRMYW5ndWFnZVRhZ1NldHRpbmdQbGFpbktleShkYXRhRWxlbWVudC5zZXR0aW5nLmtleSk7XG5cdFx0Y29uc3QgZWRpdExhbmd1YWdlU2V0dGluZ0xhYmVsID0gbG9jYWxpemUoJ2VkaXRMYW5ndWFnZVNldHRpbmdMYWJlbCcsIFwiRWRpdCBzZXR0aW5ncyBmb3IgezB9XCIsIHBsYWluS2V5KTtcblx0XHRjb25zdCBpc0xhbmd1YWdlVGFnU2V0dGluZyA9IGRhdGFFbGVtZW50LnNldHRpbmcuaXNMYW5ndWFnZVRhZ1NldHRpbmc7XG5cdFx0dGVtcGxhdGUuYnV0dG9uLnRleHRDb250ZW50ID0gaXNMYW5ndWFnZVRhZ1NldHRpbmdcblx0XHRcdD8gZWRpdExhbmd1YWdlU2V0dGluZ0xhYmVsXG5cdFx0XHQ6IFNldHRpbmdDb21wbGV4UmVuZGVyZXIuRURJVF9JTl9KU09OX0xBQkVMO1xuXG5cdFx0Y29uc3Qgb25DbGlja09yS2V5ZG93biA9IChlOiBVSUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoaXNMYW5ndWFnZVRhZ1NldHRpbmcpIHtcblx0XHRcdFx0dGhpcy5fb25BcHBseUZpbHRlci5maXJlKGBAJHtMQU5HVUFHRV9TRVRUSU5HX1RBR30ke3BsYWluS2V5LnJlcGxhY2VBbGwoJyAnLCAnJyl9YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vbkRpZE9wZW5TZXR0aW5ncy5maXJlKGRhdGFFbGVtZW50LnNldHRpbmcua2V5KTtcblx0XHRcdH1cblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGUuYnV0dG9uLCBET00uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0b25DbGlja09yS2V5ZG93bihlKTtcblx0XHR9KSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlLmJ1dHRvbiwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldi5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXYuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdG9uQ2xpY2tPcktleWRvd24oZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZW5kZXJWYWxpZGF0aW9ucyhkYXRhRWxlbWVudCwgdGVtcGxhdGUpO1xuXG5cdFx0aWYgKGlzTGFuZ3VhZ2VUYWdTZXR0aW5nKSB7XG5cdFx0XHR0ZW1wbGF0ZS5idXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZWRpdExhbmd1YWdlU2V0dGluZ0xhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUuYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGAke1NldHRpbmdDb21wbGV4UmVuZGVyZXIuRURJVF9JTl9KU09OX0xBQkVMfTogJHtkYXRhRWxlbWVudC5zZXR0aW5nLmtleX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclZhbGlkYXRpb25zKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nQ29tcGxleEl0ZW1UZW1wbGF0ZSkge1xuXHRcdGNvbnN0IGVyck1zZyA9IGRhdGFFbGVtZW50LmlzQ29uZmlndXJlZCAmJiBnZXRJbnZhbGlkVHlwZUVycm9yKGRhdGFFbGVtZW50LnZhbHVlLCBkYXRhRWxlbWVudC5zZXR0aW5nLnR5cGUpO1xuXHRcdGlmIChlcnJNc2cpIHtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0dGVtcGxhdGUudmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQuaW5uZXJUZXh0ID0gZXJyTXNnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaW52YWxpZC1pbnB1dCcpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdDb21wbGV4T2JqZWN0UmVuZGVyZXIgZXh0ZW5kcyBTZXR0aW5nQ29tcGxleFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nQ29tcGxleE9iamVjdEl0ZW1UZW1wbGF0ZT4ge1xuXG5cdG92ZXJyaWRlIHRlbXBsYXRlSWQgPSBTRVRUSU5HU19DT01QTEVYX09CSkVDVF9URU1QTEFURV9JRDtcblxuXHRvdmVycmlkZSByZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdDb21wbGV4T2JqZWN0SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSB0aGlzLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIGNvbnRhaW5lciwgJ2xpc3QnKTtcblxuXHRcdGNvbnN0IG9iamVjdFNldHRpbmdXaWRnZXQgPSBjb21tb24udG9EaXNwb3NlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPYmplY3RTZXR0aW5nRHJvcGRvd25XaWRnZXQsIGNvbW1vbi5jb250cm9sRWxlbWVudCkpO1xuXHRcdG9iamVjdFNldHRpbmdXaWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfQ0xBU1MpO1xuXG5cdFx0Y29uc3Qgb3BlblNldHRpbmdzQnV0dG9uID0gRE9NLmFwcGVuZChET00uYXBwZW5kKGNvbW1vbi5jb250cm9sRWxlbWVudCwgJCgnLmNvbXBsZXgtb2JqZWN0LWVkaXQtaW4tc2V0dGluZ3MtYnV0dG9uLWNvbnRhaW5lcicpKSwgJCgnYS5jb21wbGV4LW9iamVjdC5lZGl0LWluLXNldHRpbmdzLWJ1dHRvbicpKTtcblx0XHRvcGVuU2V0dGluZ3NCdXR0b24uY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRvcGVuU2V0dGluZ3NCdXR0b24ucm9sZSA9ICdidXR0b24nO1xuXG5cdFx0Y29uc3QgdmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQgPSAkKCcuc2V0dGluZy1pdGVtLXZhbGlkYXRpb24tbWVzc2FnZScpO1xuXHRcdGNvbW1vbi5jb250YWluZXJFbGVtZW50LmFwcGVuZENoaWxkKHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50KTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0NvbXBsZXhPYmplY3RJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHQuLi5jb21tb24sXG5cdFx0XHRidXR0b246IG9wZW5TZXR0aW5nc0J1dHRvbixcblx0XHRcdHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50LFxuXHRcdFx0b2JqZWN0U2V0dGluZ1dpZGdldFxuXHRcdH07XG5cblx0XHR0aGlzLmFkZFNldHRpbmdFbGVtZW50Rm9jdXNIYW5kbGVyKHRlbXBsYXRlKTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJWYWx1ZShkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ0NvbXBsZXhPYmplY3RJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gZ2V0T2JqZWN0RGlzcGxheVZhbHVlKGRhdGFFbGVtZW50KTtcblx0XHR0ZW1wbGF0ZS5vYmplY3RTZXR0aW5nV2lkZ2V0LnNldFZhbHVlKGl0ZW1zLCB7XG5cdFx0XHRzZXR0aW5nS2V5OiBkYXRhRWxlbWVudC5zZXR0aW5nLmtleSxcblx0XHRcdHNob3dBZGRCdXR0b246IGZhbHNlLFxuXHRcdFx0aXNSZWFkT25seTogdHJ1ZSxcblx0XHR9KTtcblx0XHR0ZW1wbGF0ZS5idXR0b24ucGFyZW50RWxlbWVudD8uY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsIGRhdGFFbGVtZW50Lmhhc1BvbGljeVZhbHVlIHx8IGRhdGFFbGVtZW50LmlzQWdlbnRzV2luZG93UmVhZE9ubHkpO1xuXHRcdHN1cGVyLnJlbmRlclZhbHVlKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgb25DaGFuZ2UpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdBcnJheVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdMaXN0SXRlbVRlbXBsYXRlPiB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19BUlJBWV9URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdMaXN0SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSB0aGlzLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIGNvbnRhaW5lciwgJ2xpc3QnKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBkZXNjcmlwdGlvbkVsZW1lbnQgPSBjb21tb24uY29udGFpbmVyRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJykhO1xuXHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50ID0gJCgnLnNldHRpbmctaXRlbS12YWxpZGF0aW9uLW1lc3NhZ2UnKTtcblx0XHRkZXNjcmlwdGlvbkVsZW1lbnQuYWZ0ZXIodmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgbGlzdFdpZGdldCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpc3RTZXR0aW5nV2lkZ2V0LCBjb21tb24uY29udHJvbEVsZW1lbnQpO1xuXHRcdGxpc3RXaWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfQ0xBU1MpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKGxpc3RXaWRnZXQpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElTZXR0aW5nTGlzdEl0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdC4uLmNvbW1vbixcblx0XHRcdGxpc3RXaWRnZXQsXG5cdFx0XHR2YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudFxuXHRcdH07XG5cblx0XHR0aGlzLmFkZFNldHRpbmdFbGVtZW50Rm9jdXNIYW5kbGVyKHRlbXBsYXRlKTtcblxuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKFxuXHRcdFx0bGlzdFdpZGdldC5vbkRpZENoYW5nZUxpc3QoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5ld0xpc3QgPSB0aGlzLmNvbXB1dGVOZXdMaXN0KHRlbXBsYXRlLCBlKTtcblx0XHRcdFx0dGVtcGxhdGUub25DaGFuZ2U/LihuZXdMaXN0KTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZU5ld0xpc3QodGVtcGxhdGU6IElTZXR0aW5nTGlzdEl0ZW1UZW1wbGF0ZSwgZTogU2V0dGluZ0xpc3RFdmVudDxJTGlzdERhdGFJdGVtPik6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGVtcGxhdGUuY29udGV4dCkge1xuXHRcdFx0bGV0IG5ld1ZhbHVlOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodGVtcGxhdGUuY29udGV4dC5zY29wZVZhbHVlKSkge1xuXHRcdFx0XHRuZXdWYWx1ZSA9IFsuLi50ZW1wbGF0ZS5jb250ZXh0LnNjb3BlVmFsdWVdO1xuXHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHRlbXBsYXRlLmNvbnRleHQudmFsdWUpKSB7XG5cdFx0XHRcdG5ld1ZhbHVlID0gWy4uLnRlbXBsYXRlLmNvbnRleHQudmFsdWVdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS50eXBlID09PSAnbW92ZScpIHtcblx0XHRcdFx0Ly8gQSBkcmFnIGFuZCBkcm9wIG9jY3VycmVkXG5cdFx0XHRcdGNvbnN0IHNvdXJjZUluZGV4ID0gZS5zb3VyY2VJbmRleDtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0SW5kZXggPSBlLnRhcmdldEluZGV4O1xuXHRcdFx0XHRjb25zdCBzcGxpY2VkRWxlbSA9IG5ld1ZhbHVlLnNwbGljZShzb3VyY2VJbmRleCwgMSlbMF07XG5cdFx0XHRcdG5ld1ZhbHVlLnNwbGljZSh0YXJnZXRJbmRleCwgMCwgc3BsaWNlZEVsZW0pO1xuXHRcdFx0fSBlbHNlIGlmIChlLnR5cGUgPT09ICdyZW1vdmUnIHx8IGUudHlwZSA9PT0gJ3Jlc2V0Jykge1xuXHRcdFx0XHRuZXdWYWx1ZS5zcGxpY2UoZS50YXJnZXRJbmRleCwgMSk7XG5cdFx0XHR9IGVsc2UgaWYgKGUudHlwZSA9PT0gJ2NoYW5nZScpIHtcblx0XHRcdFx0Y29uc3QgaXRlbVZhbHVlRGF0YSA9IGUubmV3SXRlbS52YWx1ZS5kYXRhLnRvU3RyaW5nKCk7XG5cblx0XHRcdFx0Ly8gVXBkYXRlIHZhbHVlXG5cdFx0XHRcdGlmIChlLnRhcmdldEluZGV4ID4gLTEpIHtcblx0XHRcdFx0XHRuZXdWYWx1ZVtlLnRhcmdldEluZGV4XSA9IGl0ZW1WYWx1ZURhdGE7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRm9yIHNvbWUgcmVhc29uLCB3ZSBhcmUgdXBkYXRpbmcgYW5kIGNhbm5vdCBmaW5kIG9yaWdpbmFsIHZhbHVlXG5cdFx0XHRcdC8vIEp1c3QgYXBwZW5kIHRoZSB2YWx1ZSBpbiB0aGlzIGNhc2Vcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bmV3VmFsdWUucHVzaChpdGVtVmFsdWVEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlLnR5cGUgPT09ICdhZGQnKSB7XG5cdFx0XHRcdG5ld1ZhbHVlLnB1c2goZS5uZXdJdGVtLnZhbHVlLmRhdGEudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChcblx0XHRcdFx0dGVtcGxhdGUuY29udGV4dC5kZWZhdWx0VmFsdWUgJiZcblx0XHRcdFx0QXJyYXkuaXNBcnJheSh0ZW1wbGF0ZS5jb250ZXh0LmRlZmF1bHRWYWx1ZSkgJiZcblx0XHRcdFx0dGVtcGxhdGUuY29udGV4dC5kZWZhdWx0VmFsdWUubGVuZ3RoID09PSBuZXdWYWx1ZS5sZW5ndGggJiZcblx0XHRcdFx0dGVtcGxhdGUuY29udGV4dC5kZWZhdWx0VmFsdWUuam9pbigpID09PSBuZXdWYWx1ZS5qb2luKClcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ld1ZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nTGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nTGlzdEl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nW10gfCBudW1iZXJbXSB8IHVuZGVmaW5lZCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gZ2V0TGlzdERpc3BsYXlWYWx1ZShkYXRhRWxlbWVudCk7XG5cdFx0Y29uc3Qga2V5U3VnZ2VzdGVyID0gZGF0YUVsZW1lbnQuc2V0dGluZy5lbnVtID8gY3JlYXRlQXJyYXlTdWdnZXN0ZXIoZGF0YUVsZW1lbnQpIDogdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlLmxpc3RXaWRnZXQuc2V0VmFsdWUodmFsdWUsIHtcblx0XHRcdHNob3dBZGRCdXR0b246IGdldFNob3dBZGRCdXR0b25MaXN0KGRhdGFFbGVtZW50LCB2YWx1ZSksXG5cdFx0XHRrZXlTdWdnZXN0ZXJcblx0XHR9KTtcblx0XHR0ZW1wbGF0ZS5jb250ZXh0ID0gZGF0YUVsZW1lbnQ7XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS5saXN0V2lkZ2V0LmNhbmNlbEVkaXQoKTtcblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSA9ICh2OiBzdHJpbmdbXSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKHYgJiYgIXJlbmRlckFycmF5VmFsaWRhdGlvbnMoZGF0YUVsZW1lbnQsIHRlbXBsYXRlLCB2LCBmYWxzZSkpIHtcblx0XHRcdFx0Y29uc3QgaXRlbVR5cGUgPSBkYXRhRWxlbWVudC5zZXR0aW5nLmFycmF5SXRlbVR5cGU7XG5cdFx0XHRcdGNvbnN0IGFyclRvU2F2ZSA9IGlzTm9uTnVsbGFibGVOdW1lcmljVHlwZShpdGVtVHlwZSkgPyB2Lm1hcChhID0+ICthKSA6IHY7XG5cdFx0XHRcdG9uQ2hhbmdlKGFyclRvU2F2ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTYXZlIHRoZSBzZXR0aW5nIHVucGFyc2VkIGFuZCBjb250YWluaW5nIHRoZSBlcnJvcnMuXG5cdFx0XHRcdC8vIHJlbmRlckFycmF5VmFsaWRhdGlvbnMgd2lsbCByZW5kZXIgcmVsZXZhbnQgZXJyb3IgbWVzc2FnZXMuXG5cdFx0XHRcdG9uQ2hhbmdlKHYpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZW5kZXJBcnJheVZhbGlkYXRpb25zKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgdmFsdWUubWFwKHYgPT4gdi52YWx1ZS5kYXRhLnRvU3RyaW5nKCkpLCB0cnVlKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFNldHRpbmdPYmplY3RSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlPiB7XG5cblx0cHJvdGVjdGVkIHJlbmRlclRlbXBsYXRlV2l0aFdpZGdldChjb21tb246IElTZXR0aW5nSXRlbVRlbXBsYXRlLCB3aWRnZXQ6IE9iamVjdFNldHRpbmdDaGVja2JveFdpZGdldCB8IE9iamVjdFNldHRpbmdEcm9wZG93bldpZGdldCk6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlIHtcblx0XHR3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfQ0xBU1MpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKHdpZGdldCk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBkZXNjcmlwdGlvbkVsZW1lbnQgPSBjb21tb24uY29udGFpbmVyRWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJykhO1xuXHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50ID0gJCgnLnNldHRpbmctaXRlbS12YWxpZGF0aW9uLW1lc3NhZ2UnKTtcblx0XHRkZXNjcmlwdGlvbkVsZW1lbnQuYWZ0ZXIodmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlID0ge1xuXHRcdFx0Li4uY29tbW9uLFxuXHRcdFx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnRcblx0XHR9O1xuXHRcdGlmICh3aWRnZXQgaW5zdGFuY2VvZiBPYmplY3RTZXR0aW5nQ2hlY2tib3hXaWRnZXQpIHtcblx0XHRcdHRlbXBsYXRlLm9iamVjdENoZWNrYm94V2lkZ2V0ID0gd2lkZ2V0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5vYmplY3REcm9wZG93bldpZGdldCA9IHdpZGdldDtcblx0XHR9XG5cblx0XHR0aGlzLmFkZFNldHRpbmdFbGVtZW50Rm9jdXNIYW5kbGVyKHRlbXBsYXRlKTtcblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyU2V0dGluZ0VsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ09iamVjdFJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nT2JqZWN0UmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdPYmplY3RJdGVtVGVtcGxhdGU+IHtcblx0b3ZlcnJpZGUgdGVtcGxhdGVJZCA9IFNFVFRJTkdTX09CSkVDVF9URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdPYmplY3RJdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGNvbW1vbiA9IHRoaXMucmVuZGVyQ29tbW9uVGVtcGxhdGUobnVsbCwgY29udGFpbmVyLCAnbGlzdCcpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE9iamVjdFNldHRpbmdEcm9wZG93bldpZGdldCwgY29tbW9uLmNvbnRyb2xFbGVtZW50KTtcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHRoaXMucmVuZGVyVGVtcGxhdGVXaXRoV2lkZ2V0KGNvbW1vbiwgd2lkZ2V0KTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZCh3aWRnZXQub25EaWRDaGFuZ2VMaXN0KGUgPT4ge1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZU9iamVjdCh0ZW1wbGF0ZSwgZSk7XG5cdFx0fSkpO1xuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VPYmplY3QodGVtcGxhdGU6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlLCBlOiBTZXR0aW5nTGlzdEV2ZW50PElPYmplY3REYXRhSXRlbT4pOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0ZW1wbGF0ZS5vYmplY3REcm9wZG93bldpZGdldCE7XG5cdFx0aWYgKHRlbXBsYXRlLmNvbnRleHQpIHtcblx0XHRcdGNvbnN0IHNldHRpbmdTdXBwb3J0c1JlbW92ZURlZmF1bHQgPSBvYmplY3RTZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0VmFsdWUodGVtcGxhdGUuY29udGV4dC5zZXR0aW5nLmtleSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlID09PSAnb2JqZWN0J1xuXHRcdFx0XHQ/IHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlID8/IHt9XG5cdFx0XHRcdDoge307XG5cblx0XHRcdGNvbnN0IHNjb3BlVmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gdHlwZW9mIHRlbXBsYXRlLmNvbnRleHQuc2NvcGVWYWx1ZSA9PT0gJ29iamVjdCdcblx0XHRcdFx0PyB0ZW1wbGF0ZS5jb250ZXh0LnNjb3BlVmFsdWUgPz8ge31cblx0XHRcdFx0OiB7fTtcblxuXHRcdFx0Y29uc3QgbmV3VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyAuLi50ZW1wbGF0ZS5jb250ZXh0LnNjb3BlVmFsdWUgfTsgLy8gSW5pdGlhbGl6ZSB3aXRoIHNjb3BlZCB2YWx1ZXMgYXMgcmVtb3ZlZCBkZWZhdWx0IHZhbHVlcyBhcmUgbm90IHJlbmRlcmVkXG5cdFx0XHRjb25zdCBuZXdJdGVtczogSU9iamVjdERhdGFJdGVtW10gPSBbXTtcblxuXHRcdFx0d2lkZ2V0Lml0ZW1zLmZvckVhY2goKGl0ZW0sIGlkeCkgPT4ge1xuXHRcdFx0XHQvLyBJdGVtIHdhcyB1cGRhdGVkXG5cdFx0XHRcdGlmICgoZS50eXBlID09PSAnY2hhbmdlJyB8fCBlLnR5cGUgPT09ICdtb3ZlJykgJiYgZS50YXJnZXRJbmRleCA9PT0gaWR4KSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlIGtleSBvZiB0aGUgZGVmYXVsdCB2YWx1ZSBpcyBjaGFuZ2VkLCByZW1vdmUgdGhlIGRlZmF1bHQgdmFsdWVcblx0XHRcdFx0XHRpZiAoZS5vcmlnaW5hbEl0ZW0ua2V5LmRhdGEgIT09IGUubmV3SXRlbS5rZXkuZGF0YSAmJiBzZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0ICYmIGUub3JpZ2luYWxJdGVtLmtleS5kYXRhIGluIGRlZmF1bHRWYWx1ZSkge1xuXHRcdFx0XHRcdFx0bmV3VmFsdWVbZS5vcmlnaW5hbEl0ZW0ua2V5LmRhdGFdID0gbnVsbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIG5ld1ZhbHVlW2Uub3JpZ2luYWxJdGVtLmtleS5kYXRhXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bmV3VmFsdWVbZS5uZXdJdGVtLmtleS5kYXRhXSA9IGUubmV3SXRlbS52YWx1ZS5kYXRhO1xuXHRcdFx0XHRcdG5ld0l0ZW1zLnB1c2goZS5uZXdJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBbGwgcmVtYWluaW5nIGl0ZW1zLCBidXQgc2tpcCB0aGUgb25lIHRoYXQgd2UganVzdCB1cGRhdGVkXG5cdFx0XHRcdGVsc2UgaWYgKChlLnR5cGUgIT09ICdjaGFuZ2UnICYmIGUudHlwZSAhPT0gJ21vdmUnKSB8fCBlLm5ld0l0ZW0ua2V5LmRhdGEgIT09IGl0ZW0ua2V5LmRhdGEpIHtcblx0XHRcdFx0XHRuZXdWYWx1ZVtpdGVtLmtleS5kYXRhXSA9IGl0ZW0udmFsdWUuZGF0YTtcblx0XHRcdFx0XHRuZXdJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSXRlbSB3YXMgZGVsZXRlZFxuXHRcdFx0aWYgKGUudHlwZSA9PT0gJ3JlbW92ZScgfHwgZS50eXBlID09PSAncmVzZXQnKSB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdEtleSA9IGUub3JpZ2luYWxJdGVtLmtleS5kYXRhO1xuXHRcdFx0XHRjb25zdCByZW1vdmluZ0RlZmF1bHRWYWx1ZSA9IGUudHlwZSA9PT0gJ3JlbW92ZScgJiYgc2V0dGluZ1N1cHBvcnRzUmVtb3ZlRGVmYXVsdCAmJiBkZWZhdWx0VmFsdWVbb2JqZWN0S2V5XSA9PT0gZS5vcmlnaW5hbEl0ZW0udmFsdWUuZGF0YTtcblx0XHRcdFx0aWYgKHJlbW92aW5nRGVmYXVsdFZhbHVlKSB7XG5cdFx0XHRcdFx0bmV3VmFsdWVbb2JqZWN0S2V5XSA9IG51bGw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVsZXRlIG5ld1ZhbHVlW29iamVjdEtleV07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpdGVtVG9EZWxldGUgPSBuZXdJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLmtleS5kYXRhID09PSBvYmplY3RLZXkpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0SXRlbVZhbHVlID0gZGVmYXVsdFZhbHVlW29iamVjdEtleV0gYXMgc3RyaW5nIHwgYm9vbGVhbjtcblxuXHRcdFx0XHQvLyBJdGVtIGRvZXMgbm90IGhhdmUgYSBkZWZhdWx0IG9yIGRlZmF1bHQgaXMgYmluZyByZW1vdmVkXG5cdFx0XHRcdGlmIChyZW1vdmluZ0RlZmF1bHRWYWx1ZSB8fCBpc1VuZGVmaW5lZE9yTnVsbChkZWZhdWx0VmFsdWVbb2JqZWN0S2V5XSkgJiYgaXRlbVRvRGVsZXRlID4gLTEpIHtcblx0XHRcdFx0XHRuZXdJdGVtcy5zcGxpY2UoaXRlbVRvRGVsZXRlLCAxKTtcblx0XHRcdFx0fSBlbHNlIGlmICghcmVtb3ZpbmdEZWZhdWx0VmFsdWUgJiYgaXRlbVRvRGVsZXRlID4gLTEpIHtcblx0XHRcdFx0XHRuZXdJdGVtc1tpdGVtVG9EZWxldGVdLnZhbHVlLmRhdGEgPSBkZWZhdWx0SXRlbVZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBOZXcgaXRlbSB3YXMgYWRkZWRcblx0XHRcdGVsc2UgaWYgKGUudHlwZSA9PT0gJ2FkZCcpIHtcblx0XHRcdFx0bmV3VmFsdWVbZS5uZXdJdGVtLmtleS5kYXRhXSA9IGUubmV3SXRlbS52YWx1ZS5kYXRhO1xuXHRcdFx0XHRuZXdJdGVtcy5wdXNoKGUubmV3SXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdE9iamVjdC5lbnRyaWVzKG5ld1ZhbHVlKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcblx0XHRcdFx0Ly8gdmFsdWUgZnJvbSB0aGUgc2NvcGUgaGFzIGNoYW5nZWQgYmFjayB0byB0aGUgZGVmYXVsdFxuXHRcdFx0XHRpZiAoc2NvcGVWYWx1ZVtrZXldICE9PSB2YWx1ZSAmJiBkZWZhdWx0VmFsdWVba2V5XSA9PT0gdmFsdWUgJiYgIShzZXR0aW5nU3VwcG9ydHNSZW1vdmVEZWZhdWx0ICYmIHZhbHVlID09PSBudWxsKSkge1xuXHRcdFx0XHRcdGRlbGV0ZSBuZXdWYWx1ZVtrZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbmV3T2JqZWN0ID0gT2JqZWN0LmtleXMobmV3VmFsdWUpLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IG5ld1ZhbHVlO1xuXHRcdFx0dGVtcGxhdGUub2JqZWN0RHJvcGRvd25XaWRnZXQhLnNldFZhbHVlKG5ld0l0ZW1zKTtcblx0XHRcdHRlbXBsYXRlLm9uQ2hhbmdlPy4obmV3T2JqZWN0KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdPYmplY3RJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXMgPSBnZXRPYmplY3REaXNwbGF5VmFsdWUoZGF0YUVsZW1lbnQpO1xuXHRcdGNvbnN0IHsga2V5LCBvYmplY3RQcm9wZXJ0aWVzLCBvYmplY3RQYXR0ZXJuUHJvcGVydGllcywgb2JqZWN0QWRkaXRpb25hbFByb3BlcnRpZXMsIHByb3BlcnR5TmFtZXMgfSA9IGRhdGFFbGVtZW50LnNldHRpbmc7XG5cblx0XHR0ZW1wbGF0ZS5vYmplY3REcm9wZG93bldpZGdldCEuc2V0VmFsdWUoaXRlbXMsIHtcblx0XHRcdHNldHRpbmdLZXk6IGtleSxcblx0XHRcdHNob3dBZGRCdXR0b246IG9iamVjdEFkZGl0aW9uYWxQcm9wZXJ0aWVzID09PSBmYWxzZVxuXHRcdFx0XHQ/IChcblx0XHRcdFx0XHQhYXJlQWxsUHJvcGVydGllc0RlZmluZWQoT2JqZWN0LmtleXMob2JqZWN0UHJvcGVydGllcyA/PyB7fSksIGl0ZW1zKSB8fFxuXHRcdFx0XHRcdGlzRGVmaW5lZChvYmplY3RQYXR0ZXJuUHJvcGVydGllcylcblx0XHRcdFx0KVxuXHRcdFx0XHQ6IHRydWUsXG5cdFx0XHRrZXlTdWdnZXN0ZXI6IGNyZWF0ZU9iamVjdEtleVN1Z2dlc3RlcihkYXRhRWxlbWVudCksXG5cdFx0XHR2YWx1ZVN1Z2dlc3RlcjogY3JlYXRlT2JqZWN0VmFsdWVTdWdnZXN0ZXIoZGF0YUVsZW1lbnQpLFxuXHRcdFx0cHJvcGVydHlOYW1lc1xuXHRcdH0pO1xuXG5cdFx0dGVtcGxhdGUuY29udGV4dCA9IGRhdGFFbGVtZW50O1xuXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGUub2JqZWN0RHJvcGRvd25XaWRnZXQhLmNhbmNlbEVkaXQoKTtcblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSA9ICh2OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKHYgJiYgIXJlbmRlckFycmF5VmFsaWRhdGlvbnMoZGF0YUVsZW1lbnQsIHRlbXBsYXRlLCB2LCBmYWxzZSkpIHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkUmVjb3JkID0gcGFyc2VOdW1lcmljT2JqZWN0VmFsdWVzKGRhdGFFbGVtZW50LCB2KTtcblx0XHRcdFx0b25DaGFuZ2UocGFyc2VkUmVjb3JkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFNhdmUgdGhlIHNldHRpbmcgdW5wYXJzZWQgYW5kIGNvbnRhaW5pbmcgdGhlIGVycm9ycy5cblx0XHRcdFx0Ly8gcmVuZGVyQXJyYXlWYWxpZGF0aW9ucyB3aWxsIHJlbmRlciByZWxldmFudCBlcnJvciBtZXNzYWdlcy5cblx0XHRcdFx0b25DaGFuZ2Uodik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZW5kZXJBcnJheVZhbGlkYXRpb25zKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgZGF0YUVsZW1lbnQudmFsdWUsIHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdCb29sT2JqZWN0UmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdPYmplY3RSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ09iamVjdEl0ZW1UZW1wbGF0ZT4ge1xuXHRvdmVycmlkZSB0ZW1wbGF0ZUlkID0gU0VUVElOR1NfQk9PTF9PQkpFQ1RfVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSB0aGlzLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIGNvbnRhaW5lciwgJ2xpc3QnKTtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPYmplY3RTZXR0aW5nQ2hlY2tib3hXaWRnZXQsIGNvbW1vbi5jb250cm9sRWxlbWVudCk7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLnJlbmRlclRlbXBsYXRlV2l0aFdpZGdldChjb21tb24sIHdpZGdldCk7XG5cdFx0Y29tbW9uLnRvRGlzcG9zZS5hZGQod2lkZ2V0Lm9uRGlkQ2hhbmdlTGlzdChlID0+IHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VPYmplY3QodGVtcGxhdGUsIGUpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25EaWRDaGFuZ2VPYmplY3QodGVtcGxhdGU6IElTZXR0aW5nT2JqZWN0SXRlbVRlbXBsYXRlLCBlOiBTZXR0aW5nTGlzdEV2ZW50PElCb29sT2JqZWN0RGF0YUl0ZW0+KTogdm9pZCB7XG5cdFx0aWYgKHRlbXBsYXRlLmNvbnRleHQpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRlbXBsYXRlLm9iamVjdENoZWNrYm94V2lkZ2V0ITtcblx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB0eXBlb2YgdGVtcGxhdGUuY29udGV4dC5kZWZhdWx0VmFsdWUgPT09ICdvYmplY3QnXG5cdFx0XHRcdD8gdGVtcGxhdGUuY29udGV4dC5kZWZhdWx0VmFsdWUgPz8ge31cblx0XHRcdFx0OiB7fTtcblxuXHRcdFx0Y29uc3Qgc2NvcGVWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB0eXBlb2YgdGVtcGxhdGUuY29udGV4dC5zY29wZVZhbHVlID09PSAnb2JqZWN0J1xuXHRcdFx0XHQ/IHRlbXBsYXRlLmNvbnRleHQuc2NvcGVWYWx1ZSA/PyB7fVxuXHRcdFx0XHQ6IHt9O1xuXG5cdFx0XHRjb25zdCBuZXdWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLnRlbXBsYXRlLmNvbnRleHQuc2NvcGVWYWx1ZSB9OyAvLyBJbml0aWFsaXplIHdpdGggc2NvcGVkIHZhbHVlcyBhcyByZW1vdmVkIGRlZmF1bHQgdmFsdWVzIGFyZSBub3QgcmVuZGVyZWRcblx0XHRcdGNvbnN0IG5ld0l0ZW1zOiBJQm9vbE9iamVjdERhdGFJdGVtW10gPSBbXTtcblxuXHRcdFx0aWYgKGUudHlwZSAhPT0gJ2NoYW5nZScpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdVbmV4cGVjdGVkIGV2ZW50IHR5cGUnLCBlLnR5cGUsICdmb3IgYm9vbCBvYmplY3Qgc2V0dGluZycsIHRlbXBsYXRlLmNvbnRleHQuc2V0dGluZy5rZXkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHdpZGdldC5pdGVtcy5mb3JFYWNoKChpdGVtLCBpZHgpID0+IHtcblx0XHRcdFx0Ly8gSXRlbSB3YXMgdXBkYXRlZFxuXHRcdFx0XHRpZiAoZS50YXJnZXRJbmRleCA9PT0gaWR4KSB7XG5cdFx0XHRcdFx0bmV3VmFsdWVbZS5uZXdJdGVtLmtleS5kYXRhXSA9IGUubmV3SXRlbS52YWx1ZS5kYXRhO1xuXHRcdFx0XHRcdG5ld0l0ZW1zLnB1c2goZS5uZXdJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBbGwgcmVtYWluaW5nIGl0ZW1zLCBidXQgc2tpcCB0aGUgb25lIHRoYXQgd2UganVzdCB1cGRhdGVkXG5cdFx0XHRcdGVsc2UgaWYgKGUubmV3SXRlbS5rZXkuZGF0YSAhPT0gaXRlbS5rZXkuZGF0YSkge1xuXHRcdFx0XHRcdG5ld1ZhbHVlW2l0ZW0ua2V5LmRhdGFdID0gaXRlbS52YWx1ZS5kYXRhO1xuXHRcdFx0XHRcdG5ld0l0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRPYmplY3QuZW50cmllcyhuZXdWYWx1ZSkuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG5cdFx0XHRcdC8vIHZhbHVlIGZyb20gdGhlIHNjb3BlIGhhcyBjaGFuZ2VkIGJhY2sgdG8gdGhlIGRlZmF1bHRcblx0XHRcdFx0aWYgKHNjb3BlVmFsdWVba2V5XSAhPT0gdmFsdWUgJiYgZGVmYXVsdFZhbHVlW2tleV0gPT09IHZhbHVlKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIG5ld1ZhbHVlW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBuZXdPYmplY3QgPSBPYmplY3Qua2V5cyhuZXdWYWx1ZSkubGVuZ3RoID09PSAwID8gdW5kZWZpbmVkIDogbmV3VmFsdWU7XG5cdFx0XHR0ZW1wbGF0ZS5vYmplY3RDaGVja2JveFdpZGdldCEuc2V0VmFsdWUobmV3SXRlbXMpO1xuXHRcdFx0dGVtcGxhdGUub25DaGFuZ2U/LihuZXdPYmplY3QpO1xuXG5cdFx0XHQvLyBGb2N1cyB0aGlzIHNldHRpbmcgZXhwbGljaXRseSwgaW4gY2FzZSB3ZSB3ZXJlIHByZXZpb3VzbHlcblx0XHRcdC8vIGZvY3VzZWQgb24gYW5vdGhlciBzZXR0aW5nIGFuZCBjbGlja2VkIGEgY2hlY2tib3gvdmFsdWUgY29udGFpbmVyXG5cdFx0XHQvLyBmb3IgdGhpcyBzZXR0aW5nLlxuXHRcdFx0dGhpcy5fb25EaWRGb2N1c1NldHRpbmcuZmlyZSh0ZW1wbGF0ZS5jb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdPYmplY3RJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAodmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXMgPSBnZXRCb29sT2JqZWN0RGlzcGxheVZhbHVlKGRhdGFFbGVtZW50KTtcblx0XHRjb25zdCB7IGtleSB9ID0gZGF0YUVsZW1lbnQuc2V0dGluZztcblxuXHRcdHRlbXBsYXRlLm9iamVjdENoZWNrYm94V2lkZ2V0IS5zZXRWYWx1ZShpdGVtcywge1xuXHRcdFx0c2V0dGluZ0tleToga2V5XG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZS5jb250ZXh0ID0gZGF0YUVsZW1lbnQ7XG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSAodjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdG9uQ2hhbmdlKHYpO1xuXHRcdH07XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgU2V0dGluZ0luY2x1ZGVFeGNsdWRlUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ0luY2x1ZGVFeGNsdWRlSXRlbVRlbXBsYXRlPiB7XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGlzRXhjbHVkZSgpOiBib29sZWFuO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2V0dGluZ0luY2x1ZGVFeGNsdWRlSXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSB0aGlzLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIGNvbnRhaW5lciwgJ2xpc3QnKTtcblxuXHRcdGNvbnN0IGluY2x1ZGVFeGNsdWRlV2lkZ2V0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UodGhpcy5pc0V4Y2x1ZGUoKSA/IEV4Y2x1ZGVTZXR0aW5nV2lkZ2V0IDogSW5jbHVkZVNldHRpbmdXaWRnZXQsIGNvbW1vbi5jb250cm9sRWxlbWVudCk7XG5cdFx0aW5jbHVkZUV4Y2x1ZGVXaWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfQ0xBU1MpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKGluY2x1ZGVFeGNsdWRlV2lkZ2V0KTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0luY2x1ZGVFeGNsdWRlSXRlbVRlbXBsYXRlID0ge1xuXHRcdFx0Li4uY29tbW9uLFxuXHRcdFx0aW5jbHVkZUV4Y2x1ZGVXaWRnZXRcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChpbmNsdWRlRXhjbHVkZVdpZGdldC5vbkRpZENoYW5nZUxpc3QoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlSW5jbHVkZUV4Y2x1ZGUodGVtcGxhdGUsIGUpKSk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlSW5jbHVkZUV4Y2x1ZGUodGVtcGxhdGU6IElTZXR0aW5nSW5jbHVkZUV4Y2x1ZGVJdGVtVGVtcGxhdGUsIGU6IFNldHRpbmdMaXN0RXZlbnQ8SUxpc3REYXRhSXRlbT4pOiB2b2lkIHtcblx0XHRpZiAodGVtcGxhdGUuY29udGV4dCkge1xuXHRcdFx0Y29uc3QgbmV3VmFsdWUgPSB7IC4uLnRlbXBsYXRlLmNvbnRleHQuc2NvcGVWYWx1ZSB9O1xuXG5cdFx0XHQvLyBmaXJzdCBkZWxldGUgdGhlIGV4aXN0aW5nIGVudHJ5LCBpZiBwcmVzZW50XG5cdFx0XHRpZiAoZS50eXBlICE9PSAnYWRkJykge1xuXHRcdFx0XHRpZiAoZS5vcmlnaW5hbEl0ZW0udmFsdWUuZGF0YS50b1N0cmluZygpIGluIHRlbXBsYXRlLmNvbnRleHQuZGVmYXVsdFZhbHVlKSB7XG5cdFx0XHRcdFx0Ly8gZGVsZXRlIGEgZGVmYXVsdCBieSBvdmVycmlkaW5nIGl0XG5cdFx0XHRcdFx0bmV3VmFsdWVbZS5vcmlnaW5hbEl0ZW0udmFsdWUuZGF0YS50b1N0cmluZygpXSA9IGZhbHNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlbGV0ZSBuZXdWYWx1ZVtlLm9yaWdpbmFsSXRlbS52YWx1ZS5kYXRhLnRvU3RyaW5nKCldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIHRoZW4gYWRkIHRoZSBuZXcgb3IgdXBkYXRlZCBlbnRyeSwgaWYgcHJlc2VudFxuXHRcdFx0aWYgKGUudHlwZSA9PT0gJ2NoYW5nZScgfHwgZS50eXBlID09PSAnYWRkJyB8fCBlLnR5cGUgPT09ICdtb3ZlJykge1xuXHRcdFx0XHRpZiAoZS5uZXdJdGVtLnZhbHVlLmRhdGEudG9TdHJpbmcoKSBpbiB0ZW1wbGF0ZS5jb250ZXh0LmRlZmF1bHRWYWx1ZSAmJiAhZS5uZXdJdGVtLnNpYmxpbmcpIHtcblx0XHRcdFx0XHQvLyBhZGQgYSBkZWZhdWx0IGJ5IGRlbGV0aW5nIGl0cyBvdmVycmlkZVxuXHRcdFx0XHRcdGRlbGV0ZSBuZXdWYWx1ZVtlLm5ld0l0ZW0udmFsdWUuZGF0YS50b1N0cmluZygpXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXdWYWx1ZVtlLm5ld0l0ZW0udmFsdWUuZGF0YS50b1N0cmluZygpXSA9IGUubmV3SXRlbS5zaWJsaW5nID8geyB3aGVuOiBlLm5ld0l0ZW0uc2libGluZyB9IDogdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBzb3J0S2V5czxUIGV4dGVuZHMgb2JqZWN0PihvYmo6IFQpIHtcblx0XHRcdFx0Y29uc3Qgc29ydGVkS2V5cyA9IE9iamVjdC5rZXlzKG9iailcblx0XHRcdFx0XHQuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSBhcyBBcnJheTxrZXlvZiBUPjtcblxuXHRcdFx0XHRjb25zdCByZXRWYWw6IFBhcnRpYWw8VD4gPSB7fTtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygc29ydGVkS2V5cykge1xuXHRcdFx0XHRcdHJldFZhbFtrZXldID0gb2JqW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJldFZhbDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXR0aW5nLmZpcmUoe1xuXHRcdFx0XHRrZXk6IHRlbXBsYXRlLmNvbnRleHQuc2V0dGluZy5rZXksXG5cdFx0XHRcdHZhbHVlOiBPYmplY3Qua2V5cyhuZXdWYWx1ZSkubGVuZ3RoID09PSAwID8gdW5kZWZpbmVkIDogc29ydEtleXMobmV3VmFsdWUpLFxuXHRcdFx0XHR0eXBlOiB0ZW1wbGF0ZS5jb250ZXh0LnZhbHVlVHlwZSxcblx0XHRcdFx0bWFudWFsUmVzZXQ6IGZhbHNlLFxuXHRcdFx0XHRzY29wZTogdGVtcGxhdGUuY29udGV4dC5zZXR0aW5nLnNjb3BlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nSW5jbHVkZUV4Y2x1ZGVJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJTZXR0aW5nRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJWYWx1ZShkYXRhRWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHRlbXBsYXRlOiBJU2V0dGluZ0luY2x1ZGVFeGNsdWRlSXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB2YWx1ZSA9IGdldEluY2x1ZGVFeGNsdWRlRGlzcGxheVZhbHVlKGRhdGFFbGVtZW50KTtcblx0XHR0ZW1wbGF0ZS5pbmNsdWRlRXhjbHVkZVdpZGdldC5zZXRWYWx1ZSh2YWx1ZSwgeyBpc1JlYWRPbmx5OiBkYXRhRWxlbWVudC5oYXNQb2xpY3lWYWx1ZSB8fCBkYXRhRWxlbWVudC5pc0FnZW50c1dpbmRvd1JlYWRPbmx5IH0pO1xuXHRcdHRlbXBsYXRlLmNvbnRleHQgPSBkYXRhRWxlbWVudDtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS5pbmNsdWRlRXhjbHVkZVdpZGdldC5jYW5jZWxFZGl0KCk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdFeGNsdWRlUmVuZGVyZXIgZXh0ZW5kcyBTZXR0aW5nSW5jbHVkZUV4Y2x1ZGVSZW5kZXJlciB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19FWENMVURFX1RFTVBMQVRFX0lEO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc0V4Y2x1ZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ0luY2x1ZGVSZW5kZXJlciBleHRlbmRzIFNldHRpbmdJbmNsdWRlRXhjbHVkZVJlbmRlcmVyIHtcblx0dGVtcGxhdGVJZCA9IFNFVFRJTkdTX0lOQ0xVREVfVEVNUExBVEVfSUQ7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGlzRXhjbHVkZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuY29uc3Qgc2V0dGluZ3NJbnB1dEJveFN0eWxlcyA9IGdldElucHV0Qm94U3R5bGUoe1xuXHRpbnB1dEJhY2tncm91bmQ6IHNldHRpbmdzVGV4dElucHV0QmFja2dyb3VuZCxcblx0aW5wdXRGb3JlZ3JvdW5kOiBzZXR0aW5nc1RleHRJbnB1dEZvcmVncm91bmQsXG5cdGlucHV0Qm9yZGVyOiBzZXR0aW5nc1RleHRJbnB1dEJvcmRlclxufSk7XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0U2V0dGluZ1RleHRSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IE1VTFRJTElORV9NQVhfSEVJR0hUID0gMTUwO1xuXG5cdHJlbmRlclRlbXBsYXRlKF9jb250YWluZXI6IEhUTUxFbGVtZW50LCB1c2VNdWx0aWxpbmU/OiBib29sZWFuKTogSVNldHRpbmdUZXh0SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCBjb21tb24gPSB0aGlzLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIF9jb250YWluZXIsICd0ZXh0Jyk7XG5cdFx0Y29uc3QgdmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQgPSBET00uYXBwZW5kKGNvbW1vbi5jb250YWluZXJFbGVtZW50LCAkKCcuc2V0dGluZy1pdGVtLXZhbGlkYXRpb24tbWVzc2FnZScpKTtcblxuXHRcdGNvbnN0IGlucHV0Qm94T3B0aW9uczogSUlucHV0T3B0aW9ucyA9IHtcblx0XHRcdGZsZXhpYmxlSGVpZ2h0OiB1c2VNdWx0aWxpbmUsXG5cdFx0XHRmbGV4aWJsZVdpZHRoOiBmYWxzZSxcblx0XHRcdGZsZXhpYmxlTWF4SGVpZ2h0OiB0aGlzLk1VTFRJTElORV9NQVhfSEVJR0hULFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IHNldHRpbmdzSW5wdXRCb3hTdHlsZXNcblx0XHR9O1xuXHRcdGNvbnN0IGlucHV0Qm94ID0gbmV3IElucHV0Qm94KGNvbW1vbi5jb250cm9sRWxlbWVudCwgdGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLCBpbnB1dEJveE9wdGlvbnMpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKGlucHV0Qm94KTtcblx0XHRjb21tb24udG9EaXNwb3NlLmFkZChcblx0XHRcdGlucHV0Qm94Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHR0ZW1wbGF0ZS5vbkNoYW5nZT8uKGUpO1xuXHRcdFx0fSkpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKGlucHV0Qm94KTtcblx0XHRpbnB1dEJveC5pbnB1dEVsZW1lbnQuY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRpbnB1dEJveC5pbnB1dEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdC4uLmNvbW1vbixcblx0XHRcdGlucHV0Qm94LFxuXHRcdFx0dmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnRcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGUuaW5wdXRCb3gudmFsdWUgPSBkYXRhRWxlbWVudC52YWx1ZTtcblx0XHR0ZW1wbGF0ZS5pbnB1dEJveC5zZXRFbmFibGVkKCFkYXRhRWxlbWVudC5oYXNQb2xpY3lWYWx1ZSAmJiAhZGF0YUVsZW1lbnQuaXNBZ2VudHNXaW5kb3dSZWFkT25seSk7XG5cdFx0dGVtcGxhdGUuaW5wdXRCb3guc2V0QXJpYUxhYmVsKGRhdGFFbGVtZW50LnNldHRpbmcua2V5KTtcblx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSA9IHZhbHVlID0+IHtcblx0XHRcdGlmICghcmVuZGVyVmFsaWRhdGlvbnMoZGF0YUVsZW1lbnQsIHRlbXBsYXRlLCBmYWxzZSkpIHtcblx0XHRcdFx0b25DaGFuZ2UodmFsdWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZW5kZXJWYWxpZGF0aW9ucyhkYXRhRWxlbWVudCwgdGVtcGxhdGUsIHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdUZXh0UmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdUZXh0UmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdUZXh0SXRlbVRlbXBsYXRlPiB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19URVhUX1RFTVBMQVRFX0lEO1xuXG5cdG92ZXJyaWRlIHJlbmRlclRlbXBsYXRlKF9jb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdUZXh0SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHN1cGVyLnJlbmRlclRlbXBsYXRlKF9jb250YWluZXIsIGZhbHNlKTtcblxuXHRcdC8vIFRPRE9AOWF0ODogbGlzdFdpZGdldCBmaWx0ZXJzIG91dCBhbGwga2V5IGV2ZW50cyBmcm9tIGlucHV0IGJveGVzLCBzbyB3ZSBuZWVkIHRvIGNvbWUgdXAgd2l0aCBhIGJldHRlciB3YXlcblx0XHQvLyBEaXNhYmxlIEFycm93VXAgYW5kIEFycm93RG93biBiZWhhdmlvdXIgaW4gZmF2b3Igb2YgbGlzdCBuYXZpZ2F0aW9uXG5cdFx0dGVtcGxhdGUudG9EaXNwb3NlLmFkZChET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGUuaW5wdXRCb3guaW5wdXRFbGVtZW50LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpIHx8IGUuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdNdWx0aWxpbmVUZXh0UmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdUZXh0UmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdUZXh0SXRlbVRlbXBsYXRlPiB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19NVUxUSUxJTkVfVEVYVF9URU1QTEFURV9JRDtcblxuXHRvdmVycmlkZSByZW5kZXJUZW1wbGF0ZShfY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSB7XG5cdFx0cmV0dXJuIHN1cGVyLnJlbmRlclRlbXBsYXRlKF9jb250YWluZXIsIHRydWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nVGV4dEl0ZW1UZW1wbGF0ZSwgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3Qgb25DaGFuZ2VPdmVycmlkZSA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0XHQvLyBFbnN1cmUgdGhlIG1vZGVsIGlzIHVwIHRvIGRhdGUgc2luY2UgYSBkaWZmZXJlbnQgdmFsdWUgd2lsbCBiZSByZW5kZXJlZCBhcyBkaWZmZXJlbnQgaGVpZ2h0IHdoZW4gcHJvYmluZyB0aGUgaGVpZ2h0LlxuXHRcdFx0ZGF0YUVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcblx0XHRcdG9uQ2hhbmdlKHZhbHVlKTtcblx0XHR9O1xuXHRcdHN1cGVyLnJlbmRlclZhbHVlKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgb25DaGFuZ2VPdmVycmlkZSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChcblx0XHRcdHRlbXBsYXRlLmlucHV0Qm94Lm9uRGlkSGVpZ2h0Q2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBoZWlnaHQgPSB0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsaWVudEhlaWdodDtcblx0XHRcdFx0Ly8gRG9uJ3QgZmlyZSBldmVudCBpZiBoZWlnaHQgaXMgcmVwb3J0ZWQgYXMgMCxcblx0XHRcdFx0Ly8gd2hpY2ggc29tZXRpbWVzIGhhcHBlbnMgd2hlbiBjbGlja2luZyBvbnRvIGEgbmV3IHNldHRpbmcuXG5cdFx0XHRcdGlmIChoZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNldHRpbmdIZWlnaHQuZmlyZSh7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiBkYXRhRWxlbWVudCxcblx0XHRcdFx0XHRcdGhlaWdodDogdGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGllbnRIZWlnaHRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdHRlbXBsYXRlLmlucHV0Qm94LmxheW91dCgpO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdFbnVtUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFNldHRpbmdSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyLCBJU2V0dGluZ0VudW1JdGVtVGVtcGxhdGU+IHtcblx0dGVtcGxhdGVJZCA9IFNFVFRJTkdTX0VOVU1fVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nRW51bUl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gdGhpcy5yZW5kZXJDb21tb25UZW1wbGF0ZShudWxsLCBjb250YWluZXIsICdlbnVtJyk7XG5cblx0XHRjb25zdCBzdHlsZXMgPSBnZXRTZWxlY3RCb3hTdHlsZXMoe1xuXHRcdFx0c2VsZWN0QmFja2dyb3VuZDogc2V0dGluZ3NTZWxlY3RCYWNrZ3JvdW5kLFxuXHRcdFx0c2VsZWN0Rm9yZWdyb3VuZDogc2V0dGluZ3NTZWxlY3RGb3JlZ3JvdW5kLFxuXHRcdFx0c2VsZWN0Qm9yZGVyOiBzZXR0aW5nc1NlbGVjdEJvcmRlcixcblx0XHRcdHNlbGVjdExpc3RCb3JkZXI6IHNldHRpbmdzU2VsZWN0TGlzdEJvcmRlclxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VsZWN0Qm94ID0gbmV3IFNlbGVjdEJveChbXSwgMCwgdGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLCBzdHlsZXMsIHtcblx0XHRcdHVzZUN1c3RvbURyYXduOiAhaGFzTmF0aXZlQ29udGV4dE1lbnUodGhpcy5fY29uZmlnU2VydmljZSkgfHwgIShpc0lPUyAmJiBCcm93c2VyRmVhdHVyZXMucG9pbnRlckV2ZW50cylcblx0XHR9KTtcblxuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKHNlbGVjdEJveCk7XG5cdFx0c2VsZWN0Qm94LnJlbmRlcihjb21tb24uY29udHJvbEVsZW1lbnQpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHNlbGVjdEVsZW1lbnQgPSBjb21tb24uY29udHJvbEVsZW1lbnQucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XG5cdFx0aWYgKHNlbGVjdEVsZW1lbnQpIHtcblx0XHRcdHNlbGVjdEVsZW1lbnQuY2xhc3NMaXN0LmFkZChBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX0NMQVNTKTtcblx0XHRcdHNlbGVjdEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdH1cblxuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKFxuXHRcdFx0c2VsZWN0Qm94Lm9uRGlkU2VsZWN0KGUgPT4ge1xuXHRcdFx0XHR0ZW1wbGF0ZS5vbkNoYW5nZT8uKGUuaW5kZXgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0Y29uc3QgZW51bURlc2NyaXB0aW9uRWxlbWVudCA9IGNvbW1vbi5jb250YWluZXJFbGVtZW50Lmluc2VydEJlZm9yZSgkKCcuc2V0dGluZy1pdGVtLWVudW1EZXNjcmlwdGlvbicpLCBjb21tb24uZGVzY3JpcHRpb25FbGVtZW50Lm5leHRTaWJsaW5nKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0VudW1JdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHQuLi5jb21tb24sXG5cdFx0XHRzZWxlY3RCb3gsXG5cdFx0XHRzZWxlY3RFbGVtZW50LFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uRWxlbWVudFxuXHRcdH07XG5cblx0XHR0aGlzLmFkZFNldHRpbmdFbGVtZW50Rm9jdXNIYW5kbGVyKHRlbXBsYXRlKTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlcj4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNldHRpbmdFbnVtSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyU2V0dGluZ0VsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdFbnVtSXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHQvLyBNYWtlIHNoYWxsb3cgY29waWVzIGhlcmUgc28gdGhhdCB3ZSBkb24ndCBtb2RpZnkgdGhlIGFjdHVhbCBkYXRhRWxlbWVudCBsYXRlclxuXHRcdGNvbnN0IGVudW1JdGVtTGFiZWxzID0gZGF0YUVsZW1lbnQuc2V0dGluZy5lbnVtSXRlbUxhYmVscyA/IFsuLi5kYXRhRWxlbWVudC5zZXR0aW5nLmVudW1JdGVtTGFiZWxzXSA6IFtdO1xuXHRcdGNvbnN0IGVudW1EZXNjcmlwdGlvbnMgPSBkYXRhRWxlbWVudC5zZXR0aW5nLmVudW1EZXNjcmlwdGlvbnMgPyBbLi4uZGF0YUVsZW1lbnQuc2V0dGluZy5lbnVtRGVzY3JpcHRpb25zXSA6IFtdO1xuXHRcdGNvbnN0IHNldHRpbmdFbnVtID0gWy4uLmRhdGFFbGVtZW50LnNldHRpbmcuZW51bSFdO1xuXHRcdGNvbnN0IGVudW1EZXNjcmlwdGlvbnNBcmVNYXJrZG93biA9IGRhdGFFbGVtZW50LnNldHRpbmcuZW51bURlc2NyaXB0aW9uc0FyZU1hcmtkb3duO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlcyk7XG5cblx0XHRsZXQgY3JlYXRlZERlZmF1bHQgPSBmYWxzZTtcblx0XHRpZiAoIXNldHRpbmdFbnVtLmluY2x1ZGVzKGRhdGFFbGVtZW50LmRlZmF1bHRWYWx1ZSkpIHtcblx0XHRcdC8vIEFkZCBhIG5ldyBwb3RlbnRpYWxseSBibGFuayBkZWZhdWx0IHNldHRpbmdcblx0XHRcdHNldHRpbmdFbnVtLnVuc2hpZnQoZGF0YUVsZW1lbnQuZGVmYXVsdFZhbHVlKTtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnMudW5zaGlmdCgnJyk7XG5cdFx0XHRlbnVtSXRlbUxhYmVscy51bnNoaWZ0KCcnKTtcblx0XHRcdGNyZWF0ZWREZWZhdWx0ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBVc2UgU3RyaW5nIGNvbnN0cnVjdG9yIGluIGNhc2Ugb2YgbnVsbCBvciB1bmRlZmluZWQgdmFsdWVzXG5cdFx0Y29uc3Qgc3RyaW5naWZpZWREZWZhdWx0VmFsdWUgPSBlc2NhcGVJbnZpc2libGVDaGFycyhTdHJpbmcoZGF0YUVsZW1lbnQuZGVmYXVsdFZhbHVlKSk7XG5cdFx0Y29uc3QgZGlzcGxheU9wdGlvbnM6IElTZWxlY3RPcHRpb25JdGVtW10gPSBzZXR0aW5nRW51bVxuXHRcdFx0Lm1hcChTdHJpbmcpXG5cdFx0XHQubWFwKGVzY2FwZUludmlzaWJsZUNoYXJzKVxuXHRcdFx0Lm1hcCgoZGF0YSwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSAoZW51bURlc2NyaXB0aW9uc1tpbmRleF0gJiYgKGVudW1EZXNjcmlwdGlvbnNBcmVNYXJrZG93biA/IGZpeFNldHRpbmdMaW5rcyhlbnVtRGVzY3JpcHRpb25zW2luZGV4XSwgZmFsc2UpIDogZW51bURlc2NyaXB0aW9uc1tpbmRleF0pKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0ZXh0OiBlbnVtSXRlbUxhYmVsc1tpbmRleF0gPyBlbnVtSXRlbUxhYmVsc1tpbmRleF0gOiBkYXRhLFxuXHRcdFx0XHRcdGRldGFpbDogZW51bUl0ZW1MYWJlbHNbaW5kZXhdID8gZGF0YSA6ICcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uSXNNYXJrZG93bjogZW51bURlc2NyaXB0aW9uc0FyZU1hcmtkb3duLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uTWFya2Rvd25BY3Rpb25IYW5kbGVyOiAoY29udGVudCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKGNvbnRlbnQpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlY29yYXRvclJpZ2h0OiAoKChkYXRhID09PSBzdHJpbmdpZmllZERlZmF1bHRWYWx1ZSkgfHwgKGNyZWF0ZWREZWZhdWx0ICYmIGluZGV4ID09PSAwKSkgPyBsb2NhbGl6ZSgnc2V0dGluZ3MuRGVmYXVsdCcsIFwiZGVmYXVsdFwiKSA6ICcnKVxuXHRcdFx0XHR9IHNhdGlzZmllcyBJU2VsZWN0T3B0aW9uSXRlbTtcblx0XHRcdH0pO1xuXG5cdFx0dGVtcGxhdGUuc2VsZWN0Qm94LnNldE9wdGlvbnMoZGlzcGxheU9wdGlvbnMpO1xuXHRcdHRlbXBsYXRlLnNlbGVjdEJveC5zZXRBcmlhTGFiZWwoZGF0YUVsZW1lbnQuc2V0dGluZy5rZXkpO1xuXHRcdHRlbXBsYXRlLnNlbGVjdEJveC5zZXRFbmFibGVkKCFkYXRhRWxlbWVudC5oYXNQb2xpY3lWYWx1ZSAmJiAhZGF0YUVsZW1lbnQuaXNBZ2VudHNXaW5kb3dSZWFkT25seSk7XG5cblx0XHRsZXQgaWR4ID0gc2V0dGluZ0VudW0uaW5kZXhPZihkYXRhRWxlbWVudC52YWx1ZSk7XG5cdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdGlkeCA9IDA7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGUuc2VsZWN0Qm94LnNlbGVjdChpZHgpO1xuXHRcdHRlbXBsYXRlLm9uQ2hhbmdlID0gKGlkeCkgPT4ge1xuXHRcdFx0aWYgKGNyZWF0ZWREZWZhdWx0ICYmIGlkeCA9PT0gMCkge1xuXHRcdFx0XHRvbkNoYW5nZShkYXRhRWxlbWVudC5kZWZhdWx0VmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b25DaGFuZ2Uoc2V0dGluZ0VudW1baWR4XSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlbXBsYXRlLmVudW1EZXNjcmlwdGlvbkVsZW1lbnQuaW5uZXJUZXh0ID0gJyc7XG5cdH1cbn1cblxuY29uc3Qgc2V0dGluZ3NOdW1iZXJJbnB1dEJveFN0eWxlcyA9IGdldElucHV0Qm94U3R5bGUoe1xuXHRpbnB1dEJhY2tncm91bmQ6IHNldHRpbmdzTnVtYmVySW5wdXRCYWNrZ3JvdW5kLFxuXHRpbnB1dEZvcmVncm91bmQ6IHNldHRpbmdzTnVtYmVySW5wdXRGb3JlZ3JvdW5kLFxuXHRpbnB1dEJvcmRlcjogc2V0dGluZ3NOdW1iZXJJbnB1dEJvcmRlclxufSk7XG5cbmNsYXNzIFNldHRpbmdOdW1iZXJSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nTnVtYmVySXRlbVRlbXBsYXRlPiB7XG5cdHRlbXBsYXRlSWQgPSBTRVRUSU5HU19OVU1CRVJfVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2V0dGluZ051bWJlckl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgY29tbW9uID0gc3VwZXIucmVuZGVyQ29tbW9uVGVtcGxhdGUobnVsbCwgX2NvbnRhaW5lciwgJ251bWJlcicpO1xuXHRcdGNvbnN0IHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50ID0gRE9NLmFwcGVuZChjb21tb24uY29udGFpbmVyRWxlbWVudCwgJCgnLnNldHRpbmctaXRlbS12YWxpZGF0aW9uLW1lc3NhZ2UnKSk7XG5cblx0XHRjb25zdCBpbnB1dEJveCA9IG5ldyBJbnB1dEJveChjb21tb24uY29udHJvbEVsZW1lbnQsIHRoaXMuX2NvbnRleHRWaWV3U2VydmljZSwgeyB0eXBlOiAnbnVtYmVyJywgaW5wdXRCb3hTdHlsZXM6IHNldHRpbmdzTnVtYmVySW5wdXRCb3hTdHlsZXMgfSk7XG5cdFx0Y29tbW9uLnRvRGlzcG9zZS5hZGQoaW5wdXRCb3gpO1xuXHRcdGNvbW1vbi50b0Rpc3Bvc2UuYWRkKFxuXHRcdFx0aW5wdXRCb3gub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdHRlbXBsYXRlLm9uQ2hhbmdlPy4oZSk7XG5cdFx0XHR9KSk7XG5cdFx0Y29tbW9uLnRvRGlzcG9zZS5hZGQoaW5wdXRCb3gpO1xuXHRcdGlucHV0Qm94LmlucHV0RWxlbWVudC5jbGFzc0xpc3QuYWRkKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfQ0xBU1MpO1xuXHRcdGlucHV0Qm94LmlucHV0RWxlbWVudC50YWJJbmRleCA9IDA7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZTogSVNldHRpbmdOdW1iZXJJdGVtVGVtcGxhdGUgPSB7XG5cdFx0XHQuLi5jb21tb24sXG5cdFx0XHRpbnB1dEJveCxcblx0XHRcdHZhbGlkYXRpb25FcnJvck1lc3NhZ2VFbGVtZW50XG5cdFx0fTtcblxuXHRcdHRoaXMuYWRkU2V0dGluZ0VsZW1lbnRGb2N1c0hhbmRsZXIodGVtcGxhdGUpO1xuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIG5ldmVyPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2V0dGluZ051bWJlckl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlclNldHRpbmdFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlclZhbHVlKGRhdGFFbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgdGVtcGxhdGU6IElTZXR0aW5nTnVtYmVySXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiBudW1iZXIgfCBudWxsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgbnVtUGFyc2VGbiA9IChkYXRhRWxlbWVudC52YWx1ZVR5cGUgPT09ICdpbnRlZ2VyJyB8fCBkYXRhRWxlbWVudC52YWx1ZVR5cGUgPT09ICdudWxsYWJsZS1pbnRlZ2VyJylcblx0XHRcdD8gcGFyc2VJbnQgOiBwYXJzZUZsb2F0O1xuXG5cdFx0Y29uc3QgbnVsbE51bVBhcnNlRm4gPSAoZGF0YUVsZW1lbnQudmFsdWVUeXBlID09PSAnbnVsbGFibGUtaW50ZWdlcicgfHwgZGF0YUVsZW1lbnQudmFsdWVUeXBlID09PSAnbnVsbGFibGUtbnVtYmVyJylcblx0XHRcdD8gKCh2OiBzdHJpbmcpID0+IHYgPT09ICcnID8gbnVsbCA6IG51bVBhcnNlRm4odikpIDogbnVtUGFyc2VGbjtcblxuXHRcdHRlbXBsYXRlLm9uQ2hhbmdlID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlLmlucHV0Qm94LnZhbHVlID0gdHlwZW9mIGRhdGFFbGVtZW50LnZhbHVlID09PSAnbnVtYmVyJyA/XG5cdFx0XHRkYXRhRWxlbWVudC52YWx1ZS50b1N0cmluZygpIDogJyc7XG5cdFx0dGVtcGxhdGUuaW5wdXRCb3guc3RlcCA9IGRhdGFFbGVtZW50LnZhbHVlVHlwZS5pbmNsdWRlcygnaW50ZWdlcicpID8gJzEnIDogJ2FueSc7XG5cdFx0dGVtcGxhdGUuaW5wdXRCb3guc2V0QXJpYUxhYmVsKGRhdGFFbGVtZW50LnNldHRpbmcua2V5KTtcblx0XHR0ZW1wbGF0ZS5pbnB1dEJveC5zZXRFbmFibGVkKCFkYXRhRWxlbWVudC5oYXNQb2xpY3lWYWx1ZSAmJiAhZGF0YUVsZW1lbnQuaXNBZ2VudHNXaW5kb3dSZWFkT25seSk7XG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXJlbmRlclZhbGlkYXRpb25zKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgZmFsc2UpKSB7XG5cdFx0XHRcdG9uQ2hhbmdlKG51bGxOdW1QYXJzZUZuKHZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJlbmRlclZhbGlkYXRpb25zKGRhdGFFbGVtZW50LCB0ZW1wbGF0ZSwgdHJ1ZSk7XG5cdH1cbn1cblxuY2xhc3MgU2V0dGluZ0Jvb2xSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXIsIElTZXR0aW5nQm9vbEl0ZW1UZW1wbGF0ZT4ge1xuXHR0ZW1wbGF0ZUlkID0gU0VUVElOR1NfQk9PTF9URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShfY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZXR0aW5nQm9vbEl0ZW1UZW1wbGF0ZSB7XG5cdFx0X2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWl0ZW0nKTtcblx0XHRfY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctaXRlbS1ib29sJyk7XG5cblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBET00uYXBwZW5kKF9jb250YWluZXIsICQoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuQ09OVEVOVFNfU0VMRUNUT1IpKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2V0dGluZ3Mtcm93LWlubmVyLWNvbnRhaW5lcicpO1xuXG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWl0ZW0tdGl0bGUnKSk7XG5cdFx0Y29uc3QgY2F0ZWdvcnlFbGVtZW50ID0gRE9NLmFwcGVuZCh0aXRsZUVsZW1lbnQsICQoJ3NwYW4uc2V0dGluZy1pdGVtLWNhdGVnb3J5JykpO1xuXHRcdGNvbnN0IGxhYmVsRWxlbWVudENvbnRhaW5lciA9IERPTS5hcHBlbmQodGl0bGVFbGVtZW50LCAkKCdzcGFuLnNldHRpbmctaXRlbS1sYWJlbCcpKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0b0Rpc3Bvc2UuYWRkKG5ldyBTaW1wbGVJY29uTGFiZWwobGFiZWxFbGVtZW50Q29udGFpbmVyKSk7XG5cdFx0Y29uc3QgaW5kaWNhdG9yc0xhYmVsID0gdG9EaXNwb3NlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc1RyZWVJbmRpY2F0b3JzTGFiZWwsIHRpdGxlRWxlbWVudCkpO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb25BbmRWYWx1ZUVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctaXRlbS12YWx1ZS1kZXNjcmlwdGlvbicpKTtcblx0XHRjb25zdCBjb250cm9sRWxlbWVudCA9IERPTS5hcHBlbmQoZGVzY3JpcHRpb25BbmRWYWx1ZUVsZW1lbnQsICQoJy5zZXR0aW5nLWl0ZW0tYm9vbC1jb250cm9sJykpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uRWxlbWVudCA9IERPTS5hcHBlbmQoZGVzY3JpcHRpb25BbmRWYWx1ZUVsZW1lbnQsICQoJy5zZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRJbmRpY2F0b3JFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWl0ZW0tbW9kaWZpZWQtaW5kaWNhdG9yJykpO1xuXHRcdHRvRGlzcG9zZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKG1vZGlmaWVkSW5kaWNhdG9yRWxlbWVudCwge1xuXHRcdFx0Y29udGVudDogbG9jYWxpemUoJ21vZGlmaWVkJywgXCJUaGUgc2V0dGluZyBoYXMgYmVlbiBjb25maWd1cmVkIGluIHRoZSBjdXJyZW50IHNjb3BlLlwiKVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRlcHJlY2F0aW9uV2FybmluZ0VsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmctaXRlbS1kZXByZWNhdGlvbi1tZXNzYWdlJykpO1xuXG5cdFx0Y29uc3QgY2hlY2tib3ggPSBuZXcgVG9nZ2xlKHsgaWNvbjogQ29kaWNvbi5jaGVjaywgYWN0aW9uQ2xhc3NOYW1lOiAnc2V0dGluZy12YWx1ZS1jaGVja2JveCcsIGlzQ2hlY2tlZDogdHJ1ZSwgdGl0bGU6ICcnLCAuLi51bnRoZW1lZFRvZ2dsZVN0eWxlcyB9KTtcblx0XHRjb250cm9sRWxlbWVudC5hcHBlbmRDaGlsZChjaGVja2JveC5kb21Ob2RlKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKGNoZWNrYm94KTtcblx0XHR0b0Rpc3Bvc2UuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRlbXBsYXRlLm9uQ2hhbmdlIShjaGVja2JveC5jaGVja2VkKTtcblx0XHR9KSk7XG5cblx0XHRjaGVja2JveC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuQ09OVFJPTF9DTEFTUyk7XG5cdFx0Y29uc3QgdG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZy10b29sYmFyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCB0b29sYmFyID0gdGhpcy5yZW5kZXJTZXR0aW5nVG9vbGJhcih0b29sYmFyQ29udGFpbmVyKTtcblx0XHR0b0Rpc3Bvc2UuYWRkKHRvb2xiYXIpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElTZXR0aW5nQm9vbEl0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdHRvRGlzcG9zZSxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlczogdG9EaXNwb3NlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpLFxuXG5cdFx0XHRjb250YWluZXJFbGVtZW50OiBjb250YWluZXIsXG5cdFx0XHRjYXRlZ29yeUVsZW1lbnQsXG5cdFx0XHRsYWJlbEVsZW1lbnQsXG5cdFx0XHRjb250cm9sRWxlbWVudCxcblx0XHRcdGNoZWNrYm94LFxuXHRcdFx0ZGVzY3JpcHRpb25FbGVtZW50LFxuXHRcdFx0ZGVwcmVjYXRpb25XYXJuaW5nRWxlbWVudCxcblx0XHRcdGluZGljYXRvcnNMYWJlbCxcblx0XHRcdHRvb2xiYXJcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHQvLyBQcmV2ZW50IGNsaWNrcyBmcm9tIGJlaW5nIGhhbmRsZWQgYnkgbGlzdFxuXHRcdHRvRGlzcG9zZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250cm9sRWxlbWVudCwgJ21vdXNlZG93bicsIChlOiBJTW91c2VFdmVudCkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHRcdHRvRGlzcG9zZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aXRsZUVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfRU5URVIsIGUgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vdXNlb3ZlcicpKSk7XG5cdFx0dG9EaXNwb3NlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlRWxlbWVudCwgRE9NLkV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgZSA9PiBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbW91c2VvdmVyJykpKTtcblxuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlcj4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNldHRpbmdCb29sSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyU2V0dGluZ0VsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdCb29sSXRlbVRlbXBsYXRlLCBvbkNoYW5nZTogKHZhbHVlOiBib29sZWFuKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUub25DaGFuZ2UgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGUuY2hlY2tib3guY2hlY2tlZCA9IGRhdGFFbGVtZW50LnZhbHVlO1xuXHRcdGlmIChkYXRhRWxlbWVudC5oYXNQb2xpY3lWYWx1ZSB8fCBkYXRhRWxlbWVudC5pc0FnZW50c1dpbmRvd1JlYWRPbmx5KSB7XG5cdFx0XHR0ZW1wbGF0ZS5jaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUuY2hlY2tib3guZW5hYmxlKCk7XG5cdFx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbkVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZGlzYWJsZWQnKTtcblxuXHRcdFx0Ly8gTmVlZCB0byBsaXN0ZW4gZm9yIG1vdXNlIGNsaWNrcyBvbiBkZXNjcmlwdGlvbiBhbmQgdG9nZ2xlIGNoZWNrYm94IC0gdXNlIHRhcmdldCBJRCBmb3Igc2FmZXR5XG5cdFx0XHQvLyBBbHNvIGhhdmUgdG8gaWdub3JlIGVtYmVkZGVkIGxpbmtzIC0gdXNlIGNsb3Nlc3QoJ2EnKSB0byBoYW5kbGUgY2xpY2tzIG9uIGNoaWxkIGVsZW1lbnRzIG9mIGxpbmtzIChlLmcuIFNWRyBpY29ucyBpbnNpZGUgPGE+IHRhZ3MpXG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGUuZGVzY3JpcHRpb25FbGVtZW50LCBET00uRXZlbnRUeXBlLk1PVVNFX0RPV04sIChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldEVsZW1lbnQ6IEVsZW1lbnQgfCBudWxsID0gZS50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ID8gZS50YXJnZXQgOiBudWxsO1xuXG5cdFx0XHRcdC8vIFRvZ2dsZSB0YXJnZXQgY2hlY2tib3hcblx0XHRcdFx0aWYgKCF0YXJnZXRFbGVtZW50IHx8ICF0YXJnZXRFbGVtZW50LmNsb3Nlc3QoJ2EnKSkge1xuXHRcdFx0XHRcdHRlbXBsYXRlLmNoZWNrYm94LmNoZWNrZWQgPSAhdGVtcGxhdGUuY2hlY2tib3guY2hlY2tlZDtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSEodGVtcGxhdGUuY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0RE9NLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRlbXBsYXRlLmNoZWNrYm94LnNldFRpdGxlKGRhdGFFbGVtZW50LnNldHRpbmcua2V5KTtcblx0XHR0ZW1wbGF0ZS5vbkNoYW5nZSA9IG9uQ2hhbmdlO1xuXHR9XG59XG5cbnR5cGUgTWFuYWdlRXh0ZW5zaW9uQ2xpY2tUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZXh0ZW5zaW9uIHRoZSB1c2VyIHdlbnQgdG8gbWFuYWdlLicgfTtcblx0b3duZXI6ICdyemhhbzI3MSc7XG5cdGNvbW1lbnQ6ICdFdmVudCB1c2VkIHRvIGdhaW4gaW5zaWdodHMgaW50byB3aGVuIHVzZXJzIGludGVyYWN0IHdpdGggYW4gZXh0ZW5zaW9uIG1hbmFnZW1lbnQgc2V0dGluZyc7XG59O1xuXG5jbGFzcyBTZXR0aW5nc0V4dGVuc2lvblRvZ2dsZVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBuZXZlciwgSVNldHRpbmdFeHRlbnNpb25Ub2dnbGVJdGVtVGVtcGxhdGU+IHtcblx0dGVtcGxhdGVJZCA9IFNFVFRJTkdTX0VYVEVOU0lPTl9UT0dHTEVfVEVNUExBVEVfSUQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNtaXNzRXh0ZW5zaW9uU2V0dGluZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzbWlzc0V4dGVuc2lvblNldHRpbmcgPSB0aGlzLl9vbkRpZERpc21pc3NFeHRlbnNpb25TZXR0aW5nLmV2ZW50O1xuXG5cdHJlbmRlclRlbXBsYXRlKF9jb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNldHRpbmdFeHRlbnNpb25Ub2dnbGVJdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGNvbW1vbiA9IHN1cGVyLnJlbmRlckNvbW1vblRlbXBsYXRlKG51bGwsIF9jb250YWluZXIsICdleHRlbnNpb24tdG9nZ2xlJyk7XG5cblx0XHRjb25zdCBhY3Rpb25CdXR0b24gPSBuZXcgQnV0dG9uKGNvbW1vbi5jb250YWluZXJFbGVtZW50LCB7XG5cdFx0XHR0aXRsZTogZmFsc2UsXG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzXG5cdFx0fSk7XG5cdFx0YWN0aW9uQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1pdGVtLWV4dGVuc2lvbi10b2dnbGUtYnV0dG9uJyk7XG5cdFx0YWN0aW9uQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3Nob3dFeHRlbnNpb24nLCBcIlNob3cgRXh0ZW5zaW9uXCIpO1xuXG5cdFx0Y29uc3QgZGlzbWlzc0J1dHRvbiA9IG5ldyBCdXR0b24oY29tbW9uLmNvbnRhaW5lckVsZW1lbnQsIHtcblx0XHRcdHRpdGxlOiBmYWxzZSxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXNcblx0XHR9KTtcblx0XHRkaXNtaXNzQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1pdGVtLWV4dGVuc2lvbi1kaXNtaXNzLWJ1dHRvbicpO1xuXHRcdGRpc21pc3NCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnZGlzbWlzcycsIFwiRGlzbWlzc1wiKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlOiBJU2V0dGluZ0V4dGVuc2lvblRvZ2dsZUl0ZW1UZW1wbGF0ZSA9IHtcblx0XHRcdC4uLmNvbW1vbixcblx0XHRcdGFjdGlvbkJ1dHRvbixcblx0XHRcdGRpc21pc3NCdXR0b25cblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRTZXR0aW5nRWxlbWVudEZvY3VzSGFuZGxlcih0ZW1wbGF0ZSk7XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgbmV2ZXI+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZXR0aW5nRXh0ZW5zaW9uVG9nZ2xlSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyU2V0dGluZ0VsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyVmFsdWUoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdFeHRlbnNpb25Ub2dnbGVJdGVtVGVtcGxhdGUsIG9uQ2hhbmdlOiAoXzogdW5kZWZpbmVkKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBleHRlbnNpb25JZCA9IGRhdGFFbGVtZW50LnNldHRpbmcuZGlzcGxheUV4dGVuc2lvbklkITtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlLmFjdGlvbkJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IGV4dGVuc2lvbklkOiBTdHJpbmcgfSwgTWFuYWdlRXh0ZW5zaW9uQ2xpY2tUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbj4oJ01hbmFnZUV4dGVuc2lvbkNsaWNrJywgeyBleHRlbnNpb25JZCB9KTtcblx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdleHRlbnNpb24ub3BlbicsIGV4dGVuc2lvbklkKTtcblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlLmRpc21pc3NCdXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBleHRlbnNpb25JZDogU3RyaW5nIH0sIE1hbmFnZUV4dGVuc2lvbkNsaWNrVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdEaXNtaXNzRXh0ZW5zaW9uQ2xpY2snLCB7IGV4dGVuc2lvbklkIH0pO1xuXHRcdFx0dGhpcy5fb25EaWREaXNtaXNzRXh0ZW5zaW9uU2V0dGluZy5maXJlKGV4dGVuc2lvbklkKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldHRpbmdUcmVlUmVuZGVyZXJzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQ6IEV2ZW50PElTZXR0aW5nT3ZlcnJpZGVDbGlja0V2ZW50PjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNldHRpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2V0dGluZ0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXR0aW5nOiBFdmVudDxJU2V0dGluZ0NoYW5nZUV2ZW50PjtcblxuXHRyZWFkb25seSBvbkRpZERpc21pc3NFeHRlbnNpb25TZXR0aW5nOiBFdmVudDxzdHJpbmc+O1xuXG5cdHJlYWRvbmx5IG9uRGlkT3BlblNldHRpbmdzOiBFdmVudDxzdHJpbmc+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tTZXR0aW5nTGluazogRXZlbnQ8SVNldHRpbmdMaW5rQ2xpY2tFdmVudD47XG5cblx0cmVhZG9ubHkgb25EaWRGb2N1c1NldHRpbmc6IEV2ZW50PFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50PjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNldHRpbmdIZWlnaHQ6IEV2ZW50PEhlaWdodENoYW5nZVBhcmFtcz47XG5cblx0cmVhZG9ubHkgb25BcHBseUZpbHRlcjogRXZlbnQ8c3RyaW5nPjtcblxuXHRyZWFkb25seSBhbGxSZW5kZXJlcnM6IElUcmVlUmVuZGVyZXI8U2V0dGluZ3NUcmVlRWxlbWVudCwgbmV2ZXIsIGFueT5bXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNldHRpbmdBY3Rpb25zOiBJQWN0aW9uW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2V0dGluZ0FjdGlvbnMgPSBbXG5cdFx0XHRuZXcgQWN0aW9uKCdzZXR0aW5ncy5yZXNldFNldHRpbmcnLCBsb2NhbGl6ZSgncmVzZXRTZXR0aW5nTGFiZWwnLCBcIlJlc2V0IFNldHRpbmdcIiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhc3luYyBjb250ZXh0ID0+IHtcblx0XHRcdFx0aWYgKGNvbnRleHQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdFx0XHRcdGlmICghY29udGV4dC5pc1VudHJ1c3RlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXR0aW5nLmZpcmUoe1xuXHRcdFx0XHRcdFx0XHRrZXk6IGNvbnRleHQuc2V0dGluZy5rZXksXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHR5cGU6IGNvbnRleHQuc2V0dGluZy50eXBlIGFzIFNldHRpbmdWYWx1ZVR5cGUsXG5cdFx0XHRcdFx0XHRcdG1hbnVhbFJlc2V0OiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRzY29wZTogY29udGV4dC5zZXR0aW5nLnNjb3BlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29weVNldHRpbmdJZEFjdGlvbiksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3B5U2V0dGluZ0FzSlNPTkFjdGlvbiksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3B5U2V0dGluZ0FzVVJMQWN0aW9uKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0aW9uRmFjdG9yeSA9IChzZXR0aW5nOiBJU2V0dGluZywgc2V0dGluZ1RhcmdldDogU2V0dGluZ3NUYXJnZXQpID0+IHRoaXMuZ2V0QWN0aW9uc0ZvclNldHRpbmcoc2V0dGluZywgc2V0dGluZ1RhcmdldCk7XG5cdFx0Y29uc3QgZW1wdHlBY3Rpb25GYWN0b3J5ID0gKF86IElTZXR0aW5nKSA9PiBbXTtcblx0XHRjb25zdCBleHRlbnNpb25SZW5kZXJlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzRXh0ZW5zaW9uVG9nZ2xlUmVuZGVyZXIsIFtdLCBlbXB0eUFjdGlvbkZhY3RvcnkpO1xuXHRcdGNvbnN0IHNldHRpbmdSZW5kZXJlcnMgPSBbXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nQm9vbFJlbmRlcmVyLCB0aGlzLnNldHRpbmdBY3Rpb25zLCBhY3Rpb25GYWN0b3J5KSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdOdW1iZXJSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nQXJyYXlSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nQ29tcGxleFJlbmRlcmVyLCB0aGlzLnNldHRpbmdBY3Rpb25zLCBhY3Rpb25GYWN0b3J5KSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdDb21wbGV4T2JqZWN0UmVuZGVyZXIsIHRoaXMuc2V0dGluZ0FjdGlvbnMsIGFjdGlvbkZhY3RvcnkpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ1RleHRSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nTXVsdGlsaW5lVGV4dFJlbmRlcmVyLCB0aGlzLnNldHRpbmdBY3Rpb25zLCBhY3Rpb25GYWN0b3J5KSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdFeGNsdWRlUmVuZGVyZXIsIHRoaXMuc2V0dGluZ0FjdGlvbnMsIGFjdGlvbkZhY3RvcnkpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ0luY2x1ZGVSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nRW51bVJlbmRlcmVyLCB0aGlzLnNldHRpbmdBY3Rpb25zLCBhY3Rpb25GYWN0b3J5KSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdPYmplY3RSZW5kZXJlciwgdGhpcy5zZXR0aW5nQWN0aW9ucywgYWN0aW9uRmFjdG9yeSksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nQm9vbE9iamVjdFJlbmRlcmVyLCB0aGlzLnNldHRpbmdBY3Rpb25zLCBhY3Rpb25GYWN0b3J5KSxcblx0XHRcdGV4dGVuc2lvblJlbmRlcmVyXG5cdFx0XTtcblxuXHRcdHRoaXMub25EaWRDbGlja092ZXJyaWRlRWxlbWVudCA9IEV2ZW50LmFueSguLi5zZXR0aW5nUmVuZGVyZXJzLm1hcChyID0+IHIub25EaWRDbGlja092ZXJyaWRlRWxlbWVudCkpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VTZXR0aW5nID0gRXZlbnQuYW55KFxuXHRcdFx0Li4uc2V0dGluZ1JlbmRlcmVycy5tYXAociA9PiByLm9uRGlkQ2hhbmdlU2V0dGluZyksXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNldHRpbmcuZXZlbnRcblx0XHQpO1xuXHRcdHRoaXMub25EaWREaXNtaXNzRXh0ZW5zaW9uU2V0dGluZyA9IGV4dGVuc2lvblJlbmRlcmVyLm9uRGlkRGlzbWlzc0V4dGVuc2lvblNldHRpbmc7XG5cdFx0dGhpcy5vbkRpZE9wZW5TZXR0aW5ncyA9IEV2ZW50LmFueSguLi5zZXR0aW5nUmVuZGVyZXJzLm1hcChyID0+IHIub25EaWRPcGVuU2V0dGluZ3MpKTtcblx0XHR0aGlzLm9uRGlkQ2xpY2tTZXR0aW5nTGluayA9IEV2ZW50LmFueSguLi5zZXR0aW5nUmVuZGVyZXJzLm1hcChyID0+IHIub25EaWRDbGlja1NldHRpbmdMaW5rKSk7XG5cdFx0dGhpcy5vbkRpZEZvY3VzU2V0dGluZyA9IEV2ZW50LmFueSguLi5zZXR0aW5nUmVuZGVyZXJzLm1hcChyID0+IHIub25EaWRGb2N1c1NldHRpbmcpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2V0dGluZ0hlaWdodCA9IEV2ZW50LmFueSguLi5zZXR0aW5nUmVuZGVyZXJzLm1hcChyID0+IHIub25EaWRDaGFuZ2VTZXR0aW5nSGVpZ2h0KSk7XG5cdFx0dGhpcy5vbkFwcGx5RmlsdGVyID0gRXZlbnQuYW55KC4uLnNldHRpbmdSZW5kZXJlcnMubWFwKHIgPT4gci5vbkFwcGx5RmlsdGVyKSk7XG5cblx0XHR0aGlzLmFsbFJlbmRlcmVycyA9IFtcblx0XHRcdC4uLnNldHRpbmdSZW5kZXJlcnMsXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nR3JvdXBSZW5kZXJlciksXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nTmV3RXh0ZW5zaW9uc1JlbmRlcmVyKSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zRm9yU2V0dGluZyhzZXR0aW5nOiBJU2V0dGluZywgc2V0dGluZ1RhcmdldDogU2V0dGluZ3NUYXJnZXQpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmICghKHNldHRpbmcuc2NvcGUgJiYgQVBQTElDQVRJT05fU0NPUEVTLmluY2x1ZGVzKHNldHRpbmcuc2NvcGUpKSAmJiBzZXR0aW5nVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBcHBseVNldHRpbmdUb0FsbFByb2ZpbGVzQWN0aW9uLCBzZXR0aW5nKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl91c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiAhc2V0dGluZy5kaXNhbGxvd1N5bmNJZ25vcmUpIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTeW5jU2V0dGluZ0FjdGlvbiwgc2V0dGluZykpO1xuXHRcdH1cblx0XHRpZiAoYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGFjdGlvbnMuc3BsaWNlKDAsIDAsIG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0fVxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0Y2FuY2VsU3VnZ2VzdGVycygpIHtcblx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdH1cblxuXHRzaG93Q29udGV4dE1lbnUoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIHNldHRpbmdET01FbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRvb2xiYXJFbGVtZW50ID0gc2V0dGluZ0RPTUVsZW1lbnQucXVlcnlTZWxlY3RvcignLm1vbmFjby10b29sYmFyJyk7XG5cdFx0aWYgKHRvb2xiYXJFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5zZXR0aW5nQWN0aW9ucyxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiA8SFRNTEVsZW1lbnQ+dG9vbGJhckVsZW1lbnQsXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlbGVtZW50XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRnZXRTZXR0aW5nRE9NRWxlbWVudEZvckRPTUVsZW1lbnQoZG9tRWxlbWVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHRcdGNvbnN0IHBhcmVudCA9IERPTS5maW5kUGFyZW50V2l0aENsYXNzKGRvbUVsZW1lbnQsIEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRFTlRTX0NMQVNTKTtcblx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRyZXR1cm4gcGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Z2V0RE9NRWxlbWVudHNGb3JTZXR0aW5nS2V5KHRyZWVDb250YWluZXI6IEhUTUxFbGVtZW50LCBrZXk6IHN0cmluZyk6IE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRyZXR1cm4gdHJlZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKGBbJHtBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5TRVRUSU5HX0tFWV9BVFRSfT1cIiR7a2V5fVwiXWApO1xuXHR9XG5cblx0Z2V0S2V5Rm9yRE9NRWxlbWVudEluU2V0dGluZyhlbGVtZW50OiBIVE1MRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IHNldHRpbmdFbGVtZW50ID0gdGhpcy5nZXRTZXR0aW5nRE9NRWxlbWVudEZvckRPTUVsZW1lbnQoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHNldHRpbmdFbGVtZW50ICYmIHNldHRpbmdFbGVtZW50LmdldEF0dHJpYnV0ZShBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5TRVRUSU5HX0tFWV9BVFRSKTtcblx0fVxuXG5cdGdldElkRm9yRE9NRWxlbWVudEluU2V0dGluZyhlbGVtZW50OiBIVE1MRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IHNldHRpbmdFbGVtZW50ID0gdGhpcy5nZXRTZXR0aW5nRE9NRWxlbWVudEZvckRPTUVsZW1lbnQoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHNldHRpbmdFbGVtZW50ICYmIHNldHRpbmdFbGVtZW50LmdldEF0dHJpYnV0ZShBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5TRVRUSU5HX0lEX0FUVFIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zZXR0aW5nQWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoaXNEaXNwb3NhYmxlKGFjdGlvbikpIHtcblx0XHRcdFx0YWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLmFsbFJlbmRlcmVycy5mb3JFYWNoKHJlbmRlcmVyID0+IHtcblx0XHRcdGlmIChpc0Rpc3Bvc2FibGUocmVuZGVyZXIpKSB7XG5cdFx0XHRcdHJlbmRlcmVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFZhbGlkYXRlIGFuZCByZW5kZXIgYW55IGVycm9yIG1lc3NhZ2UuIFJldHVybnMgdHJ1ZSBpZiB0aGUgdmFsdWUgaXMgaW52YWxpZC5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyVmFsaWRhdGlvbnMoZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCB0ZW1wbGF0ZTogSVNldHRpbmdUZXh0SXRlbVRlbXBsYXRlLCBjYWxsZWRPblN0YXJ0dXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0aWYgKGRhdGFFbGVtZW50LnNldHRpbmcudmFsaWRhdG9yKSB7XG5cdFx0Y29uc3QgZXJyTXNnID0gZGF0YUVsZW1lbnQuc2V0dGluZy52YWxpZGF0b3IodGVtcGxhdGUuaW5wdXRCb3gudmFsdWUpO1xuXHRcdGlmIChlcnJNc2cpIHtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0dGVtcGxhdGUudmFsaWRhdGlvbkVycm9yTWVzc2FnZUVsZW1lbnQuaW5uZXJUZXh0ID0gZXJyTXNnO1xuXHRcdFx0Y29uc3QgdmFsaWRhdGlvbkVycm9yID0gbG9jYWxpemUoJ3ZhbGlkYXRpb25FcnJvcicsIFwiVmFsaWRhdGlvbiBFcnJvci5cIik7XG5cdFx0XHR0ZW1wbGF0ZS5pbnB1dEJveC5pbnB1dEVsZW1lbnQucGFyZW50RWxlbWVudCEuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgW3ZhbGlkYXRpb25FcnJvciwgZXJyTXNnXS5qb2luKCcgJykpO1xuXHRcdFx0aWYgKCFjYWxsZWRPblN0YXJ0dXApIHsgYXJpYS5zdGF0dXModmFsaWRhdGlvbkVycm9yICsgJyAnICsgZXJyTXNnKTsgfVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLmlucHV0Qm94LmlucHV0RWxlbWVudC5wYXJlbnRFbGVtZW50IS5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0XHR9XG5cdH1cblx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbnZhbGlkLWlucHV0Jyk7XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBhbmQgcmVuZGVyIGFueSBlcnJvciBtZXNzYWdlIGZvciBhcnJheXMuIFJldHVybnMgdHJ1ZSBpZiB0aGUgdmFsdWUgaXMgaW52YWxpZC5cbiAqL1xuZnVuY3Rpb24gcmVuZGVyQXJyYXlWYWxpZGF0aW9ucyhcblx0ZGF0YUVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LFxuXHR0ZW1wbGF0ZTogSVNldHRpbmdMaXN0SXRlbVRlbXBsYXRlIHwgSVNldHRpbmdPYmplY3RJdGVtVGVtcGxhdGUsXG5cdHZhbHVlOiBzdHJpbmdbXSB8IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLFxuXHRjYWxsZWRPblN0YXJ0dXA6IGJvb2xlYW5cbik6IGJvb2xlYW4ge1xuXHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludmFsaWQtaW5wdXQnKTtcblx0aWYgKGRhdGFFbGVtZW50LnNldHRpbmcudmFsaWRhdG9yKSB7XG5cdFx0Y29uc3QgZXJyTXNnID0gZGF0YUVsZW1lbnQuc2V0dGluZy52YWxpZGF0b3IodmFsdWUpO1xuXHRcdGlmIChlcnJNc2cgJiYgZXJyTXNnICE9PSAnJykge1xuXHRcdFx0dGVtcGxhdGUuY29udGFpbmVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHR0ZW1wbGF0ZS52YWxpZGF0aW9uRXJyb3JNZXNzYWdlRWxlbWVudC5pbm5lclRleHQgPSBlcnJNc2c7XG5cdFx0XHRjb25zdCB2YWxpZGF0aW9uRXJyb3IgPSBsb2NhbGl6ZSgndmFsaWRhdGlvbkVycm9yJywgXCJWYWxpZGF0aW9uIEVycm9yLlwiKTtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgW2RhdGFFbGVtZW50LnNldHRpbmcua2V5LCB2YWxpZGF0aW9uRXJyb3IsIGVyck1zZ10uam9pbignICcpKTtcblx0XHRcdGlmICghY2FsbGVkT25TdGFydHVwKSB7IGFyaWEuc3RhdHVzKHZhbGlkYXRpb25FcnJvciArICcgJyArIGVyck1zZyk7IH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGRhdGFFbGVtZW50LnNldHRpbmcua2V5KTtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lckVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaW52YWxpZC1pbnB1dCcpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGNsZWFuUmVuZGVyZWRNYXJrZG93bihlbGVtZW50OiBOb2RlKTogdm9pZCB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY2hpbGQgPSBlbGVtZW50LmNoaWxkTm9kZXMuaXRlbShpKTtcblxuXHRcdGNvbnN0IHRhZ05hbWUgPSAoPEVsZW1lbnQ+Y2hpbGQpLnRhZ05hbWUgJiYgKDxFbGVtZW50PmNoaWxkKS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKHRhZ05hbWUgPT09ICdpbWcnKSB7XG5cdFx0XHRjaGlsZC5yZW1vdmUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2xlYW5SZW5kZXJlZE1hcmtkb3duKGNoaWxkKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZml4U2V0dGluZ0xpbmtzKHRleHQ6IHN0cmluZywgbGlua2lmeSA9IHRydWUpOiBzdHJpbmcge1xuXHRyZXR1cm4gdGV4dC5yZXBsYWNlKC9gIyhbXiNcXHNgXSspI2B8JyMoW14jXFxzJ10rKSMnL2csIChtYXRjaCwgYmFja3RpY2tzR3JvdXAsIHF1b3Rlc0dyb3VwKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dGluZ0tleTogc3RyaW5nID0gYmFja3RpY2tzR3JvdXAgPz8gcXVvdGVzR3JvdXA7XG5cdFx0Y29uc3QgdGFyZ2V0RGlzcGxheUZvcm1hdCA9IHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoc2V0dGluZ0tleSk7XG5cdFx0Y29uc3QgdGFyZ2V0TmFtZSA9IGAke3RhcmdldERpc3BsYXlGb3JtYXQuY2F0ZWdvcnl9OiAke3RhcmdldERpc3BsYXlGb3JtYXQubGFiZWx9YDtcblx0XHRyZXR1cm4gbGlua2lmeSA/XG5cdFx0XHRgWyR7dGFyZ2V0TmFtZX1dKCMke3NldHRpbmdLZXl9IFwiJHtzZXR0aW5nS2V5fVwiKWAgOlxuXHRcdFx0YFwiJHt0YXJnZXROYW1lfVwiYDtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUludmlzaWJsZUNoYXJzKGVudW1WYWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGVudW1WYWx1ZSAmJiBlbnVtVmFsdWVcblx0XHQucmVwbGFjZSgvXFxuL2csICdcXFxcbicpXG5cdFx0LnJlcGxhY2UoL1xcci9nLCAnXFxcXHInKTtcbn1cblxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUcmVlRmlsdGVyIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8U2V0dGluZ3NUcmVlRWxlbWVudD4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHZpZXdTdGF0ZTogSVNldHRpbmdzRWRpdG9yVmlld1N0YXRlLFxuXHRcdHByaXZhdGUgaXNGaWx0ZXJpbmdHcm91cHM6IGJvb2xlYW4sXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0ZmlsdGVyKGVsZW1lbnQ6IFNldHRpbmdzVHJlZUVsZW1lbnQsIHBhcmVudFZpc2liaWxpdHk6IFRyZWVWaXNpYmlsaXR5KTogVHJlZUZpbHRlclJlc3VsdDx2b2lkPiB7XG5cdFx0Ly8gRmlsdGVyIGR1cmluZyBzZWFyY2hcblx0XHRpZiAodGhpcy52aWV3U3RhdGUuY2F0ZWdvcnlGaWx0ZXIgJiYgZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KSB7XG5cdFx0XHRpZiAoIXRoaXMuc2V0dGluZ0NvbnRhaW5lZEluR3JvdXAoZWxlbWVudC5zZXR0aW5nLCB0aGlzLnZpZXdTdGF0ZS5jYXRlZ29yeUZpbHRlcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vbi11c2VyIHNjb3BlIHNlbGVjdGVkXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCAmJiB0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCAhPT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHRjb25zdCBpc1JlbW90ZSA9ICEhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0aWYgKCFlbGVtZW50Lm1hdGNoZXNTY29wZSh0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCwgaXNSZW1vdGUpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBHcm91cCB3aXRoIG5vIHZpc2libGUgY2hpbGRyZW5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCkge1xuXHRcdFx0Ly8gV2hlbiBmaWx0ZXJpbmcgdG8gYSBzcGVjaWZpYyBjYXRlZ29yeSwgb25seSBzaG93IHRoYXQgY2F0ZWdvcnkgYW5kIGl0cyBkZXNjZW5kYW50c1xuXHRcdFx0aWYgKHRoaXMuaXNGaWx0ZXJpbmdHcm91cHMgJiYgdGhpcy52aWV3U3RhdGUuY2F0ZWdvcnlGaWx0ZXIpIHtcblx0XHRcdFx0aWYgKCF0aGlzLmdyb3VwSXNSZWxhdGVkVG9DYXRlZ29yeShlbGVtZW50LCB0aGlzLnZpZXdTdGF0ZS5jYXRlZ29yeUZpbHRlcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRm9yIGdyb3VwcyByZWxhdGVkIHRvIHRoZSBjYXRlZ29yeSwgc2tpcCB0aGUgY291bnQgY2hlY2sgYW5kIHJlY3Vyc2Vcblx0XHRcdFx0Ly8gdG8gbGV0IGNoaWxkIHNldHRpbmdzIGJlIGZpbHRlcmVkXG5cdFx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQuY291bnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50LmNvdW50ID4gMDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyZWQgXCJuZXcgZXh0ZW5zaW9uc1wiIGJ1dHRvblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQpIHtcblx0XHRcdGlmICh0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzPy5zaXplIHx8IHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dGluZ0NvbnRhaW5lZEluR3JvdXAoc2V0dGluZzogSVNldHRpbmcsIGdyb3VwOiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZ3JvdXAuY2hpbGRyZW4uc29tZShjaGlsZCA9PiB7XG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0dGluZ0NvbnRhaW5lZEluR3JvdXAoc2V0dGluZywgY2hpbGQpO1xuXHRcdFx0fSBlbHNlIGlmIChjaGlsZCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybiBjaGlsZC5zZXR0aW5nLmtleSA9PT0gc2V0dGluZy5rZXk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIGEgZ3JvdXAgaXMgcmVsYXRlZCB0byB0aGUgZmlsdGVyZWQgY2F0ZWdvcnkuXG5cdCAqIEEgZ3JvdXAgaXMgcmVsYXRlZCBpZiBpdCdzIHRoZSBjYXRlZ29yeSBpdHNlbGYsIGEgZGVzY2VuZGFudCBvZiBpdCwgb3IgYW4gYW5jZXN0b3Igb2YgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGdyb3VwSXNSZWxhdGVkVG9DYXRlZ29yeShncm91cDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50LCBjYXRlZ29yeTogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBncm91cCBpcyB0aGUgY2F0ZWdvcnkgaXRzZWxmXG5cdFx0aWYgKGdyb3VwLmlkID09PSBjYXRlZ29yeS5pZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBncm91cCBpcyBhIGRlc2NlbmRhbnQgb2YgdGhlIGNhdGVnb3J5XG5cdFx0bGV0IHBhcmVudCA9IGdyb3VwLnBhcmVudDtcblx0XHR3aGlsZSAocGFyZW50KSB7XG5cdFx0XHRpZiAocGFyZW50LmlkID09PSBjYXRlZ29yeS5pZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBncm91cCBpcyBhbiBhbmNlc3RvciBvZiB0aGUgY2F0ZWdvcnlcblx0XHRsZXQgY2F0ZWdvcnlQYXJlbnQgPSBjYXRlZ29yeS5wYXJlbnQ7XG5cdFx0d2hpbGUgKGNhdGVnb3J5UGFyZW50KSB7XG5cdFx0XHRpZiAoY2F0ZWdvcnlQYXJlbnQuaWQgPT09IGdyb3VwLmlkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2F0ZWdvcnlQYXJlbnQgPSBjYXRlZ29yeVBhcmVudC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdzVHJlZURlbGVnYXRlIGV4dGVuZHMgQ2FjaGVkTGlzdFZpcnR1YWxEZWxlZ2F0ZTxTZXR0aW5nc1RyZWVHcm91cENoaWxkPiB7XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQgfCBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCB8IFNldHRpbmdzVHJlZU5ld0V4dGVuc2lvbnNFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIFNFVFRJTkdTX0VMRU1FTlRfVEVNUExBVEVfSUQ7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkV4dGVuc2lvblRvZ2dsZSkge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfRVhURU5TSU9OX1RPR0dMRV9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW52YWxpZFR5cGVFcnJvciA9IGVsZW1lbnQuaXNDb25maWd1cmVkICYmIGdldEludmFsaWRUeXBlRXJyb3IoZWxlbWVudC52YWx1ZSwgZWxlbWVudC5zZXR0aW5nLnR5cGUpO1xuXHRcdFx0aWYgKGludmFsaWRUeXBlRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIFNFVFRJTkdTX0NPTVBMRVhfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5Cb29sZWFuKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19CT09MX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuSW50ZWdlciB8fFxuXHRcdFx0XHRlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5OdW1iZXIgfHxcblx0XHRcdFx0ZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuTnVsbGFibGVJbnRlZ2VyIHx8XG5cdFx0XHRcdGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLk51bGxhYmxlTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19OVU1CRVJfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5NdWx0aWxpbmVTdHJpbmcpIHtcblx0XHRcdFx0cmV0dXJuIFNFVFRJTkdTX01VTFRJTElORV9URVhUX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuU3RyaW5nKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19URVhUX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuRW51bSkge1xuXHRcdFx0XHRyZXR1cm4gU0VUVElOR1NfRU5VTV9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkFycmF5KSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19BUlJBWV9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkV4Y2x1ZGUpIHtcblx0XHRcdFx0cmV0dXJuIFNFVFRJTkdTX0VYQ0xVREVfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5JbmNsdWRlKSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19JTkNMVURFX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuT2JqZWN0KSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19PQkpFQ1RfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnZhbHVlVHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5Cb29sZWFuT2JqZWN0KSB7XG5cdFx0XHRcdHJldHVybiBTRVRUSU5HU19CT09MX09CSkVDVF9URU1QTEFURV9JRDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudmFsdWVUeXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkNvbXBsZXhPYmplY3QpIHtcblx0XHRcdFx0cmV0dXJuIFNFVFRJTkdTX0NPTVBMRVhfT0JKRUNUX1RFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuTGFuZ3VhZ2VUYWcpIHtcblx0XHRcdFx0cmV0dXJuIFNFVFRJTkdTX0NPTVBMRVhfVEVNUExBVEVfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBTRVRUSU5HU19DT01QTEVYX1RFTVBMQVRFX0lEO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQpIHtcblx0XHRcdHJldHVybiBTRVRUSU5HU19ORVdfRVhURU5TSU9OU19URU1QTEFURV9JRDtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Vua25vd24gZWxlbWVudCB0eXBlOiAnICsgZWxlbWVudCk7XG5cdH1cblxuXHRoYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQ6IFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCB8IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50IHwgU2V0dGluZ3NUcmVlTmV3RXh0ZW5zaW9uc0VsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIShlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBlc3RpbWF0ZUhlaWdodChlbGVtZW50OiBTZXR0aW5nc1RyZWVHcm91cENoaWxkKTogbnVtYmVyIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIDQyO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQgJiYgZWxlbWVudC52YWx1ZVR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuQm9vbGVhbiA/IDc4IDogMTA0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb25Db2xsYXBzaWJsZU9iamVjdFRyZWVNb2RlbDxUPiBleHRlbmRzIE9iamVjdFRyZWVNb2RlbDxUPiB7XG5cdG92ZXJyaWRlIGlzQ29sbGFwc2libGUoZWxlbWVudDogVCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldENvbGxhcHNlZChlbGVtZW50OiBULCBjb2xsYXBzZWQ/OiBib29sZWFuLCByZWN1cnNpdmU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdzVHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFNldHRpbmdzVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKSB7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogU2V0dGluZ3NUcmVlRWxlbWVudCkge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGFyaWFMYWJlbFNlY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChgJHtlbGVtZW50LmRpc3BsYXlDYXRlZ29yeX0gJHtlbGVtZW50LmRpc3BsYXlMYWJlbH0uYCk7XG5cblx0XHRcdGlmIChlbGVtZW50LmlzQ29uZmlndXJlZCkge1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZFRleHQgPSBsb2NhbGl6ZSgnc2V0dGluZ3MuTW9kaWZpZWQnLCAnTW9kaWZpZWQuJyk7XG5cdFx0XHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2gobW9kaWZpZWRUZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5kaWNhdG9yc0xhYmVsQXJpYUxhYmVsID0gZ2V0SW5kaWNhdG9yc0xhYmVsQXJpYUxhYmVsKGVsZW1lbnQsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRcdGlmIChpbmRpY2F0b3JzTGFiZWxBcmlhTGFiZWwubGVuZ3RoKSB7XG5cdFx0XHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2goYCR7aW5kaWNhdG9yc0xhYmVsQXJpYUxhYmVsfS5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25XaXRob3V0U2V0dGluZ0xpbmtzID0gcmVuZGVyQXNQbGFpbnRleHQoeyB2YWx1ZTogZml4U2V0dGluZ0xpbmtzKGVsZW1lbnQuZGVzY3JpcHRpb24sIGZhbHNlKSB9KTtcblx0XHRcdGlmIChkZXNjcmlwdGlvbldpdGhvdXRTZXR0aW5nTGlua3MubGVuZ3RoKSB7XG5cdFx0XHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2goZGVzY3JpcHRpb25XaXRob3V0U2V0dGluZ0xpbmtzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhcmlhTGFiZWxTZWN0aW9ucy5qb2luKCcgJyk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnc2V0dGluZ3MnLCBcIlNldHRpbmdzXCIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RyZWUgZXh0ZW5kcyBXb3JrYmVuY2hPYmplY3RUcmVlPFNldHRpbmdzVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHR2aWV3U3RhdGU6IElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZSxcblx0XHRyZW5kZXJlcnM6IElUcmVlUmVuZGVyZXI8YW55LCB2b2lkLCBhbnk+W10sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ1NldHRpbmdzVHJlZScsIGNvbnRhaW5lcixcblx0XHRcdG5ldyBTZXR0aW5nc1RyZWVEZWxlZ2F0ZSgpLFxuXHRcdFx0cmVuZGVyZXJzLFxuXHRcdFx0e1xuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydER5bmFtaWNIZWlnaHRzOiB0cnVlLFxuXHRcdFx0XHRzY3JvbGxUb0FjdGl2ZUVsZW1lbnQ6IHRydWUsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZChlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZS5pZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFNldHRpbmdzVHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlcihjb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSksXG5cdFx0XHRcdHN0eWxlQ29udHJvbGxlcjogaWQgPT4gbmV3IERlZmF1bHRTdHlsZUNvbnRyb2xsZXIoZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVTdHlsZVNoZWV0KGNvbnRhaW5lciksIGlkKSxcblx0XHRcdFx0ZmlsdGVyOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc1RyZWVGaWx0ZXIsIHZpZXdTdGF0ZSwgdHJ1ZSksXG5cdFx0XHRcdHNtb290aFNjcm9sbGluZzogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5saXN0LnNtb290aFNjcm9sbGluZycpLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRmaW5kV2lkZ2V0RW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk5vbmUsXG5cdFx0XHRcdHRyYW5zZm9ybU9wdGltaXphdGlvbjogZmFsc2UgLy8gRGlzYWJsZSB0cmFuc2Zvcm0gb3B0aW1pemF0aW9uICMxNzc0NzBcblx0XHRcdH0sXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0bGlzdFNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHQpO1xuXG5cdFx0dGhpcy5nZXRIVE1MRWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ3NldHRpbmdzLWVkaXRvci10cmVlJyk7XG5cblx0XHR0aGlzLnN0eWxlKGdldExpc3RTdHlsZXMoe1xuXHRcdFx0bGlzdEJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRsaXN0Rm9jdXNCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0bGlzdEZvY3VzRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0XHRcdGxpc3RIb3ZlckZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRsaXN0SG92ZXJCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0bGlzdEhvdmVyT3V0bGluZTogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdGxpc3RGb2N1c091dGxpbmU6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZTogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdHRyZWVJbmRlbnRHdWlkZXNTdHJva2U6IHVuZGVmaW5lZCxcblx0XHRcdHRyZWVJbmFjdGl2ZUluZGVudEd1aWRlc1N0cm9rZTogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gubGlzdC5zbW9vdGhTY3JvbGxpbmcnKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdHNtb290aFNjcm9sbGluZzogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5saXN0LnNtb290aFNjcm9sbGluZycpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVNb2RlbCh1c2VyOiBzdHJpbmcsIG9wdGlvbnM6IElPYmplY3RUcmVlT3B0aW9uczxTZXR0aW5nc1RyZWVFbGVtZW50IHwgbnVsbCwgdm9pZD4pOiBJVHJlZU1vZGVsPFNldHRpbmdzVHJlZUdyb3VwQ2hpbGQgfCBudWxsLCB2b2lkLCBTZXR0aW5nc1RyZWVHcm91cENoaWxkIHwgbnVsbD4ge1xuXHRcdHJldHVybiBuZXcgTm9uQ29sbGFwc2libGVPYmplY3RUcmVlTW9kZWw8U2V0dGluZ3NUcmVlR3JvdXBDaGlsZD4odXNlciwgb3B0aW9ucyk7XG5cdH1cbn1cblxuY2xhc3MgQ29weVNldHRpbmdJZEFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXR0aW5ncy5jb3B5U2V0dGluZ0lkJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2NvcHlTZXR0aW5nSWRMYWJlbCcsIFwiQ29weSBTZXR0aW5nIElEXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKENvcHlTZXR0aW5nSWRBY3Rpb24uSUQsIENvcHlTZXR0aW5nSWRBY3Rpb24uTEFCRUwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGNvbnRleHQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoY29udGV4dC5zZXR0aW5nLmtleSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG59XG5cbmNsYXNzIENvcHlTZXR0aW5nQXNKU09OQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3NldHRpbmdzLmNvcHlTZXR0aW5nQXNKU09OJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2NvcHlTZXR0aW5nQXNKU09OTGFiZWwnLCBcIkNvcHkgU2V0dGluZyBhcyBKU09OXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKENvcHlTZXR0aW5nQXNKU09OQWN0aW9uLklELCBDb3B5U2V0dGluZ0FzSlNPTkFjdGlvbi5MQUJFTCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oY29udGV4dDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29udGV4dCkge1xuXHRcdFx0Y29uc3QganNvblJlc3VsdCA9IGBcIiR7Y29udGV4dC5zZXR0aW5nLmtleX1cIjogJHtKU09OLnN0cmluZ2lmeShjb250ZXh0LnZhbHVlLCB1bmRlZmluZWQsICcgICcpfWA7XG5cdFx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGpzb25SZXN1bHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxufVxuXG5jbGFzcyBDb3B5U2V0dGluZ0FzVVJMQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3NldHRpbmdzLmNvcHlTZXR0aW5nQXNVUkwnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnY29weVNldHRpbmdBc1VSTExhYmVsJywgXCJDb3B5IFNldHRpbmcgYXMgVVJMXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihDb3B5U2V0dGluZ0FzVVJMQWN0aW9uLklELCBDb3B5U2V0dGluZ0FzVVJMQWN0aW9uLkxBQkVMKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihjb250ZXh0OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nS2V5ID0gY29udGV4dC5zZXR0aW5nLmtleTtcblx0XHRcdGNvbnN0IHByb2R1Y3QgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IHByb2R1Y3QsIGF1dGhvcml0eTogU0VUVElOR1NfQVVUSE9SSVRZLCBwYXRoOiBgLyR7c2V0dGluZ0tleX1gIH0sIHRydWUpO1xuXHRcdFx0YXdhaXQgdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dCh1cmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG59XG5cbmNsYXNzIFN5bmNTZXR0aW5nQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3NldHRpbmdzLnN0b3BTeW5jaW5nU2V0dGluZyc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdzdG9wU3luY2luZ1NldHRpbmcnLCBcIlN5bmMgVGhpcyBTZXR0aW5nXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZzogSVNldHRpbmcsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoU3luY1NldHRpbmdBY3Rpb24uSUQsIFN5bmNTZXR0aW5nQWN0aW9uLkxBQkVMKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIoY29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2V0dGluZ3NTeW5jLmlnbm9yZWRTZXR0aW5ncycpKSgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZSgpIHtcblx0XHRjb25zdCBpZ25vcmVkU2V0dGluZ3MgPSBnZXRJZ25vcmVkU2V0dGluZ3MoZ2V0RGVmYXVsdElnbm9yZWRTZXR0aW5ncygpLCB0aGlzLmNvbmZpZ1NlcnZpY2UpO1xuXHRcdHRoaXMuY2hlY2tlZCA9ICFpZ25vcmVkU2V0dGluZ3MuaW5jbHVkZXModGhpcy5zZXR0aW5nLmtleSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZmlyc3QgcmVtb3ZlIHRoZSBjdXJyZW50IHNldHRpbmcgY29tcGxldGVseSBmcm9tIGlnbm9yZWQgc2V0dGluZ3Ncblx0XHRsZXQgY3VycmVudFZhbHVlID0gWy4uLnRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxzdHJpbmdbXT4oJ3NldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3MnKV07XG5cdFx0Y3VycmVudFZhbHVlID0gY3VycmVudFZhbHVlLmZpbHRlcih2ID0+IHYgIT09IHRoaXMuc2V0dGluZy5rZXkgJiYgdiAhPT0gYC0ke3RoaXMuc2V0dGluZy5rZXl9YCk7XG5cblx0XHRjb25zdCBkZWZhdWx0SWdub3JlZFNldHRpbmdzID0gZ2V0RGVmYXVsdElnbm9yZWRTZXR0aW5ncygpO1xuXHRcdGNvbnN0IGlzRGVmYXVsdElnbm9yZWQgPSBkZWZhdWx0SWdub3JlZFNldHRpbmdzLmluY2x1ZGVzKHRoaXMuc2V0dGluZy5rZXkpO1xuXHRcdGNvbnN0IGFza2VkVG9TeW5jID0gIXRoaXMuY2hlY2tlZDtcblxuXHRcdC8vIElmIGFza2VkIHRvIHN5bmMsIHRoZW4gYWRkIG9ubHkgaWYgaXQgaXMgaWdub3JlZCBieSBkZWZhdWx0XG5cdFx0aWYgKGFza2VkVG9TeW5jICYmIGlzRGVmYXVsdElnbm9yZWQpIHtcblx0XHRcdGN1cnJlbnRWYWx1ZS5wdXNoKGAtJHt0aGlzLnNldHRpbmcua2V5fWApO1xuXHRcdH1cblxuXHRcdC8vIElmIGFza2VkIG5vdCB0byBzeW5jLCB0aGVuIGFkZCBvbmx5IGlmIGl0IGlzIG5vdCBpZ25vcmVkIGJ5IGRlZmF1bHRcblx0XHRpZiAoIWFza2VkVG9TeW5jICYmICFpc0RlZmF1bHRJZ25vcmVkKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUucHVzaCh0aGlzLnNldHRpbmcua2V5KTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUoJ3NldHRpbmdzU3luYy5pZ25vcmVkU2V0dGluZ3MnLCBjdXJyZW50VmFsdWUubGVuZ3RoID8gY3VycmVudFZhbHVlIDogdW5kZWZpbmVkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cbn1cblxuY2xhc3MgQXBwbHlTZXR0aW5nVG9BbGxQcm9maWxlc0FjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXR0aW5ncy5hcHBseVRvQWxsUHJvZmlsZXMnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnYXBwbHlUb0FsbFByb2ZpbGVzJywgXCJBcHBseSBTZXR0aW5nIHRvIGFsbCBQcm9maWxlc1wiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNldHRpbmc6IElTZXR0aW5nLFxuXHRcdEBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWdTZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEFwcGx5U2V0dGluZ1RvQWxsUHJvZmlsZXNBY3Rpb24uSUQsIEFwcGx5U2V0dGluZ1RvQWxsUHJvZmlsZXNBY3Rpb24uTEFCRUwpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihjb25maWdTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSkoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKSB7XG5cdFx0Y29uc3QgYWxsUHJvZmlsZXNTZXR0aW5ncyA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxzdHJpbmdbXT4oQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpO1xuXHRcdHRoaXMuY2hlY2tlZCA9IGFsbFByb2ZpbGVzU2V0dGluZ3MuaW5jbHVkZXModGhpcy5zZXR0aW5nLmtleSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZmlyc3QgcmVtb3ZlIHRoZSBjdXJyZW50IHNldHRpbmcgY29tcGxldGVseSBmcm9tIGlnbm9yZWQgc2V0dGluZ3Ncblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxzdHJpbmdbXT4oQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpID8/IFtdO1xuXG5cdFx0aWYgKHRoaXMuY2hlY2tlZCkge1xuXHRcdFx0Y29uc3QgaWR4ID0gdmFsdWUuaW5kZXhPZih0aGlzLnNldHRpbmcua2V5KTtcblx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdHZhbHVlLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZS5wdXNoKHRoaXMuc2V0dGluZy5rZXkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1ZhbHVlID0gZGlzdGluY3QodmFsdWUpO1xuXHRcdGlmICh0aGlzLmNoZWNrZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlnU2VydmljZS51cGRhdGVWYWx1ZSh0aGlzLnNldHRpbmcua2V5LCB0aGlzLmNvbmZpZ1NlcnZpY2UuaW5zcGVjdCh0aGlzLnNldHRpbmcua2V5KS5hcHBsaWNhdGlvbj8udmFsdWUsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCk7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUoQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcsIG5ld1ZhbHVlLmxlbmd0aCA/IG5ld1ZhbHVlIDogdW5kZWZpbmVkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUoQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcsIG5ld1ZhbHVlLmxlbmd0aCA/IG5ld1ZhbHVlIDogdW5kZWZpbmVkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdFx0YXdhaXQgdGhpcy5jb25maWdTZXJ2aWNlLnVwZGF0ZVZhbHVlKHRoaXMuc2V0dGluZy5rZXksIHRoaXMuY29uZmlnU2VydmljZS5pbnNwZWN0KHRoaXMuc2V0dGluZy5rZXkpLnVzZXJMb2NhbD8udmFsdWUsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCk7XG5cdFx0fVxuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxTQUFTO0FBQ3JCLFlBQVksc0JBQXNCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBRWxDLFlBQVksVUFBVTtBQUN0QixTQUFTLGNBQWM7QUFDdkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBd0IsZ0JBQWdCO0FBQ3hDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsOEJBQTBEO0FBQ25FLFNBQTRCLGlCQUFpQjtBQUM3QyxTQUFTLFFBQVEsNEJBQTRCO0FBQzdDLFNBQVMsZUFBZTtBQUN4QixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUE4RSxzQkFBc0I7QUFDcEcsU0FBUyxRQUFpQixpQkFBaUI7QUFDM0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLGNBQWMsb0JBQW9CO0FBQ3hFLFNBQVMsYUFBYTtBQUN0QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFdBQVcseUJBQXlCO0FBQzdDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQix1QkFBdUIscUNBQXFDO0FBRTFGLFNBQVMsMEJB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
