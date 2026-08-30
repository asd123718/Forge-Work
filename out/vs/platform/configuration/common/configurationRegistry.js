import { distinct } from "../../../base/common/arrays.js";
import { Emitter } from "../../../base/common/event.js";
import * as types from "../../../base/common/types.js";
import * as nls from "../../../nls.js";
import { getLanguageTagSettingPlainKey } from "./configuration.js";
import { Extensions as JSONExtensions } from "../../jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../registry/common/platform.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import product from "../../product/common/product.js";
var EditPresentationTypes = /* @__PURE__ */ ((EditPresentationTypes2) => {
  EditPresentationTypes2["Multiline"] = "multilineText";
  EditPresentationTypes2["Singleline"] = "singlelineText";
  return EditPresentationTypes2;
})(EditPresentationTypes || {});
const Extensions = {
  Configuration: "base.contributions.configuration"
};
var ConfigurationScope = /* @__PURE__ */ ((ConfigurationScope2) => {
  ConfigurationScope2[ConfigurationScope2["APPLICATION"] = 1] = "APPLICATION";
  ConfigurationScope2[ConfigurationScope2["MACHINE"] = 2] = "MACHINE";
  ConfigurationScope2[ConfigurationScope2["APPLICATION_MACHINE"] = 3] = "APPLICATION_MACHINE";
  ConfigurationScope2[ConfigurationScope2["WINDOW"] = 4] = "WINDOW";
  ConfigurationScope2[ConfigurationScope2["RESOURCE"] = 5] = "RESOURCE";
  ConfigurationScope2[ConfigurationScope2["LANGUAGE_OVERRIDABLE"] = 6] = "LANGUAGE_OVERRIDABLE";
  ConfigurationScope2[ConfigurationScope2["MACHINE_OVERRIDABLE"] = 7] = "MACHINE_OVERRIDABLE";
  return ConfigurationScope2;
})(ConfigurationScope || {});
function isConfigurationDefaultSourceEquals(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (typeof a === "string" || typeof b === "string") {
    return a === b;
  }
  return a.id === b.id;
}
const allSettings = { properties: {}, patternProperties: {} };
const applicationSettings = { properties: {}, patternProperties: {} };
const applicationMachineSettings = { properties: {}, patternProperties: {} };
const machineSettings = { properties: {}, patternProperties: {} };
const machineOverridableSettings = { properties: {}, patternProperties: {} };
const windowSettings = { properties: {}, patternProperties: {} };
const resourceSettings = { properties: {}, patternProperties: {} };
const resourceLanguageSettingsSchemaId = "vscode://schemas/settings/resourceLanguage";
const configurationDefaultsSchemaId = "vscode://schemas/settings/configurationDefaults";
const contributionRegistry = Registry.as(JSONExtensions.JSONContribution);
class ConfigurationRegistry extends Disposable {
  constructor() {
    super();
    this.registeredConfigurationDefaults = [];
    /**
     * Agent-host-mirrored setting keys per node that were hidden with
     * `included: false`. Registration deletes those keys from the node's
     * `properties`, so deregistration has no other way to find them.
     */
    this.excludedAgentHostSyncKeys = /* @__PURE__ */ new Map();
    this.overrideIdentifiers = /* @__PURE__ */ new Set();
    this._onDidSchemaChange = this._register(new Emitter());
    this.onDidSchemaChange = this._onDidSchemaChange.event;
    this._onDidUpdateConfiguration = this._register(new Emitter());
    this.onDidUpdateConfiguration = this._onDidUpdateConfiguration.event;
    this.configurationDefaultsOverrides = /* @__PURE__ */ new Map();
    this.defaultLanguageConfigurationOverridesNode = {
      id: "defaultOverrides",
      title: nls.localize("defaultLanguageConfigurationOverrides.title", "Default Language Configuration Overrides"),
      properties: {}
    };
    this.configurationContributors = [this.defaultLanguageConfigurationOverridesNode];
    this.resourceLanguageSettingsSchema = {
      properties: {},
      patternProperties: {},
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    this.configurationProperties = {};
    this.policyConfigurations = /* @__PURE__ */ new Map();
    this.policyReferenceConfigurations = /* @__PURE__ */ new Map();
    this.agentHostSyncConfigurations = /* @__PURE__ */ new Map();
    this.excludedConfigurationProperties = {};
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this.registerOverridePropertyPatternKey();
  }
  registerConfiguration(configuration, validate = true) {
    this.registerConfigurations([configuration], validate);
    return configuration;
  }
  registerConfigurations(configurations, validate = true) {
    const properties = /* @__PURE__ */ new Set();
    this.doRegisterConfigurations(configurations, validate, properties);
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties });
  }
  deregisterConfigurations(configurations) {
    const properties = /* @__PURE__ */ new Set();
    this.doDeregisterConfigurations(configurations, properties);
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties });
  }
  updateConfigurations({ add, remove }) {
    const properties = /* @__PURE__ */ new Set();
    this.doDeregisterConfigurations(remove, properties);
    this.doRegisterConfigurations(add, false, properties);
    contributionRegistry.registerSchema(resourceLanguageSettingsSchemaId, this.resourceLanguageSettingsSchema);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties });
  }
  registerDefaultConfigurations(configurationDefaults) {
    const properties = /* @__PURE__ */ new Set();
    this.doRegisterDefaultConfigurations(configurationDefaults, properties);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
  }
  doRegisterDefaultConfigurations(configurationDefaults, bucket) {
    this.registeredConfigurationDefaults.push(...configurationDefaults);
    const overrideIdentifiers = [];
    for (const { overrides, source } of configurationDefaults) {
      for (const key in overrides) {
        bucket.add(key);
        const configurationDefaultOverridesForKey = this.configurationDefaultsOverrides.get(key) ?? this.configurationDefaultsOverrides.set(key, { configurationDefaultOverrides: [] }).get(key);
        const value = overrides[key];
        configurationDefaultOverridesForKey.configurationDefaultOverrides.push({ value, source });
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
          const newDefaultOverride = this.mergeDefaultConfigurationsForOverrideIdentifier(key, value, source, configurationDefaultOverridesForKey.configurationDefaultOverrideValue);
          if (!newDefaultOverride) {
            continue;
          }
          configurationDefaultOverridesForKey.configurationDefaultOverrideValue = newDefaultOverride;
          this.updateDefaultOverrideProperty(key, newDefaultOverride, source);
          overrideIdentifiers.push(...overrideIdentifiersFromKey(key));
        } else {
          const newDefaultOverride = this.mergeDefaultConfigurationsForConfigurationProperty(key, value, source, configurationDefaultOverridesForKey.configurationDefaultOverrideValue);
          if (!newDefaultOverride) {
            continue;
          }
          configurationDefaultOverridesForKey.configurationDefaultOverrideValue = newDefaultOverride;
          const property = this.configurationProperties[key];
          if (property) {
            this.updatePropertyDefaultValue(key, property);
            this.updateSchema(key, property);
          }
        }
      }
    }
    this.doRegisterOverrideIdentifiers(overrideIdentifiers);
  }
  deregisterDefaultConfigurations(defaultConfigurations) {
    const properties = /* @__PURE__ */ new Set();
    this.doDeregisterDefaultConfigurations(defaultConfigurations, properties);
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides: true });
  }
  doDeregisterDefaultConfigurations(defaultConfigurations, bucket) {
    for (const defaultConfiguration of defaultConfigurations) {
      const index = this.registeredConfigurationDefaults.indexOf(defaultConfiguration);
      if (index !== -1) {
        this.registeredConfigurationDefaults.splice(index, 1);
      }
    }
    for (const { overrides, source } of defaultConfigurations) {
      for (const key in overrides) {
        const configurationDefaultOverridesForKey = this.configurationDefaultsOverrides.get(key);
        if (!configurationDefaultOverridesForKey) {
          continue;
        }
        const index = configurationDefaultOverridesForKey.configurationDefaultOverrides.findIndex((configurationDefaultOverride) => source ? isConfigurationDefaultSourceEquals(configurationDefaultOverride.source, source) : configurationDefaultOverride.value === overrides[key]);
        if (index === -1) {
          continue;
        }
        configurationDefaultOverridesForKey.configurationDefaultOverrides.splice(index, 1);
        if (configurationDefaultOverridesForKey.configurationDefaultOverrides.length === 0) {
          this.configurationDefaultsOverrides.delete(key);
        }
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
          let configurationDefaultOverrideValue;
          for (const configurationDefaultOverride of configurationDefaultOverridesForKey.configurationDefaultOverrides) {
            configurationDefaultOverrideValue = this.mergeDefaultConfigurationsForOverrideIdentifier(key, configurationDefaultOverride.value, configurationDefaultOverride.source, configurationDefaultOverrideValue);
          }
          if (configurationDefaultOverrideValue && !types.isEmptyObject(configurationDefaultOverrideValue.value)) {
            configurationDefaultOverridesForKey.configurationDefaultOverrideValue = configurationDefaultOverrideValue;
            this.updateDefaultOverrideProperty(key, configurationDefaultOverrideValue, source);
          } else {
            this.configurationDefaultsOverrides.delete(key);
            delete this.configurationProperties[key];
            delete this.defaultLanguageConfigurationOverridesNode.properties[key];
          }
        } else {
          let configurationDefaultOverrideValue;
          for (const configurationDefaultOverride of configurationDefaultOverridesForKey.configurationDefaultOverrides) {
            configurationDefaultOverrideValue = this.mergeDefaultConfigurationsForConfigurationProperty(key, configurationDefaultOverride.value, configurationDefaultOverride.source, configurationDefaultOverrideValue);
          }
          configurationDefaultOverridesForKey.configurationDefaultOverrideValue = configurationDefaultOverrideValue;
          const property = this.configurationProperties[key];
          if (property) {
            this.updatePropertyDefaultValue(key, property);
            this.updateSchema(key, property);
          }
        }
        bucket.add(key);
      }
    }
    this.updateOverridePropertyPatternKey();
  }
  updateDefaultOverrideProperty(key, newDefaultOverride, source) {
    const property = {
      section: {
        id: this.defaultLanguageConfigurationOverridesNode.id,
        title: this.defaultLanguageConfigurationOverridesNode.title,
        order: this.defaultLanguageConfigurationOverridesNode.order,
        extensionInfo: this.defaultLanguageConfigurationOverridesNode.extensionInfo
      },
      type: "object",
      default: newDefaultOverride.value,
      description: nls.localize("defaultLanguageConfiguration.description", "Configure settings to be overridden for {0}.", getLanguageTagSettingPlainKey(key)),
      $ref: resourceLanguageSettingsSchemaId,
      defaultDefaultValue: newDefaultOverride.value,
      source,
      defaultValueSource: source
    };
    this.configurationProperties[key] = property;
    this.defaultLanguageConfigurationOverridesNode.properties[key] = property;
  }
  mergeDefaultConfigurationsForOverrideIdentifier(overrideIdentifier, configurationValueObject, valueSource, existingDefaultOverride) {
    const defaultValue = existingDefaultOverride?.value || {};
    const source = existingDefaultOverride?.source ?? /* @__PURE__ */ new Map();
    if (!(source instanceof Map)) {
      console.error("objectConfigurationSources is not a Map");
      return void 0;
    }
    for (const propertyKey of Object.keys(configurationValueObject)) {
      const propertyDefaultValue = configurationValueObject[propertyKey];
      const isObjectSetting = types.isObject(propertyDefaultValue) && (types.isUndefined(defaultValue[propertyKey]) || types.isObject(defaultValue[propertyKey]));
      if (isObjectSetting) {
        defaultValue[propertyKey] = { ...defaultValue[propertyKey] ?? {}, ...propertyDefaultValue };
        if (valueSource) {
          for (const objectKey in propertyDefaultValue) {
            source.set(`${propertyKey}.${objectKey}`, valueSource);
          }
        }
      } else {
        defaultValue[propertyKey] = propertyDefaultValue;
        if (valueSource) {
          source.set(propertyKey, valueSource);
        } else {
          source.delete(propertyKey);
        }
      }
    }
    return { value: defaultValue, source };
  }
  mergeDefaultConfigurationsForConfigurationProperty(propertyKey, value, valuesSource, existingDefaultOverride) {
    const property = this.configurationProperties[propertyKey];
    const existingDefaultValue = existingDefaultOverride?.value ?? property?.defaultDefaultValue;
    let source = valuesSource;
    const isObjectSetting = types.isObject(value) && (property !== void 0 && property.type === "object" || property === void 0 && (types.isUndefined(existingDefaultValue) || types.isObject(existingDefaultValue)));
    if (isObjectSetting) {
      source = existingDefaultOverride?.source ?? /* @__PURE__ */ new Map();
      if (!(source instanceof Map)) {
        console.error("defaultValueSource is not a Map");
        return void 0;
      }
      for (const objectKey in value) {
        if (valuesSource) {
          source.set(`${propertyKey}.${objectKey}`, valuesSource);
        }
      }
      value = { ...types.isObject(existingDefaultValue) ? existingDefaultValue : {}, ...value };
    }
    return { value, source };
  }
  deltaConfiguration(delta) {
    let defaultsOverrides = false;
    const properties = /* @__PURE__ */ new Set();
    if (delta.removedDefaults) {
      this.doDeregisterDefaultConfigurations(delta.removedDefaults, properties);
      defaultsOverrides = true;
    }
    if (delta.addedDefaults) {
      this.doRegisterDefaultConfigurations(delta.addedDefaults, properties);
      defaultsOverrides = true;
    }
    if (delta.removedConfigurations) {
      this.doDeregisterConfigurations(delta.removedConfigurations, properties);
    }
    if (delta.addedConfigurations) {
      this.doRegisterConfigurations(delta.addedConfigurations, false, properties);
    }
    this._onDidSchemaChange.fire();
    this._onDidUpdateConfiguration.fire({ properties, defaultsOverrides });
  }
  notifyConfigurationSchemaUpdated(...configurations) {
    this._onDidSchemaChange.fire();
  }
  registerOverrideIdentifiers(overrideIdentifiers) {
    this.doRegisterOverrideIdentifiers(overrideIdentifiers);
    this._onDidSchemaChange.fire();
  }
  doRegisterOverrideIdentifiers(overrideIdentifiers) {
    for (const overrideIdentifier of overrideIdentifiers) {
      this.overrideIdentifiers.add(overrideIdentifier);
    }
    this.updateOverridePropertyPatternKey();
  }
  doRegisterConfigurations(configurations, validate, bucket) {
    configurations.forEach((configuration) => {
      this.validateAndRegisterProperties(configuration, validate, configuration.extensionInfo, configuration.restrictedProperties, void 0, bucket);
      this.configurationContributors.push(configuration);
      this.registerJSONConfiguration(configuration);
    });
  }
  doDeregisterConfigurations(configurations, bucket) {
    const deregisterConfiguration = (configuration) => {
      const excludedSyncKeys = this.excludedAgentHostSyncKeys.get(configuration);
      if (excludedSyncKeys) {
        for (const key of excludedSyncKeys) {
          bucket.add(key);
          this.agentHostSyncConfigurations.delete(key);
        }
        this.excludedAgentHostSyncKeys.delete(configuration);
      }
      if (configuration.properties) {
        for (const key in configuration.properties) {
          bucket.add(key);
          const property = this.configurationProperties[key];
          if (property?.policy?.name) {
            this.policyConfigurations.delete(property.policy.name);
          }
          this.agentHostSyncConfigurations.delete(key);
          if (property?.policyReference?.name) {
            const refs = this.policyReferenceConfigurations.get(property.policyReference.name);
            if (refs) {
              refs.delete(key);
              if (refs.size === 0) {
                this.policyReferenceConfigurations.delete(property.policyReference.name);
              }
            }
          }
          delete this.configurationProperties[key];
          this.removeFromSchema(key, configuration.properties[key]);
        }
      }
      configuration.allOf?.forEach((node) => deregisterConfiguration(node));
    };
    for (const configuration of configurations) {
      deregisterConfiguration(configuration);
      const index = this.configurationContributors.indexOf(configuration);
      if (index !== -1) {
        this.configurationContributors.splice(index, 1);
      }
    }
  }
  validateAndRegisterProperties(configuration, validate = true, extensionInfo, restrictedProperties, scope = 4 /* WINDOW */, bucket) {
    scope = types.isUndefinedOrNull(configuration.scope) ? scope : configuration.scope;
    const properties = configuration.properties;
    if (properties) {
      for (const key in properties) {
        const property = properties[key];
        property.section = {
          id: configuration.id,
          title: configuration.title,
          order: configuration.order,
          extensionInfo: configuration.extensionInfo
        };
        if (validate && validateProperty(key, property, extensionInfo?.id)) {
          delete properties[key];
          continue;
        }
        property.source = extensionInfo;
        property.defaultDefaultValue = properties[key].default;
        this.updatePropertyDefaultValue(key, property);
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
          property.scope = void 0;
        } else {
          property.scope = types.isUndefinedOrNull(property.scope) ? scope : property.scope;
          property.restricted = types.isUndefinedOrNull(property.restricted) ? !!restrictedProperties?.includes(key) : property.restricted;
        }
        if (property.experiment) {
          if (!property.tags?.some((tag) => tag.toLowerCase() === "onexp")) {
            property.tags = property.tags ?? [];
            property.tags.push("onExP");
          }
        } else if (property.tags?.some((tag) => tag.toLowerCase() === "onexp")) {
          console.error(`Invalid tag 'onExP' found for property '${key}'. Please use 'experiment' property instead.`);
          property.experiment = { mode: "startup" };
        }
        const excluded = properties[key].hasOwnProperty("included") && !properties[key].included;
        const policyName = properties[key].policy?.name;
        const policyReferenceName = properties[key].policyReference?.name;
        const agentHostSync = properties[key].agentHost;
        if (agentHostSync) {
          this.agentHostSyncConfigurations.set(key, agentHostSync);
        }
        if (excluded) {
          this.excludedConfigurationProperties[key] = properties[key];
          if (policyName) {
            this.policyConfigurations.set(policyName, key);
            bucket.add(key);
          }
          if (policyReferenceName) {
            this.addPolicyReferenceConfiguration(policyReferenceName, key);
            bucket.add(key);
          }
          if (agentHostSync) {
            bucket.add(key);
            let excludedSyncKeys = this.excludedAgentHostSyncKeys.get(configuration);
            if (!excludedSyncKeys) {
              excludedSyncKeys = /* @__PURE__ */ new Set();
              this.excludedAgentHostSyncKeys.set(configuration, excludedSyncKeys);
            }
            excludedSyncKeys.add(key);
          }
          delete properties[key];
        } else {
          bucket.add(key);
          if (policyName) {
            this.policyConfigurations.set(policyName, key);
          }
          if (policyReferenceName) {
            this.addPolicyReferenceConfiguration(policyReferenceName, key);
          }
          this.configurationProperties[key] = properties[key];
          if (!properties[key].deprecationMessage && properties[key].markdownDeprecationMessage) {
            properties[key].deprecationMessage = properties[key].markdownDeprecationMessage;
          }
        }
      }
    }
    const subNodes = configuration.allOf;
    if (subNodes) {
      for (const node of subNodes) {
        this.validateAndRegisterProperties(node, validate, extensionInfo, restrictedProperties, scope, bucket);
      }
    }
  }
  addPolicyReferenceConfiguration(policyName, key) {
    let keys = this.policyReferenceConfigurations.get(policyName);
    if (!keys) {
      keys = /* @__PURE__ */ new Set();
      this.policyReferenceConfigurations.set(policyName, keys);
    }
    keys.add(key);
  }
  // Only for tests
  getConfigurations() {
    return this.configurationContributors;
  }
  getConfigurationProperties() {
    return this.configurationProperties;
  }
  getPolicyConfigurations() {
    return this.policyConfigurations;
  }
  getPolicyReferenceConfigurations() {
    return this.policyReferenceConfigurations;
  }
  getAgentHostSyncConfigurations() {
    return this.agentHostSyncConfigurations;
  }
  getExcludedConfigurationProperties() {
    return this.excludedConfigurationProperties;
  }
  getRegisteredDefaultConfigurations() {
    return [...this.registeredConfigurationDefaults];
  }
  getConfigurationDefaultsOverrides() {
    const configurationDefaultsOverrides = /* @__PURE__ */ new Map();
    for (const [key, value] of this.configurationDefaultsOverrides) {
      if (value.configurationDefaultOverrideValue) {
        configurationDefaultsOverrides.set(key, value.configurationDefaultOverrideValue);
      }
    }
    return configurationDefaultsOverrides;
  }
  registerJSONConfiguration(configuration) {
    const register = (configuration2) => {
      const properties = configuration2.properties;
      if (properties) {
        for (const key in properties) {
          this.updateSchema(key, properties[key]);
        }
      }
      const subNodes = configuration2.allOf;
      subNodes?.forEach(register);
    };
    register(configuration);
  }
  updateSchema(key, property) {
    allSettings.properties[key] = property;
    switch (property.scope) {
      case 1 /* APPLICATION */:
        applicationSettings.properties[key] = property;
        break;
      case 2 /* MACHINE */:
        machineSettings.properties[key] = property;
        break;
      case 3 /* APPLICATION_MACHINE */:
        applicationMachineSettings.properties[key] = property;
        break;
      case 7 /* MACHINE_OVERRIDABLE */:
        machineOverridableSettings.properties[key] = property;
        break;
      case 4 /* WINDOW */:
        windowSettings.properties[key] = property;
        break;
      case 5 /* RESOURCE */:
        resourceSettings.properties[key] = property;
        break;
      case 6 /* LANGUAGE_OVERRIDABLE */:
        resourceSettings.properties[key] = property;
        this.resourceLanguageSettingsSchema.properties[key] = property;
        break;
    }
  }
  removeFromSchema(key, property) {
    delete allSettings.properties[key];
    switch (property.scope) {
      case 1 /* APPLICATION */:
        delete applicationSettings.properties[key];
        break;
      case 2 /* MACHINE */:
        delete machineSettings.properties[key];
        break;
      case 3 /* APPLICATION_MACHINE */:
        delete applicationMachineSettings.properties[key];
        break;
      case 7 /* MACHINE_OVERRIDABLE */:
        delete machineOverridableSettings.properties[key];
        break;
      case 4 /* WINDOW */:
        delete windowSettings.properties[key];
        break;
      case 5 /* RESOURCE */:
      case 6 /* LANGUAGE_OVERRIDABLE */:
        delete resourceSettings.properties[key];
        delete this.resourceLanguageSettingsSchema.properties[key];
        break;
    }
  }
  updateOverridePropertyPatternKey() {
    for (const overrideIdentifier of this.overrideIdentifiers.values()) {
      const overrideIdentifierProperty = `[${overrideIdentifier}]`;
      const resourceLanguagePropertiesSchema = {
        type: "object",
        description: nls.localize("overrideSettings.defaultDescription", "Configure editor settings to be overridden for a language."),
        errorMessage: nls.localize("overrideSettings.errorMessage", "This setting does not support per-language configuration."),
        $ref: resourceLanguageSettingsSchemaId
      };
      this.updatePropertyDefaultValue(overrideIdentifierProperty, resourceLanguagePropertiesSchema);
      allSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      applicationSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      applicationMachineSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      machineSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      machineOverridableSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      windowSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
      resourceSettings.properties[overrideIdentifierProperty] = resourceLanguagePropertiesSchema;
    }
  }
  registerOverridePropertyPatternKey() {
    const resourceLanguagePropertiesSchema = {
      type: "object",
      description: nls.localize("overrideSettings.defaultDescription", "Configure editor settings to be overridden for a language."),
      errorMessage: nls.localize("overrideSettings.errorMessage", "This setting does not support per-language configuration."),
      $ref: resourceLanguageSettingsSchemaId
    };
    allSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    applicationSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    applicationMachineSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    machineSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    machineOverridableSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    windowSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    resourceSettings.patternProperties[OVERRIDE_PROPERTY_PATTERN] = resourceLanguagePropertiesSchema;
    this._onDidSchemaChange.fire();
  }
  updatePropertyDefaultValue(key, property) {
    const configurationdefaultOverride = this.configurationDefaultsOverrides.get(key)?.configurationDefaultOverrideValue;
    let defaultValue = void 0;
    let defaultSource = void 0;
    if (configurationdefaultOverride && (!property.disallowConfigurationDefault || !configurationdefaultOverride.source)) {
      defaultValue = configurationdefaultOverride.value;
      defaultSource = configurationdefaultOverride.source;
    }
    if (types.isUndefined(defaultValue)) {
      defaultValue = property.defaultDefaultValue;
      defaultSource = void 0;
    }
    if (types.isUndefined(defaultValue)) {
      defaultValue = getDefaultValue(property.type);
    }
    property.default = defaultValue;
    property.defaultValueSource = defaultSource;
  }
}
const OVERRIDE_IDENTIFIER_PATTERN = `\\[([^\\]]+)\\]`;
const OVERRIDE_IDENTIFIER_REGEX = new RegExp(OVERRIDE_IDENTIFIER_PATTERN, "g");
const OVERRIDE_PROPERTY_PATTERN = `^(${OVERRIDE_IDENTIFIER_PATTERN})+$`;
const OVERRIDE_PROPERTY_REGEX = new RegExp(OVERRIDE_PROPERTY_PATTERN);
function overrideIdentifiersFromKey(key) {
  const identifiers = [];
  if (OVERRIDE_PROPERTY_REGEX.test(key)) {
    let matches = OVERRIDE_IDENTIFIER_REGEX.exec(key);
    while (matches?.length) {
      const identifier = matches[1].trim();
      if (identifier) {
        identifiers.push(identifier);
      }
      matches = OVERRIDE_IDENTIFIER_REGEX.exec(key);
    }
  }
  return distinct(identifiers);
}
function keyFromOverrideIdentifiers(overrideIdentifiers) {
  return overrideIdentifiers.reduce((result, overrideIdentifier) => `${result}[${overrideIdentifier}]`, "");
}
function getDefaultValue(type) {
  const t = Array.isArray(type) ? type[0] : type;
  switch (t) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "string":
      return "";
    case "array":
      return [];
    case "object":
      return {};
    default:
      return null;
  }
}
const configurationRegistry = new ConfigurationRegistry();
Registry.add(Extensions.Configuration, configurationRegistry);
function validateProperty(property, schema, extensionId) {
  if (!property.trim()) {
    return nls.localize("config.property.empty", "Cannot register an empty property");
  }
  if (OVERRIDE_PROPERTY_REGEX.test(property)) {
    return nls.localize("config.property.languageDefault", "Cannot register '{0}'. This matches property pattern '\\\\[.*\\\\]$' for describing language specific editor settings. Use 'configurationDefaults' contribution.", property);
  }
  if (configurationRegistry.getConfigurationProperties()[property] !== void 0 && (!extensionId || !EXTENSION_UNIFICATION_EXTENSION_IDS.has(extensionId.toLowerCase()))) {
    return nls.localize("config.property.duplicate", "Cannot register '{0}'. This property is already registered.", property);
  }
  if (schema.policy && schema.policyReference) {
    return nls.localize("config.policy.bothPolicyAndReference", "Cannot register '{0}'. A setting must not declare both 'policy' and 'policyReference'.", property);
  }
  if (schema.policy?.name && configurationRegistry.getPolicyConfigurations().get(schema.policy?.name) !== void 0) {
    return nls.localize("config.policy.duplicate", "Cannot register '{0}'. The associated policy {1} is already registered with {2}. To attach another setting to the same policy, use 'policyReference'.", property, schema.policy?.name, configurationRegistry.getPolicyConfigurations().get(schema.policy?.name));
  }
  if (schema.agentHost) {
    for (const [owner, sync] of configurationRegistry.getAgentHostSyncConfigurations()) {
      if (sync.key === schema.agentHost.key && owner !== property) {
        return nls.localize("config.agentHost.duplicate", "Cannot register '{0}'. The agent host configuration key '{1}' is already mirrored from '{2}'.", property, schema.agentHost.key, owner);
      }
    }
  }
  return null;
}
function getScopes() {
  const scopes = [];
  const configurationProperties = configurationRegistry.getConfigurationProperties();
  for (const key of Object.keys(configurationProperties)) {
    scopes.push([key, configurationProperties[key].scope]);
  }
  scopes.push(["launch", 5 /* RESOURCE */]);
  scopes.push(["task", 5 /* RESOURCE */]);
  return scopes;
}
function getAllConfigurationProperties(configurationNode) {
  const result = {};
  for (const configuration of configurationNode) {
    const properties = configuration.properties;
    if (types.isObject(properties)) {
      for (const key in properties) {
        result[key] = properties[key];
      }
    }
    if (configuration.allOf) {
      Object.assign(result, getAllConfigurationProperties(configuration.allOf));
    }
  }
  return result;
}
function parseScope(scope) {
  switch (scope) {
    case "application":
      return 1 /* APPLICATION */;
    case "machine":
      return 2 /* MACHINE */;
    case "resource":
      return 5 /* RESOURCE */;
    case "machine-overridable":
      return 7 /* MACHINE_OVERRIDABLE */;
    case "language-overridable":
      return 6 /* LANGUAGE_OVERRIDABLE */;
    default:
      return 4 /* WINDOW */;
  }
}
const EXTENSION_UNIFICATION_EXTENSION_IDS = new Set(product.defaultChatAgent ? [product.defaultChatAgent.extensionId, product.defaultChatAgent.chatExtensionId].map((id) => id.toLowerCase()) : []);
export {
  ConfigurationScope,
  EXTENSION_UNIFICATION_EXTENSION_IDS,
  EditPresentationTypes,
  Extensions,
  OVERRIDE_PROPERTY_PATTERN,
  OVERRIDE_PROPERTY_REGEX,
  allSettings,
  applicationMachineSettings,
  applicationSettings,
  configurationDefaultsSchemaId,
  getAllConfigurationProperties,
  getDefaultValue,
  getScopes,
  isConfigurationDefaultSourceEquals,
  keyFromOverrideIdentifiers,
  machineOverridableSettings,
  machineSettings,
  overrideIdentifiersFromKey,
  parseScope,
  resourceLanguageSettingsSchemaId,
  resourceSettings,
  validateProperty,
  windowSettings
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29uZmlndXJhdGlvblxcY29tbW9uXFxjb25maWd1cmF0aW9uUmVnaXN0cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0TGFuZ3VhZ2VUYWdTZXR0aW5nUGxhaW5LZXkgfSBmcm9tICcuL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVBvbGljeSwgSVBvbGljeVJlZmVyZW5jZSwgUG9saWN5TmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuXG5leHBvcnQgZW51bSBFZGl0UHJlc2VudGF0aW9uVHlwZXMge1xuXHRNdWx0aWxpbmUgPSAnbXVsdGlsaW5lVGV4dCcsXG5cdFNpbmdsZWxpbmUgPSAnc2luZ2xlbGluZVRleHQnXG59XG5cbmV4cG9ydCBjb25zdCBFeHRlbnNpb25zID0ge1xuXHRDb25maWd1cmF0aW9uOiAnYmFzZS5jb250cmlidXRpb25zLmNvbmZpZ3VyYXRpb24nXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWd1cmF0aW9uRGVsdGEge1xuXHRyZW1vdmVkRGVmYXVsdHM/OiBJQ29uZmlndXJhdGlvbkRlZmF1bHRzW107XG5cdHJlbW92ZWRDb25maWd1cmF0aW9ucz86IElDb25maWd1cmF0aW9uTm9kZVtdO1xuXHRhZGRlZERlZmF1bHRzPzogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdO1xuXHRhZGRlZENvbmZpZ3VyYXRpb25zPzogSUNvbmZpZ3VyYXRpb25Ob2RlW107XG59XG5cbi8qKlxuICogRGVjbGFyZXMgdGhhdCBhIHNldHRpbmcncyB2YWx1ZSBzaG91bGQgYmUgbWlycm9yZWQgaW50byB0aGUgYWdlbnQgaG9zdCdzIHJvb3RcbiAqIGNvbmZpZ3VyYXRpb24sIHJlbW92aW5nIHRoZSBuZWVkIHRvIGhhbmQtd3JpdGUgYSBmb3J3YXJkZXIgcGVyIHNldHRpbmcuXG4gKlxuICogT25seSB0aGUgc2V0dGluZydzICpnbG9iYWxseS1zY29wZWQqIHZhbHVlIGlzIG1pcnJvcmVkIFx1MjAxNCB0aGUgcmVzb2x1dGlvbiBvcmRlclxuICogaXMgcG9saWN5LCB0aGVuIHVzZXIsIHRoZW4gYXBwbGljYXRpb24sIHRoZW4gZGVmYXVsdC4gV29ya3NwYWNlIGFuZCBmb2xkZXJcbiAqIHZhbHVlcyBhcmUgZGVsaWJlcmF0ZWx5IGlnbm9yZWQ6IHRoZSBhZ2VudCBob3N0IHJvb3QgY29uZmlnIGlzIHNoYXJlZCBieSBldmVyeVxuICogd2luZG93IGNvbm5lY3RlZCB0byBhIGhvc3QsIHNvIGEgd29ya3NwYWNlLXNwZWNpZmljIHZhbHVlIHdvdWxkIGxlYWsgYWNyb3NzXG4gKiB1bnJlbGF0ZWQgd2luZG93cyBvbiBhIGxhc3Qtd3JpdGVyLXdpbnMgYmFzaXMuXG4gKlxuICogQSBzZXR0aW5nIHRoYXQgZ2VudWluZWx5IG5lZWRzIHBlci13b3Jrc3BhY2UgYmVoYXZpb3Igc2hvdWxkIG5vdCB1c2UgdGhpcztcbiAqIHB1c2ggaXQgdGhyb3VnaCBzZXNzaW9uIGNvbmZpZyBpbnN0ZWFkLCB3aGVyZSB0aGUgc2Vzc2lvbiBcdTIxOTIgcGFyZW50IFx1MjE5MiBob3N0XG4gKiBjaGFpbiByZXNvbHZlcyBwcmVjZWRlbmNlIGNvcnJlY3RseS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0Q29uZmlndXJhdGlvblN5bmMge1xuXG5cdC8qKiBUaGUgYWdlbnQgaG9zdCByb290IGNvbmZpZ3VyYXRpb24ga2V5IHRvIHdyaXRlIHRoZSB2YWx1ZSB0by4gKi9cblx0cmVhZG9ubHkga2V5OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE1hcHMgdGhlIGdsb2JhbGx5LXNjb3BlZCBzZXR0aW5nIHZhbHVlIHRvIHRoZSB2YWx1ZSB3cml0dGVuIHRvIHtAbGluayBrZXl9LlxuXHQgKiBEZWZhdWx0cyB0byB0aGUgaWRlbnRpdHksIHdoaWNoIGlzIHdoYXQgbW9zdCBzZXR0aW5ncyB3YW50OiB0aGUgcmVzb2x2ZXJcblx0ICogYWxyZWFkeSBza2lwcyBsYXllcnMgd2hvc2UgdmFsdWUgZG9lcyBub3QgY29uZm9ybSB0byB0aGUgZGVjbGFyZWQgYHR5cGVgXG5cdCAqIGFuZCBmYWxscyBiYWNrIHRvIHRoZSByZWdpc3RlcmVkIGRlZmF1bHQsIHNvIGEgdHJhbnNmb3JtIGlzIG9ubHkgbmVlZGVkIHRvXG5cdCAqIGNoYW5nZSB0aGUgKnNoYXBlKiBvZiB0aGUgdmFsdWUgKGZvciBleGFtcGxlIG1hcHBpbmcgYW4gZW51bSB0byBhXG5cdCAqIGRpZmZlcmVudCByZXByZXNlbnRhdGlvbiB0aGUgYWdlbnQgaG9zdCBleHBlY3RzKS5cblx0ICovXG5cdHJlYWRvbmx5IHRyYW5zZm9ybT86ICh2YWx1ZTogdW5rbm93bikgPT4gdW5rbm93bjtcblxuXHQvKipcblx0ICogV2hlbiBgdHJ1ZWAsIHRoZSB2YWx1ZSBpcyBvbmx5IG1pcnJvcmVkIHRvIGEgbG9jYWwgYWdlbnQgaG9zdCwgYW5kIG5ldmVyIHRvXG5cdCAqIGEgcmVtb3RlIG9uZS4gVXNlIGZvciBzZXR0aW5ncyB0aGF0IGRlc2NyaWJlIHRoZSBjbGllbnQncyBvd24gbWFjaGluZSBcdTIwMTRcblx0ICogZmlsZXN5c3RlbSBwYXRocywgbWFjaGluZSBpZGVudGl0eSBcdTIwMTQgd2hpY2ggYXJlIG1lYW5pbmdsZXNzIG9uIGEgcmVtb3RlXG5cdCAqIGhvc3QuIERlZmF1bHRzIHRvIGBmYWxzZWAsIG1pcnJvcmluZyB0byBldmVyeSBhZ2VudCBob3N0LlxuXHQgKi9cblx0cmVhZG9ubHkgbG9jYWxPbmx5PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IHtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBjb25maWd1cmF0aW9uIHRvIHRoZSByZWdpc3RyeS5cblx0ICovXG5cdHJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUpOiBJQ29uZmlndXJhdGlvbk5vZGU7XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIG11bHRpcGxlIGNvbmZpZ3VyYXRpb25zIHRvIHRoZSByZWdpc3RyeS5cblx0ICovXG5cdHJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdLCB2YWxpZGF0ZT86IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEZXJlZ2lzdGVyIG11bHRpcGxlIGNvbmZpZ3VyYXRpb25zIGZyb20gdGhlIHJlZ2lzdHJ5LlxuXHQgKi9cblx0ZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25zOiBJQ29uZmlndXJhdGlvbk5vZGVbXSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIHVwZGF0ZSB0aGUgY29uZmlndXJhdGlvbiByZWdpc3RyeSBieVxuXHQgKiBcdC0gcmVnaXN0ZXJpbmcgdGhlIGNvbmZpZ3VyYXRpb25zIHRvIGFkZFxuXHQgKiBcdC0gZGVyZWlnc3RlcmluZyB0aGUgY29uZmlndXJhdGlvbnMgdG8gcmVtb3ZlXG5cdCAqL1xuXHR1cGRhdGVDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uczogeyBhZGQ6IElDb25maWd1cmF0aW9uTm9kZVtdOyByZW1vdmU6IElDb25maWd1cmF0aW9uTm9kZVtdIH0pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBtdWx0aXBsZSBkZWZhdWx0IGNvbmZpZ3VyYXRpb25zIHRvIHRoZSByZWdpc3RyeS5cblx0ICovXG5cdHJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGRlZmF1bHRDb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdKTogdm9pZDtcblxuXHQvKipcblx0ICogRGVyZWdpc3RlciBtdWx0aXBsZSBkZWZhdWx0IGNvbmZpZ3VyYXRpb25zIGZyb20gdGhlIHJlZ2lzdHJ5LlxuXHQgKi9cblx0ZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhkZWZhdWx0Q29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uRGVmYXVsdHNbXSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEJ1bGsgdXBkYXRlIG9mIHRoZSBjb25maWd1cmF0aW9uIHJlZ2lzdHJ5IChkZWZhdWx0IGFuZCBjb25maWd1cmF0aW9ucywgcmVtb3ZlIGFuZCBhZGQpXG5cdCAqIEBwYXJhbSBkZWx0YVxuXHQgKi9cblx0ZGVsdGFDb25maWd1cmF0aW9uKGRlbHRhOiBJQ29uZmlndXJhdGlvbkRlbHRhKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSByZWdpc3RlcmVkIGRlZmF1bHQgY29uZmlndXJhdGlvbnNcblx0ICovXG5cdGdldFJlZ2lzdGVyZWREZWZhdWx0Q29uZmlndXJhdGlvbnMoKTogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIHJlZ2lzdGVyZWQgY29uZmlndXJhdGlvbiBkZWZhdWx0cyBvdmVycmlkZXNcblx0ICovXG5cdGdldENvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcygpOiBNYXA8c3RyaW5nLCBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlPjtcblxuXHQvKipcblx0ICogU2lnbmFsIHRoYXQgdGhlIHNjaGVtYSBvZiBhIGNvbmZpZ3VyYXRpb24gc2V0dGluZyBoYXMgY2hhbmdlcy4gSXQgaXMgY3VycmVudGx5IG9ubHkgc3VwcG9ydGVkIHRvIGNoYW5nZSBlbnVtZXJhdGlvbiB2YWx1ZXMuXG5cdCAqIFByb3BlcnR5IG9yIGRlZmF1bHQgdmFsdWUgY2hhbmdlcyBhcmUgbm90IGFsbG93ZWQuXG5cdCAqL1xuXHRub3RpZnlDb25maWd1cmF0aW9uU2NoZW1hVXBkYXRlZCguLi5jb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBFdmVudCB0aGF0IGZpcmVzIHdoZW5ldmVyIGEgY29uZmlndXJhdGlvbiBoYXMgYmVlblxuXHQgKiByZWdpc3RlcmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTY2hlbWFDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBFdmVudCB0aGF0IGZpcmVzIHdoZW5ldmVyIGEgY29uZmlndXJhdGlvbiBoYXMgYmVlblxuXHQgKiByZWdpc3RlcmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRVcGRhdGVDb25maWd1cmF0aW9uOiBFdmVudDx7IHByb3BlcnRpZXM6IFJlYWRvbmx5U2V0PHN0cmluZz47IGRlZmF1bHRzT3ZlcnJpZGVzPzogYm9vbGVhbiB9PjtcblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgY29uZmlndXJhdGlvbiBub2RlcyBjb250cmlidXRlZCB0byB0aGlzIHJlZ2lzdHJ5LlxuXHQgKi9cblx0Z2V0Q29uZmlndXJhdGlvbnMoKTogSUNvbmZpZ3VyYXRpb25Ob2RlW107XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGNvbmZpZ3VyYXRpb25zIHNldHRpbmdzIG9mIGFsbCBjb25maWd1cmF0aW9uIG5vZGVzIGNvbnRyaWJ1dGVkIHRvIHRoaXMgcmVnaXN0cnkuXG5cdCAqL1xuXHRnZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG93bmluZyBzZXR0aW5nIGtleSBwZXIgcG9saWN5IG5hbWUgKGF0IG1vc3Qgb25lIG93bmVyIHBlciBuYW1lKS5cblx0ICovXG5cdGdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCk6IE1hcDxQb2xpY3lOYW1lLCBzdHJpbmc+O1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSByZWZlcmVuY2luZyBzZXR0aW5nIGtleXMgcGVyIHBvbGljeSBuYW1lLlxuXHQgKi9cblx0Z2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKTogTWFwPFBvbGljeU5hbWUsIFNldDxzdHJpbmc+PjtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUge0BsaW5rIElBZ2VudEhvc3RDb25maWd1cmF0aW9uU3luY30gZGVzY3JpcHRvciBwZXIgc2V0dGluZyBrZXlcblx0ICogZm9yIGV2ZXJ5IHNldHRpbmcgdGhhdCBkZWNsYXJlcyBvbmUuIEluY2x1ZGVzIHNldHRpbmdzIGhpZGRlbiBmcm9tIHRoZVxuXHQgKiBTZXR0aW5ncyBVSSB2aWEgYGluY2x1ZGVkOiBmYWxzZWAsIHdoaWNoIGFyZSBhYnNlbnQgZnJvbVxuXHQgKiB7QGxpbmsgZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXN9LlxuXHQgKi9cblx0Z2V0QWdlbnRIb3N0U3luY0NvbmZpZ3VyYXRpb25zKCk6IE1hcDxzdHJpbmcsIElBZ2VudEhvc3RDb25maWd1cmF0aW9uU3luYz47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGV4Y2x1ZGVkIGNvbmZpZ3VyYXRpb25zIHNldHRpbmdzIG9mIGFsbCBjb25maWd1cmF0aW9uIG5vZGVzIGNvbnRyaWJ1dGVkIHRvIHRoaXMgcmVnaXN0cnkuXG5cdCAqL1xuXHRnZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgdGhlIGlkZW50aWZpZXJzIGZvciBlZGl0b3IgY29uZmlndXJhdGlvbnNcblx0ICovXG5cdHJlZ2lzdGVyT3ZlcnJpZGVJZGVudGlmaWVycyhpZGVudGlmaWVyczogc3RyaW5nW10pOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDb25maWd1cmF0aW9uU2NvcGUge1xuXHQvKipcblx0ICogQXBwbGljYXRpb24gc3BlY2lmaWMgY29uZmlndXJhdGlvbiwgd2hpY2ggY2FuIGJlIGNvbmZpZ3VyZWQgb25seSBpbiBkZWZhdWx0IHByb2ZpbGUgdXNlciBzZXR0aW5ncy5cblx0ICovXG5cdEFQUExJQ0FUSU9OID0gMSxcblx0LyoqXG5cdCAqIE1hY2hpbmUgc3BlY2lmaWMgY29uZmlndXJhdGlvbiwgd2hpY2ggY2FuIGJlIGNvbmZpZ3VyZWQgb25seSBpbiBsb2NhbCBhbmQgcmVtb3RlIHVzZXIgc2V0dGluZ3MuXG5cdCAqL1xuXHRNQUNISU5FLFxuXHQvKipcblx0ICogQW4gYXBwbGljYXRpb24gbWFjaGluZSBzcGVjaWZpYyBjb25maWd1cmF0aW9uLCB3aGljaCBjYW4gYmUgY29uZmlndXJlZCBvbmx5IGluIGRlZmF1bHQgcHJvZmlsZSB1c2VyIHNldHRpbmdzIGFuZCByZW1vdGUgdXNlciBzZXR0aW5ncy5cblx0ICovXG5cdEFQUExJQ0FUSU9OX01BQ0hJTkUsXG5cdC8qKlxuXHQgKiBXaW5kb3cgc3BlY2lmaWMgY29uZmlndXJhdGlvbiwgd2hpY2ggY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIHVzZXIgb3Igd29ya3NwYWNlIHNldHRpbmdzLlxuXHQgKi9cblx0V0lORE9XLFxuXHQvKipcblx0ICogUmVzb3VyY2Ugc3BlY2lmaWMgY29uZmlndXJhdGlvbiwgd2hpY2ggY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIHVzZXIsIHdvcmtzcGFjZSBvciBmb2xkZXIgc2V0dGluZ3MuXG5cdCAqL1xuXHRSRVNPVVJDRSxcblx0LyoqXG5cdCAqIFJlc291cmNlIHNwZWNpZmljIGNvbmZpZ3VyYXRpb24gdGhhdCBjYW4gYmUgY29uZmlndXJlZCBpbiBsYW5ndWFnZSBzcGVjaWZpYyBzZXR0aW5nc1xuXHQgKi9cblx0TEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdC8qKlxuXHQgKiBNYWNoaW5lIHNwZWNpZmljIGNvbmZpZ3VyYXRpb24gdGhhdCBjYW4gYWxzbyBiZSBjb25maWd1cmVkIGluIHdvcmtzcGFjZSBvciBmb2xkZXIgc2V0dGluZ3MuXG5cdCAqL1xuXHRNQUNISU5FX09WRVJSSURBQkxFLFxufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSBleHRlbmRzIElKU09OU2NoZW1hIHtcblxuXHRzY29wZT86IENvbmZpZ3VyYXRpb25TY29wZTtcblxuXHQvKipcblx0ICogV2hlbiByZXN0cmljdGVkLCB2YWx1ZSBvZiB0aGlzIGNvbmZpZ3VyYXRpb24gd2lsbCBiZSByZWFkIG9ubHkgZnJvbSB0cnVzdGVkIHNvdXJjZXMuXG5cdCAqIEZvciBlZy4sIElmIHRoZSB3b3Jrc3BhY2UgaXMgbm90IHRydXN0ZWQsIHRoZW4gdGhlIHZhbHVlIG9mIHRoaXMgY29uZmlndXJhdGlvbiBpcyBub3QgcmVhZCBmcm9tIHdvcmtzcGFjZSBzZXR0aW5ncyBmaWxlLlxuXHQgKi9cblx0cmVzdHJpY3RlZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gYGZhbHNlYCB0aGlzIHByb3BlcnR5IGlzIGV4Y2x1ZGVkIGZyb20gdGhlIHJlZ2lzdHJ5LiBEZWZhdWx0IGlzIHRvIGluY2x1ZGUuXG5cdCAqL1xuXHRpbmNsdWRlZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIExpc3Qgb2YgdGFncyBhc3NvY2lhdGVkIHRvIHRoZSBwcm9wZXJ0eS5cblx0ICogIC0gQSB0YWcgY2FuIGJlIHVzZWQgZm9yIGZpbHRlcmluZ1xuXHQgKiAgLSBVc2UgYGV4cGVyaW1lbnRhbGAgdGFnIGZvciBtYXJraW5nIHRoZSBzZXR0aW5nIGFzIGV4cGVyaW1lbnRhbC5cblx0ICovXG5cdHRhZ3M/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogV2hlbiBlbmFibGVkIHRoaXMgc2V0dGluZyBpcyBpZ25vcmVkIGR1cmluZyBzeW5jIGFuZCB1c2VyIGNhbiBvdmVycmlkZSB0aGlzLlxuXHQgKi9cblx0aWdub3JlU3luYz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gZW5hYmxlZCB0aGlzIHNldHRpbmcgaXMgaWdub3JlZCBkdXJpbmcgc3luYyBhbmQgdXNlciBjYW5ub3Qgb3ZlcnJpZGUgdGhpcy5cblx0ICovXG5cdGRpc2FsbG93U3luY0lnbm9yZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIERpc2FsbG93IGV4dGVuc2lvbnMgdG8gY29udHJpYnV0ZSBjb25maWd1cmF0aW9uIGRlZmF1bHQgdmFsdWUgZm9yIHRoaXMgc2V0dGluZy5cblx0ICovXG5cdGRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBMYWJlbHMgZm9yIGVudW1lcmF0aW9uIGl0ZW1zXG5cdCAqL1xuXHRlbnVtSXRlbUxhYmVscz86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBrZXl3b3JkcyB1c2VkIGZvciBzZWFyY2ggcHVycG9zZXMuXG5cdCAqL1xuXHRrZXl3b3Jkcz86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHNwZWNpZmllZCwgY29udHJvbHMgdGhlIHByZXNlbnRhdGlvbiBmb3JtYXQgb2Ygc3RyaW5nIHNldHRpbmdzLlxuXHQgKiBPdGhlcndpc2UsIHRoZSBwcmVzZW50YXRpb24gZm9ybWF0IGRlZmF1bHRzIHRvIGBzaW5nbGVsaW5lYC5cblx0ICovXG5cdGVkaXRQcmVzZW50YXRpb24/OiBFZGl0UHJlc2VudGF0aW9uVHlwZXM7XG5cblx0LyoqXG5cdCAqIFdoZW4gc3BlY2lmaWVkLCBnaXZlcyBhbiBvcmRlciBudW1iZXIgZm9yIHRoZSBzZXR0aW5nXG5cdCAqIHdpdGhpbiB0aGUgc2V0dGluZ3MgZWRpdG9yLiBPdGhlcndpc2UsIHRoZSBzZXR0aW5nIGlzIHBsYWNlZCBhdCB0aGUgZW5kLlxuXHQgKi9cblx0b3JkZXI/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFdoZW4gc3BlY2lmaWVkLCB0aGlzIHNldHRpbmcncyB2YWx1ZSBjYW4gYWx3YXlzIGJlIG92ZXJ3cml0dGVuIGJ5XG5cdCAqIGEgc3lzdGVtLXdpZGUgcG9saWN5LiBFeGFjdGx5IG9uZSBzZXR0aW5nIG1heSAqb3duKiBhIGdpdmVuIHBvbGljeSBuYW1lLlxuXHQgKi9cblx0cG9saWN5PzogSVBvbGljeTtcblxuXHQvKipcblx0ICogV2hlbiBzcGVjaWZpZWQsIHRoaXMgc2V0dGluZyBpcyBnb3Zlcm5lZCBieSBhIHBvbGljeSBvd25lZCBieSBhbm90aGVyIHNldHRpbmcuXG5cdCAqIEEgc2V0dGluZyBtdXN0IG5vdCBkZWNsYXJlIGJvdGggYHBvbGljeWAgYW5kIGBwb2xpY3lSZWZlcmVuY2VgLlxuXHQgKiBUaGUgdHlwZSBtdXN0IG1hdGNoIHRoZSBvd25pbmcgc2V0dGluZyAoZW5mb3JjZWQgd2hlbiBleHBvcnRpbmcgdGhlIHBvbGljeSBjYXRhbG9nKS5cblx0ICovXG5cdHBvbGljeVJlZmVyZW5jZT86IElQb2xpY3lSZWZlcmVuY2U7XG5cblx0LyoqXG5cdCAqIFdoZW4gc3BlY2lmaWVkLCB0aGlzIHNldHRpbmcncyBnbG9iYWxseS1zY29wZWQgdmFsdWUgaXMgbWlycm9yZWQgaW50byB0aGVcblx0ICogYWdlbnQgaG9zdCdzIHJvb3QgY29uZmlndXJhdGlvbiBhdXRvbWF0aWNhbGx5LCB3aXRob3V0IGFueSBwZXItc2V0dGluZ1xuXHQgKiBwbHVtYmluZy4gU2VlIHtAbGluayBJQWdlbnRIb3N0Q29uZmlndXJhdGlvblN5bmN9LlxuXHQgKi9cblx0YWdlbnRIb3N0PzogSUFnZW50SG9zdENvbmZpZ3VyYXRpb25TeW5jO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHNwZWNpZmllZCwgdGhpcyBzZXR0aW5nJ3MgZGVmYXVsdCB2YWx1ZSBjYW4gYWx3YXlzIGJlIG92ZXJ3cml0dGVuIGJ5XG5cdCAqIGFuIGV4cGVyaW1lbnQuXG5cdCAqL1xuXHRleHBlcmltZW50Pzoge1xuXHRcdC8qKlxuXHRcdCAqIFRoZSBtb2RlIG9mIHRoZSBleHBlcmltZW50LlxuXHRcdCAqIC0gYHN0YXJ0dXBgOiBUaGUgc2V0dGluZyB2YWx1ZSBpcyB1cGRhdGVkIHRvIHRoZSBleHBlcmltZW50IHZhbHVlIG9ubHkgb24gc3RhcnR1cC5cblx0XHQgKiAtIGBhdXRvYDogVGhlIHNldHRpbmcgdmFsdWUgaXMgdXBkYXRlZCB0byB0aGUgZXhwZXJpbWVudCB2YWx1ZSBhdXRvbWF0aWNhbGx5ICh3aGVuZXZlciB0aGUgZXhwZXJpbWVudCB2YWx1ZSBjaGFuZ2VzKS5cblx0XHQgKi9cblx0XHRtb2RlOiAnc3RhcnR1cCcgfCAnYXV0byc7XG5cblx0XHQvKipcblx0XHQgKiBUaGUgbmFtZSBvZiB0aGUgZXhwZXJpbWVudC4gQnkgZGVmYXVsdCwgdGhpcyBpcyBgY29uZmlnLiR7c2V0dGluZ0lkfWBcblx0XHQgKi9cblx0XHRuYW1lPzogc3RyaW5nO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBXaGVuIHNwZWNpZmllZCwgcHJvdmlkZXMgY29uZmlndXJhdGlvbiBvdmVycmlkZXMgZm9yIHRoZSBBZ2VudHMgd2luZG93LlxuXHQgKi9cblx0YWdlbnRzV2luZG93Pzoge1xuXHRcdC8qKlxuXHRcdCAqIE92ZXJyaWRlIGRlZmF1bHQgdmFsdWUgZm9yIHRoaXMgc2V0dGluZyBpbiB0aGUgQWdlbnRzIHdpbmRvdy5cblx0XHQgKi9cblx0XHRkZWZhdWx0PzogdW5rbm93bjtcblxuXHRcdC8qKlxuXHRcdCAqIFdoZW4gYHRydWVgLCB0aGlzIHNldHRpbmcgaXMgcmVhZC1vbmx5IGluIHRoZSBBZ2VudHMgd2luZG93XG5cdFx0ICogYW5kIGNhbm5vdCBiZSBjaGFuZ2VkIGJ5IHRoZSB1c2VyLlxuXHRcdCAqL1xuXHRcdHJlYWRPbmx5PzogYm9vbGVhbjtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uSW5mbyB7XG5cdGlkOiBzdHJpbmc7XG5cdGRpc3BsYXlOYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWd1cmF0aW9uTm9kZSB7XG5cdGlkPzogc3RyaW5nO1xuXHRvcmRlcj86IG51bWJlcjtcblx0dHlwZT86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHR0aXRsZT86IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHByb3BlcnRpZXM/OiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjtcblx0YWxsT2Y/OiBJQ29uZmlndXJhdGlvbk5vZGVbXTtcblx0c2NvcGU/OiBDb25maWd1cmF0aW9uU2NvcGU7XG5cdGV4dGVuc2lvbkluZm8/OiBJRXh0ZW5zaW9uSW5mbztcblx0cmVzdHJpY3RlZFByb3BlcnRpZXM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IHR5cGUgQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2UgPSBJRXh0ZW5zaW9uSW5mbyB8IHN0cmluZztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMoYTogQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2UgfCB1bmRlZmluZWQsIGI6IENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhID09PSBiKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh0eXBlb2YgYSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGIgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGEgPT09IGI7XG5cdH1cblx0cmV0dXJuIGEuaWQgPT09IGIuaWQ7XG59XG5cbmV4cG9ydCB0eXBlIENvbmZpZ3VyYXRpb25EZWZhdWx0VmFsdWVTb3VyY2UgPSBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZSB8IE1hcDxzdHJpbmcsIENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlPjtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvbkRlZmF1bHRzIHtcblx0b3ZlcnJpZGVzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcblx0c291cmNlPzogQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2U7XG5cdGRvbm90Q2FjaGU/OiBib29sZWFuO1xuXHRwcmV2ZW50RXhwZXJpbWVudE92ZXJyaWRlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hICYge1xuXHRzZWN0aW9uPzoge1xuXHRcdGlkPzogc3RyaW5nO1xuXHRcdHRpdGxlPzogc3RyaW5nO1xuXHRcdG9yZGVyPzogbnVtYmVyO1xuXHRcdGV4dGVuc2lvbkluZm8/OiBJRXh0ZW5zaW9uSW5mbztcblx0fTtcblx0ZGVmYXVsdERlZmF1bHRWYWx1ZT86IHVua25vd247XG5cdHNvdXJjZT86IENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlOyAvLyBTb3VyY2Ugb2YgdGhlIFByb3BlcnR5XG5cdGRlZmF1bHRWYWx1ZVNvdXJjZT86IENvbmZpZ3VyYXRpb25EZWZhdWx0VmFsdWVTb3VyY2U7IC8vIFNvdXJjZSBvZiB0aGUgRGVmYXVsdCBWYWx1ZVxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZSB7XG5cdHJlYWRvbmx5IHZhbHVlOiB1bmtub3duO1xuXHRyZWFkb25seSBzb3VyY2U/OiBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZTsgIC8vIFNvdXJjZSBvZiB0aGUgZGVmYXVsdCBvdmVycmlkZVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUge1xuXHRyZWFkb25seSB2YWx1ZTogdW5rbm93bjtcblx0cmVhZG9ubHkgc291cmNlPzogQ29uZmlndXJhdGlvbkRlZmF1bHRWYWx1ZVNvdXJjZTtcbn1cblxuZXhwb3J0IGNvbnN0IGFsbFNldHRpbmdzOiB7IHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+OyBwYXR0ZXJuUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gfSA9IHsgcHJvcGVydGllczoge30sIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7fSB9O1xuZXhwb3J0IGNvbnN0IGFwcGxpY2F0aW9uU2V0dGluZ3M6IHsgcHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT47IHBhdHRlcm5Qcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiB9ID0geyBwcm9wZXJ0aWVzOiB7fSwgcGF0dGVyblByb3BlcnRpZXM6IHt9IH07XG5leHBvcnQgY29uc3QgYXBwbGljYXRpb25NYWNoaW5lU2V0dGluZ3M6IHsgcHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT47IHBhdHRlcm5Qcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiB9ID0geyBwcm9wZXJ0aWVzOiB7fSwgcGF0dGVyblByb3BlcnRpZXM6IHt9IH07XG5leHBvcnQgY29uc3QgbWFjaGluZVNldHRpbmdzOiB7IHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+OyBwYXR0ZXJuUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gfSA9IHsgcHJvcGVydGllczoge30sIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7fSB9O1xuZXhwb3J0IGNvbnN0IG1hY2hpbmVPdmVycmlkYWJsZVNldHRpbmdzOiB7IHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+OyBwYXR0ZXJuUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gfSA9IHsgcHJvcGVydGllczoge30sIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7fSB9O1xuZXhwb3J0IGNvbnN0IHdpbmRvd1NldHRpbmdzOiB7IHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+OyBwYXR0ZXJuUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gfSA9IHsgcHJvcGVydGllczoge30sIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7fSB9O1xuZXhwb3J0IGNvbnN0IHJlc291cmNlU2V0dGluZ3M6IHsgcHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT47IHBhdHRlcm5Qcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiB9ID0geyBwcm9wZXJ0aWVzOiB7fSwgcGF0dGVyblByb3BlcnRpZXM6IHt9IH07XG5cbmV4cG9ydCBjb25zdCByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL3NldHRpbmdzL3Jlc291cmNlTGFuZ3VhZ2UnO1xuZXhwb3J0IGNvbnN0IGNvbmZpZ3VyYXRpb25EZWZhdWx0c1NjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMvc2V0dGluZ3MvY29uZmlndXJhdGlvbkRlZmF1bHRzJztcblxuY29uc3QgY29udHJpYnV0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuY2xhc3MgQ29uZmlndXJhdGlvblJlZ2lzdHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb25maWd1cmF0aW9uUmVnaXN0cnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25EZWZhdWx0czogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzOiBNYXA8c3RyaW5nLCB7IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVtdOyBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWU/OiBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlIH0+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRMYW5ndWFnZUNvbmZpZ3VyYXRpb25PdmVycmlkZXNOb2RlOiBJQ29uZmlndXJhdGlvbk5vZGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkNvbnRyaWJ1dG9yczogSUNvbmZpZ3VyYXRpb25Ob2RlW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjtcblx0cHJpdmF0ZSByZWFkb25seSBwb2xpY3lDb25maWd1cmF0aW9uczogTWFwPFBvbGljeU5hbWUsIHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgcG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnM6IE1hcDxQb2xpY3lOYW1lLCBTZXQ8c3RyaW5nPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgYWdlbnRIb3N0U3luY0NvbmZpZ3VyYXRpb25zOiBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0Q29uZmlndXJhdGlvblN5bmM+O1xuXHQvKipcblx0ICogQWdlbnQtaG9zdC1taXJyb3JlZCBzZXR0aW5nIGtleXMgcGVyIG5vZGUgdGhhdCB3ZXJlIGhpZGRlbiB3aXRoXG5cdCAqIGBpbmNsdWRlZDogZmFsc2VgLiBSZWdpc3RyYXRpb24gZGVsZXRlcyB0aG9zZSBrZXlzIGZyb20gdGhlIG5vZGUnc1xuXHQgKiBgcHJvcGVydGllc2AsIHNvIGRlcmVnaXN0cmF0aW9uIGhhcyBubyBvdGhlciB3YXkgdG8gZmluZCB0aGVtLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBleGNsdWRlZEFnZW50SG9zdFN5bmNLZXlzID0gbmV3IE1hcDxJQ29uZmlndXJhdGlvbk5vZGUsIFNldDxzdHJpbmc+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPjtcblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hO1xuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJyaWRlSWRlbnRpZmllcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjaGVtYUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNjaGVtYUNoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFNjaGVtYUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHByb3BlcnRpZXM6IFJlYWRvbmx5U2V0PHN0cmluZz47IGRlZmF1bHRzT3ZlcnJpZGVzPzogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVDb25maWd1cmF0aW9uID0gdGhpcy5fb25EaWRVcGRhdGVDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5kZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzTm9kZSA9IHtcblx0XHRcdGlkOiAnZGVmYXVsdE92ZXJyaWRlcycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdkZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzLnRpdGxlJywgXCJEZWZhdWx0IExhbmd1YWdlIENvbmZpZ3VyYXRpb24gT3ZlcnJpZGVzXCIpLFxuXHRcdFx0cHJvcGVydGllczoge31cblx0XHR9O1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbkNvbnRyaWJ1dG9ycyA9IFt0aGlzLmRlZmF1bHRMYW5ndWFnZUNvbmZpZ3VyYXRpb25PdmVycmlkZXNOb2RlXTtcblx0XHR0aGlzLnJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYSA9IHtcblx0XHRcdHByb3BlcnRpZXM6IHt9LFxuXHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHt9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRcdFx0YWxsb3dDb21tZW50czogdHJ1ZVxuXHRcdH07XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHt9O1xuXHRcdHRoaXMucG9saWN5Q29uZmlndXJhdGlvbnMgPSBuZXcgTWFwPFBvbGljeU5hbWUsIHN0cmluZz4oKTtcblx0XHR0aGlzLnBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zID0gbmV3IE1hcDxQb2xpY3lOYW1lLCBTZXQ8c3RyaW5nPj4oKTtcblx0XHR0aGlzLmFnZW50SG9zdFN5bmNDb25maWd1cmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0Q29uZmlndXJhdGlvblN5bmM+KCk7XG5cdFx0dGhpcy5leGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0ge307XG5cblx0XHRjb250cmlidXRpb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShyZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCwgdGhpcy5yZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWEpO1xuXHRcdHRoaXMucmVnaXN0ZXJPdmVycmlkZVByb3BlcnR5UGF0dGVybktleSgpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUsIHZhbGlkYXRlOiBib29sZWFuID0gdHJ1ZSk6IElDb25maWd1cmF0aW9uTm9kZSB7XG5cdFx0dGhpcy5yZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtjb25maWd1cmF0aW9uXSwgdmFsaWRhdGUpO1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdLCB2YWxpZGF0ZTogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5kb1JlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnMsIHZhbGlkYXRlLCBwcm9wZXJ0aWVzKTtcblxuXHRcdGNvbnRyaWJ1dGlvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYUlkLCB0aGlzLnJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYSk7XG5cdFx0dGhpcy5fb25EaWRTY2hlbWFDaGFuZ2UuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlQ29uZmlndXJhdGlvbi5maXJlKHsgcHJvcGVydGllcyB9KTtcblx0fVxuXG5cdHB1YmxpYyBkZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuZG9EZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnMsIHByb3BlcnRpZXMpO1xuXG5cdFx0Y29udHJpYnV0aW9uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEocmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hSWQsIHRoaXMucmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hKTtcblx0XHR0aGlzLl9vbkRpZFNjaGVtYUNoYW5nZS5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVDb25maWd1cmF0aW9uLmZpcmUoeyBwcm9wZXJ0aWVzIH0pO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZUNvbmZpZ3VyYXRpb25zKHsgYWRkLCByZW1vdmUgfTogeyBhZGQ6IElDb25maWd1cmF0aW9uTm9kZVtdOyByZW1vdmU6IElDb25maWd1cmF0aW9uTm9kZVtdIH0pOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5kb0RlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhyZW1vdmUsIHByb3BlcnRpZXMpO1xuXHRcdHRoaXMuZG9SZWdpc3RlckNvbmZpZ3VyYXRpb25zKGFkZCwgZmFsc2UsIHByb3BlcnRpZXMpO1xuXG5cdFx0Y29udHJpYnV0aW9uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEocmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hSWQsIHRoaXMucmVzb3VyY2VMYW5ndWFnZVNldHRpbmdzU2NoZW1hKTtcblx0XHR0aGlzLl9vbkRpZFNjaGVtYUNoYW5nZS5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVDb25maWd1cmF0aW9uLmZpcmUoeyBwcm9wZXJ0aWVzIH0pO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25EZWZhdWx0czogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuZG9SZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uRGVmYXVsdHMsIHByb3BlcnRpZXMpO1xuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24uZmlyZSh7IHByb3BlcnRpZXMsIGRlZmF1bHRzT3ZlcnJpZGVzOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25EZWZhdWx0czogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdLCBidWNrZXQ6IFNldDxzdHJpbmc+KSB7XG5cblx0XHR0aGlzLnJlZ2lzdGVyZWRDb25maWd1cmF0aW9uRGVmYXVsdHMucHVzaCguLi5jb25maWd1cmF0aW9uRGVmYXVsdHMpO1xuXG5cdFx0Y29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgeyBvdmVycmlkZXMsIHNvdXJjZSB9IG9mIGNvbmZpZ3VyYXRpb25EZWZhdWx0cykge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gb3ZlcnJpZGVzKSB7XG5cdFx0XHRcdGJ1Y2tldC5hZGQoa2V5KTtcblxuXHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleSA9IHRoaXMuY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzLmdldChrZXkpXG5cdFx0XHRcdFx0Pz8gdGhpcy5jb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMuc2V0KGtleSwgeyBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlczogW10gfSkuZ2V0KGtleSkhO1xuXG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gb3ZlcnJpZGVzW2tleV07XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzLnB1c2goeyB2YWx1ZSwgc291cmNlIH0pO1xuXG5cdFx0XHRcdC8vIENvbmZpZ3VyYXRpb24gZGVmYXVsdHMgZm9yIE92ZXJyaWRlIElkZW50aWZpZXJzXG5cdFx0XHRcdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdEZWZhdWx0T3ZlcnJpZGUgPSB0aGlzLm1lcmdlRGVmYXVsdENvbmZpZ3VyYXRpb25zRm9yT3ZlcnJpZGVJZGVudGlmaWVyKGtleSwgdmFsdWUgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIHNvdXJjZSwgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlKTtcblx0XHRcdFx0XHRpZiAoIW5ld0RlZmF1bHRPdmVycmlkZSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNGb3JLZXkuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlID0gbmV3RGVmYXVsdE92ZXJyaWRlO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlRGVmYXVsdE92ZXJyaWRlUHJvcGVydHkoa2V5LCBuZXdEZWZhdWx0T3ZlcnJpZGUsIHNvdXJjZSk7XG5cdFx0XHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVycy5wdXNoKC4uLm92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5KGtleSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ29uZmlndXJhdGlvbiBkZWZhdWx0cyBmb3IgQ29uZmlndXJhdGlvbiBQcm9wZXJ0aWVzXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IG5ld0RlZmF1bHRPdmVycmlkZSA9IHRoaXMubWVyZ2VEZWZhdWx0Q29uZmlndXJhdGlvbnNGb3JDb25maWd1cmF0aW9uUHJvcGVydHkoa2V5LCB2YWx1ZSwgc291cmNlLCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleS5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUpO1xuXHRcdFx0XHRcdGlmICghbmV3RGVmYXVsdE92ZXJyaWRlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleS5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgPSBuZXdEZWZhdWx0T3ZlcnJpZGU7XG5cdFx0XHRcdFx0Y29uc3QgcHJvcGVydHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVByb3BlcnR5RGVmYXVsdFZhbHVlKGtleSwgcHJvcGVydHkpO1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVTY2hlbWEoa2V5LCBwcm9wZXJ0eSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRvUmVnaXN0ZXJPdmVycmlkZUlkZW50aWZpZXJzKG92ZXJyaWRlSWRlbnRpZmllcnMpO1xuXHR9XG5cblx0cHVibGljIGRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoZGVmYXVsdENvbmZpZ3VyYXRpb25zOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRzW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5kb0RlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoZGVmYXVsdENvbmZpZ3VyYXRpb25zLCBwcm9wZXJ0aWVzKTtcblx0XHR0aGlzLl9vbkRpZFNjaGVtYUNoYW5nZS5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVDb25maWd1cmF0aW9uLmZpcmUoeyBwcm9wZXJ0aWVzLCBkZWZhdWx0c092ZXJyaWRlczogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9EZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKGRlZmF1bHRDb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25EZWZhdWx0c1tdLCBidWNrZXQ6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiBvZiBkZWZhdWx0Q29uZmlndXJhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5yZWdpc3RlcmVkQ29uZmlndXJhdGlvbkRlZmF1bHRzLmluZGV4T2YoZGVmYXVsdENvbmZpZ3VyYXRpb24pO1xuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyZWRDb25maWd1cmF0aW9uRGVmYXVsdHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgb3ZlcnJpZGVzLCBzb3VyY2UgfSBvZiBkZWZhdWx0Q29uZmlndXJhdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIG92ZXJyaWRlcykge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleSA9IHRoaXMuY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzLmdldChrZXkpO1xuXHRcdFx0XHRpZiAoIWNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpbmRleCA9IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzXG5cdFx0XHRcdFx0LmZpbmRJbmRleChjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlID0+IHNvdXJjZSA/IGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMoY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZS5zb3VyY2UsIHNvdXJjZSkgOiBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlLnZhbHVlID09PSBvdmVycmlkZXNba2V5XSk7XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleS5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkpIHtcblx0XHRcdFx0XHRsZXQgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZSBvZiBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0ZvcktleS5jb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlcykge1xuXHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlID0gdGhpcy5tZXJnZURlZmF1bHRDb25maWd1cmF0aW9uc0Zvck92ZXJyaWRlSWRlbnRpZmllcihrZXksIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGUudmFsdWUgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGUuc291cmNlLCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlICYmICF0eXBlcy5pc0VtcHR5T2JqZWN0KGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZS52YWx1ZSkpIHtcblx0XHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSA9IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlRGVmYXVsdE92ZXJyaWRlUHJvcGVydHkoa2V5LCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUsIHNvdXJjZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLmRlZmF1bHRMYW5ndWFnZUNvbmZpZ3VyYXRpb25PdmVycmlkZXNOb2RlLnByb3BlcnRpZXMhW2tleV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxldCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWU6IElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlIG9mIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzKSB7XG5cdFx0XHRcdFx0XHRjb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgPSB0aGlzLm1lcmdlRGVmYXVsdENvbmZpZ3VyYXRpb25zRm9yQ29uZmlndXJhdGlvblByb3BlcnR5KGtleSwgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZS52YWx1ZSwgY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZS5zb3VyY2UsIGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzRm9yS2V5LmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSA9IGNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZTtcblx0XHRcdFx0XHRjb25zdCBwcm9wZXJ0eSA9IHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRpZiAocHJvcGVydHkpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlUHJvcGVydHlEZWZhdWx0VmFsdWUoa2V5LCBwcm9wZXJ0eSk7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNjaGVtYShrZXksIHByb3BlcnR5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnVja2V0LmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZU92ZXJyaWRlUHJvcGVydHlQYXR0ZXJuS2V5KCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURlZmF1bHRPdmVycmlkZVByb3BlcnR5KGtleTogc3RyaW5nLCBuZXdEZWZhdWx0T3ZlcnJpZGU6IElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUsIHNvdXJjZTogQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0eTogSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdFx0XHRzZWN0aW9uOiB7XG5cdFx0XHRcdGlkOiB0aGlzLmRlZmF1bHRMYW5ndWFnZUNvbmZpZ3VyYXRpb25PdmVycmlkZXNOb2RlLmlkLFxuXHRcdFx0XHR0aXRsZTogdGhpcy5kZWZhdWx0TGFuZ3VhZ2VDb25maWd1cmF0aW9uT3ZlcnJpZGVzTm9kZS50aXRsZSxcblx0XHRcdFx0b3JkZXI6IHRoaXMuZGVmYXVsdExhbmd1YWdlQ29uZmlndXJhdGlvbk92ZXJyaWRlc05vZGUub3JkZXIsXG5cdFx0XHRcdGV4dGVuc2lvbkluZm86IHRoaXMuZGVmYXVsdExhbmd1YWdlQ29uZmlndXJhdGlvbk92ZXJyaWRlc05vZGUuZXh0ZW5zaW9uSW5mb1xuXHRcdFx0fSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdDogbmV3RGVmYXVsdE92ZXJyaWRlLnZhbHVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGVmYXVsdExhbmd1YWdlQ29uZmlndXJhdGlvbi5kZXNjcmlwdGlvbicsIFwiQ29uZmlndXJlIHNldHRpbmdzIHRvIGJlIG92ZXJyaWRkZW4gZm9yIHswfS5cIiwgZ2V0TGFuZ3VhZ2VUYWdTZXR0aW5nUGxhaW5LZXkoa2V5KSksXG5cdFx0XHQkcmVmOiByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCxcblx0XHRcdGRlZmF1bHREZWZhdWx0VmFsdWU6IG5ld0RlZmF1bHRPdmVycmlkZS52YWx1ZSxcblx0XHRcdHNvdXJjZSxcblx0XHRcdGRlZmF1bHRWYWx1ZVNvdXJjZTogc291cmNlXG5cdFx0fTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHR0aGlzLmRlZmF1bHRMYW5ndWFnZUNvbmZpZ3VyYXRpb25PdmVycmlkZXNOb2RlLnByb3BlcnRpZXMhW2tleV0gPSBwcm9wZXJ0eTtcblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VEZWZhdWx0Q29uZmlndXJhdGlvbnNGb3JPdmVycmlkZUlkZW50aWZpZXIob3ZlcnJpZGVJZGVudGlmaWVyOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb25WYWx1ZU9iamVjdDogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIHZhbHVlU291cmNlOiBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZSB8IHVuZGVmaW5lZCwgZXhpc3RpbmdEZWZhdWx0T3ZlcnJpZGU6IElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgfCB1bmRlZmluZWQpOiBJQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkZWZhdWx0VmFsdWUgPSBleGlzdGluZ0RlZmF1bHRPdmVycmlkZT8udmFsdWUgfHwge307XG5cdFx0Y29uc3Qgc291cmNlID0gZXhpc3RpbmdEZWZhdWx0T3ZlcnJpZGU/LnNvdXJjZSA/PyBuZXcgTWFwPHN0cmluZywgQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2U+KCk7XG5cblx0XHQvLyBUaGlzIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0aWYgKCEoc291cmNlIGluc3RhbmNlb2YgTWFwKSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignb2JqZWN0Q29uZmlndXJhdGlvblNvdXJjZXMgaXMgbm90IGEgTWFwJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcHJvcGVydHlLZXkgb2YgT2JqZWN0LmtleXMoY29uZmlndXJhdGlvblZhbHVlT2JqZWN0KSkge1xuXHRcdFx0Y29uc3QgcHJvcGVydHlEZWZhdWx0VmFsdWUgPSBjb25maWd1cmF0aW9uVmFsdWVPYmplY3RbcHJvcGVydHlLZXldO1xuXG5cdFx0XHRjb25zdCBpc09iamVjdFNldHRpbmcgPSB0eXBlcy5pc09iamVjdChwcm9wZXJ0eURlZmF1bHRWYWx1ZSkgJiZcblx0XHRcdFx0KHR5cGVzLmlzVW5kZWZpbmVkKChkZWZhdWx0VmFsdWUgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pW3Byb3BlcnR5S2V5XSkgfHwgdHlwZXMuaXNPYmplY3QoKGRlZmF1bHRWYWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPilbcHJvcGVydHlLZXldKSk7XG5cblx0XHRcdC8vIElmIHRoZSBkZWZhdWx0IHZhbHVlIGlzIGFuIG9iamVjdCwgbWVyZ2UgdGhlIG9iamVjdHMgYW5kIHN0b3JlIHRoZSBzb3VyY2Ugb2YgZWFjaCBrZXlzXG5cdFx0XHRpZiAoaXNPYmplY3RTZXR0aW5nKSB7XG5cdFx0XHRcdChkZWZhdWx0VmFsdWUgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pW3Byb3BlcnR5S2V5XSA9IHsgLi4uKChkZWZhdWx0VmFsdWUgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4pW3Byb3BlcnR5S2V5XSA/PyB7fSksIC4uLnByb3BlcnR5RGVmYXVsdFZhbHVlIH07XG5cdFx0XHRcdC8vIFRyYWNrIHRoZSBzb3VyY2Ugb2YgZWFjaCB2YWx1ZSBpbiB0aGUgb2JqZWN0XG5cdFx0XHRcdGlmICh2YWx1ZVNvdXJjZSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgb2JqZWN0S2V5IGluIHByb3BlcnR5RGVmYXVsdFZhbHVlKSB7XG5cdFx0XHRcdFx0XHRzb3VyY2Uuc2V0KGAke3Byb3BlcnR5S2V5fS4ke29iamVjdEtleX1gLCB2YWx1ZVNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByaW1pdGl2ZSB2YWx1ZXMgYXJlIG92ZXJyaWRkZW5cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQoZGVmYXVsdFZhbHVlIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KVtwcm9wZXJ0eUtleV0gPSBwcm9wZXJ0eURlZmF1bHRWYWx1ZTtcblx0XHRcdFx0aWYgKHZhbHVlU291cmNlKSB7XG5cdFx0XHRcdFx0c291cmNlLnNldChwcm9wZXJ0eUtleSwgdmFsdWVTb3VyY2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNvdXJjZS5kZWxldGUocHJvcGVydHlLZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdmFsdWU6IGRlZmF1bHRWYWx1ZSwgc291cmNlIH07XG5cdH1cblxuXHRwcml2YXRlIG1lcmdlRGVmYXVsdENvbmZpZ3VyYXRpb25zRm9yQ29uZmlndXJhdGlvblByb3BlcnR5KHByb3BlcnR5S2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB2YWx1ZXNTb3VyY2U6IENvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlIHwgdW5kZWZpbmVkLCBleGlzdGluZ0RlZmF1bHRPdmVycmlkZTogSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSB8IHVuZGVmaW5lZCk6IElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByb3BlcnR5ID0gdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllc1twcm9wZXJ0eUtleV07XG5cdFx0Y29uc3QgZXhpc3RpbmdEZWZhdWx0VmFsdWUgPSBleGlzdGluZ0RlZmF1bHRPdmVycmlkZT8udmFsdWUgPz8gcHJvcGVydHk/LmRlZmF1bHREZWZhdWx0VmFsdWU7XG5cdFx0bGV0IHNvdXJjZTogQ29uZmlndXJhdGlvbkRlZmF1bHRWYWx1ZVNvdXJjZSB8IHVuZGVmaW5lZCA9IHZhbHVlc1NvdXJjZTtcblxuXHRcdGNvbnN0IGlzT2JqZWN0U2V0dGluZyA9IHR5cGVzLmlzT2JqZWN0KHZhbHVlKSAmJlxuXHRcdFx0KFxuXHRcdFx0XHRwcm9wZXJ0eSAhPT0gdW5kZWZpbmVkICYmIHByb3BlcnR5LnR5cGUgPT09ICdvYmplY3QnIHx8XG5cdFx0XHRcdHByb3BlcnR5ID09PSB1bmRlZmluZWQgJiYgKHR5cGVzLmlzVW5kZWZpbmVkKGV4aXN0aW5nRGVmYXVsdFZhbHVlKSB8fCB0eXBlcy5pc09iamVjdChleGlzdGluZ0RlZmF1bHRWYWx1ZSkpXG5cdFx0XHQpO1xuXG5cdFx0Ly8gSWYgdGhlIGRlZmF1bHQgdmFsdWUgaXMgYW4gb2JqZWN0LCBtZXJnZSB0aGUgb2JqZWN0cyBhbmQgc3RvcmUgdGhlIHNvdXJjZSBvZiBlYWNoIGtleXNcblx0XHRpZiAoaXNPYmplY3RTZXR0aW5nKSB7XG5cdFx0XHRzb3VyY2UgPSBleGlzdGluZ0RlZmF1bHRPdmVycmlkZT8uc291cmNlID8/IG5ldyBNYXA8c3RyaW5nLCBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZT4oKTtcblxuXHRcdFx0Ly8gVGhpcyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0aWYgKCEoc291cmNlIGluc3RhbmNlb2YgTWFwKSkge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdkZWZhdWx0VmFsdWVTb3VyY2UgaXMgbm90IGEgTWFwJyk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3Qgb2JqZWN0S2V5IGluICh2YWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPikpIHtcblx0XHRcdFx0aWYgKHZhbHVlc1NvdXJjZSkge1xuXHRcdFx0XHRcdHNvdXJjZS5zZXQoYCR7cHJvcGVydHlLZXl9LiR7b2JqZWN0S2V5fWAsIHZhbHVlc1NvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHZhbHVlID0geyAuLi4odHlwZXMuaXNPYmplY3QoZXhpc3RpbmdEZWZhdWx0VmFsdWUpID8gZXhpc3RpbmdEZWZhdWx0VmFsdWUgOiB7fSksIC4uLih2YWx1ZSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPikgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB2YWx1ZSwgc291cmNlIH07XG5cdH1cblxuXHRwdWJsaWMgZGVsdGFDb25maWd1cmF0aW9uKGRlbHRhOiBJQ29uZmlndXJhdGlvbkRlbHRhKTogdm9pZCB7XG5cdFx0Ly8gZGVmYXVsdHM6IHJlbW92ZVxuXHRcdGxldCBkZWZhdWx0c092ZXJyaWRlcyA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRpZiAoZGVsdGEucmVtb3ZlZERlZmF1bHRzKSB7XG5cdFx0XHR0aGlzLmRvRGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhkZWx0YS5yZW1vdmVkRGVmYXVsdHMsIHByb3BlcnRpZXMpO1xuXHRcdFx0ZGVmYXVsdHNPdmVycmlkZXMgPSB0cnVlO1xuXHRcdH1cblx0XHQvLyBkZWZhdWx0czogYWRkXG5cdFx0aWYgKGRlbHRhLmFkZGVkRGVmYXVsdHMpIHtcblx0XHRcdHRoaXMuZG9SZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhkZWx0YS5hZGRlZERlZmF1bHRzLCBwcm9wZXJ0aWVzKTtcblx0XHRcdGRlZmF1bHRzT3ZlcnJpZGVzID0gdHJ1ZTtcblx0XHR9XG5cdFx0Ly8gY29uZmlndXJhdGlvbnM6IHJlbW92ZVxuXHRcdGlmIChkZWx0YS5yZW1vdmVkQ29uZmlndXJhdGlvbnMpIHtcblx0XHRcdHRoaXMuZG9EZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoZGVsdGEucmVtb3ZlZENvbmZpZ3VyYXRpb25zLCBwcm9wZXJ0aWVzKTtcblx0XHR9XG5cdFx0Ly8gY29uZmlndXJhdGlvbnM6IGFkZFxuXHRcdGlmIChkZWx0YS5hZGRlZENvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHR0aGlzLmRvUmVnaXN0ZXJDb25maWd1cmF0aW9ucyhkZWx0YS5hZGRlZENvbmZpZ3VyYXRpb25zLCBmYWxzZSwgcHJvcGVydGllcyk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24uZmlyZSh7IHByb3BlcnRpZXMsIGRlZmF1bHRzT3ZlcnJpZGVzIH0pO1xuXHR9XG5cblx0cHVibGljIG5vdGlmeUNvbmZpZ3VyYXRpb25TY2hlbWFVcGRhdGVkKC4uLmNvbmZpZ3VyYXRpb25zOiBJQ29uZmlndXJhdGlvbk5vZGVbXSkge1xuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3Rlck92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVJZGVudGlmaWVyczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLmRvUmVnaXN0ZXJPdmVycmlkZUlkZW50aWZpZXJzKG92ZXJyaWRlSWRlbnRpZmllcnMpO1xuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZWdpc3Rlck92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVJZGVudGlmaWVyczogc3RyaW5nW10pIHtcblx0XHRmb3IgKGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllciBvZiBvdmVycmlkZUlkZW50aWZpZXJzKSB7XG5cdFx0XHR0aGlzLm92ZXJyaWRlSWRlbnRpZmllcnMuYWRkKG92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlT3ZlcnJpZGVQcm9wZXJ0eVBhdHRlcm5LZXkoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZWdpc3RlckNvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25zOiBJQ29uZmlndXJhdGlvbk5vZGVbXSwgdmFsaWRhdGU6IGJvb2xlYW4sIGJ1Y2tldDogU2V0PHN0cmluZz4pOiB2b2lkIHtcblxuXHRcdGNvbmZpZ3VyYXRpb25zLmZvckVhY2goY29uZmlndXJhdGlvbiA9PiB7XG5cblx0XHRcdHRoaXMudmFsaWRhdGVBbmRSZWdpc3RlclByb3BlcnRpZXMoY29uZmlndXJhdGlvbiwgdmFsaWRhdGUsIGNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uSW5mbywgY29uZmlndXJhdGlvbi5yZXN0cmljdGVkUHJvcGVydGllcywgdW5kZWZpbmVkLCBidWNrZXQpO1xuXG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Db250cmlidXRvcnMucHVzaChjb25maWd1cmF0aW9uKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJKU09OQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9EZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdLCBidWNrZXQ6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cblx0XHRjb25zdCBkZXJlZ2lzdGVyQ29uZmlndXJhdGlvbiA9IChjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUpID0+IHtcblx0XHRcdC8vIFByb3BlcnRpZXMgaGlkZGVuIHdpdGggYGluY2x1ZGVkOiBmYWxzZWAgYXJlIHN0cmlwcGVkIGZyb21cblx0XHRcdC8vIGBjb25maWd1cmF0aW9uLnByb3BlcnRpZXNgIGF0IHJlZ2lzdHJhdGlvbiB0aW1lLCBzbyB0aGUgbG9vcCBiZWxvd1xuXHRcdFx0Ly8gY2Fubm90IHNlZSB0aGVtLiBDbGVhbiB0aGVpciBtaXJyb3JpbmcgZW50cmllcyBmcm9tIHRoZSBzaWRlIHRhYmxlXG5cdFx0XHQvLyByZWNvcmRlZCB3aGVuIHRoZXkgd2VyZSBleGNsdWRlZC5cblx0XHRcdGNvbnN0IGV4Y2x1ZGVkU3luY0tleXMgPSB0aGlzLmV4Y2x1ZGVkQWdlbnRIb3N0U3luY0tleXMuZ2V0KGNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0aWYgKGV4Y2x1ZGVkU3luY0tleXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgZXhjbHVkZWRTeW5jS2V5cykge1xuXHRcdFx0XHRcdGJ1Y2tldC5hZGQoa2V5KTtcblx0XHRcdFx0XHR0aGlzLmFnZW50SG9zdFN5bmNDb25maWd1cmF0aW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmV4Y2x1ZGVkQWdlbnRIb3N0U3luY0tleXMuZGVsZXRlKGNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24ucHJvcGVydGllcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBjb25maWd1cmF0aW9uLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRidWNrZXQuYWRkKGtleSk7XG5cdFx0XHRcdFx0Y29uc3QgcHJvcGVydHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5Py5wb2xpY3k/Lm5hbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMucG9saWN5Q29uZmlndXJhdGlvbnMuZGVsZXRlKHByb3BlcnR5LnBvbGljeS5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5hZ2VudEhvc3RTeW5jQ29uZmlndXJhdGlvbnMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0aWYgKHByb3BlcnR5Py5wb2xpY3lSZWZlcmVuY2U/Lm5hbWUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlZnMgPSB0aGlzLnBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zLmdldChwcm9wZXJ0eS5wb2xpY3lSZWZlcmVuY2UubmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAocmVmcykge1xuXHRcdFx0XHRcdFx0XHRyZWZzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdFx0XHRpZiAocmVmcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5wb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucy5kZWxldGUocHJvcGVydHkucG9saWN5UmVmZXJlbmNlLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmVGcm9tU2NoZW1hKGtleSwgY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzW2tleV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25maWd1cmF0aW9uLmFsbE9mPy5mb3JFYWNoKG5vZGUgPT4gZGVyZWdpc3RlckNvbmZpZ3VyYXRpb24obm9kZSkpO1xuXHRcdH07XG5cdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIGNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRkZXJlZ2lzdGVyQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uKTtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5jb25maWd1cmF0aW9uQ29udHJpYnV0b3JzLmluZGV4T2YoY29uZmlndXJhdGlvbik7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvbkNvbnRyaWJ1dG9ycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVBbmRSZWdpc3RlclByb3BlcnRpZXMoY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlLCB2YWxpZGF0ZTogYm9vbGVhbiA9IHRydWUsIGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25JbmZvIHwgdW5kZWZpbmVkLCByZXN0cmljdGVkUHJvcGVydGllczogc3RyaW5nW10gfCB1bmRlZmluZWQsIHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUgPSBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLCBidWNrZXQ6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdFx0c2NvcGUgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChjb25maWd1cmF0aW9uLnNjb3BlKSA/IHNjb3BlIDogY29uZmlndXJhdGlvbi5zY29wZTtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzO1xuXHRcdGlmIChwcm9wZXJ0aWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5OiBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0cHJvcGVydHkuc2VjdGlvbiA9IHtcblx0XHRcdFx0XHRpZDogY29uZmlndXJhdGlvbi5pZCxcblx0XHRcdFx0XHR0aXRsZTogY29uZmlndXJhdGlvbi50aXRsZSxcblx0XHRcdFx0XHRvcmRlcjogY29uZmlndXJhdGlvbi5vcmRlcixcblx0XHRcdFx0XHRleHRlbnNpb25JbmZvOiBjb25maWd1cmF0aW9uLmV4dGVuc2lvbkluZm9cblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKHZhbGlkYXRlICYmIHZhbGlkYXRlUHJvcGVydHkoa2V5LCBwcm9wZXJ0eSwgZXh0ZW5zaW9uSW5mbz8uaWQpKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3BlcnR5LnNvdXJjZSA9IGV4dGVuc2lvbkluZm87XG5cblx0XHRcdFx0Ly8gdXBkYXRlIGRlZmF1bHQgdmFsdWVcblx0XHRcdFx0cHJvcGVydHkuZGVmYXVsdERlZmF1bHRWYWx1ZSA9IHByb3BlcnRpZXNba2V5XS5kZWZhdWx0O1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVByb3BlcnR5RGVmYXVsdFZhbHVlKGtleSwgcHJvcGVydHkpO1xuXG5cdFx0XHRcdC8vIHVwZGF0ZSBzY29wZVxuXHRcdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRcdFx0cHJvcGVydHkuc2NvcGUgPSB1bmRlZmluZWQ7IC8vIE5vIHNjb3BlIGZvciBvdmVycmlkYWJsZSBwcm9wZXJ0aWVzIGBbJHtpZGVudGlmaWVyfV1gXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvcGVydHkuc2NvcGUgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChwcm9wZXJ0eS5zY29wZSkgPyBzY29wZSA6IHByb3BlcnR5LnNjb3BlO1xuXHRcdFx0XHRcdHByb3BlcnR5LnJlc3RyaWN0ZWQgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChwcm9wZXJ0eS5yZXN0cmljdGVkKSA/ICEhcmVzdHJpY3RlZFByb3BlcnRpZXM/LmluY2x1ZGVzKGtleSkgOiBwcm9wZXJ0eS5yZXN0cmljdGVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHByb3BlcnR5LmV4cGVyaW1lbnQpIHtcblx0XHRcdFx0XHRpZiAoIXByb3BlcnR5LnRhZ3M/LnNvbWUodGFnID0+IHRhZy50b0xvd2VyQ2FzZSgpID09PSAnb25leHAnKSkge1xuXHRcdFx0XHRcdFx0cHJvcGVydHkudGFncyA9IHByb3BlcnR5LnRhZ3MgPz8gW107XG5cdFx0XHRcdFx0XHRwcm9wZXJ0eS50YWdzLnB1c2goJ29uRXhQJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHByb3BlcnR5LnRhZ3M/LnNvbWUodGFnID0+IHRhZy50b0xvd2VyQ2FzZSgpID09PSAnb25leHAnKSkge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYEludmFsaWQgdGFnICdvbkV4UCcgZm91bmQgZm9yIHByb3BlcnR5ICcke2tleX0nLiBQbGVhc2UgdXNlICdleHBlcmltZW50JyBwcm9wZXJ0eSBpbnN0ZWFkLmApO1xuXHRcdFx0XHRcdHByb3BlcnR5LmV4cGVyaW1lbnQgPSB7IG1vZGU6ICdzdGFydHVwJyB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZXhjbHVkZWQgPSBwcm9wZXJ0aWVzW2tleV0uaGFzT3duUHJvcGVydHkoJ2luY2x1ZGVkJykgJiYgIXByb3BlcnRpZXNba2V5XS5pbmNsdWRlZDtcblx0XHRcdFx0Y29uc3QgcG9saWN5TmFtZSA9IHByb3BlcnRpZXNba2V5XS5wb2xpY3k/Lm5hbWU7XG5cdFx0XHRcdGNvbnN0IHBvbGljeVJlZmVyZW5jZU5hbWUgPSBwcm9wZXJ0aWVzW2tleV0ucG9saWN5UmVmZXJlbmNlPy5uYW1lO1xuXHRcdFx0XHRjb25zdCBhZ2VudEhvc3RTeW5jID0gcHJvcGVydGllc1trZXldLmFnZW50SG9zdDtcblxuXHRcdFx0XHRpZiAoYWdlbnRIb3N0U3luYykge1xuXHRcdFx0XHRcdHRoaXMuYWdlbnRIb3N0U3luY0NvbmZpZ3VyYXRpb25zLnNldChrZXksIGFnZW50SG9zdFN5bmMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGV4Y2x1ZGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5leGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0aWYgKHBvbGljeU5hbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMucG9saWN5Q29uZmlndXJhdGlvbnMuc2V0KHBvbGljeU5hbWUsIGtleSk7XG5cdFx0XHRcdFx0XHRidWNrZXQuYWRkKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChwb2xpY3lSZWZlcmVuY2VOYW1lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZFBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb24ocG9saWN5UmVmZXJlbmNlTmFtZSwga2V5KTtcblx0XHRcdFx0XHRcdGJ1Y2tldC5hZGQoa2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGFnZW50SG9zdFN5bmMpIHtcblx0XHRcdFx0XHRcdC8vIEhpZGRlbiBzZXR0aW5ncyBzdGlsbCBtaXJyb3IgdG8gdGhlIGFnZW50IGhvc3Q7IHRoZSBidWNrZXRcblx0XHRcdFx0XHRcdC8vIGVudHJ5IGlzIHdoYXQgbWFrZXMgdGhlIGNoYW5nZSBvYnNlcnZhYmxlIHRvIHRoZSBzeW5jZXIuXG5cdFx0XHRcdFx0XHRidWNrZXQuYWRkKGtleSk7XG5cdFx0XHRcdFx0XHQvLyBgZGVsZXRlIHByb3BlcnRpZXNba2V5XWAgYmVsb3cgZXJhc2VzIHRoZSBvbmx5IGxpbmsgYmFjayB0b1xuXHRcdFx0XHRcdFx0Ly8gdGhpcyBub2RlLCBzbyByZW1lbWJlciB0aGUga2V5IGZvciBkZXJlZ2lzdHJhdGlvbi5cblx0XHRcdFx0XHRcdGxldCBleGNsdWRlZFN5bmNLZXlzID0gdGhpcy5leGNsdWRlZEFnZW50SG9zdFN5bmNLZXlzLmdldChjb25maWd1cmF0aW9uKTtcblx0XHRcdFx0XHRcdGlmICghZXhjbHVkZWRTeW5jS2V5cykge1xuXHRcdFx0XHRcdFx0XHRleGNsdWRlZFN5bmNLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZXhjbHVkZWRBZ2VudEhvc3RTeW5jS2V5cy5zZXQoY29uZmlndXJhdGlvbiwgZXhjbHVkZWRTeW5jS2V5cyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRleGNsdWRlZFN5bmNLZXlzLmFkZChrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWxldGUgcHJvcGVydGllc1trZXldO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1Y2tldC5hZGQoa2V5KTtcblx0XHRcdFx0XHRpZiAocG9saWN5TmFtZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5wb2xpY3lDb25maWd1cmF0aW9ucy5zZXQocG9saWN5TmFtZSwga2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBvbGljeVJlZmVyZW5jZU5hbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuYWRkUG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbihwb2xpY3lSZWZlcmVuY2VOYW1lLCBrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0aWYgKCFwcm9wZXJ0aWVzW2tleV0uZGVwcmVjYXRpb25NZXNzYWdlICYmIHByb3BlcnRpZXNba2V5XS5tYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0Ly8gSWYgbm90IHNldCwgZGVmYXVsdCBkZXByZWNhdGlvbk1lc3NhZ2UgdG8gdGhlIG1hcmtkb3duIHNvdXJjZVxuXHRcdFx0XHRcdFx0cHJvcGVydGllc1trZXldLmRlcHJlY2F0aW9uTWVzc2FnZSA9IHByb3BlcnRpZXNba2V5XS5tYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHN1Yk5vZGVzID0gY29uZmlndXJhdGlvbi5hbGxPZjtcblx0XHRpZiAoc3ViTm9kZXMpIHtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBzdWJOb2Rlcykge1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlQW5kUmVnaXN0ZXJQcm9wZXJ0aWVzKG5vZGUsIHZhbGlkYXRlLCBleHRlbnNpb25JbmZvLCByZXN0cmljdGVkUHJvcGVydGllcywgc2NvcGUsIGJ1Y2tldCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGRQb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9uKHBvbGljeU5hbWU6IFBvbGljeU5hbWUsIGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IGtleXMgPSB0aGlzLnBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zLmdldChwb2xpY3lOYW1lKTtcblx0XHRpZiAoIWtleXMpIHtcblx0XHRcdGtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdHRoaXMucG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMuc2V0KHBvbGljeU5hbWUsIGtleXMpO1xuXHRcdH1cblx0XHRrZXlzLmFkZChrZXkpO1xuXHR9XG5cblx0Ly8gT25seSBmb3IgdGVzdHNcblx0Z2V0Q29uZmlndXJhdGlvbnMoKTogSUNvbmZpZ3VyYXRpb25Ob2RlW10ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25Db250cmlidXRvcnM7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzO1xuXHR9XG5cblx0Z2V0UG9saWN5Q29uZmlndXJhdGlvbnMoKTogTWFwPFBvbGljeU5hbWUsIHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb25zO1xuXHR9XG5cblx0Z2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKTogTWFwPFBvbGljeU5hbWUsIFNldDxzdHJpbmc+PiB7XG5cdFx0cmV0dXJuIHRoaXMucG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnM7XG5cdH1cblxuXHRnZXRBZ2VudEhvc3RTeW5jQ29uZmlndXJhdGlvbnMoKTogTWFwPHN0cmluZywgSUFnZW50SG9zdENvbmZpZ3VyYXRpb25TeW5jPiB7XG5cdFx0cmV0dXJuIHRoaXMuYWdlbnRIb3N0U3luY0NvbmZpZ3VyYXRpb25zO1xuXHR9XG5cblx0Z2V0RXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcygpOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4ge1xuXHRcdHJldHVybiB0aGlzLmV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXM7XG5cdH1cblxuXHRnZXRSZWdpc3RlcmVkRGVmYXVsdENvbmZpZ3VyYXRpb25zKCk6IElDb25maWd1cmF0aW9uRGVmYXVsdHNbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLnJlZ2lzdGVyZWRDb25maWd1cmF0aW9uRGVmYXVsdHNdO1xuXHR9XG5cblx0Z2V0Q29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKCk6IE1hcDxzdHJpbmcsIElDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlVmFsdWU+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZT4oKTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLmNvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcykge1xuXHRcdFx0aWYgKHZhbHVlLmNvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVWYWx1ZSkge1xuXHRcdFx0XHRjb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMuc2V0KGtleSwgdmFsdWUuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcztcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJKU09OQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUpIHtcblx0XHRjb25zdCByZWdpc3RlciA9IChjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvbk5vZGUpID0+IHtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSBjb25maWd1cmF0aW9uLnByb3BlcnRpZXM7XG5cdFx0XHRpZiAocHJvcGVydGllcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTY2hlbWEoa2V5LCBwcm9wZXJ0aWVzW2tleV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdWJOb2RlcyA9IGNvbmZpZ3VyYXRpb24uYWxsT2Y7XG5cdFx0XHRzdWJOb2Rlcz8uZm9yRWFjaChyZWdpc3Rlcik7XG5cdFx0fTtcblx0XHRyZWdpc3Rlcihjb25maWd1cmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2NoZW1hKGtleTogc3RyaW5nLCBwcm9wZXJ0eTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSk6IHZvaWQge1xuXHRcdGFsbFNldHRpbmdzLnByb3BlcnRpZXNba2V5XSA9IHByb3BlcnR5O1xuXHRcdHN3aXRjaCAocHJvcGVydHkuc2NvcGUpIHtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRhcHBsaWNhdGlvblNldHRpbmdzLnByb3BlcnRpZXNba2V5XSA9IHByb3BlcnR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkU6XG5cdFx0XHRcdG1hY2hpbmVTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTl9NQUNISU5FOlxuXHRcdFx0XHRhcHBsaWNhdGlvbk1hY2hpbmVTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FX09WRVJSSURBQkxFOlxuXHRcdFx0XHRtYWNoaW5lT3ZlcnJpZGFibGVTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV0gPSBwcm9wZXJ0eTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1c6XG5cdFx0XHRcdHdpbmRvd1NldHRpbmdzLnByb3BlcnRpZXNba2V5XSA9IHByb3BlcnR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFOlxuXHRcdFx0XHRyZXNvdXJjZVNldHRpbmdzLnByb3BlcnRpZXNba2V5XSA9IHByb3BlcnR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFOlxuXHRcdFx0XHRyZXNvdXJjZVNldHRpbmdzLnByb3BlcnRpZXNba2V5XSA9IHByb3BlcnR5O1xuXHRcdFx0XHR0aGlzLnJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYS5wcm9wZXJ0aWVzIVtrZXldID0gcHJvcGVydHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlRnJvbVNjaGVtYShrZXk6IHN0cmluZywgcHJvcGVydHk6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiB2b2lkIHtcblx0XHRkZWxldGUgYWxsU2V0dGluZ3MucHJvcGVydGllc1trZXldO1xuXHRcdHN3aXRjaCAocHJvcGVydHkuc2NvcGUpIHtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRkZWxldGUgYXBwbGljYXRpb25TZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORTpcblx0XHRcdFx0ZGVsZXRlIG1hY2hpbmVTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05fTUFDSElORTpcblx0XHRcdFx0ZGVsZXRlIGFwcGxpY2F0aW9uTWFjaGluZVNldHRpbmdzLnByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FX09WRVJSSURBQkxFOlxuXHRcdFx0XHRkZWxldGUgbWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLldJTkRPVzpcblx0XHRcdFx0ZGVsZXRlIHdpbmRvd1NldHRpbmdzLnByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRTpcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFOlxuXHRcdFx0XHRkZWxldGUgcmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLnJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYS5wcm9wZXJ0aWVzIVtrZXldO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU92ZXJyaWRlUHJvcGVydHlQYXR0ZXJuS2V5KCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyIG9mIHRoaXMub3ZlcnJpZGVJZGVudGlmaWVycy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVyUHJvcGVydHkgPSBgWyR7b3ZlcnJpZGVJZGVudGlmaWVyfV1gO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb3ZlcnJpZGVTZXR0aW5ncy5kZWZhdWx0RGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZSBlZGl0b3Igc2V0dGluZ3MgdG8gYmUgb3ZlcnJpZGRlbiBmb3IgYSBsYW5ndWFnZS5cIiksXG5cdFx0XHRcdGVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdvdmVycmlkZVNldHRpbmdzLmVycm9yTWVzc2FnZScsIFwiVGhpcyBzZXR0aW5nIGRvZXMgbm90IHN1cHBvcnQgcGVyLWxhbmd1YWdlIGNvbmZpZ3VyYXRpb24uXCIpLFxuXHRcdFx0XHQkcmVmOiByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLnVwZGF0ZVByb3BlcnR5RGVmYXVsdFZhbHVlKG92ZXJyaWRlSWRlbnRpZmllclByb3BlcnR5LCByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYSk7XG5cdFx0XHRhbGxTZXR0aW5ncy5wcm9wZXJ0aWVzW292ZXJyaWRlSWRlbnRpZmllclByb3BlcnR5XSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdFx0YXBwbGljYXRpb25TZXR0aW5ncy5wcm9wZXJ0aWVzW292ZXJyaWRlSWRlbnRpZmllclByb3BlcnR5XSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdFx0YXBwbGljYXRpb25NYWNoaW5lU2V0dGluZ3MucHJvcGVydGllc1tvdmVycmlkZUlkZW50aWZpZXJQcm9wZXJ0eV0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRcdG1hY2hpbmVTZXR0aW5ncy5wcm9wZXJ0aWVzW292ZXJyaWRlSWRlbnRpZmllclByb3BlcnR5XSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdFx0bWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucHJvcGVydGllc1tvdmVycmlkZUlkZW50aWZpZXJQcm9wZXJ0eV0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRcdHdpbmRvd1NldHRpbmdzLnByb3BlcnRpZXNbb3ZlcnJpZGVJZGVudGlmaWVyUHJvcGVydHldID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0XHRyZXNvdXJjZVNldHRpbmdzLnByb3BlcnRpZXNbb3ZlcnJpZGVJZGVudGlmaWVyUHJvcGVydHldID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck92ZXJyaWRlUHJvcGVydHlQYXR0ZXJuS2V5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb3ZlcnJpZGVTZXR0aW5ncy5kZWZhdWx0RGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZSBlZGl0b3Igc2V0dGluZ3MgdG8gYmUgb3ZlcnJpZGRlbiBmb3IgYSBsYW5ndWFnZS5cIiksXG5cdFx0XHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnb3ZlcnJpZGVTZXR0aW5ncy5lcnJvck1lc3NhZ2UnLCBcIlRoaXMgc2V0dGluZyBkb2VzIG5vdCBzdXBwb3J0IHBlci1sYW5ndWFnZSBjb25maWd1cmF0aW9uLlwiKSxcblx0XHRcdCRyZWY6IHJlc291cmNlTGFuZ3VhZ2VTZXR0aW5nc1NjaGVtYUlkLFxuXHRcdH07XG5cdFx0YWxsU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXNbT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTl0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRhcHBsaWNhdGlvblNldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzW09WRVJSSURFX1BST1BFUlRZX1BBVFRFUk5dID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0YXBwbGljYXRpb25NYWNoaW5lU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXNbT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTl0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRtYWNoaW5lU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXNbT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTl0gPSByZXNvdXJjZUxhbmd1YWdlUHJvcGVydGllc1NjaGVtYTtcblx0XHRtYWNoaW5lT3ZlcnJpZGFibGVTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllc1tPVkVSUklERV9QUk9QRVJUWV9QQVRURVJOXSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdHdpbmRvd1NldHRpbmdzLnBhdHRlcm5Qcm9wZXJ0aWVzW09WRVJSSURFX1BST1BFUlRZX1BBVFRFUk5dID0gcmVzb3VyY2VMYW5ndWFnZVByb3BlcnRpZXNTY2hlbWE7XG5cdFx0cmVzb3VyY2VTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllc1tPVkVSUklERV9QUk9QRVJUWV9QQVRURVJOXSA9IHJlc291cmNlTGFuZ3VhZ2VQcm9wZXJ0aWVzU2NoZW1hO1xuXHRcdHRoaXMuX29uRGlkU2NoZW1hQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJvcGVydHlEZWZhdWx0VmFsdWUoa2V5OiBzdHJpbmcsIHByb3BlcnR5OiBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25kZWZhdWx0T3ZlcnJpZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25EZWZhdWx0c092ZXJyaWRlcy5nZXQoa2V5KT8uY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZVZhbHVlO1xuXHRcdGxldCBkZWZhdWx0VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlZmF1bHRTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25kZWZhdWx0T3ZlcnJpZGVcblx0XHRcdCYmICghcHJvcGVydHkuZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdCB8fCAhY29uZmlndXJhdGlvbmRlZmF1bHRPdmVycmlkZS5zb3VyY2UpIC8vIFByZXZlbnQgb3ZlcnJpZGluZyB0aGUgZGVmYXVsdCB2YWx1ZSBpZiB0aGUgcHJvcGVydHkgaXMgZGlzYWxsb3dlZCB0byBiZSBvdmVycmlkZGVuIGJ5IGNvbmZpZ3VyYXRpb24gZGVmYXVsdHMgZnJvbSBleHRlbnNpb25zXG5cdFx0KSB7XG5cdFx0XHRkZWZhdWx0VmFsdWUgPSBjb25maWd1cmF0aW9uZGVmYXVsdE92ZXJyaWRlLnZhbHVlO1xuXHRcdFx0ZGVmYXVsdFNvdXJjZSA9IGNvbmZpZ3VyYXRpb25kZWZhdWx0T3ZlcnJpZGUuc291cmNlO1xuXHRcdH1cblx0XHRpZiAodHlwZXMuaXNVbmRlZmluZWQoZGVmYXVsdFZhbHVlKSkge1xuXHRcdFx0ZGVmYXVsdFZhbHVlID0gcHJvcGVydHkuZGVmYXVsdERlZmF1bHRWYWx1ZTtcblx0XHRcdGRlZmF1bHRTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0eXBlcy5pc1VuZGVmaW5lZChkZWZhdWx0VmFsdWUpKSB7XG5cdFx0XHRkZWZhdWx0VmFsdWUgPSBnZXREZWZhdWx0VmFsdWUocHJvcGVydHkudHlwZSk7XG5cdFx0fVxuXHRcdHByb3BlcnR5LmRlZmF1bHQgPSBkZWZhdWx0VmFsdWU7XG5cdFx0cHJvcGVydHkuZGVmYXVsdFZhbHVlU291cmNlID0gZGVmYXVsdFNvdXJjZTtcblx0fVxufVxuXG5jb25zdCBPVkVSUklERV9JREVOVElGSUVSX1BBVFRFUk4gPSBgXFxcXFsoW15cXFxcXV0rKVxcXFxdYDtcbmNvbnN0IE9WRVJSSURFX0lERU5USUZJRVJfUkVHRVggPSBuZXcgUmVnRXhwKE9WRVJSSURFX0lERU5USUZJRVJfUEFUVEVSTiwgJ2cnKTtcbmV4cG9ydCBjb25zdCBPVkVSUklERV9QUk9QRVJUWV9QQVRURVJOID0gYF4oJHtPVkVSUklERV9JREVOVElGSUVSX1BBVFRFUk59KSskYDtcbmV4cG9ydCBjb25zdCBPVkVSUklERV9QUk9QRVJUWV9SRUdFWCA9IG5ldyBSZWdFeHAoT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTik7XG5cbmV4cG9ydCBmdW5jdGlvbiBvdmVycmlkZUlkZW50aWZpZXJzRnJvbUtleShrZXk6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgaWRlbnRpZmllcnM6IHN0cmluZ1tdID0gW107XG5cdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkpIHtcblx0XHRsZXQgbWF0Y2hlcyA9IE9WRVJSSURFX0lERU5USUZJRVJfUkVHRVguZXhlYyhrZXkpO1xuXHRcdHdoaWxlIChtYXRjaGVzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSBtYXRjaGVzWzFdLnRyaW0oKTtcblx0XHRcdGlmIChpZGVudGlmaWVyKSB7XG5cdFx0XHRcdGlkZW50aWZpZXJzLnB1c2goaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0XHRtYXRjaGVzID0gT1ZFUlJJREVfSURFTlRJRklFUl9SRUdFWC5leGVjKGtleSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkaXN0aW5jdChpZGVudGlmaWVycyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBrZXlGcm9tT3ZlcnJpZGVJZGVudGlmaWVycyhvdmVycmlkZUlkZW50aWZpZXJzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdHJldHVybiBvdmVycmlkZUlkZW50aWZpZXJzLnJlZHVjZSgocmVzdWx0LCBvdmVycmlkZUlkZW50aWZpZXIpID0+IGAke3Jlc3VsdH1bJHtvdmVycmlkZUlkZW50aWZpZXJ9XWAsICcnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHRWYWx1ZSh0eXBlOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCkge1xuXHRjb25zdCB0ID0gQXJyYXkuaXNBcnJheSh0eXBlKSA/IHR5cGVbMF0gOiA8c3RyaW5nPnR5cGU7XG5cdHN3aXRjaCAodCkge1xuXHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdGNhc2UgJ2ludGVnZXInOlxuXHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRyZXR1cm4gMDtcblx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdGNhc2UgJ2FycmF5Jzpcblx0XHRcdHJldHVybiBbXTtcblx0XHRjYXNlICdvYmplY3QnOlxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBuZXcgQ29uZmlndXJhdGlvblJlZ2lzdHJ5KCk7XG5SZWdpc3RyeS5hZGQoRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uLCBjb25maWd1cmF0aW9uUmVnaXN0cnkpO1xuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVQcm9wZXJ0eShwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBleHRlbnNpb25JZD86IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRpZiAoIXByb3BlcnR5LnRyaW0oKSkge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ2NvbmZpZy5wcm9wZXJ0eS5lbXB0eScsIFwiQ2Fubm90IHJlZ2lzdGVyIGFuIGVtcHR5IHByb3BlcnR5XCIpO1xuXHR9XG5cdGlmIChPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KHByb3BlcnR5KSkge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ2NvbmZpZy5wcm9wZXJ0eS5sYW5ndWFnZURlZmF1bHQnLCBcIkNhbm5vdCByZWdpc3RlciAnezB9Jy4gVGhpcyBtYXRjaGVzIHByb3BlcnR5IHBhdHRlcm4gJ1xcXFxcXFxcWy4qXFxcXFxcXFxdJCcgZm9yIGRlc2NyaWJpbmcgbGFuZ3VhZ2Ugc3BlY2lmaWMgZWRpdG9yIHNldHRpbmdzLiBVc2UgJ2NvbmZpZ3VyYXRpb25EZWZhdWx0cycgY29udHJpYnV0aW9uLlwiLCBwcm9wZXJ0eSk7XG5cdH1cblx0aWYgKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpW3Byb3BlcnR5XSAhPT0gdW5kZWZpbmVkICYmICghZXh0ZW5zaW9uSWQgfHwgIUVYVEVOU0lPTl9VTklGSUNBVElPTl9FWFRFTlNJT05fSURTLmhhcyhleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpKSkpIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb25maWcucHJvcGVydHkuZHVwbGljYXRlJywgXCJDYW5ub3QgcmVnaXN0ZXIgJ3swfScuIFRoaXMgcHJvcGVydHkgaXMgYWxyZWFkeSByZWdpc3RlcmVkLlwiLCBwcm9wZXJ0eSk7XG5cdH1cblx0aWYgKHNjaGVtYS5wb2xpY3kgJiYgc2NoZW1hLnBvbGljeVJlZmVyZW5jZSkge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ2NvbmZpZy5wb2xpY3kuYm90aFBvbGljeUFuZFJlZmVyZW5jZScsIFwiQ2Fubm90IHJlZ2lzdGVyICd7MH0nLiBBIHNldHRpbmcgbXVzdCBub3QgZGVjbGFyZSBib3RoICdwb2xpY3knIGFuZCAncG9saWN5UmVmZXJlbmNlJy5cIiwgcHJvcGVydHkpO1xuXHR9XG5cdGlmIChzY2hlbWEucG9saWN5Py5uYW1lICYmIGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRQb2xpY3lDb25maWd1cmF0aW9ucygpLmdldChzY2hlbWEucG9saWN5Py5uYW1lKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY29uZmlnLnBvbGljeS5kdXBsaWNhdGUnLCBcIkNhbm5vdCByZWdpc3RlciAnezB9Jy4gVGhlIGFzc29jaWF0ZWQgcG9saWN5IHsxfSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQgd2l0aCB7Mn0uIFRvIGF0dGFjaCBhbm90aGVyIHNldHRpbmcgdG8gdGhlIHNhbWUgcG9saWN5LCB1c2UgJ3BvbGljeVJlZmVyZW5jZScuXCIsIHByb3BlcnR5LCBzY2hlbWEucG9saWN5Py5uYW1lLCBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5Q29uZmlndXJhdGlvbnMoKS5nZXQoc2NoZW1hLnBvbGljeT8ubmFtZSkpO1xuXHR9XG5cdGlmIChzY2hlbWEuYWdlbnRIb3N0KSB7XG5cdFx0Zm9yIChjb25zdCBbb3duZXIsIHN5bmNdIG9mIGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRBZ2VudEhvc3RTeW5jQ29uZmlndXJhdGlvbnMoKSkge1xuXHRcdFx0aWYgKHN5bmMua2V5ID09PSBzY2hlbWEuYWdlbnRIb3N0LmtleSAmJiBvd25lciAhPT0gcHJvcGVydHkpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY29uZmlnLmFnZW50SG9zdC5kdXBsaWNhdGUnLCBcIkNhbm5vdCByZWdpc3RlciAnezB9Jy4gVGhlIGFnZW50IGhvc3QgY29uZmlndXJhdGlvbiBrZXkgJ3sxfScgaXMgYWxyZWFkeSBtaXJyb3JlZCBmcm9tICd7Mn0nLlwiLCBwcm9wZXJ0eSwgc2NoZW1hLmFnZW50SG9zdC5rZXksIG93bmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTY29wZXMoKTogW3N0cmluZywgQ29uZmlndXJhdGlvblNjb3BlIHwgdW5kZWZpbmVkXVtdIHtcblx0Y29uc3Qgc2NvcGVzOiBbc3RyaW5nLCBDb25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWRdW10gPSBbXTtcblx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoY29uZmlndXJhdGlvblByb3BlcnRpZXMpKSB7XG5cdFx0c2NvcGVzLnB1c2goW2tleSwgY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XS5zY29wZV0pO1xuXHR9XG5cdHNjb3Blcy5wdXNoKFsnbGF1bmNoJywgQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXSk7XG5cdHNjb3Blcy5wdXNoKFsndGFzaycsIENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRV0pO1xuXHRyZXR1cm4gc2NvcGVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWxsQ29uZmlndXJhdGlvblByb3BlcnRpZXMoY29uZmlndXJhdGlvbk5vZGU6IElDb25maWd1cmF0aW9uTm9kZVtdKTogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+IHtcblx0Y29uc3QgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gPSB7fTtcblx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIGNvbmZpZ3VyYXRpb25Ob2RlKSB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb24ucHJvcGVydGllcztcblx0XHRpZiAodHlwZXMuaXNPYmplY3QocHJvcGVydGllcykpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIHByb3BlcnRpZXMpIHtcblx0XHRcdFx0cmVzdWx0W2tleV0gPSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjb25maWd1cmF0aW9uLmFsbE9mKSB7XG5cdFx0XHRPYmplY3QuYXNzaWduKHJlc3VsdCwgZ2V0QWxsQ29uZmlndXJhdGlvblByb3BlcnRpZXMoY29uZmlndXJhdGlvbi5hbGxPZikpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTY29wZShzY29wZTogc3RyaW5nKTogQ29uZmlndXJhdGlvblNjb3BlIHtcblx0c3dpdGNoIChzY29wZSkge1xuXHRcdGNhc2UgJ2FwcGxpY2F0aW9uJzpcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT047XG5cdFx0Y2FzZSAnbWFjaGluZSc6XG5cdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkU7XG5cdFx0Y2FzZSAncmVzb3VyY2UnOlxuXHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRTtcblx0XHRjYXNlICdtYWNoaW5lLW92ZXJyaWRhYmxlJzpcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORV9PVkVSUklEQUJMRTtcblx0XHRjYXNlICdsYW5ndWFnZS1vdmVycmlkYWJsZSc6XG5cdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblNjb3BlLldJTkRPVztcblx0fVxufVxuXG4vLyBVc2VkIGZvciBleHRlbnNpb24gdW5pZmljYXRpb24uIFNob3VsZCBiZSByZW1vdmVkIHdoZW4gY29tcGxldGUuXG5leHBvcnQgY29uc3QgRVhURU5TSU9OX1VOSUZJQ0FUSU9OX0VYVEVOU0lPTl9JRFM6IFNldDxzdHJpbmc+ID0gbmV3IFNldChwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQgPyBbcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50LmV4dGVuc2lvbklkLCBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQuY2hhdEV4dGVuc2lvbklkXS5tYXAoaWQgPT4gaWQudG9Mb3dlckNhc2UoKSkgOiBbXSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGVBQXNCO0FBRS9CLFlBQVksV0FBVztBQUN2QixZQUFZLFNBQVM7QUFDckIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxjQUFjLHNCQUFpRDtBQUN4RSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGtC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QkFBMkIseUpBQXlKLFVBQVUsT0FBTyxRQUFRLE1BQU0sc0JBQXNCLHdCQUF3QixFQUFFLElBQUksT0FBTyxRQUFRLElBQUksQ0FBQztBQUFBLEVBQ2hUO0FBQ0EsTUFBSSxPQUFPLFdBQVc7QUFDckIsZUFBVyxDQUFDLE9BQU8sSUFBSSxLQUFLLHNCQUFzQiwrQkFBK0IsR0FBRztBQUNuRixVQUFJLEtBQUssUUFBUSxPQUFPLFVBQVUsT0FBTyxVQUFVLFVBQVU7QUFDNUQsZUFBTyxJQUFJLFNBQVMsOEJBQThCLGlHQUFpRyxVQUFVLE9BQU8sVUFBVSxLQUFLLEtBQUs7QUFBQSxNQUN6TDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRU8sU0FBUyxZQUF3RDtBQUN2RSxRQUFNLFNBQXFELENBQUM7QUFDNUQsUUFBTSwwQkFBMEIsc0JBQXNCLDJCQUEyQjtBQUNqRixhQUFXLE9BQU8sT0FBTyxLQUFLLHVCQUF1QixHQUFHO0FBQ3ZELFdBQU8sS0FBSyxDQUFDLEtBQUssd0JBQXdCLEdBQUcsRUFBRSxLQUFLLENBQUM7QUFBQSxFQUN0RDtBQUNBLFNBQU8sS0FBSyxDQUFDLFVBQVUsZ0JBQTJCLENBQUM7QUFDbkQsU0FBTyxLQUFLLENBQUMsUUFBUSxnQkFBMkIsQ0FBQztBQUNqRCxTQUFPO0FBQ1I7QUFFTyxTQUFTLDhCQUE4QixtQkFBb0c7QUFDakosUUFBTSxTQUFvRSxDQUFDO0FBQzNFLGFBQVcsaUJBQWlCLG1CQUFtQjtBQUM5QyxVQUFNLGFBQWEsY0FBYztBQUNqQyxRQUFJLE1BQU0sU0FBUyxVQUFVLEdBQUc7QUFDL0IsaUJBQVcsT0FBTyxZQUFZO0FBQzdCLGVBQU8sR0FBRyxJQUFJLFdBQVcsR0FBRztBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUNBLFFBQUksY0FBYyxPQUFPO0FBQ3hCLGFBQU8sT0FBTyxRQUFRLDhCQUE4QixjQUFjLEtBQUssQ0FBQztBQUFBLElBQ3pFO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsV0FBVyxPQUFtQztBQUM3RCxVQUFRLE9BQU87QUFBQSxJQUNkLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1I7QUFDQyxhQUFPO0FBQUEsRUFDVDtBQUNEO0FBR08sTUFBTSxzQ0FBbUQsSUFBSSxJQUFJLFFBQVEsbUJBQW1CLENBQUMsUUFBUSxpQkFBaUIsYUFBYSxRQUFRLGlCQUFpQixlQUFlLEVBQUUsSUFBSSxRQUFNLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDOyIsCiAgIm5hbWVzIjogWyJFZGl0UHJlc2VudGF0aW9uVHlwZXMiLCAiQ29uZmlndXJhdGlvblNjb3BlIiwgImNvbmZpZ3VyYXRpb24iXQp9Cg==
