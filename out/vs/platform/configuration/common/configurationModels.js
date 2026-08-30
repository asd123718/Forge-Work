import * as arrays from "../../../base/common/arrays.js";
import { Emitter, Event } from "../../../base/common/event.js";
import * as json from "../../../base/common/json.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { getOrSet, ResourceMap } from "../../../base/common/map.js";
import * as objects from "../../../base/common/objects.js";
import * as types from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { addToValueTree, getConfigurationValue, removeFromValueTree, toValuesTree } from "./configuration.js";
import { ConfigurationScope, Extensions, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from "./configurationRegistry.js";
import { FileOperation } from "../../files/common/files.js";
import { Registry } from "../../registry/common/platform.js";
function freeze(data) {
  return Object.isFrozen(data) ? data : objects.deepFreeze(data);
}
class ConfigurationModel {
  constructor(_contents, _keys, _overrides, _raw, logService) {
    this._contents = _contents;
    this._keys = _keys;
    this._overrides = _overrides;
    this._raw = _raw;
    this.logService = logService;
    this.overrideConfigurations = /* @__PURE__ */ new Map();
  }
  static createEmptyModel(logService) {
    return new ConfigurationModel({}, [], [], void 0, logService);
  }
  get rawConfiguration() {
    if (!this._rawConfiguration) {
      if (this._raw) {
        const rawConfigurationModels = (Array.isArray(this._raw) ? this._raw : [this._raw]).map((raw) => {
          if (raw instanceof ConfigurationModel) {
            return raw;
          }
          const parser = new ConfigurationModelParser("", this.logService);
          parser.parseRaw(raw);
          return parser.configurationModel;
        });
        this._rawConfiguration = rawConfigurationModels.reduce((previous, current) => current === previous ? current : previous.merge(current), rawConfigurationModels[0]);
      } else {
        this._rawConfiguration = this;
      }
    }
    return this._rawConfiguration;
  }
  get contents() {
    return this._contents;
  }
  get overrides() {
    return this._overrides;
  }
  get keys() {
    return this._keys;
  }
  get raw() {
    if (!this._raw) {
      return void 0;
    }
    if (Array.isArray(this._raw) && this._raw.every((raw) => raw instanceof ConfigurationModel)) {
      return void 0;
    }
    return this._raw;
  }
  isEmpty() {
    return this._keys.length === 0 && Object.keys(this._contents).length === 0 && this._overrides.length === 0;
  }
  getValue(section) {
    return section ? getConfigurationValue(this.contents, section) : this.contents;
  }
  inspect(section, overrideIdentifier) {
    const that = this;
    return {
      get value() {
        return freeze(that.rawConfiguration.getValue(section));
      },
      get override() {
        return overrideIdentifier ? freeze(that.rawConfiguration.getOverrideValue(section, overrideIdentifier)) : void 0;
      },
      get merged() {
        return freeze(overrideIdentifier ? that.rawConfiguration.override(overrideIdentifier).getValue(section) : that.rawConfiguration.getValue(section));
      },
      get overrides() {
        const overrides = [];
        for (const { contents, identifiers, keys } of that.rawConfiguration.overrides) {
          const value = new ConfigurationModel(contents, keys, [], void 0, that.logService).getValue(section);
          if (value !== void 0) {
            overrides.push({ identifiers, value });
          }
        }
        return overrides.length ? freeze(overrides) : void 0;
      }
    };
  }
  getOverrideValue(section, overrideIdentifier) {
    const overrideContents = this.getContentsForOverrideIdentifer(overrideIdentifier);
    return overrideContents ? section ? getConfigurationValue(overrideContents, section) : overrideContents : void 0;
  }
  getKeysForOverrideIdentifier(identifier) {
    const keys = [];
    for (const override of this.overrides) {
      if (override.identifiers.includes(identifier)) {
        keys.push(...override.keys);
      }
    }
    return arrays.distinct(keys);
  }
  getAllOverrideIdentifiers() {
    const result = [];
    for (const override of this.overrides) {
      result.push(...override.identifiers);
    }
    return arrays.distinct(result);
  }
  override(identifier) {
    let overrideConfigurationModel = this.overrideConfigurations.get(identifier);
    if (!overrideConfigurationModel) {
      overrideConfigurationModel = this.createOverrideConfigurationModel(identifier);
      this.overrideConfigurations.set(identifier, overrideConfigurationModel);
    }
    return overrideConfigurationModel;
  }
  merge(...others) {
    const contents = objects.deepClone(this.contents);
    const overrides = objects.deepClone(this.overrides);
    const keys = [...this.keys];
    const raws = this._raw ? Array.isArray(this._raw) ? [...this._raw] : [this._raw] : [this];
    for (const other of others) {
      raws.push(...other._raw ? Array.isArray(other._raw) ? other._raw : [other._raw] : [other]);
      if (other.isEmpty()) {
        continue;
      }
      this.mergeContents(contents, other.contents);
      for (const otherOverride of other.overrides) {
        const [override] = overrides.filter((o) => arrays.equals(o.identifiers, otherOverride.identifiers));
        if (override) {
          this.mergeContents(override.contents, otherOverride.contents);
          override.keys.push(...otherOverride.keys);
          override.keys = arrays.distinct(override.keys);
        } else {
          overrides.push(objects.deepClone(otherOverride));
        }
      }
      for (const key of other.keys) {
        if (keys.indexOf(key) === -1) {
          keys.push(key);
        }
      }
    }
    return new ConfigurationModel(contents, keys, overrides, !raws.length || raws.every((raw) => raw instanceof ConfigurationModel) ? void 0 : raws, this.logService);
  }
  createOverrideConfigurationModel(identifier) {
    const overrideContents = this.getContentsForOverrideIdentifer(identifier);
    if (!overrideContents || typeof overrideContents !== "object" || !Object.keys(overrideContents).length) {
      return this;
    }
    const contents = {};
    for (const key of arrays.distinct([...Object.keys(this.contents), ...Object.keys(overrideContents)])) {
      let contentsForKey = this.contents[key];
      const overrideContentsForKey = overrideContents[key];
      if (overrideContentsForKey) {
        if (typeof contentsForKey === "object" && typeof overrideContentsForKey === "object") {
          contentsForKey = objects.deepClone(contentsForKey);
          this.mergeContents(contentsForKey, overrideContentsForKey);
        } else {
          contentsForKey = overrideContentsForKey;
        }
      }
      contents[key] = contentsForKey;
    }
    return new ConfigurationModel(contents, this.keys, this.overrides, void 0, this.logService);
  }
  mergeContents(source, target) {
    for (const key of Object.keys(target)) {
      if (key in source) {
        if (types.isObject(source[key]) && types.isObject(target[key])) {
          this.mergeContents(source[key], target[key]);
          continue;
        }
      }
      source[key] = objects.deepClone(target[key]);
    }
  }
  getContentsForOverrideIdentifer(identifier) {
    let contentsForIdentifierOnly = null;
    let contents = null;
    const mergeContents = (contentsToMerge) => {
      if (contentsToMerge) {
        if (contents) {
          this.mergeContents(contents, contentsToMerge);
        } else {
          contents = objects.deepClone(contentsToMerge);
        }
      }
    };
    for (const override of this.overrides) {
      if (override.identifiers.length === 1 && override.identifiers[0] === identifier) {
        contentsForIdentifierOnly = override.contents;
      } else if (override.identifiers.includes(identifier)) {
        mergeContents(override.contents);
      }
    }
    mergeContents(contentsForIdentifierOnly);
    return contents;
  }
  toJSON() {
    return {
      contents: this.contents,
      overrides: this.overrides,
      keys: this.keys
    };
  }
  // Update methods
  addValue(key, value) {
    this.updateValue(key, value, true);
  }
  setValue(key, value) {
    this.updateValue(key, value, false);
  }
  removeValue(key) {
    const index = this.keys.indexOf(key);
    if (index === -1) {
      return;
    }
    this.keys.splice(index, 1);
    removeFromValueTree(this.contents, key);
    if (OVERRIDE_PROPERTY_REGEX.test(key)) {
      this.overrides.splice(this.overrides.findIndex((o) => arrays.equals(o.identifiers, overrideIdentifiersFromKey(key))), 1);
    }
  }
  updateValue(key, value, add) {
    addToValueTree(this.contents, key, value, (e) => this.logService.error(e));
    add = add || this.keys.indexOf(key) === -1;
    if (add) {
      this.keys.push(key);
    }
    if (OVERRIDE_PROPERTY_REGEX.test(key)) {
      const overrideContents = this.contents[key];
      const identifiers = overrideIdentifiersFromKey(key);
      const override = {
        identifiers,
        keys: Object.keys(overrideContents),
        contents: toValuesTree(overrideContents, (message) => this.logService.error(message))
      };
      const index = this.overrides.findIndex((o) => arrays.equals(o.identifiers, identifiers));
      if (index !== -1) {
        this.overrides[index] = override;
      } else {
        this.overrides.push(override);
      }
    }
  }
}
class ConfigurationModelParser {
  constructor(_name, logService) {
    this._name = _name;
    this.logService = logService;
    this._raw = null;
    this._configurationModel = null;
    this._restrictedConfigurations = [];
    this._parseErrors = [];
  }
  get configurationModel() {
    return this._configurationModel || ConfigurationModel.createEmptyModel(this.logService);
  }
  get restrictedConfigurations() {
    return this._restrictedConfigurations;
  }
  get errors() {
    return this._parseErrors;
  }
  parse(content, options) {
    if (!types.isUndefinedOrNull(content)) {
      const raw = this.doParseContent(content);
      this.parseRaw(raw, options);
    }
  }
  reparse(options) {
    if (this._raw) {
      this.parseRaw(this._raw, options);
    }
  }
  parseRaw(raw, options) {
    this._raw = raw;
    const { contents, keys, overrides, restricted, hasExcludedProperties } = this.doParseRaw(raw, options);
    this._configurationModel = new ConfigurationModel(contents, keys, overrides, hasExcludedProperties ? [raw] : void 0, this.logService);
    this._restrictedConfigurations = restricted || [];
  }
  doParseContent(content) {
    let raw = {};
    let currentProperty = null;
    let currentParent = [];
    const previousParents = [];
    const parseErrors = [];
    function onValue(value) {
      if (Array.isArray(currentParent)) {
        currentParent.push(value);
      } else if (currentProperty !== null) {
        currentParent[currentProperty] = value;
      }
    }
    const visitor = {
      onObjectBegin: () => {
        const object = {};
        onValue(object);
        previousParents.push(currentParent);
        currentParent = object;
        currentProperty = null;
      },
      onObjectProperty: (name) => {
        currentProperty = name;
      },
      onObjectEnd: () => {
        currentParent = previousParents.pop();
      },
      onArrayBegin: () => {
        const array = [];
        onValue(array);
        previousParents.push(currentParent);
        currentParent = array;
        currentProperty = null;
      },
      onArrayEnd: () => {
        currentParent = previousParents.pop();
      },
      onLiteralValue: onValue,
      onError: (error, offset, length) => {
        parseErrors.push({ error, offset, length });
      }
    };
    if (content) {
      try {
        json.visit(content, visitor);
        raw = currentParent[0] || {};
      } catch (e) {
        this.logService.error(`Error while parsing settings file ${this._name}: ${e}`);
        this._parseErrors = [e];
      }
    }
    return raw;
  }
  doParseRaw(raw, options) {
    const registry = Registry.as(Extensions.Configuration);
    const configurationProperties = registry.getConfigurationProperties();
    const excludedConfigurationProperties = registry.getExcludedConfigurationProperties();
    const filtered = this.filter(raw, configurationProperties, excludedConfigurationProperties, true, options);
    raw = filtered.raw;
    const contents = toValuesTree(raw, (message) => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
    const keys = Object.keys(raw);
    const overrides = this.toOverrides(raw, (message) => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
    return { contents, keys, overrides, restricted: filtered.restricted, hasExcludedProperties: filtered.hasExcludedProperties };
  }
  filter(properties, configurationProperties, excludedConfigurationProperties, filterOverriddenProperties, options) {
    let hasExcludedProperties = false;
    if (!options?.scopes && !options?.skipRestricted && !options?.skipUnregistered && !options?.exclude?.length) {
      return { raw: properties, restricted: [], hasExcludedProperties };
    }
    const raw = {};
    const restricted = [];
    for (const key in properties) {
      if (OVERRIDE_PROPERTY_REGEX.test(key) && filterOverriddenProperties) {
        const result = this.filter(properties[key], configurationProperties, excludedConfigurationProperties, false, options);
        raw[key] = result.raw;
        hasExcludedProperties = hasExcludedProperties || result.hasExcludedProperties;
        restricted.push(...result.restricted);
      } else {
        const propertySchema = configurationProperties[key];
        if (propertySchema?.restricted) {
          restricted.push(key);
        }
        if (this.shouldInclude(key, propertySchema, excludedConfigurationProperties, options)) {
          raw[key] = properties[key];
        } else {
          hasExcludedProperties = true;
        }
      }
    }
    return { raw, restricted, hasExcludedProperties };
  }
  shouldInclude(key, propertySchema, excludedConfigurationProperties, options) {
    if (options.exclude?.includes(key)) {
      return false;
    }
    if (options.include?.includes(key)) {
      return true;
    }
    if (options.skipRestricted && propertySchema?.restricted) {
      return false;
    }
    if (options.skipUnregistered && !propertySchema) {
      return false;
    }
    const schema = propertySchema ?? excludedConfigurationProperties[key];
    const scope = schema ? typeof schema.scope !== "undefined" ? schema.scope : ConfigurationScope.WINDOW : void 0;
    if (scope === void 0 || options.scopes === void 0) {
      return true;
    }
    return options.scopes.includes(scope);
  }
  toOverrides(raw, conflictReporter) {
    const overrides = [];
    for (const key of Object.keys(raw)) {
      if (OVERRIDE_PROPERTY_REGEX.test(key)) {
        const overrideRaw = {};
        const rawKey = raw[key];
        for (const keyInOverrideRaw in rawKey) {
          overrideRaw[keyInOverrideRaw] = rawKey[keyInOverrideRaw];
        }
        overrides.push({
          identifiers: overrideIdentifiersFromKey(key),
          keys: Object.keys(overrideRaw),
          contents: toValuesTree(overrideRaw, conflictReporter)
        });
      }
    }
    return overrides;
  }
}
class UserSettings extends Disposable {
  constructor(userSettingsResource, parseOptions, extUri, fileService, logService) {
    super();
    this.userSettingsResource = userSettingsResource;
    this.parseOptions = parseOptions;
    this.fileService = fileService;
    this.logService = logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.parser = new ConfigurationModelParser(this.userSettingsResource.toString(), logService);
    this._register(this.fileService.watch(extUri.dirname(this.userSettingsResource)));
    this._register(this.fileService.watch(this.userSettingsResource));
    this._register(Event.any(
      Event.filter(this.fileService.onDidFilesChange, (e) => e.contains(this.userSettingsResource)),
      Event.filter(this.fileService.onDidRunOperation, (e) => (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.COPY) || e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.WRITE)) && extUri.isEqual(e.resource, userSettingsResource))
    )(() => this._onDidChange.fire()));
  }
  async loadConfiguration() {
    try {
      const content = await this.fileService.readFile(this.userSettingsResource);
      this.parser.parse(content.value.toString() || "{}", this.parseOptions);
      return this.parser.configurationModel;
    } catch (e) {
      return ConfigurationModel.createEmptyModel(this.logService);
    }
  }
  reparse(parseOptions) {
    if (parseOptions) {
      this.parseOptions = parseOptions;
    }
    this.parser.reparse(this.parseOptions);
    return this.parser.configurationModel;
  }
  getRestrictedSettings() {
    return this.parser.restrictedConfigurations;
  }
}
class ConfigurationInspectValue {
  constructor(key, overrides, _value, overrideIdentifiers, defaultConfiguration, policyConfiguration, applicationConfiguration, userConfiguration, localUserConfiguration, remoteUserConfiguration, workspaceConfiguration, folderConfigurationModel, memoryConfigurationModel) {
    this.key = key;
    this.overrides = overrides;
    this._value = _value;
    this.overrideIdentifiers = overrideIdentifiers;
    this.defaultConfiguration = defaultConfiguration;
    this.policyConfiguration = policyConfiguration;
    this.applicationConfiguration = applicationConfiguration;
    this.userConfiguration = userConfiguration;
    this.localUserConfiguration = localUserConfiguration;
    this.remoteUserConfiguration = remoteUserConfiguration;
    this.workspaceConfiguration = workspaceConfiguration;
    this.folderConfigurationModel = folderConfigurationModel;
    this.memoryConfigurationModel = memoryConfigurationModel;
  }
  get value() {
    return freeze(this._value);
  }
  toInspectValue(inspectValue) {
    return inspectValue?.value !== void 0 || inspectValue?.override !== void 0 || inspectValue?.overrides !== void 0 ? inspectValue : void 0;
  }
  get defaultInspectValue() {
    if (!this._defaultInspectValue) {
      this._defaultInspectValue = this.defaultConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._defaultInspectValue;
  }
  get defaultValue() {
    return this.defaultInspectValue.merged;
  }
  get default() {
    return this.toInspectValue(this.defaultInspectValue);
  }
  get policyInspectValue() {
    if (this._policyInspectValue === void 0) {
      this._policyInspectValue = this.policyConfiguration ? this.policyConfiguration.inspect(this.key) : null;
    }
    return this._policyInspectValue;
  }
  get policyValue() {
    return this.policyInspectValue?.merged;
  }
  get policy() {
    return this.policyInspectValue?.value !== void 0 ? { value: this.policyInspectValue.value } : void 0;
  }
  get applicationInspectValue() {
    if (this._applicationInspectValue === void 0) {
      this._applicationInspectValue = this.applicationConfiguration ? this.applicationConfiguration.inspect(this.key) : null;
    }
    return this._applicationInspectValue;
  }
  get applicationValue() {
    return this.applicationInspectValue?.merged;
  }
  get application() {
    return this.toInspectValue(this.applicationInspectValue);
  }
  get userInspectValue() {
    if (!this._userInspectValue) {
      this._userInspectValue = this.userConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._userInspectValue;
  }
  get userValue() {
    return this.userInspectValue.merged;
  }
  get user() {
    return this.toInspectValue(this.userInspectValue);
  }
  get userLocalInspectValue() {
    if (!this._userLocalInspectValue) {
      this._userLocalInspectValue = this.localUserConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._userLocalInspectValue;
  }
  get userLocalValue() {
    return this.userLocalInspectValue.merged;
  }
  get userLocal() {
    return this.toInspectValue(this.userLocalInspectValue);
  }
  get userRemoteInspectValue() {
    if (!this._userRemoteInspectValue) {
      this._userRemoteInspectValue = this.remoteUserConfiguration.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._userRemoteInspectValue;
  }
  get userRemoteValue() {
    return this.userRemoteInspectValue.merged;
  }
  get userRemote() {
    return this.toInspectValue(this.userRemoteInspectValue);
  }
  get workspaceInspectValue() {
    if (this._workspaceInspectValue === void 0) {
      this._workspaceInspectValue = this.workspaceConfiguration ? this.workspaceConfiguration.inspect(this.key, this.overrides.overrideIdentifier) : null;
    }
    return this._workspaceInspectValue;
  }
  get workspaceValue() {
    return this.workspaceInspectValue?.merged;
  }
  get workspace() {
    return this.toInspectValue(this.workspaceInspectValue);
  }
  get workspaceFolderInspectValue() {
    if (this._workspaceFolderInspectValue === void 0) {
      this._workspaceFolderInspectValue = this.folderConfigurationModel ? this.folderConfigurationModel.inspect(this.key, this.overrides.overrideIdentifier) : null;
    }
    return this._workspaceFolderInspectValue;
  }
  get workspaceFolderValue() {
    return this.workspaceFolderInspectValue?.merged;
  }
  get workspaceFolder() {
    return this.toInspectValue(this.workspaceFolderInspectValue);
  }
  get memoryInspectValue() {
    if (this._memoryInspectValue === void 0) {
      this._memoryInspectValue = this.memoryConfigurationModel.inspect(this.key, this.overrides.overrideIdentifier);
    }
    return this._memoryInspectValue;
  }
  get memoryValue() {
    return this.memoryInspectValue.merged;
  }
  get memory() {
    return this.toInspectValue(this.memoryInspectValue);
  }
}
class Configuration {
  constructor(_defaultConfiguration, _policyConfiguration, _applicationConfiguration, _localUserConfiguration, _remoteUserConfiguration, _workspaceConfiguration, _folderConfigurations, _memoryConfiguration, _memoryConfigurationByResource, logService) {
    this._defaultConfiguration = _defaultConfiguration;
    this._policyConfiguration = _policyConfiguration;
    this._applicationConfiguration = _applicationConfiguration;
    this._localUserConfiguration = _localUserConfiguration;
    this._remoteUserConfiguration = _remoteUserConfiguration;
    this._workspaceConfiguration = _workspaceConfiguration;
    this._folderConfigurations = _folderConfigurations;
    this._memoryConfiguration = _memoryConfiguration;
    this._memoryConfigurationByResource = _memoryConfigurationByResource;
    this.logService = logService;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations = new ResourceMap();
    this._userConfiguration = null;
  }
  getValue(section, overrides, workspace) {
    const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(section, overrides, workspace);
    return consolidateConfigurationModel.getValue(section);
  }
  updateValue(key, value, overrides = {}) {
    let memoryConfiguration;
    if (overrides.resource) {
      memoryConfiguration = this._memoryConfigurationByResource.get(overrides.resource);
      if (!memoryConfiguration) {
        memoryConfiguration = ConfigurationModel.createEmptyModel(this.logService);
        this._memoryConfigurationByResource.set(overrides.resource, memoryConfiguration);
      }
    } else {
      memoryConfiguration = this._memoryConfiguration;
    }
    if (value === void 0) {
      memoryConfiguration.removeValue(key);
    } else {
      memoryConfiguration.setValue(key, value);
    }
    if (!overrides.resource) {
      this._workspaceConsolidatedConfiguration = null;
    }
  }
  inspect(key, overrides, workspace) {
    const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(key, overrides, workspace);
    const folderConfigurationModel = this.getFolderConfigurationModelForResource(overrides.resource, workspace);
    const memoryConfigurationModel = overrides.resource ? this._memoryConfigurationByResource.get(overrides.resource) || this._memoryConfiguration : this._memoryConfiguration;
    const overrideIdentifiers = /* @__PURE__ */ new Set();
    for (const override of consolidateConfigurationModel.overrides) {
      for (const overrideIdentifier of override.identifiers) {
        if (consolidateConfigurationModel.getOverrideValue(key, overrideIdentifier) !== void 0) {
          overrideIdentifiers.add(overrideIdentifier);
        }
      }
    }
    return new ConfigurationInspectValue(
      key,
      overrides,
      consolidateConfigurationModel.getValue(key),
      overrideIdentifiers.size ? [...overrideIdentifiers] : void 0,
      this._defaultConfiguration,
      this._policyConfiguration.isEmpty() ? void 0 : this._policyConfiguration,
      this.applicationConfiguration.isEmpty() ? void 0 : this.applicationConfiguration,
      this.userConfiguration,
      this.localUserConfiguration,
      this.remoteUserConfiguration,
      workspace ? this._workspaceConfiguration : void 0,
      folderConfigurationModel ? folderConfigurationModel : void 0,
      memoryConfigurationModel
    );
  }
  keys(workspace) {
    const folderConfigurationModel = this.getFolderConfigurationModelForResource(void 0, workspace);
    return {
      default: this._defaultConfiguration.keys.slice(0),
      policy: this._policyConfiguration.keys.slice(0),
      user: this.userConfiguration.keys.slice(0),
      workspace: this._workspaceConfiguration.keys.slice(0),
      workspaceFolder: folderConfigurationModel ? folderConfigurationModel.keys.slice(0) : []
    };
  }
  updateDefaultConfiguration(defaultConfiguration) {
    this._defaultConfiguration = defaultConfiguration;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updatePolicyConfiguration(policyConfiguration) {
    this._policyConfiguration = policyConfiguration;
  }
  updateApplicationConfiguration(applicationConfiguration) {
    this._applicationConfiguration = applicationConfiguration;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateLocalUserConfiguration(localUserConfiguration) {
    this._localUserConfiguration = localUserConfiguration;
    this._userConfiguration = null;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateRemoteUserConfiguration(remoteUserConfiguration) {
    this._remoteUserConfiguration = remoteUserConfiguration;
    this._userConfiguration = null;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateWorkspaceConfiguration(workspaceConfiguration) {
    this._workspaceConfiguration = workspaceConfiguration;
    this._workspaceConsolidatedConfiguration = null;
    this._foldersConsolidatedConfigurations.clear();
  }
  updateFolderConfiguration(resource, configuration) {
    this._folderConfigurations.set(resource, configuration);
    this._foldersConsolidatedConfigurations.delete(resource);
  }
  deleteFolderConfiguration(resource) {
    this.folderConfigurations.delete(resource);
    this._foldersConsolidatedConfigurations.delete(resource);
  }
  compareAndUpdateDefaultConfiguration(defaults, keys) {
    const overrides = [];
    if (!keys) {
      const { added, updated, removed } = compare(this._defaultConfiguration, defaults);
      keys = [...added, ...updated, ...removed];
    }
    for (const key of keys) {
      for (const overrideIdentifier of overrideIdentifiersFromKey(key)) {
        const fromKeys = this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier);
        const toKeys = defaults.getKeysForOverrideIdentifier(overrideIdentifier);
        const keys2 = [
          ...toKeys.filter((key2) => fromKeys.indexOf(key2) === -1),
          ...fromKeys.filter((key2) => toKeys.indexOf(key2) === -1),
          ...fromKeys.filter((key2) => !objects.equals(this._defaultConfiguration.override(overrideIdentifier).getValue(key2), defaults.override(overrideIdentifier).getValue(key2)))
        ];
        overrides.push([overrideIdentifier, keys2]);
      }
    }
    this.updateDefaultConfiguration(defaults);
    return { keys, overrides };
  }
  compareAndUpdatePolicyConfiguration(policyConfiguration) {
    const { added, updated, removed } = compare(this._policyConfiguration, policyConfiguration);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updatePolicyConfiguration(policyConfiguration);
    }
    return { keys, overrides: [] };
  }
  compareAndUpdateApplicationConfiguration(application) {
    const { added, updated, removed, overrides } = compare(this.applicationConfiguration, application);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateApplicationConfiguration(application);
    }
    return { keys, overrides };
  }
  compareAndUpdateLocalUserConfiguration(user) {
    const { added, updated, removed, overrides } = compare(this.localUserConfiguration, user);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateLocalUserConfiguration(user);
    }
    return { keys, overrides };
  }
  compareAndUpdateRemoteUserConfiguration(user) {
    const { added, updated, removed, overrides } = compare(this.remoteUserConfiguration, user);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateRemoteUserConfiguration(user);
    }
    return { keys, overrides };
  }
  compareAndUpdateWorkspaceConfiguration(workspaceConfiguration) {
    const { added, updated, removed, overrides } = compare(this.workspaceConfiguration, workspaceConfiguration);
    const keys = [...added, ...updated, ...removed];
    if (keys.length) {
      this.updateWorkspaceConfiguration(workspaceConfiguration);
    }
    return { keys, overrides };
  }
  compareAndUpdateFolderConfiguration(resource, folderConfiguration) {
    const currentFolderConfiguration = this.folderConfigurations.get(resource);
    const { added, updated, removed, overrides } = compare(currentFolderConfiguration, folderConfiguration);
    const keys = [...added, ...updated, ...removed];
    if (keys.length || !currentFolderConfiguration) {
      this.updateFolderConfiguration(resource, folderConfiguration);
    }
    return { keys, overrides };
  }
  compareAndDeleteFolderConfiguration(folder) {
    const folderConfig = this.folderConfigurations.get(folder);
    if (!folderConfig) {
      throw new Error("Unknown folder");
    }
    this.deleteFolderConfiguration(folder);
    const { added, updated, removed, overrides } = compare(folderConfig, void 0);
    return { keys: [...added, ...updated, ...removed], overrides };
  }
  get defaults() {
    return this._defaultConfiguration;
  }
  get applicationConfiguration() {
    return this._applicationConfiguration;
  }
  get userConfiguration() {
    if (!this._userConfiguration) {
      if (this._remoteUserConfiguration.isEmpty()) {
        this._userConfiguration = this._localUserConfiguration;
      } else {
        const merged = this._localUserConfiguration.merge(this._remoteUserConfiguration);
        this._userConfiguration = new ConfigurationModel(merged.contents, merged.keys, merged.overrides, void 0, this.logService);
      }
    }
    return this._userConfiguration;
  }
  get localUserConfiguration() {
    return this._localUserConfiguration;
  }
  get remoteUserConfiguration() {
    return this._remoteUserConfiguration;
  }
  get workspaceConfiguration() {
    return this._workspaceConfiguration;
  }
  get folderConfigurations() {
    return this._folderConfigurations;
  }
  getConsolidatedConfigurationModel(section, overrides, workspace) {
    let configurationModel = this.getConsolidatedConfigurationModelForResource(overrides, workspace);
    if (overrides.overrideIdentifier) {
      configurationModel = configurationModel.override(overrides.overrideIdentifier);
    }
    if (!this._policyConfiguration.isEmpty() && this._policyConfiguration.getValue(section) !== void 0) {
      configurationModel = configurationModel.merge();
      for (const key of this._policyConfiguration.keys) {
        configurationModel.setValue(key, this._policyConfiguration.getValue(key));
      }
    }
    return configurationModel;
  }
  getConsolidatedConfigurationModelForResource({ resource }, workspace) {
    let consolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();
    if (workspace && resource) {
      const root = workspace.getFolder(resource);
      if (root) {
        consolidateConfiguration = this.getFolderConsolidatedConfiguration(root.uri) || consolidateConfiguration;
      }
      const memoryConfigurationForResource = this._memoryConfigurationByResource.get(resource);
      if (memoryConfigurationForResource) {
        consolidateConfiguration = consolidateConfiguration.merge(memoryConfigurationForResource);
      }
    }
    return consolidateConfiguration;
  }
  getWorkspaceConsolidatedConfiguration() {
    if (!this._workspaceConsolidatedConfiguration) {
      this._workspaceConsolidatedConfiguration = this._defaultConfiguration.merge(this.applicationConfiguration, this.userConfiguration, this._workspaceConfiguration, this._memoryConfiguration);
    }
    return this._workspaceConsolidatedConfiguration;
  }
  getFolderConsolidatedConfiguration(folder) {
    let folderConsolidatedConfiguration = this._foldersConsolidatedConfigurations.get(folder);
    if (!folderConsolidatedConfiguration) {
      const workspaceConsolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();
      const folderConfiguration = this._folderConfigurations.get(folder);
      if (folderConfiguration) {
        folderConsolidatedConfiguration = workspaceConsolidateConfiguration.merge(folderConfiguration);
        this._foldersConsolidatedConfigurations.set(folder, folderConsolidatedConfiguration);
      } else {
        folderConsolidatedConfiguration = workspaceConsolidateConfiguration;
      }
    }
    return folderConsolidatedConfiguration;
  }
  getFolderConfigurationModelForResource(resource, workspace) {
    if (workspace && resource) {
      const root = workspace.getFolder(resource);
      if (root) {
        return this._folderConfigurations.get(root.uri);
      }
    }
    return void 0;
  }
  toData() {
    return {
      defaults: {
        contents: this._defaultConfiguration.contents,
        overrides: this._defaultConfiguration.overrides,
        keys: this._defaultConfiguration.keys
      },
      policy: {
        contents: this._policyConfiguration.contents,
        overrides: this._policyConfiguration.overrides,
        keys: this._policyConfiguration.keys
      },
      application: {
        contents: this.applicationConfiguration.contents,
        overrides: this.applicationConfiguration.overrides,
        keys: this.applicationConfiguration.keys,
        raw: Array.isArray(this.applicationConfiguration.raw) ? void 0 : this.applicationConfiguration.raw
      },
      userLocal: {
        contents: this.localUserConfiguration.contents,
        overrides: this.localUserConfiguration.overrides,
        keys: this.localUserConfiguration.keys,
        raw: Array.isArray(this.localUserConfiguration.raw) ? void 0 : this.localUserConfiguration.raw
      },
      userRemote: {
        contents: this.remoteUserConfiguration.contents,
        overrides: this.remoteUserConfiguration.overrides,
        keys: this.remoteUserConfiguration.keys,
        raw: Array.isArray(this.remoteUserConfiguration.raw) ? void 0 : this.remoteUserConfiguration.raw
      },
      workspace: {
        contents: this._workspaceConfiguration.contents,
        overrides: this._workspaceConfiguration.overrides,
        keys: this._workspaceConfiguration.keys
      },
      folders: [...this._folderConfigurations.keys()].reduce((result, folder) => {
        const { contents, overrides, keys } = this._folderConfigurations.get(folder);
        result.push([folder, { contents, overrides, keys }]);
        return result;
      }, [])
    };
  }
  allKeys() {
    const keys = /* @__PURE__ */ new Set();
    this._defaultConfiguration.keys.forEach((key) => keys.add(key));
    this.userConfiguration.keys.forEach((key) => keys.add(key));
    this._workspaceConfiguration.keys.forEach((key) => keys.add(key));
    this._folderConfigurations.forEach((folderConfiguration) => folderConfiguration.keys.forEach((key) => keys.add(key)));
    return [...keys.values()];
  }
  allOverrideIdentifiers() {
    const keys = /* @__PURE__ */ new Set();
    this._defaultConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key));
    this.userConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key));
    this._workspaceConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key));
    this._folderConfigurations.forEach((folderConfiguration) => folderConfiguration.getAllOverrideIdentifiers().forEach((key) => keys.add(key)));
    return [...keys.values()];
  }
  getAllKeysForOverrideIdentifier(overrideIdentifier) {
    const keys = /* @__PURE__ */ new Set();
    this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key));
    this.userConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key));
    this._workspaceConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key));
    this._folderConfigurations.forEach((folderConfiguration) => folderConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach((key) => keys.add(key)));
    return [...keys.values()];
  }
  static parse(data, logService) {
    const defaultConfiguration = this.parseConfigurationModel(data.defaults, logService);
    const policyConfiguration = this.parseConfigurationModel(data.policy, logService);
    const applicationConfiguration = this.parseConfigurationModel(data.application, logService);
    const userLocalConfiguration = this.parseConfigurationModel(data.userLocal, logService);
    const userRemoteConfiguration = this.parseConfigurationModel(data.userRemote, logService);
    const workspaceConfiguration = this.parseConfigurationModel(data.workspace, logService);
    const folders = data.folders.reduce((result, value) => {
      result.set(URI.revive(value[0]), this.parseConfigurationModel(value[1], logService));
      return result;
    }, new ResourceMap());
    return new Configuration(
      defaultConfiguration,
      policyConfiguration,
      applicationConfiguration,
      userLocalConfiguration,
      userRemoteConfiguration,
      workspaceConfiguration,
      folders,
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      logService
    );
  }
  static parseConfigurationModel(model, logService) {
    return new ConfigurationModel(model.contents, model.keys, model.overrides, model.raw, logService);
  }
}
function mergeChanges(...changes) {
  if (changes.length === 0) {
    return { keys: [], overrides: [] };
  }
  if (changes.length === 1) {
    return changes[0];
  }
  const keysSet = /* @__PURE__ */ new Set();
  const overridesMap = /* @__PURE__ */ new Map();
  for (const change of changes) {
    change.keys.forEach((key) => keysSet.add(key));
    change.overrides.forEach(([identifier, keys]) => {
      const result = getOrSet(overridesMap, identifier, /* @__PURE__ */ new Set());
      keys.forEach((key) => result.add(key));
    });
  }
  const overrides = [];
  overridesMap.forEach((keys, identifier) => overrides.push([identifier, [...keys.values()]]));
  return { keys: [...keysSet.values()], overrides };
}
class ConfigurationChangeEvent {
  constructor(change, previous, currentConfiguraiton, currentWorkspace, logService) {
    this.change = change;
    this.previous = previous;
    this.currentConfiguraiton = currentConfiguraiton;
    this.currentWorkspace = currentWorkspace;
    this.logService = logService;
    this._marker = "\n";
    this._markerCode1 = this._marker.charCodeAt(0);
    this._markerCode2 = ".".charCodeAt(0);
    this.affectedKeys = /* @__PURE__ */ new Set();
    this._previousConfiguration = void 0;
    for (const key of change.keys) {
      this.affectedKeys.add(key);
    }
    for (const [, keys] of change.overrides) {
      for (const key of keys) {
        this.affectedKeys.add(key);
      }
    }
    this._affectsConfigStr = this._marker;
    for (const key of this.affectedKeys) {
      this._affectsConfigStr += key + this._marker;
    }
  }
  get previousConfiguration() {
    if (!this._previousConfiguration && this.previous) {
      this._previousConfiguration = Configuration.parse(this.previous.data, this.logService);
    }
    return this._previousConfiguration;
  }
  affectsConfiguration(section, overrides) {
    const needle = this._marker + section;
    const idx = this._affectsConfigStr.indexOf(needle);
    if (idx < 0) {
      return false;
    }
    const pos = idx + needle.length;
    if (pos >= this._affectsConfigStr.length) {
      return false;
    }
    const code = this._affectsConfigStr.charCodeAt(pos);
    if (code !== this._markerCode1 && code !== this._markerCode2) {
      return false;
    }
    if (overrides) {
      const value1 = this.previousConfiguration ? this.previousConfiguration.getValue(section, overrides, this.previous?.workspace) : void 0;
      const value2 = this.currentConfiguraiton.getValue(section, overrides, this.currentWorkspace);
      return !objects.equals(value1, value2);
    }
    return true;
  }
}
function compare(from, to) {
  const { added, removed, updated } = compareConfigurationContents(to?.rawConfiguration, from?.rawConfiguration);
  const overrides = [];
  const fromOverrideIdentifiers = from?.getAllOverrideIdentifiers() || [];
  const toOverrideIdentifiers = to?.getAllOverrideIdentifiers() || [];
  if (to) {
    const addedOverrideIdentifiers = toOverrideIdentifiers.filter((key) => !fromOverrideIdentifiers.includes(key));
    for (const identifier of addedOverrideIdentifiers) {
      overrides.push([identifier, to.getKeysForOverrideIdentifier(identifier)]);
    }
  }
  if (from) {
    const removedOverrideIdentifiers = fromOverrideIdentifiers.filter((key) => !toOverrideIdentifiers.includes(key));
    for (const identifier of removedOverrideIdentifiers) {
      overrides.push([identifier, from.getKeysForOverrideIdentifier(identifier)]);
    }
  }
  if (to && from) {
    for (const identifier of fromOverrideIdentifiers) {
      if (toOverrideIdentifiers.includes(identifier)) {
        const result = compareConfigurationContents({ contents: from.getOverrideValue(void 0, identifier) || {}, keys: from.getKeysForOverrideIdentifier(identifier) }, { contents: to.getOverrideValue(void 0, identifier) || {}, keys: to.getKeysForOverrideIdentifier(identifier) });
        overrides.push([identifier, [...result.added, ...result.removed, ...result.updated]]);
      }
    }
  }
  return { added, removed, updated, overrides };
}
function compareConfigurationContents(to, from) {
  const added = to ? from ? to.keys.filter((key) => from.keys.indexOf(key) === -1) : [...to.keys] : [];
  const removed = from ? to ? from.keys.filter((key) => to.keys.indexOf(key) === -1) : [...from.keys] : [];
  const updated = [];
  if (to && from) {
    for (const key of from.keys) {
      if (to.keys.indexOf(key) !== -1) {
        const value1 = getConfigurationValue(from.contents, key);
        const value2 = getConfigurationValue(to.contents, key);
        if (!objects.equals(value1, value2)) {
          updated.push(key);
        }
      }
    }
  }
  return { added, removed, updated };
}
export {
  Configuration,
  ConfigurationChangeEvent,
  ConfigurationModel,
  ConfigurationModelParser,
  UserSettings,
  mergeChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29uZmlndXJhdGlvblxcY29tbW9uXFxjb25maWd1cmF0aW9uTW9kZWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMganNvbiBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0T3JTZXQsIFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhZGRUb1ZhbHVlVHJlZSwgQ29uZmlndXJhdGlvblRhcmdldCwgZ2V0Q29uZmlndXJhdGlvblZhbHVlLCBJQ29uZmlndXJhdGlvbkNoYW5nZSwgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25Db21wYXJlUmVzdWx0LCBJQ29uZmlndXJhdGlvbkRhdGEsIElDb25maWd1cmF0aW9uTW9kZWwsIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcywgSUNvbmZpZ3VyYXRpb25WYWx1ZSwgSUluc3BlY3RWYWx1ZSwgSU92ZXJyaWRlcywgcmVtb3ZlRnJvbVZhbHVlVHJlZSwgdG9WYWx1ZXNUcmVlIH0gZnJvbSAnLi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgb3ZlcnJpZGVJZGVudGlmaWVyc0Zyb21LZXksIE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLCBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9IGZyb20gJy4vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24sIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcblxuZnVuY3Rpb24gZnJlZXplPFQ+KGRhdGE6IFQpOiBUIHtcblx0cmV0dXJuIE9iamVjdC5pc0Zyb3plbihkYXRhKSA/IGRhdGEgOiBvYmplY3RzLmRlZXBGcmVlemUoZGF0YSk7XG59XG5cbnR5cGUgSW5zcGVjdFZhbHVlPFY+ID0gSUluc3BlY3RWYWx1ZTxWPiAmIHsgbWVyZ2VkPzogViB9O1xuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbk1vZGVsIGltcGxlbWVudHMgSUNvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cblx0c3RhdGljIGNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHt9LCBbXSwgW10sIHVuZGVmaW5lZCwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJyaWRlQ29uZmlndXJhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgQ29uZmlndXJhdGlvbk1vZGVsPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnRzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9rZXlzOiBzdHJpbmdbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vdmVycmlkZXM6IElPdmVycmlkZXNbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yYXc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgUmVhZG9ubHlBcnJheTxJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IENvbmZpZ3VyYXRpb25Nb2RlbD4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdHByaXZhdGUgX3Jhd0NvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZDtcblx0Z2V0IHJhd0NvbmZpZ3VyYXRpb24oKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRpZiAoIXRoaXMuX3Jhd0NvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGlmICh0aGlzLl9yYXcpIHtcblx0XHRcdFx0Y29uc3QgcmF3Q29uZmlndXJhdGlvbk1vZGVscyA9IChBcnJheS5pc0FycmF5KHRoaXMuX3JhdykgPyB0aGlzLl9yYXcgOiBbdGhpcy5fcmF3XSkubWFwKHJhdyA9PiB7XG5cdFx0XHRcdFx0aWYgKHJhdyBpbnN0YW5jZW9mIENvbmZpZ3VyYXRpb25Nb2RlbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJhdztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VyID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcignJywgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHRwYXJzZXIucGFyc2VSYXcocmF3KTtcblx0XHRcdFx0XHRyZXR1cm4gcGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3Jhd0NvbmZpZ3VyYXRpb24gPSByYXdDb25maWd1cmF0aW9uTW9kZWxzLnJlZHVjZSgocHJldmlvdXMsIGN1cnJlbnQpID0+IGN1cnJlbnQgPT09IHByZXZpb3VzID8gY3VycmVudCA6IHByZXZpb3VzLm1lcmdlKGN1cnJlbnQpLCByYXdDb25maWd1cmF0aW9uTW9kZWxzWzBdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHJhdyBpcyBzYW1lIGFzIGN1cnJlbnRcblx0XHRcdFx0dGhpcy5fcmF3Q29uZmlndXJhdGlvbiA9IHRoaXM7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yYXdDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRzKCk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudHM7XG5cdH1cblxuXHRnZXQgb3ZlcnJpZGVzKCk6IElPdmVycmlkZXNbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX292ZXJyaWRlcztcblx0fVxuXG5cdGdldCBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5cztcblx0fVxuXG5cdGdldCByYXcoKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPltdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3Jhdykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodGhpcy5fcmF3KSAmJiB0aGlzLl9yYXcuZXZlcnkocmF3ID0+IHJhdyBpbnN0YW5jZW9mIENvbmZpZ3VyYXRpb25Nb2RlbCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yYXcgYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPltdO1xuXHR9XG5cblx0aXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5cy5sZW5ndGggPT09IDAgJiYgT2JqZWN0LmtleXModGhpcy5fY29udGVudHMpLmxlbmd0aCA9PT0gMCAmJiB0aGlzLl9vdmVycmlkZXMubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0Z2V0VmFsdWU8Vj4oc2VjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHNlY3Rpb24gPyBnZXRDb25maWd1cmF0aW9uVmFsdWU8Vj4odGhpcy5jb250ZW50cywgc2VjdGlvbikgOiB0aGlzLmNvbnRlbnRzIGFzIFY7XG5cdH1cblxuXHRpbnNwZWN0PFY+KHNlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgb3ZlcnJpZGVJZGVudGlmaWVyPzogc3RyaW5nIHwgbnVsbCk6IEluc3BlY3RWYWx1ZTxWPiB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldCB2YWx1ZSgpIHtcblx0XHRcdFx0cmV0dXJuIGZyZWV6ZSh0aGF0LnJhd0NvbmZpZ3VyYXRpb24uZ2V0VmFsdWU8Vj4oc2VjdGlvbikpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBvdmVycmlkZSgpIHtcblx0XHRcdFx0cmV0dXJuIG92ZXJyaWRlSWRlbnRpZmllciA/IGZyZWV6ZSh0aGF0LnJhd0NvbmZpZ3VyYXRpb24uZ2V0T3ZlcnJpZGVWYWx1ZTxWPihzZWN0aW9uLCBvdmVycmlkZUlkZW50aWZpZXIpKSA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgbWVyZ2VkKCkge1xuXHRcdFx0XHRyZXR1cm4gZnJlZXplKG92ZXJyaWRlSWRlbnRpZmllciA/IHRoYXQucmF3Q29uZmlndXJhdGlvbi5vdmVycmlkZShvdmVycmlkZUlkZW50aWZpZXIpLmdldFZhbHVlPFY+KHNlY3Rpb24pIDogdGhhdC5yYXdDb25maWd1cmF0aW9uLmdldFZhbHVlPFY+KHNlY3Rpb24pKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgb3ZlcnJpZGVzKCkge1xuXHRcdFx0XHRjb25zdCBvdmVycmlkZXM6IHsgcmVhZG9ubHkgaWRlbnRpZmllcnM6IHN0cmluZ1tdOyByZWFkb25seSB2YWx1ZTogViB9W10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGNvbnRlbnRzLCBpZGVudGlmaWVycywga2V5cyB9IG9mIHRoYXQucmF3Q29uZmlndXJhdGlvbi5vdmVycmlkZXMpIHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoY29udGVudHMsIGtleXMsIFtdLCB1bmRlZmluZWQsIHRoYXQubG9nU2VydmljZSkuZ2V0VmFsdWU8Vj4oc2VjdGlvbik7XG5cdFx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlcy5wdXNoKHsgaWRlbnRpZmllcnMsIHZhbHVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3ZlcnJpZGVzLmxlbmd0aCA/IGZyZWV6ZShvdmVycmlkZXMpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRnZXRPdmVycmlkZVZhbHVlPFY+KHNlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgb3ZlcnJpZGVJZGVudGlmaWVyOiBzdHJpbmcpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBvdmVycmlkZUNvbnRlbnRzID0gdGhpcy5nZXRDb250ZW50c0Zvck92ZXJyaWRlSWRlbnRpZmVyKG92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0cmV0dXJuIG92ZXJyaWRlQ29udGVudHNcblx0XHRcdD8gc2VjdGlvbiA/IGdldENvbmZpZ3VyYXRpb25WYWx1ZTxWPihvdmVycmlkZUNvbnRlbnRzLCBzZWN0aW9uKSA6IG92ZXJyaWRlQ29udGVudHMgYXMgVlxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRLZXlzRm9yT3ZlcnJpZGVJZGVudGlmaWVyKGlkZW50aWZpZXI6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgb3ZlcnJpZGUgb2YgdGhpcy5vdmVycmlkZXMpIHtcblx0XHRcdGlmIChvdmVycmlkZS5pZGVudGlmaWVycy5pbmNsdWRlcyhpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRrZXlzLnB1c2goLi4ub3ZlcnJpZGUua2V5cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhcnJheXMuZGlzdGluY3Qoa2V5cyk7XG5cdH1cblxuXHRnZXRBbGxPdmVycmlkZUlkZW50aWZpZXJzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBvdmVycmlkZSBvZiB0aGlzLm92ZXJyaWRlcykge1xuXHRcdFx0cmVzdWx0LnB1c2goLi4ub3ZlcnJpZGUuaWRlbnRpZmllcnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJyYXlzLmRpc3RpbmN0KHJlc3VsdCk7XG5cdH1cblxuXHRvdmVycmlkZShpZGVudGlmaWVyOiBzdHJpbmcpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGxldCBvdmVycmlkZUNvbmZpZ3VyYXRpb25Nb2RlbCA9IHRoaXMub3ZlcnJpZGVDb25maWd1cmF0aW9ucy5nZXQoaWRlbnRpZmllcik7XG5cdFx0aWYgKCFvdmVycmlkZUNvbmZpZ3VyYXRpb25Nb2RlbCkge1xuXHRcdFx0b3ZlcnJpZGVDb25maWd1cmF0aW9uTW9kZWwgPSB0aGlzLmNyZWF0ZU92ZXJyaWRlQ29uZmlndXJhdGlvbk1vZGVsKGlkZW50aWZpZXIpO1xuXHRcdFx0dGhpcy5vdmVycmlkZUNvbmZpZ3VyYXRpb25zLnNldChpZGVudGlmaWVyLCBvdmVycmlkZUNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBvdmVycmlkZUNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0fVxuXG5cdG1lcmdlKC4uLm90aGVyczogQ29uZmlndXJhdGlvbk1vZGVsW10pOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gb2JqZWN0cy5kZWVwQ2xvbmUodGhpcy5jb250ZW50cyk7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzID0gb2JqZWN0cy5kZWVwQ2xvbmUodGhpcy5vdmVycmlkZXMpO1xuXHRcdGNvbnN0IGtleXMgPSBbLi4udGhpcy5rZXlzXTtcblx0XHRjb25zdCByYXdzID0gdGhpcy5fcmF3ID8gQXJyYXkuaXNBcnJheSh0aGlzLl9yYXcpID8gWy4uLnRoaXMuX3Jhd10gOiBbdGhpcy5fcmF3XSA6IFt0aGlzXTtcblxuXHRcdGZvciAoY29uc3Qgb3RoZXIgb2Ygb3RoZXJzKSB7XG5cdFx0XHRyYXdzLnB1c2goLi4uKG90aGVyLl9yYXcgPyBBcnJheS5pc0FycmF5KG90aGVyLl9yYXcpID8gb3RoZXIuX3JhdyA6IFtvdGhlci5fcmF3XSA6IFtvdGhlcl0pKTtcblx0XHRcdGlmIChvdGhlci5pc0VtcHR5KCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm1lcmdlQ29udGVudHMoY29udGVudHMsIG90aGVyLmNvbnRlbnRzKTtcblxuXHRcdFx0Zm9yIChjb25zdCBvdGhlck92ZXJyaWRlIG9mIG90aGVyLm92ZXJyaWRlcykge1xuXHRcdFx0XHRjb25zdCBbb3ZlcnJpZGVdID0gb3ZlcnJpZGVzLmZpbHRlcihvID0+IGFycmF5cy5lcXVhbHMoby5pZGVudGlmaWVycywgb3RoZXJPdmVycmlkZS5pZGVudGlmaWVycykpO1xuXHRcdFx0XHRpZiAob3ZlcnJpZGUpIHtcblx0XHRcdFx0XHR0aGlzLm1lcmdlQ29udGVudHMob3ZlcnJpZGUuY29udGVudHMsIG90aGVyT3ZlcnJpZGUuY29udGVudHMpO1xuXHRcdFx0XHRcdG92ZXJyaWRlLmtleXMucHVzaCguLi5vdGhlck92ZXJyaWRlLmtleXMpO1xuXHRcdFx0XHRcdG92ZXJyaWRlLmtleXMgPSBhcnJheXMuZGlzdGluY3Qob3ZlcnJpZGUua2V5cyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGVzLnB1c2gob2JqZWN0cy5kZWVwQ2xvbmUob3RoZXJPdmVycmlkZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBvdGhlci5rZXlzKSB7XG5cdFx0XHRcdGlmIChrZXlzLmluZGV4T2Yoa2V5KSA9PT0gLTEpIHtcblx0XHRcdFx0XHRrZXlzLnB1c2goa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbChjb250ZW50cywga2V5cywgb3ZlcnJpZGVzLCAhcmF3cy5sZW5ndGggfHwgcmF3cy5ldmVyeShyYXcgPT4gcmF3IGluc3RhbmNlb2YgQ29uZmlndXJhdGlvbk1vZGVsKSA/IHVuZGVmaW5lZCA6IHJhd3MsIHRoaXMubG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU92ZXJyaWRlQ29uZmlndXJhdGlvbk1vZGVsKGlkZW50aWZpZXI6IHN0cmluZyk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVDb250ZW50cyA9IHRoaXMuZ2V0Q29udGVudHNGb3JPdmVycmlkZUlkZW50aWZlcihpZGVudGlmaWVyKTtcblxuXHRcdGlmICghb3ZlcnJpZGVDb250ZW50cyB8fCB0eXBlb2Ygb3ZlcnJpZGVDb250ZW50cyAhPT0gJ29iamVjdCcgfHwgIU9iamVjdC5rZXlzKG92ZXJyaWRlQ29udGVudHMpLmxlbmd0aCkge1xuXHRcdFx0Ly8gSWYgdGhlcmUgYXJlIG5vIHZhbGlkIG92ZXJyaWRlcywgcmV0dXJuIHNlbGZcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IHt9O1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGFycmF5cy5kaXN0aW5jdChbLi4uT2JqZWN0LmtleXModGhpcy5jb250ZW50cyksIC4uLk9iamVjdC5rZXlzKG92ZXJyaWRlQ29udGVudHMpXSkpIHtcblxuXHRcdFx0bGV0IGNvbnRlbnRzRm9yS2V5ID0gdGhpcy5jb250ZW50c1trZXldO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVDb250ZW50c0ZvcktleSA9IG92ZXJyaWRlQ29udGVudHNba2V5XTtcblxuXHRcdFx0Ly8gSWYgdGhlcmUgYXJlIG92ZXJyaWRlIGNvbnRlbnRzIGZvciB0aGUga2V5LCBjbG9uZSBhbmQgbWVyZ2Ugb3RoZXJ3aXNlIHVzZSBiYXNlIGNvbnRlbnRzXG5cdFx0XHRpZiAob3ZlcnJpZGVDb250ZW50c0ZvcktleSkge1xuXHRcdFx0XHQvLyBDbG9uZSBhbmQgbWVyZ2Ugb25seSBpZiBiYXNlIGNvbnRlbnRzIGFuZCBvdmVycmlkZSBjb250ZW50cyBhcmUgb2YgdHlwZSBvYmplY3Qgb3RoZXJ3aXNlIGp1c3Qgb3ZlcnJpZGVcblx0XHRcdFx0aWYgKHR5cGVvZiBjb250ZW50c0ZvcktleSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG92ZXJyaWRlQ29udGVudHNGb3JLZXkgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0Y29udGVudHNGb3JLZXkgPSBvYmplY3RzLmRlZXBDbG9uZShjb250ZW50c0ZvcktleSk7XG5cdFx0XHRcdFx0dGhpcy5tZXJnZUNvbnRlbnRzKGNvbnRlbnRzRm9yS2V5IGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LCBvdmVycmlkZUNvbnRlbnRzRm9yS2V5IGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250ZW50c0ZvcktleSA9IG92ZXJyaWRlQ29udGVudHNGb3JLZXk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29udGVudHNba2V5XSA9IGNvbnRlbnRzRm9yS2V5O1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKGNvbnRlbnRzLCB0aGlzLmtleXMsIHRoaXMub3ZlcnJpZGVzLCB1bmRlZmluZWQsIHRoaXMubG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIG1lcmdlQ29udGVudHMoc291cmNlOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiwgdGFyZ2V0OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPik6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHRhcmdldCkpIHtcblx0XHRcdGlmIChrZXkgaW4gc291cmNlKSB7XG5cdFx0XHRcdGlmICh0eXBlcy5pc09iamVjdChzb3VyY2Vba2V5XSkgJiYgdHlwZXMuaXNPYmplY3QodGFyZ2V0W2tleV0pKSB7XG5cdFx0XHRcdFx0dGhpcy5tZXJnZUNvbnRlbnRzKHNvdXJjZVtrZXldIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LCB0YXJnZXRba2V5XSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHNvdXJjZVtrZXldID0gb2JqZWN0cy5kZWVwQ2xvbmUodGFyZ2V0W2tleV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udGVudHNGb3JPdmVycmlkZUlkZW50aWZlcihpZGVudGlmaWVyOiBzdHJpbmcpOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IG51bGwge1xuXHRcdGxldCBjb250ZW50c0ZvcklkZW50aWZpZXJPbmx5OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBjb250ZW50czogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBtZXJnZUNvbnRlbnRzID0gKGNvbnRlbnRzVG9NZXJnZTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCBudWxsKSA9PiB7XG5cdFx0XHRpZiAoY29udGVudHNUb01lcmdlKSB7XG5cdFx0XHRcdGlmIChjb250ZW50cykge1xuXHRcdFx0XHRcdHRoaXMubWVyZ2VDb250ZW50cyhjb250ZW50cywgY29udGVudHNUb01lcmdlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250ZW50cyA9IG9iamVjdHMuZGVlcENsb25lKGNvbnRlbnRzVG9NZXJnZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGZvciAoY29uc3Qgb3ZlcnJpZGUgb2YgdGhpcy5vdmVycmlkZXMpIHtcblx0XHRcdGlmIChvdmVycmlkZS5pZGVudGlmaWVycy5sZW5ndGggPT09IDEgJiYgb3ZlcnJpZGUuaWRlbnRpZmllcnNbMF0gPT09IGlkZW50aWZpZXIpIHtcblx0XHRcdFx0Y29udGVudHNGb3JJZGVudGlmaWVyT25seSA9IG92ZXJyaWRlLmNvbnRlbnRzO1xuXHRcdFx0fSBlbHNlIGlmIChvdmVycmlkZS5pZGVudGlmaWVycy5pbmNsdWRlcyhpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRtZXJnZUNvbnRlbnRzKG92ZXJyaWRlLmNvbnRlbnRzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gTWVyZ2UgY29udGVudHMgb2YgdGhlIGlkZW50aWZpZXIgb25seSBhdCB0aGUgZW5kIHRvIHRha2UgcHJlY2VkZW5jZS5cblx0XHRtZXJnZUNvbnRlbnRzKGNvbnRlbnRzRm9ySWRlbnRpZmllck9ubHkpO1xuXHRcdHJldHVybiBjb250ZW50cztcblx0fVxuXG5cdHRvSlNPTigpOiBJQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudHM6IHRoaXMuY29udGVudHMsXG5cdFx0XHRvdmVycmlkZXM6IHRoaXMub3ZlcnJpZGVzLFxuXHRcdFx0a2V5czogdGhpcy5rZXlzXG5cdFx0fTtcblx0fVxuXG5cdC8vIFVwZGF0ZSBtZXRob2RzXG5cblx0cHVibGljIGFkZFZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVmFsdWUoa2V5LCB2YWx1ZSwgdHJ1ZSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlVmFsdWUoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMua2V5cy5pbmRleE9mKGtleSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmtleXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRyZW1vdmVGcm9tVmFsdWVUcmVlKHRoaXMuY29udGVudHMsIGtleSk7XG5cdFx0aWYgKE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSkge1xuXHRcdFx0dGhpcy5vdmVycmlkZXMuc3BsaWNlKHRoaXMub3ZlcnJpZGVzLmZpbmRJbmRleChvID0+IGFycmF5cy5lcXVhbHMoby5pZGVudGlmaWVycywgb3ZlcnJpZGVJZGVudGlmaWVyc0Zyb21LZXkoa2V5KSkpLCAxKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgYWRkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0YWRkVG9WYWx1ZVRyZWUodGhpcy5jb250ZW50cywga2V5LCB2YWx1ZSwgZSA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSkpO1xuXHRcdGFkZCA9IGFkZCB8fCB0aGlzLmtleXMuaW5kZXhPZihrZXkpID09PSAtMTtcblx0XHRpZiAoYWRkKSB7XG5cdFx0XHR0aGlzLmtleXMucHVzaChrZXkpO1xuXHRcdH1cblx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRjb25zdCBvdmVycmlkZUNvbnRlbnRzID0gdGhpcy5jb250ZW50c1trZXldIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllcnMgPSBvdmVycmlkZUlkZW50aWZpZXJzRnJvbUtleShrZXkpO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGUgPSB7XG5cdFx0XHRcdGlkZW50aWZpZXJzLFxuXHRcdFx0XHRrZXlzOiBPYmplY3Qua2V5cyhvdmVycmlkZUNvbnRlbnRzKSxcblx0XHRcdFx0Y29udGVudHM6IHRvVmFsdWVzVHJlZShvdmVycmlkZUNvbnRlbnRzLCBtZXNzYWdlID0+IHRoaXMubG9nU2VydmljZS5lcnJvcihtZXNzYWdlKSksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLm92ZXJyaWRlcy5maW5kSW5kZXgobyA9PiBhcnJheXMuZXF1YWxzKG8uaWRlbnRpZmllcnMsIGlkZW50aWZpZXJzKSk7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMub3ZlcnJpZGVzW2luZGV4XSA9IG92ZXJyaWRlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vdmVycmlkZXMucHVzaChvdmVycmlkZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyB7XG5cdHNraXBVbnJlZ2lzdGVyZWQ/OiBib29sZWFuO1xuXHRzY29wZXM/OiBDb25maWd1cmF0aW9uU2NvcGVbXTtcblx0c2tpcFJlc3RyaWN0ZWQ/OiBib29sZWFuO1xuXHRpbmNsdWRlPzogc3RyaW5nW107XG5cdGV4Y2x1ZGU/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlciB7XG5cblx0cHJpdmF0ZSBfcmF3OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9yZXN0cmljdGVkQ29uZmlndXJhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX3BhcnNlRXJyb3JzOiBqc29uLlBhcnNlRXJyb3JbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfbmFtZTogc3RyaW5nLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHsgfVxuXG5cdGdldCBjb25maWd1cmF0aW9uTW9kZWwoKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbk1vZGVsIHx8IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSk7XG5cdH1cblxuXHRnZXQgcmVzdHJpY3RlZENvbmZpZ3VyYXRpb25zKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzdHJpY3RlZENvbmZpZ3VyYXRpb25zO1xuXHR9XG5cblx0Z2V0IGVycm9ycygpOiBqc29uLlBhcnNlRXJyb3JbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BhcnNlRXJyb3JzO1xuXHR9XG5cblx0cHVibGljIHBhcnNlKGNvbnRlbnQ6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChjb250ZW50KSkge1xuXHRcdFx0Y29uc3QgcmF3ID0gdGhpcy5kb1BhcnNlQ29udGVudChjb250ZW50KTtcblx0XHRcdHRoaXMucGFyc2VSYXcocmF3LCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVwYXJzZShvcHRpb25zOiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Jhdykge1xuXHRcdFx0dGhpcy5wYXJzZVJhdyh0aGlzLl9yYXcsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwYXJzZVJhdyhyYXc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LCBvcHRpb25zPzogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX3JhdyA9IHJhdztcblx0XHRjb25zdCB7IGNvbnRlbnRzLCBrZXlzLCBvdmVycmlkZXMsIHJlc3RyaWN0ZWQsIGhhc0V4Y2x1ZGVkUHJvcGVydGllcyB9ID0gdGhpcy5kb1BhcnNlUmF3KHJhdywgb3B0aW9ucyk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbk1vZGVsID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbChjb250ZW50cywga2V5cywgb3ZlcnJpZGVzLCBoYXNFeGNsdWRlZFByb3BlcnRpZXMgPyBbcmF3XSA6IHVuZGVmaW5lZCAvKiByYXcgaGFzIG5vdCBjaGFuZ2VkICovLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX3Jlc3RyaWN0ZWRDb25maWd1cmF0aW9ucyA9IHJlc3RyaWN0ZWQgfHwgW107XG5cdH1cblxuXHRwcml2YXRlIGRvUGFyc2VDb250ZW50KGNvbnRlbnQ6IHN0cmluZyk6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHtcblx0XHRsZXQgcmF3OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IHt9O1xuXHRcdGxldCBjdXJyZW50UHJvcGVydHk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBjdXJyZW50UGFyZW50OiB1bmtub3duW10gfCBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiA9IFtdO1xuXHRcdGNvbnN0IHByZXZpb3VzUGFyZW50czogKHVua25vd25bXSB8IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KVtdID0gW107XG5cdFx0Y29uc3QgcGFyc2VFcnJvcnM6IGpzb24uUGFyc2VFcnJvcltdID0gW107XG5cblx0XHRmdW5jdGlvbiBvblZhbHVlKHZhbHVlOiB1bmtub3duKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50UGFyZW50KSkge1xuXHRcdFx0XHRjdXJyZW50UGFyZW50LnB1c2godmFsdWUpO1xuXHRcdFx0fSBlbHNlIGlmIChjdXJyZW50UHJvcGVydHkgIT09IG51bGwpIHtcblx0XHRcdFx0Y3VycmVudFBhcmVudFtjdXJyZW50UHJvcGVydHldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaXRvcjoganNvbi5KU09OVmlzaXRvciA9IHtcblx0XHRcdG9uT2JqZWN0QmVnaW46ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0ge307XG5cdFx0XHRcdG9uVmFsdWUob2JqZWN0KTtcblx0XHRcdFx0cHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG5cdFx0XHRcdGN1cnJlbnRQYXJlbnQgPSBvYmplY3Q7XG5cdFx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG5cdFx0XHR9LFxuXHRcdFx0b25PYmplY3RQcm9wZXJ0eTogKG5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjdXJyZW50UHJvcGVydHkgPSBuYW1lO1xuXHRcdFx0fSxcblx0XHRcdG9uT2JqZWN0RW5kOiAoKSA9PiB7XG5cdFx0XHRcdGN1cnJlbnRQYXJlbnQgPSBwcmV2aW91c1BhcmVudHMucG9wKCkhO1xuXHRcdFx0fSxcblx0XHRcdG9uQXJyYXlCZWdpbjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhcnJheTogdW5rbm93bltdID0gW107XG5cdFx0XHRcdG9uVmFsdWUoYXJyYXkpO1xuXHRcdFx0XHRwcmV2aW91c1BhcmVudHMucHVzaChjdXJyZW50UGFyZW50KTtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IGFycmF5O1xuXHRcdFx0XHRjdXJyZW50UHJvcGVydHkgPSBudWxsO1xuXHRcdFx0fSxcblx0XHRcdG9uQXJyYXlFbmQ6ICgpID0+IHtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKSE7XG5cdFx0XHR9LFxuXHRcdFx0b25MaXRlcmFsVmFsdWU6IG9uVmFsdWUsXG5cdFx0XHRvbkVycm9yOiAoZXJyb3I6IGpzb24uUGFyc2VFcnJvckNvZGUsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRwYXJzZUVycm9ycy5wdXNoKHsgZXJyb3IsIG9mZnNldCwgbGVuZ3RoIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGpzb24udmlzaXQoY29udGVudCwgdmlzaXRvcik7XG5cdFx0XHRcdHJhdyA9IChjdXJyZW50UGFyZW50WzBdIGFzIElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KSB8fCB7fTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB3aGlsZSBwYXJzaW5nIHNldHRpbmdzIGZpbGUgJHt0aGlzLl9uYW1lfTogJHtlfWApO1xuXHRcdFx0XHR0aGlzLl9wYXJzZUVycm9ycyA9IFtlIGFzIGpzb24uUGFyc2VFcnJvcl07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJhdztcblx0fVxuXG5cdHByb3RlY3RlZCBkb1BhcnNlUmF3KHJhdzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIG9wdGlvbnM/OiBDb25maWd1cmF0aW9uUGFyc2VPcHRpb25zKTogSUNvbmZpZ3VyYXRpb25Nb2RlbCAmIHsgcmVzdHJpY3RlZD86IHN0cmluZ1tdOyBoYXNFeGNsdWRlZFByb3BlcnRpZXM/OiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHJlZ2lzdHJ5LmdldEV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IHRoaXMuZmlsdGVyKHJhdywgY29uZmlndXJhdGlvblByb3BlcnRpZXMsIGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIHRydWUsIG9wdGlvbnMpO1xuXHRcdHJhdyA9IGZpbHRlcmVkLnJhdztcblx0XHRjb25zdCBjb250ZW50cyA9IHRvVmFsdWVzVHJlZShyYXcsIG1lc3NhZ2UgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBDb25mbGljdCBpbiBzZXR0aW5ncyBmaWxlICR7dGhpcy5fbmFtZX06ICR7bWVzc2FnZX1gKSk7XG5cdFx0Y29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHJhdyk7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzID0gdGhpcy50b092ZXJyaWRlcyhyYXcsIG1lc3NhZ2UgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBDb25mbGljdCBpbiBzZXR0aW5ncyBmaWxlICR7dGhpcy5fbmFtZX06ICR7bWVzc2FnZX1gKSk7XG5cdFx0cmV0dXJuIHsgY29udGVudHMsIGtleXMsIG92ZXJyaWRlcywgcmVzdHJpY3RlZDogZmlsdGVyZWQucmVzdHJpY3RlZCwgaGFzRXhjbHVkZWRQcm9wZXJ0aWVzOiBmaWx0ZXJlZC5oYXNFeGNsdWRlZFByb3BlcnRpZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyKHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+LCBjb25maWd1cmF0aW9uUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+LCBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJU3RyaW5nRGljdGlvbmFyeTxJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4sIGZpbHRlck92ZXJyaWRkZW5Qcm9wZXJ0aWVzOiBib29sZWFuLCBvcHRpb25zPzogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyk6IHsgcmF3OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjsgcmVzdHJpY3RlZDogc3RyaW5nW107IGhhc0V4Y2x1ZGVkUHJvcGVydGllczogYm9vbGVhbiB9IHtcblx0XHRsZXQgaGFzRXhjbHVkZWRQcm9wZXJ0aWVzID0gZmFsc2U7XG5cdFx0aWYgKCFvcHRpb25zPy5zY29wZXMgJiYgIW9wdGlvbnM/LnNraXBSZXN0cmljdGVkICYmICFvcHRpb25zPy5za2lwVW5yZWdpc3RlcmVkICYmICFvcHRpb25zPy5leGNsdWRlPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IHJhdzogcHJvcGVydGllcywgcmVzdHJpY3RlZDogW10sIGhhc0V4Y2x1ZGVkUHJvcGVydGllcyB9O1xuXHRcdH1cblx0XHRjb25zdCByYXc6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+ID0ge307XG5cdFx0Y29uc3QgcmVzdHJpY3RlZDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpICYmIGZpbHRlck92ZXJyaWRkZW5Qcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZmlsdGVyKHByb3BlcnRpZXNba2V5XSBhcyBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiwgY29uZmlndXJhdGlvblByb3BlcnRpZXMsIGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIGZhbHNlLCBvcHRpb25zKTtcblx0XHRcdFx0cmF3W2tleV0gPSByZXN1bHQucmF3O1xuXHRcdFx0XHRoYXNFeGNsdWRlZFByb3BlcnRpZXMgPSBoYXNFeGNsdWRlZFByb3BlcnRpZXMgfHwgcmVzdWx0Lmhhc0V4Y2x1ZGVkUHJvcGVydGllcztcblx0XHRcdFx0cmVzdHJpY3RlZC5wdXNoKC4uLnJlc3VsdC5yZXN0cmljdGVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5U2NoZW1hID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0aWYgKHByb3BlcnR5U2NoZW1hPy5yZXN0cmljdGVkKSB7XG5cdFx0XHRcdFx0cmVzdHJpY3RlZC5wdXNoKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkSW5jbHVkZShrZXksIHByb3BlcnR5U2NoZW1hLCBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBvcHRpb25zKSkge1xuXHRcdFx0XHRcdHJhd1trZXldID0gcHJvcGVydGllc1trZXldO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhc0V4Y2x1ZGVkUHJvcGVydGllcyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgcmF3LCByZXN0cmljdGVkLCBoYXNFeGNsdWRlZFByb3BlcnRpZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkSW5jbHVkZShrZXk6IHN0cmluZywgcHJvcGVydHlTY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQsIGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiwgb3B0aW9uczogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGlmIChvcHRpb25zLmV4Y2x1ZGU/LmluY2x1ZGVzKGtleSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5pbmNsdWRlPy5pbmNsdWRlcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5za2lwUmVzdHJpY3RlZCAmJiBwcm9wZXJ0eVNjaGVtYT8ucmVzdHJpY3RlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnNraXBVbnJlZ2lzdGVyZWQgJiYgIXByb3BlcnR5U2NoZW1hKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NoZW1hID0gcHJvcGVydHlTY2hlbWEgPz8gZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldO1xuXHRcdGNvbnN0IHNjb3BlID0gc2NoZW1hID8gdHlwZW9mIHNjaGVtYS5zY29wZSAhPT0gJ3VuZGVmaW5lZCcgPyBzY2hlbWEuc2NvcGUgOiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XIDogdW5kZWZpbmVkO1xuXHRcdGlmIChzY29wZSA9PT0gdW5kZWZpbmVkIHx8IG9wdGlvbnMuc2NvcGVzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBvcHRpb25zLnNjb3Blcy5pbmNsdWRlcyhzY29wZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvT3ZlcnJpZGVzKHJhdzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4sIGNvbmZsaWN0UmVwb3J0ZXI6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQpOiBJT3ZlcnJpZGVzW10ge1xuXHRcdGNvbnN0IG92ZXJyaWRlczogSU92ZXJyaWRlc1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocmF3KSkge1xuXHRcdFx0aWYgKE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoa2V5KSkge1xuXHRcdFx0XHRjb25zdCBvdmVycmlkZVJhdzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0XHRcdFx0Y29uc3QgcmF3S2V5ID0gcmF3W2tleV0gYXMgSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5SW5PdmVycmlkZVJhdyBpbiByYXdLZXkpIHtcblx0XHRcdFx0XHRvdmVycmlkZVJhd1trZXlJbk92ZXJyaWRlUmF3XSA9IHJhd0tleVtrZXlJbk92ZXJyaWRlUmF3XTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZXMucHVzaCh7XG5cdFx0XHRcdFx0aWRlbnRpZmllcnM6IG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5KGtleSksXG5cdFx0XHRcdFx0a2V5czogT2JqZWN0LmtleXMob3ZlcnJpZGVSYXcpLFxuXHRcdFx0XHRcdGNvbnRlbnRzOiB0b1ZhbHVlc1RyZWUob3ZlcnJpZGVSYXcsIGNvbmZsaWN0UmVwb3J0ZXIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3ZlcnJpZGVzO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJTZXR0aW5ncyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGFyc2VyOiBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXI7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyU2V0dGluZ3NSZXNvdXJjZTogVVJJLFxuXHRcdHByb3RlY3RlZCBwYXJzZU9wdGlvbnM6IENvbmZpZ3VyYXRpb25QYXJzZU9wdGlvbnMsXG5cdFx0ZXh0VXJpOiBJRXh0VXJpLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucGFyc2VyID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbFBhcnNlcih0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlLnRvU3RyaW5nKCksIGxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2goZXh0VXJpLmRpcm5hbWUodGhpcy51c2VyU2V0dGluZ3NSZXNvdXJjZSkpKTtcblx0XHQvLyBBbHNvIGxpc3RlbiB0byB0aGUgcmVzb3VyY2UgaW5jYXNlIHRoZSByZXNvdXJjZSBpcyBhIHN5bWxpbmsgLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4MTM0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS53YXRjaCh0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZSwgZSA9PiBlLmNvbnRhaW5zKHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2UpKSxcblx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uLCBlID0+IChlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uQ1JFQVRFKSB8fCBlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uQ09QWSkgfHwgZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLkRFTEVURSkgfHwgZS5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLldSSVRFKSkgJiYgZXh0VXJpLmlzRXF1YWwoZS5yZXNvdXJjZSwgdXNlclNldHRpbmdzUmVzb3VyY2UpKVxuXHRcdCkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpKSk7XG5cdH1cblxuXHRhc3luYyBsb2FkQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlKTtcblx0XHRcdHRoaXMucGFyc2VyLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSB8fCAne30nLCB0aGlzLnBhcnNlT3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHJlcGFyc2UocGFyc2VPcHRpb25zPzogQ29uZmlndXJhdGlvblBhcnNlT3B0aW9ucyk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0aWYgKHBhcnNlT3B0aW9ucykge1xuXHRcdFx0dGhpcy5wYXJzZU9wdGlvbnMgPSBwYXJzZU9wdGlvbnM7XG5cdFx0fVxuXHRcdHRoaXMucGFyc2VyLnJlcGFyc2UodGhpcy5wYXJzZU9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLnBhcnNlci5jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRnZXRSZXN0cmljdGVkU2V0dGluZ3MoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnBhcnNlci5yZXN0cmljdGVkQ29uZmlndXJhdGlvbnM7XG5cdH1cbn1cblxuY2xhc3MgQ29uZmlndXJhdGlvbkluc3BlY3RWYWx1ZTxWPiBpbXBsZW1lbnRzIElDb25maWd1cmF0aW9uVmFsdWU8Vj4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZhbHVlOiBWIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IG92ZXJyaWRlSWRlbnRpZmllcnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdENvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBvbGljeUNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsVXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZVVzZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lbW9yeUNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsXG5cdCkge1xuXHR9XG5cblx0Z2V0IHZhbHVlKCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBmcmVlemUodGhpcy5fdmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0luc3BlY3RWYWx1ZShpbnNwZWN0VmFsdWU6IElJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQgfCBudWxsKTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGluc3BlY3RWYWx1ZT8udmFsdWUgIT09IHVuZGVmaW5lZCB8fCBpbnNwZWN0VmFsdWU/Lm92ZXJyaWRlICE9PSB1bmRlZmluZWQgfHwgaW5zcGVjdFZhbHVlPy5vdmVycmlkZXMgIT09IHVuZGVmaW5lZCA/IGluc3BlY3RWYWx1ZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2RlZmF1bHRJbnNwZWN0VmFsdWU6IEluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgZGVmYXVsdEluc3BlY3RWYWx1ZSgpOiBJbnNwZWN0VmFsdWU8Vj4ge1xuXHRcdGlmICghdGhpcy5fZGVmYXVsdEluc3BlY3RWYWx1ZSkge1xuXHRcdFx0dGhpcy5fZGVmYXVsdEluc3BlY3RWYWx1ZSA9IHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5zcGVjdDxWPih0aGlzLmtleSwgdGhpcy5vdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRJbnNwZWN0VmFsdWU7XG5cdH1cblxuXHRnZXQgZGVmYXVsdFZhbHVlKCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRJbnNwZWN0VmFsdWUubWVyZ2VkO1xuXHR9XG5cblx0Z2V0IGRlZmF1bHQoKTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudG9JbnNwZWN0VmFsdWUodGhpcy5kZWZhdWx0SW5zcGVjdFZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3BvbGljeUluc3BlY3RWYWx1ZTogSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0cHJpdmF0ZSBnZXQgcG9saWN5SW5zcGVjdFZhbHVlKCk6IEluc3BlY3RWYWx1ZTxWPiB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9wb2xpY3lJbnNwZWN0VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcG9saWN5SW5zcGVjdFZhbHVlID0gdGhpcy5wb2xpY3lDb25maWd1cmF0aW9uID8gdGhpcy5wb2xpY3lDb25maWd1cmF0aW9uLmluc3BlY3Q8Vj4odGhpcy5rZXkpIDogbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BvbGljeUluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCBwb2xpY3lWYWx1ZSgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wb2xpY3lJbnNwZWN0VmFsdWU/Lm1lcmdlZDtcblx0fVxuXG5cdGdldCBwb2xpY3koKTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucG9saWN5SW5zcGVjdFZhbHVlPy52YWx1ZSAhPT0gdW5kZWZpbmVkID8geyB2YWx1ZTogdGhpcy5wb2xpY3lJbnNwZWN0VmFsdWUudmFsdWUgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGxpY2F0aW9uSW5zcGVjdFZhbHVlOiBJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQgfCBudWxsO1xuXHRwcml2YXRlIGdldCBhcHBsaWNhdGlvbkluc3BlY3RWYWx1ZSgpOiBJbnNwZWN0VmFsdWU8Vj4gfCBudWxsIHtcblx0XHRpZiAodGhpcy5fYXBwbGljYXRpb25JbnNwZWN0VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fYXBwbGljYXRpb25JbnNwZWN0VmFsdWUgPSB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbiA/IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLmluc3BlY3Q8Vj4odGhpcy5rZXkpIDogbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FwcGxpY2F0aW9uSW5zcGVjdFZhbHVlO1xuXHR9XG5cblx0Z2V0IGFwcGxpY2F0aW9uVmFsdWUoKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYXBwbGljYXRpb25JbnNwZWN0VmFsdWU/Lm1lcmdlZDtcblx0fVxuXG5cdGdldCBhcHBsaWNhdGlvbigpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0luc3BlY3RWYWx1ZSh0aGlzLmFwcGxpY2F0aW9uSW5zcGVjdFZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VzZXJJbnNwZWN0VmFsdWU6IEluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgdXNlckluc3BlY3RWYWx1ZSgpOiBJbnNwZWN0VmFsdWU8Vj4ge1xuXHRcdGlmICghdGhpcy5fdXNlckluc3BlY3RWYWx1ZSkge1xuXHRcdFx0dGhpcy5fdXNlckluc3BlY3RWYWx1ZSA9IHRoaXMudXNlckNvbmZpZ3VyYXRpb24uaW5zcGVjdDxWPih0aGlzLmtleSwgdGhpcy5vdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3VzZXJJbnNwZWN0VmFsdWU7XG5cdH1cblxuXHRnZXQgdXNlclZhbHVlKCk6IFYgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnVzZXJJbnNwZWN0VmFsdWUubWVyZ2VkO1xuXHR9XG5cblx0Z2V0IHVzZXIoKTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudG9JbnNwZWN0VmFsdWUodGhpcy51c2VySW5zcGVjdFZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VzZXJMb2NhbEluc3BlY3RWYWx1ZTogSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCB1c2VyTG9jYWxJbnNwZWN0VmFsdWUoKTogSW5zcGVjdFZhbHVlPFY+IHtcblx0XHRpZiAoIXRoaXMuX3VzZXJMb2NhbEluc3BlY3RWYWx1ZSkge1xuXHRcdFx0dGhpcy5fdXNlckxvY2FsSW5zcGVjdFZhbHVlID0gdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLmluc3BlY3Q8Vj4odGhpcy5rZXksIHRoaXMub3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91c2VyTG9jYWxJbnNwZWN0VmFsdWU7XG5cdH1cblxuXHRnZXQgdXNlckxvY2FsVmFsdWUoKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckxvY2FsSW5zcGVjdFZhbHVlLm1lcmdlZDtcblx0fVxuXG5cdGdldCB1c2VyTG9jYWwoKTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudG9JbnNwZWN0VmFsdWUodGhpcy51c2VyTG9jYWxJbnNwZWN0VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlclJlbW90ZUluc3BlY3RWYWx1ZTogSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCB1c2VyUmVtb3RlSW5zcGVjdFZhbHVlKCk6IEluc3BlY3RWYWx1ZTxWPiB7XG5cdFx0aWYgKCF0aGlzLl91c2VyUmVtb3RlSW5zcGVjdFZhbHVlKSB7XG5cdFx0XHR0aGlzLl91c2VyUmVtb3RlSW5zcGVjdFZhbHVlID0gdGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbi5pbnNwZWN0PFY+KHRoaXMua2V5LCB0aGlzLm92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXNlclJlbW90ZUluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCB1c2VyUmVtb3RlVmFsdWUoKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudXNlclJlbW90ZUluc3BlY3RWYWx1ZS5tZXJnZWQ7XG5cdH1cblxuXHRnZXQgdXNlclJlbW90ZSgpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0luc3BlY3RWYWx1ZSh0aGlzLnVzZXJSZW1vdGVJbnNwZWN0VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlSW5zcGVjdFZhbHVlOiBJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQgfCBudWxsO1xuXHRwcml2YXRlIGdldCB3b3Jrc3BhY2VJbnNwZWN0VmFsdWUoKTogSW5zcGVjdFZhbHVlPFY+IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3dvcmtzcGFjZUluc3BlY3RWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VJbnNwZWN0VmFsdWUgPSB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPyB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24uaW5zcGVjdDxWPih0aGlzLmtleSwgdGhpcy5vdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVyKSA6IG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VJbnNwZWN0VmFsdWU7XG5cdH1cblxuXHRnZXQgd29ya3NwYWNlVmFsdWUoKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlSW5zcGVjdFZhbHVlPy5tZXJnZWQ7XG5cdH1cblxuXHRnZXQgd29ya3NwYWNlKCk6IElJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnRvSW5zcGVjdFZhbHVlKHRoaXMud29ya3NwYWNlSW5zcGVjdFZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3dvcmtzcGFjZUZvbGRlckluc3BlY3RWYWx1ZTogSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0cHJpdmF0ZSBnZXQgd29ya3NwYWNlRm9sZGVySW5zcGVjdFZhbHVlKCk6IEluc3BlY3RWYWx1ZTxWPiB8IG51bGwge1xuXHRcdGlmICh0aGlzLl93b3Jrc3BhY2VGb2xkZXJJbnNwZWN0VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlRm9sZGVySW5zcGVjdFZhbHVlID0gdGhpcy5mb2xkZXJDb25maWd1cmF0aW9uTW9kZWwgPyB0aGlzLmZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbC5pbnNwZWN0PFY+KHRoaXMua2V5LCB0aGlzLm92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpIDogbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUZvbGRlckluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VGb2xkZXJWYWx1ZSgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VGb2xkZXJJbnNwZWN0VmFsdWU/Lm1lcmdlZDtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VGb2xkZXIoKTogSUluc3BlY3RWYWx1ZTxWPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudG9JbnNwZWN0VmFsdWUodGhpcy53b3Jrc3BhY2VGb2xkZXJJbnNwZWN0VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVtb3J5SW5zcGVjdFZhbHVlOiBJbnNwZWN0VmFsdWU8Vj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IG1lbW9yeUluc3BlY3RWYWx1ZSgpOiBJbnNwZWN0VmFsdWU8Vj4ge1xuXHRcdGlmICh0aGlzLl9tZW1vcnlJbnNwZWN0VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbWVtb3J5SW5zcGVjdFZhbHVlID0gdGhpcy5tZW1vcnlDb25maWd1cmF0aW9uTW9kZWwuaW5zcGVjdDxWPih0aGlzLmtleSwgdGhpcy5vdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21lbW9yeUluc3BlY3RWYWx1ZTtcblx0fVxuXG5cdGdldCBtZW1vcnlWYWx1ZSgpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tZW1vcnlJbnNwZWN0VmFsdWUubWVyZ2VkO1xuXHR9XG5cblx0Z2V0IG1lbW9yeSgpOiBJSW5zcGVjdFZhbHVlPFY+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50b0luc3BlY3RWYWx1ZSh0aGlzLm1lbW9yeUluc3BlY3RWYWx1ZSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbiB7XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2ZvbGRlcnNDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9ucyA9IG5ldyBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZGVmYXVsdENvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIF9wb2xpY3lDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwsXG5cdFx0cHJpdmF0ZSBfYXBwbGljYXRpb25Db25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwsXG5cdFx0cHJpdmF0ZSBfbG9jYWxVc2VyQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLFxuXHRcdHByaXZhdGUgX3JlbW90ZVVzZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwsXG5cdFx0cHJpdmF0ZSBfd29ya3NwYWNlQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLFxuXHRcdHByaXZhdGUgX2ZvbGRlckNvbmZpZ3VyYXRpb25zOiBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+LFxuXHRcdHByaXZhdGUgX21lbW9yeUNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIF9tZW1vcnlDb25maWd1cmF0aW9uQnlSZXNvdXJjZTogUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0Z2V0VmFsdWUoc2VjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCB3b3Jrc3BhY2U6IFdvcmtzcGFjZSB8IHVuZGVmaW5lZCk6IHVua25vd24ge1xuXHRcdGNvbnN0IGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbk1vZGVsID0gdGhpcy5nZXRDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uTW9kZWwoc2VjdGlvbiwgb3ZlcnJpZGVzLCB3b3Jrc3BhY2UpO1xuXHRcdHJldHVybiBjb25zb2xpZGF0ZUNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZShzZWN0aW9uKTtcblx0fVxuXG5cdHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyA9IHt9KTogdm9pZCB7XG5cdFx0bGV0IG1lbW9yeUNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAob3ZlcnJpZGVzLnJlc291cmNlKSB7XG5cdFx0XHRtZW1vcnlDb25maWd1cmF0aW9uID0gdGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbkJ5UmVzb3VyY2UuZ2V0KG92ZXJyaWRlcy5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoIW1lbW9yeUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0bWVtb3J5Q29uZmlndXJhdGlvbiA9IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRcdHRoaXMuX21lbW9yeUNvbmZpZ3VyYXRpb25CeVJlc291cmNlLnNldChvdmVycmlkZXMucmVzb3VyY2UsIG1lbW9yeUNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZW1vcnlDb25maWd1cmF0aW9uID0gdGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbjtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bWVtb3J5Q29uZmlndXJhdGlvbi5yZW1vdmVWYWx1ZShrZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZW1vcnlDb25maWd1cmF0aW9uLnNldFZhbHVlKGtleSwgdmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmICghb3ZlcnJpZGVzLnJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRpbnNwZWN0PEM+KGtleTogc3RyaW5nLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCB3b3Jrc3BhY2U6IFdvcmtzcGFjZSB8IHVuZGVmaW5lZCk6IElDb25maWd1cmF0aW9uVmFsdWU8Qz4ge1xuXHRcdGNvbnN0IGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbk1vZGVsID0gdGhpcy5nZXRDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uTW9kZWwoa2V5LCBvdmVycmlkZXMsIHdvcmtzcGFjZSk7XG5cdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsID0gdGhpcy5nZXRGb2xkZXJDb25maWd1cmF0aW9uTW9kZWxGb3JSZXNvdXJjZShvdmVycmlkZXMucmVzb3VyY2UsIHdvcmtzcGFjZSk7XG5cdFx0Y29uc3QgbWVtb3J5Q29uZmlndXJhdGlvbk1vZGVsID0gb3ZlcnJpZGVzLnJlc291cmNlID8gdGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbkJ5UmVzb3VyY2UuZ2V0KG92ZXJyaWRlcy5yZXNvdXJjZSkgfHwgdGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbiA6IHRoaXMuX21lbW9yeUNvbmZpZ3VyYXRpb247XG5cdFx0Y29uc3Qgb3ZlcnJpZGVJZGVudGlmaWVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qgb3ZlcnJpZGUgb2YgY29uc29saWRhdGVDb25maWd1cmF0aW9uTW9kZWwub3ZlcnJpZGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllciBvZiBvdmVycmlkZS5pZGVudGlmaWVycykge1xuXHRcdFx0XHRpZiAoY29uc29saWRhdGVDb25maWd1cmF0aW9uTW9kZWwuZ2V0T3ZlcnJpZGVWYWx1ZShrZXksIG92ZXJyaWRlSWRlbnRpZmllcikgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnMuYWRkKG92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IENvbmZpZ3VyYXRpb25JbnNwZWN0VmFsdWU8Qz4oXG5cdFx0XHRrZXksXG5cdFx0XHRvdmVycmlkZXMsXG5cdFx0XHRjb25zb2xpZGF0ZUNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZTxDPihrZXkpLFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVycy5zaXplID8gWy4uLm92ZXJyaWRlSWRlbnRpZmllcnNdIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uLmlzRW1wdHkoKSA/IHVuZGVmaW5lZCA6IHRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5pc0VtcHR5KCkgPyB1bmRlZmluZWQgOiB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbixcblx0XHRcdHRoaXMudXNlckNvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLFxuXHRcdFx0d29ya3NwYWNlID8gdGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbCA/IGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbCA6IHVuZGVmaW5lZCxcblx0XHRcdG1lbW9yeUNvbmZpZ3VyYXRpb25Nb2RlbFxuXHRcdCk7XG5cblx0fVxuXG5cdGtleXMod29ya3NwYWNlOiBXb3Jrc3BhY2UgfCB1bmRlZmluZWQpOiB7XG5cdFx0ZGVmYXVsdDogc3RyaW5nW107XG5cdFx0cG9saWN5OiBzdHJpbmdbXTtcblx0XHR1c2VyOiBzdHJpbmdbXTtcblx0XHR3b3Jrc3BhY2U6IHN0cmluZ1tdO1xuXHRcdHdvcmtzcGFjZUZvbGRlcjogc3RyaW5nW107XG5cdH0ge1xuXHRcdGNvbnN0IGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbCA9IHRoaXMuZ2V0Rm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsRm9yUmVzb3VyY2UodW5kZWZpbmVkLCB3b3Jrc3BhY2UpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkZWZhdWx0OiB0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbi5rZXlzLnNsaWNlKDApLFxuXHRcdFx0cG9saWN5OiB0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uLmtleXMuc2xpY2UoMCksXG5cdFx0XHR1c2VyOiB0aGlzLnVzZXJDb25maWd1cmF0aW9uLmtleXMuc2xpY2UoMCksXG5cdFx0XHR3b3Jrc3BhY2U6IHRoaXMuX3dvcmtzcGFjZUNvbmZpZ3VyYXRpb24ua2V5cy5zbGljZSgwKSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsID8gZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsLmtleXMuc2xpY2UoMCkgOiBbXVxuXHRcdH07XG5cdH1cblxuXHR1cGRhdGVEZWZhdWx0Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkZWZhdWx0Q29uZmlndXJhdGlvbjtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHVwZGF0ZVBvbGljeUNvbmZpZ3VyYXRpb24ocG9saWN5Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbiA9IHBvbGljeUNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHR1cGRhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oYXBwbGljYXRpb25Db25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gPSBhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb247XG5cdFx0dGhpcy5fd29ya3NwYWNlQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbiA9IG51bGw7XG5cdFx0dGhpcy5fZm9sZGVyc0NvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25zLmNsZWFyKCk7XG5cdH1cblxuXHR1cGRhdGVMb2NhbFVzZXJDb25maWd1cmF0aW9uKGxvY2FsVXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvY2FsVXNlckNvbmZpZ3VyYXRpb24gPSBsb2NhbFVzZXJDb25maWd1cmF0aW9uO1xuXHRcdHRoaXMuX3VzZXJDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHVwZGF0ZVJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHJlbW90ZVVzZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW1vdGVVc2VyQ29uZmlndXJhdGlvbiA9IHJlbW90ZVVzZXJDb25maWd1cmF0aW9uO1xuXHRcdHRoaXMuX3VzZXJDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uID0gbnVsbDtcblx0XHR0aGlzLl9mb2xkZXJzQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24od29ya3NwYWNlQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb247XG5cdFx0dGhpcy5fd29ya3NwYWNlQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbiA9IG51bGw7XG5cdFx0dGhpcy5fZm9sZGVyc0NvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25zLmNsZWFyKCk7XG5cdH1cblxuXHR1cGRhdGVGb2xkZXJDb25maWd1cmF0aW9uKHJlc291cmNlOiBVUkksIGNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvbGRlckNvbmZpZ3VyYXRpb25zLnNldChyZXNvdXJjZSwgY29uZmlndXJhdGlvbik7XG5cdFx0dGhpcy5fZm9sZGVyc0NvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25zLmRlbGV0ZShyZXNvdXJjZSk7XG5cdH1cblxuXHRkZWxldGVGb2xkZXJDb25maWd1cmF0aW9uKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLmZvbGRlckNvbmZpZ3VyYXRpb25zLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0dGhpcy5fZm9sZGVyc0NvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25zLmRlbGV0ZShyZXNvdXJjZSk7XG5cdH1cblxuXHRjb21wYXJlQW5kVXBkYXRlRGVmYXVsdENvbmZpZ3VyYXRpb24oZGVmYXVsdHM6IENvbmZpZ3VyYXRpb25Nb2RlbCwga2V5cz86IHN0cmluZ1tdKTogSUNvbmZpZ3VyYXRpb25DaGFuZ2Uge1xuXHRcdGNvbnN0IG92ZXJyaWRlczogW3N0cmluZywgc3RyaW5nW11dW10gPSBbXTtcblx0XHRpZiAoIWtleXMpIHtcblx0XHRcdGNvbnN0IHsgYWRkZWQsIHVwZGF0ZWQsIHJlbW92ZWQgfSA9IGNvbXBhcmUodGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24sIGRlZmF1bHRzKTtcblx0XHRcdGtleXMgPSBbLi4uYWRkZWQsIC4uLnVwZGF0ZWQsIC4uLnJlbW92ZWRdO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllciBvZiBvdmVycmlkZUlkZW50aWZpZXJzRnJvbUtleShrZXkpKSB7XG5cdFx0XHRcdGNvbnN0IGZyb21LZXlzID0gdGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24uZ2V0S2V5c0Zvck92ZXJyaWRlSWRlbnRpZmllcihvdmVycmlkZUlkZW50aWZpZXIpO1xuXHRcdFx0XHRjb25zdCB0b0tleXMgPSBkZWZhdWx0cy5nZXRLZXlzRm9yT3ZlcnJpZGVJZGVudGlmaWVyKG92ZXJyaWRlSWRlbnRpZmllcik7XG5cdFx0XHRcdGNvbnN0IGtleXMgPSBbXG5cdFx0XHRcdFx0Li4udG9LZXlzLmZpbHRlcihrZXkgPT4gZnJvbUtleXMuaW5kZXhPZihrZXkpID09PSAtMSksXG5cdFx0XHRcdFx0Li4uZnJvbUtleXMuZmlsdGVyKGtleSA9PiB0b0tleXMuaW5kZXhPZihrZXkpID09PSAtMSksXG5cdFx0XHRcdFx0Li4uZnJvbUtleXMuZmlsdGVyKGtleSA9PiAhb2JqZWN0cy5lcXVhbHModGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24ub3ZlcnJpZGUob3ZlcnJpZGVJZGVudGlmaWVyKS5nZXRWYWx1ZShrZXkpLCBkZWZhdWx0cy5vdmVycmlkZShvdmVycmlkZUlkZW50aWZpZXIpLmdldFZhbHVlKGtleSkpKVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRvdmVycmlkZXMucHVzaChbb3ZlcnJpZGVJZGVudGlmaWVyLCBrZXlzXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlRGVmYXVsdENvbmZpZ3VyYXRpb24oZGVmYXVsdHMpO1xuXHRcdHJldHVybiB7IGtleXMsIG92ZXJyaWRlcyB9O1xuXHR9XG5cblx0Y29tcGFyZUFuZFVwZGF0ZVBvbGljeUNvbmZpZ3VyYXRpb24ocG9saWN5Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogSUNvbmZpZ3VyYXRpb25DaGFuZ2Uge1xuXHRcdGNvbnN0IHsgYWRkZWQsIHVwZGF0ZWQsIHJlbW92ZWQgfSA9IGNvbXBhcmUodGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbiwgcG9saWN5Q29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3Qga2V5cyA9IFsuLi5hZGRlZCwgLi4udXBkYXRlZCwgLi4ucmVtb3ZlZF07XG5cdFx0aWYgKGtleXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVBvbGljeUNvbmZpZ3VyYXRpb24ocG9saWN5Q29uZmlndXJhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiB7IGtleXMsIG92ZXJyaWRlczogW10gfTtcblx0fVxuXG5cdGNvbXBhcmVBbmRVcGRhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oYXBwbGljYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IElDb25maWd1cmF0aW9uQ2hhbmdlIHtcblx0XHRjb25zdCB7IGFkZGVkLCB1cGRhdGVkLCByZW1vdmVkLCBvdmVycmlkZXMgfSA9IGNvbXBhcmUodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24sIGFwcGxpY2F0aW9uKTtcblx0XHRjb25zdCBrZXlzID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkLCAuLi5yZW1vdmVkXTtcblx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMudXBkYXRlQXBwbGljYXRpb25Db25maWd1cmF0aW9uKGFwcGxpY2F0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2V5cywgb3ZlcnJpZGVzIH07XG5cdH1cblxuXHRjb21wYXJlQW5kVXBkYXRlTG9jYWxVc2VyQ29uZmlndXJhdGlvbih1c2VyOiBDb25maWd1cmF0aW9uTW9kZWwpOiBJQ29uZmlndXJhdGlvbkNoYW5nZSB7XG5cdFx0Y29uc3QgeyBhZGRlZCwgdXBkYXRlZCwgcmVtb3ZlZCwgb3ZlcnJpZGVzIH0gPSBjb21wYXJlKHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbiwgdXNlcik7XG5cdFx0Y29uc3Qga2V5cyA9IFsuLi5hZGRlZCwgLi4udXBkYXRlZCwgLi4ucmVtb3ZlZF07XG5cdFx0aWYgKGtleXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUxvY2FsVXNlckNvbmZpZ3VyYXRpb24odXNlcik7XG5cdFx0fVxuXHRcdHJldHVybiB7IGtleXMsIG92ZXJyaWRlcyB9O1xuXHR9XG5cblx0Y29tcGFyZUFuZFVwZGF0ZVJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHVzZXI6IENvbmZpZ3VyYXRpb25Nb2RlbCk6IElDb25maWd1cmF0aW9uQ2hhbmdlIHtcblx0XHRjb25zdCB7IGFkZGVkLCB1cGRhdGVkLCByZW1vdmVkLCBvdmVycmlkZXMgfSA9IGNvbXBhcmUodGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbiwgdXNlcik7XG5cdFx0Y29uc3Qga2V5cyA9IFsuLi5hZGRlZCwgLi4udXBkYXRlZCwgLi4ucmVtb3ZlZF07XG5cdFx0aWYgKGtleXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHVzZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBrZXlzLCBvdmVycmlkZXMgfTtcblx0fVxuXG5cdGNvbXBhcmVBbmRVcGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IElDb25maWd1cmF0aW9uQ2hhbmdlIHtcblx0XHRjb25zdCB7IGFkZGVkLCB1cGRhdGVkLCByZW1vdmVkLCBvdmVycmlkZXMgfSA9IGNvbXBhcmUodGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLCB3b3Jrc3BhY2VDb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBrZXlzID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkLCAuLi5yZW1vdmVkXTtcblx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMudXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbih3b3Jrc3BhY2VDb25maWd1cmF0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2V5cywgb3ZlcnJpZGVzIH07XG5cdH1cblxuXHRjb21wYXJlQW5kVXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihyZXNvdXJjZTogVVJJLCBmb2xkZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiBJQ29uZmlndXJhdGlvbkNoYW5nZSB7XG5cdFx0Y29uc3QgY3VycmVudEZvbGRlckNvbmZpZ3VyYXRpb24gPSB0aGlzLmZvbGRlckNvbmZpZ3VyYXRpb25zLmdldChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgeyBhZGRlZCwgdXBkYXRlZCwgcmVtb3ZlZCwgb3ZlcnJpZGVzIH0gPSBjb21wYXJlKGN1cnJlbnRGb2xkZXJDb25maWd1cmF0aW9uLCBmb2xkZXJDb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBrZXlzID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkLCAuLi5yZW1vdmVkXTtcblx0XHRpZiAoa2V5cy5sZW5ndGggfHwgIWN1cnJlbnRGb2xkZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUZvbGRlckNvbmZpZ3VyYXRpb24ocmVzb3VyY2UsIGZvbGRlckNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4geyBrZXlzLCBvdmVycmlkZXMgfTtcblx0fVxuXG5cdGNvbXBhcmVBbmREZWxldGVGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlcjogVVJJKTogSUNvbmZpZ3VyYXRpb25DaGFuZ2Uge1xuXHRcdGNvbnN0IGZvbGRlckNvbmZpZyA9IHRoaXMuZm9sZGVyQ29uZmlndXJhdGlvbnMuZ2V0KGZvbGRlcik7XG5cdFx0aWYgKCFmb2xkZXJDb25maWcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBmb2xkZXInKTtcblx0XHR9XG5cdFx0dGhpcy5kZWxldGVGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlcik7XG5cdFx0Y29uc3QgeyBhZGRlZCwgdXBkYXRlZCwgcmVtb3ZlZCwgb3ZlcnJpZGVzIH0gPSBjb21wYXJlKGZvbGRlckNvbmZpZywgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4geyBrZXlzOiBbLi4uYWRkZWQsIC4uLnVwZGF0ZWQsIC4uLnJlbW92ZWRdLCBvdmVycmlkZXMgfTtcblx0fVxuXG5cdGdldCBkZWZhdWx0cygpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGdldCBhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5fYXBwbGljYXRpb25Db25maWd1cmF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlckNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCB8IG51bGwgPSBudWxsO1xuXHRnZXQgdXNlckNvbmZpZ3VyYXRpb24oKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRpZiAoIXRoaXMuX3VzZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRpZiAodGhpcy5fcmVtb3RlVXNlckNvbmZpZ3VyYXRpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHRoaXMuX3VzZXJDb25maWd1cmF0aW9uID0gdGhpcy5fbG9jYWxVc2VyQ29uZmlndXJhdGlvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1lcmdlZCA9IHRoaXMuX2xvY2FsVXNlckNvbmZpZ3VyYXRpb24ubWVyZ2UodGhpcy5fcmVtb3RlVXNlckNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0XHR0aGlzLl91c2VyQ29uZmlndXJhdGlvbiA9IG5ldyBDb25maWd1cmF0aW9uTW9kZWwobWVyZ2VkLmNvbnRlbnRzLCBtZXJnZWQua2V5cywgbWVyZ2VkLm92ZXJyaWRlcywgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXNlckNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRnZXQgbG9jYWxVc2VyQ29uZmlndXJhdGlvbigpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhbFVzZXJDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0Z2V0IHJlbW90ZVVzZXJDb25maWd1cmF0aW9uKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVVzZXJDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGdldCBmb2xkZXJDb25maWd1cmF0aW9ucygpOiBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHRyZXR1cm4gdGhpcy5fZm9sZGVyQ29uZmlndXJhdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25Nb2RlbChzZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIHdvcmtzcGFjZTogV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRsZXQgY29uZmlndXJhdGlvbk1vZGVsID0gdGhpcy5nZXRDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uTW9kZWxGb3JSZXNvdXJjZShvdmVycmlkZXMsIHdvcmtzcGFjZSk7XG5cdFx0aWYgKG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXIpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGNvbmZpZ3VyYXRpb25Nb2RlbC5vdmVycmlkZShvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVyKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uLmlzRW1wdHkoKSAmJiB0aGlzLl9wb2xpY3lDb25maWd1cmF0aW9uLmdldFZhbHVlKHNlY3Rpb24pICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIGNsb25lIGJ5IG1lcmdpbmdcblx0XHRcdGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGNvbmZpZ3VyYXRpb25Nb2RlbC5tZXJnZSgpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbi5rZXlzKSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25Nb2RlbC5zZXRWYWx1ZShrZXksIHRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24uZ2V0VmFsdWUoa2V5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25Nb2RlbEZvclJlc291cmNlKHsgcmVzb3VyY2UgfTogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIHdvcmtzcGFjZTogV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRsZXQgY29uc29saWRhdGVDb25maWd1cmF0aW9uID0gdGhpcy5nZXRXb3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uKCk7XG5cblx0XHRpZiAod29ya3NwYWNlICYmIHJlc291cmNlKSB7XG5cdFx0XHRjb25zdCByb290ID0gd29ya3NwYWNlLmdldEZvbGRlcihyZXNvdXJjZSk7XG5cdFx0XHRpZiAocm9vdCkge1xuXHRcdFx0XHRjb25zb2xpZGF0ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLmdldEZvbGRlckNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24ocm9vdC51cmkpIHx8IGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lbW9yeUNvbmZpZ3VyYXRpb25Gb3JSZXNvdXJjZSA9IHRoaXMuX21lbW9yeUNvbmZpZ3VyYXRpb25CeVJlc291cmNlLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAobWVtb3J5Q29uZmlndXJhdGlvbkZvclJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbiA9IGNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbi5tZXJnZShtZW1vcnlDb25maWd1cmF0aW9uRm9yUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb25zb2xpZGF0ZUNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24oKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24gPSB0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbi5tZXJnZSh0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbiwgdGhpcy51c2VyQ29uZmlndXJhdGlvbiwgdGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbiwgdGhpcy5fbWVtb3J5Q29uZmlndXJhdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRGb2xkZXJDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9uKGZvbGRlcjogVVJJKTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRsZXQgZm9sZGVyQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbiA9IHRoaXMuX2ZvbGRlcnNDb25zb2xpZGF0ZWRDb25maWd1cmF0aW9ucy5nZXQoZm9sZGVyKTtcblx0XHRpZiAoIWZvbGRlckNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbiA9IHRoaXMuZ2V0V29ya3NwYWNlQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuX2ZvbGRlckNvbmZpZ3VyYXRpb25zLmdldChmb2xkZXIpO1xuXHRcdFx0aWYgKGZvbGRlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0Zm9sZGVyQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbiA9IHdvcmtzcGFjZUNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbi5tZXJnZShmb2xkZXJDb25maWd1cmF0aW9uKTtcblx0XHRcdFx0dGhpcy5fZm9sZGVyc0NvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb25zLnNldChmb2xkZXIsIGZvbGRlckNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9sZGVyQ29uc29saWRhdGVkQ29uZmlndXJhdGlvbiA9IHdvcmtzcGFjZUNvbnNvbGlkYXRlQ29uZmlndXJhdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZvbGRlckNvbnNvbGlkYXRlZENvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRwcml2YXRlIGdldEZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbEZvclJlc291cmNlKHJlc291cmNlOiBVUkkgfCBudWxsIHwgdW5kZWZpbmVkLCB3b3Jrc3BhY2U6IFdvcmtzcGFjZSB8IHVuZGVmaW5lZCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHdvcmtzcGFjZSAmJiByZXNvdXJjZSkge1xuXHRcdFx0Y29uc3Qgcm9vdCA9IHdvcmtzcGFjZS5nZXRGb2xkZXIocmVzb3VyY2UpO1xuXHRcdFx0aWYgKHJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2ZvbGRlckNvbmZpZ3VyYXRpb25zLmdldChyb290LnVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHR0b0RhdGEoKTogSUNvbmZpZ3VyYXRpb25EYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGVmYXVsdHM6IHtcblx0XHRcdFx0Y29udGVudHM6IHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uLmNvbnRlbnRzLFxuXHRcdFx0XHRvdmVycmlkZXM6IHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uLm92ZXJyaWRlcyxcblx0XHRcdFx0a2V5czogdGhpcy5fZGVmYXVsdENvbmZpZ3VyYXRpb24ua2V5cyxcblx0XHRcdH0sXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0Y29udGVudHM6IHRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24uY29udGVudHMsXG5cdFx0XHRcdG92ZXJyaWRlczogdGhpcy5fcG9saWN5Q29uZmlndXJhdGlvbi5vdmVycmlkZXMsXG5cdFx0XHRcdGtleXM6IHRoaXMuX3BvbGljeUNvbmZpZ3VyYXRpb24ua2V5c1xuXHRcdFx0fSxcblx0XHRcdGFwcGxpY2F0aW9uOiB7XG5cdFx0XHRcdGNvbnRlbnRzOiB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5jb250ZW50cyxcblx0XHRcdFx0b3ZlcnJpZGVzOiB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5vdmVycmlkZXMsXG5cdFx0XHRcdGtleXM6IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uLmtleXMsXG5cdFx0XHRcdHJhdzogQXJyYXkuaXNBcnJheSh0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5yYXcpID8gdW5kZWZpbmVkIDogdGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24ucmF3XG5cdFx0XHR9LFxuXHRcdFx0dXNlckxvY2FsOiB7XG5cdFx0XHRcdGNvbnRlbnRzOiB0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24uY29udGVudHMsXG5cdFx0XHRcdG92ZXJyaWRlczogdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLm92ZXJyaWRlcyxcblx0XHRcdFx0a2V5czogdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLmtleXMsXG5cdFx0XHRcdHJhdzogQXJyYXkuaXNBcnJheSh0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ucmF3KSA/IHVuZGVmaW5lZCA6IHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5yYXdcblx0XHRcdH0sXG5cdFx0XHR1c2VyUmVtb3RlOiB7XG5cdFx0XHRcdGNvbnRlbnRzOiB0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLmNvbnRlbnRzLFxuXHRcdFx0XHRvdmVycmlkZXM6IHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ub3ZlcnJpZGVzLFxuXHRcdFx0XHRrZXlzOiB0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLmtleXMsXG5cdFx0XHRcdHJhdzogQXJyYXkuaXNBcnJheSh0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLnJhdykgPyB1bmRlZmluZWQgOiB0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLnJhd1xuXHRcdFx0fSxcblx0XHRcdHdvcmtzcGFjZToge1xuXHRcdFx0XHRjb250ZW50czogdGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbi5jb250ZW50cyxcblx0XHRcdFx0b3ZlcnJpZGVzOiB0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLm92ZXJyaWRlcyxcblx0XHRcdFx0a2V5czogdGhpcy5fd29ya3NwYWNlQ29uZmlndXJhdGlvbi5rZXlzXG5cdFx0XHR9LFxuXHRcdFx0Zm9sZGVyczogWy4uLnRoaXMuX2ZvbGRlckNvbmZpZ3VyYXRpb25zLmtleXMoKV0ucmVkdWNlPFtVcmlDb21wb25lbnRzLCBJQ29uZmlndXJhdGlvbk1vZGVsXVtdPigocmVzdWx0LCBmb2xkZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBjb250ZW50cywgb3ZlcnJpZGVzLCBrZXlzIH0gPSB0aGlzLl9mb2xkZXJDb25maWd1cmF0aW9ucy5nZXQoZm9sZGVyKSE7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFtmb2xkZXIsIHsgY29udGVudHMsIG92ZXJyaWRlcywga2V5cyB9XSk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9LCBbXSlcblx0XHR9O1xuXHR9XG5cblx0YWxsS2V5cygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3Qga2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLl9kZWZhdWx0Q29uZmlndXJhdGlvbi5rZXlzLmZvckVhY2goa2V5ID0+IGtleXMuYWRkKGtleSkpO1xuXHRcdHRoaXMudXNlckNvbmZpZ3VyYXRpb24ua2V5cy5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmtleXMuZm9yRWFjaChrZXkgPT4ga2V5cy5hZGQoa2V5KSk7XG5cdFx0dGhpcy5fZm9sZGVyQ29uZmlndXJhdGlvbnMuZm9yRWFjaChmb2xkZXJDb25maWd1cmF0aW9uID0+IGZvbGRlckNvbmZpZ3VyYXRpb24ua2V5cy5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKSk7XG5cdFx0cmV0dXJuIFsuLi5rZXlzLnZhbHVlcygpXTtcblx0fVxuXG5cdHByb3RlY3RlZCBhbGxPdmVycmlkZUlkZW50aWZpZXJzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBrZXlzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uLmdldEFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLnVzZXJDb25maWd1cmF0aW9uLmdldEFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldEFsbE92ZXJyaWRlSWRlbnRpZmllcnMoKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLl9mb2xkZXJDb25maWd1cmF0aW9ucy5mb3JFYWNoKGZvbGRlckNvbmZpZ3VyYXRpb24gPT4gZm9sZGVyQ29uZmlndXJhdGlvbi5nZXRBbGxPdmVycmlkZUlkZW50aWZpZXJzKCkuZm9yRWFjaChrZXkgPT4ga2V5cy5hZGQoa2V5KSkpO1xuXHRcdHJldHVybiBbLi4ua2V5cy52YWx1ZXMoKV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0QWxsS2V5c0Zvck92ZXJyaWRlSWRlbnRpZmllcihvdmVycmlkZUlkZW50aWZpZXI6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBrZXlzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX2RlZmF1bHRDb25maWd1cmF0aW9uLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIob3ZlcnJpZGVJZGVudGlmaWVyKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLnVzZXJDb25maWd1cmF0aW9uLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIob3ZlcnJpZGVJZGVudGlmaWVyKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLl93b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIob3ZlcnJpZGVJZGVudGlmaWVyKS5mb3JFYWNoKGtleSA9PiBrZXlzLmFkZChrZXkpKTtcblx0XHR0aGlzLl9mb2xkZXJDb25maWd1cmF0aW9ucy5mb3JFYWNoKGZvbGRlckNvbmZpZ3VyYXRpb24gPT4gZm9sZGVyQ29uZmlndXJhdGlvbi5nZXRLZXlzRm9yT3ZlcnJpZGVJZGVudGlmaWVyKG92ZXJyaWRlSWRlbnRpZmllcikuZm9yRWFjaChrZXkgPT4ga2V5cy5hZGQoa2V5KSkpO1xuXHRcdHJldHVybiBbLi4ua2V5cy52YWx1ZXMoKV07XG5cdH1cblxuXHRzdGF0aWMgcGFyc2UoZGF0YTogSUNvbmZpZ3VyYXRpb25EYXRhLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IENvbmZpZ3VyYXRpb24ge1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gdGhpcy5wYXJzZUNvbmZpZ3VyYXRpb25Nb2RlbChkYXRhLmRlZmF1bHRzLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBwb2xpY3lDb25maWd1cmF0aW9uID0gdGhpcy5wYXJzZUNvbmZpZ3VyYXRpb25Nb2RlbChkYXRhLnBvbGljeSwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25Db25maWd1cmF0aW9uID0gdGhpcy5wYXJzZUNvbmZpZ3VyYXRpb25Nb2RlbChkYXRhLmFwcGxpY2F0aW9uLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCB1c2VyTG9jYWxDb25maWd1cmF0aW9uID0gdGhpcy5wYXJzZUNvbmZpZ3VyYXRpb25Nb2RlbChkYXRhLnVzZXJMb2NhbCwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgdXNlclJlbW90ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLnBhcnNlQ29uZmlndXJhdGlvbk1vZGVsKGRhdGEudXNlclJlbW90ZSwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMucGFyc2VDb25maWd1cmF0aW9uTW9kZWwoZGF0YS53b3Jrc3BhY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGZvbGRlcnM6IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4gPSBkYXRhLmZvbGRlcnMucmVkdWNlKChyZXN1bHQsIHZhbHVlKSA9PiB7XG5cdFx0XHRyZXN1bHQuc2V0KFVSSS5yZXZpdmUodmFsdWVbMF0pLCB0aGlzLnBhcnNlQ29uZmlndXJhdGlvbk1vZGVsKHZhbHVlWzFdLCBsb2dTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sIG5ldyBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+KCkpO1xuXHRcdHJldHVybiBuZXcgQ29uZmlndXJhdGlvbihcblx0XHRcdGRlZmF1bHRDb25maWd1cmF0aW9uLFxuXHRcdFx0cG9saWN5Q29uZmlndXJhdGlvbixcblx0XHRcdGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbixcblx0XHRcdHVzZXJMb2NhbENvbmZpZ3VyYXRpb24sXG5cdFx0XHR1c2VyUmVtb3RlQ29uZmlndXJhdGlvbixcblx0XHRcdHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24sXG5cdFx0XHRmb2xkZXJzLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRuZXcgUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPigpLFxuXHRcdFx0bG9nU2VydmljZVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBwYXJzZUNvbmZpZ3VyYXRpb25Nb2RlbChtb2RlbDogSUNvbmZpZ3VyYXRpb25Nb2RlbCwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKG1vZGVsLmNvbnRlbnRzLCBtb2RlbC5rZXlzLCBtb2RlbC5vdmVycmlkZXMsIG1vZGVsLnJhdywgbG9nU2VydmljZSk7XG5cdH1cblxufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VDaGFuZ2VzKC4uLmNoYW5nZXM6IElDb25maWd1cmF0aW9uQ2hhbmdlW10pOiBJQ29uZmlndXJhdGlvbkNoYW5nZSB7XG5cdGlmIChjaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB7IGtleXM6IFtdLCBvdmVycmlkZXM6IFtdIH07XG5cdH1cblx0aWYgKGNoYW5nZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIGNoYW5nZXNbMF07XG5cdH1cblx0Y29uc3Qga2V5c1NldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBvdmVycmlkZXNNYXAgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG5cdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRjaGFuZ2Uua2V5cy5mb3JFYWNoKGtleSA9PiBrZXlzU2V0LmFkZChrZXkpKTtcblx0XHRjaGFuZ2Uub3ZlcnJpZGVzLmZvckVhY2goKFtpZGVudGlmaWVyLCBrZXlzXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0T3JTZXQob3ZlcnJpZGVzTWFwLCBpZGVudGlmaWVyLCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdFx0XHRrZXlzLmZvckVhY2goa2V5ID0+IHJlc3VsdC5hZGQoa2V5KSk7XG5cdFx0fSk7XG5cdH1cblx0Y29uc3Qgb3ZlcnJpZGVzOiBbc3RyaW5nLCBzdHJpbmdbXV1bXSA9IFtdO1xuXHRvdmVycmlkZXNNYXAuZm9yRWFjaCgoa2V5cywgaWRlbnRpZmllcikgPT4gb3ZlcnJpZGVzLnB1c2goW2lkZW50aWZpZXIsIFsuLi5rZXlzLnZhbHVlcygpXV0pKTtcblx0cmV0dXJuIHsga2V5czogWy4uLmtleXNTZXQudmFsdWVzKCldLCBvdmVycmlkZXMgfTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCBpbXBsZW1lbnRzIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtlciA9ICdcXG4nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJDb2RlMSA9IHRoaXMuX21hcmtlci5jaGFyQ29kZUF0KDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJDb2RlMiA9ICcuJy5jaGFyQ29kZUF0KDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZmZlY3RzQ29uZmlnU3RyOiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgYWZmZWN0ZWRLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHNvdXJjZSE6IENvbmZpZ3VyYXRpb25UYXJnZXQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY2hhbmdlOiBJQ29uZmlndXJhdGlvbkNoYW5nZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByZXZpb3VzOiB7IHdvcmtzcGFjZT86IFdvcmtzcGFjZTsgZGF0YTogSUNvbmZpZ3VyYXRpb25EYXRhIH0gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjdXJyZW50Q29uZmlndXJhaXRvbjogQ29uZmlndXJhdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRXb3Jrc3BhY2U6IFdvcmtzcGFjZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGNoYW5nZS5rZXlzKSB7XG5cdFx0XHR0aGlzLmFmZmVjdGVkS2V5cy5hZGQoa2V5KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbLCBrZXlzXSBvZiBjaGFuZ2Uub3ZlcnJpZGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRcdHRoaXMuYWZmZWN0ZWRLZXlzLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEV4YW1wbGU6ICdcXG5mb28uYmFyXFxuYWJjLmRlZlxcbidcblx0XHR0aGlzLl9hZmZlY3RzQ29uZmlnU3RyID0gdGhpcy5fbWFya2VyO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuYWZmZWN0ZWRLZXlzKSB7XG5cdFx0XHR0aGlzLl9hZmZlY3RzQ29uZmlnU3RyICs9IGtleSArIHRoaXMuX21hcmtlcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2aW91c0NvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBwcmV2aW91c0NvbmZpZ3VyYXRpb24oKTogQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9wcmV2aW91c0NvbmZpZ3VyYXRpb24gJiYgdGhpcy5wcmV2aW91cykge1xuXHRcdFx0dGhpcy5fcHJldmlvdXNDb25maWd1cmF0aW9uID0gQ29uZmlndXJhdGlvbi5wYXJzZSh0aGlzLnByZXZpb3VzLmRhdGEsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcmV2aW91c0NvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRhZmZlY3RzQ29uZmlndXJhdGlvbihzZWN0aW9uOiBzdHJpbmcsIG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogYm9vbGVhbiB7XG5cdFx0Ly8gd2UgaGF2ZSBvbmUgbGFyZ2Ugc3RyaW5nIHdpdGggYWxsIGtleXMgdGhhdCBoYXZlIGNoYW5nZWQuIHdlIHBhZCAobWFya2VyKSB0aGUgc2VjdGlvblxuXHRcdC8vIGFuZCBjaGVjayB0aGF0IGVpdGhlciBmaW5kIGl0IHBhZGRlZCBvciBiZWZvcmUgYSBzZWdtZW50IGNoYXJhY3RlclxuXHRcdGNvbnN0IG5lZWRsZSA9IHRoaXMuX21hcmtlciArIHNlY3Rpb247XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fYWZmZWN0c0NvbmZpZ1N0ci5pbmRleE9mKG5lZWRsZSk7XG5cdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdC8vIE5PVDogKG1hcmtlciArIHNlY3Rpb24pXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBvcyA9IGlkeCArIG5lZWRsZS5sZW5ndGg7XG5cdFx0aWYgKHBvcyA+PSB0aGlzLl9hZmZlY3RzQ29uZmlnU3RyLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBjb2RlID0gdGhpcy5fYWZmZWN0c0NvbmZpZ1N0ci5jaGFyQ29kZUF0KHBvcyk7XG5cdFx0aWYgKGNvZGUgIT09IHRoaXMuX21hcmtlckNvZGUxICYmIGNvZGUgIT09IHRoaXMuX21hcmtlckNvZGUyKSB7XG5cdFx0XHQvLyBOT1Q6IHNlY3Rpb24gKyAobWFya2VyIHwgc2VnbWVudClcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKG92ZXJyaWRlcykge1xuXHRcdFx0Y29uc3QgdmFsdWUxID0gdGhpcy5wcmV2aW91c0NvbmZpZ3VyYXRpb24gPyB0aGlzLnByZXZpb3VzQ29uZmlndXJhdGlvbi5nZXRWYWx1ZShzZWN0aW9uLCBvdmVycmlkZXMsIHRoaXMucHJldmlvdXM/LndvcmtzcGFjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB2YWx1ZTIgPSB0aGlzLmN1cnJlbnRDb25maWd1cmFpdG9uLmdldFZhbHVlKHNlY3Rpb24sIG92ZXJyaWRlcywgdGhpcy5jdXJyZW50V29ya3NwYWNlKTtcblx0XHRcdHJldHVybiAhb2JqZWN0cy5lcXVhbHModmFsdWUxLCB2YWx1ZTIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb21wYXJlKGZyb206IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZCwgdG86IENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZCk6IElDb25maWd1cmF0aW9uQ29tcGFyZVJlc3VsdCB7XG5cdGNvbnN0IHsgYWRkZWQsIHJlbW92ZWQsIHVwZGF0ZWQgfSA9IGNvbXBhcmVDb25maWd1cmF0aW9uQ29udGVudHModG8/LnJhd0NvbmZpZ3VyYXRpb24sIGZyb20/LnJhd0NvbmZpZ3VyYXRpb24pO1xuXHRjb25zdCBvdmVycmlkZXM6IFtzdHJpbmcsIHN0cmluZ1tdXVtdID0gW107XG5cblx0Y29uc3QgZnJvbU92ZXJyaWRlSWRlbnRpZmllcnMgPSBmcm9tPy5nZXRBbGxPdmVycmlkZUlkZW50aWZpZXJzKCkgfHwgW107XG5cdGNvbnN0IHRvT3ZlcnJpZGVJZGVudGlmaWVycyA9IHRvPy5nZXRBbGxPdmVycmlkZUlkZW50aWZpZXJzKCkgfHwgW107XG5cblx0aWYgKHRvKSB7XG5cdFx0Y29uc3QgYWRkZWRPdmVycmlkZUlkZW50aWZpZXJzID0gdG9PdmVycmlkZUlkZW50aWZpZXJzLmZpbHRlcihrZXkgPT4gIWZyb21PdmVycmlkZUlkZW50aWZpZXJzLmluY2x1ZGVzKGtleSkpO1xuXHRcdGZvciAoY29uc3QgaWRlbnRpZmllciBvZiBhZGRlZE92ZXJyaWRlSWRlbnRpZmllcnMpIHtcblx0XHRcdG92ZXJyaWRlcy5wdXNoKFtpZGVudGlmaWVyLCB0by5nZXRLZXlzRm9yT3ZlcnJpZGVJZGVudGlmaWVyKGlkZW50aWZpZXIpXSk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGZyb20pIHtcblx0XHRjb25zdCByZW1vdmVkT3ZlcnJpZGVJZGVudGlmaWVycyA9IGZyb21PdmVycmlkZUlkZW50aWZpZXJzLmZpbHRlcihrZXkgPT4gIXRvT3ZlcnJpZGVJZGVudGlmaWVycy5pbmNsdWRlcyhrZXkpKTtcblx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgcmVtb3ZlZE92ZXJyaWRlSWRlbnRpZmllcnMpIHtcblx0XHRcdG92ZXJyaWRlcy5wdXNoKFtpZGVudGlmaWVyLCBmcm9tLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIoaWRlbnRpZmllcildKTtcblx0XHR9XG5cdH1cblxuXHRpZiAodG8gJiYgZnJvbSkge1xuXHRcdGZvciAoY29uc3QgaWRlbnRpZmllciBvZiBmcm9tT3ZlcnJpZGVJZGVudGlmaWVycykge1xuXHRcdFx0aWYgKHRvT3ZlcnJpZGVJZGVudGlmaWVycy5pbmNsdWRlcyhpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBjb21wYXJlQ29uZmlndXJhdGlvbkNvbnRlbnRzKHsgY29udGVudHM6IGZyb20uZ2V0T3ZlcnJpZGVWYWx1ZSh1bmRlZmluZWQsIGlkZW50aWZpZXIpIHx8IHt9LCBrZXlzOiBmcm9tLmdldEtleXNGb3JPdmVycmlkZUlkZW50aWZpZXIoaWRlbnRpZmllcikgfSwgeyBjb250ZW50czogdG8uZ2V0T3ZlcnJpZGVWYWx1ZSh1bmRlZmluZWQsIGlkZW50aWZpZXIpIHx8IHt9LCBrZXlzOiB0by5nZXRLZXlzRm9yT3ZlcnJpZGVJZGVudGlmaWVyKGlkZW50aWZpZXIpIH0pO1xuXHRcdFx0XHRvdmVycmlkZXMucHVzaChbaWRlbnRpZmllciwgWy4uLnJlc3VsdC5hZGRlZCwgLi4ucmVzdWx0LnJlbW92ZWQsIC4uLnJlc3VsdC51cGRhdGVkXV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkLCBvdmVycmlkZXMgfTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUNvbmZpZ3VyYXRpb25Db250ZW50cyh0bzogeyBrZXlzOiBzdHJpbmdbXTsgY29udGVudHM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IH0gfCB1bmRlZmluZWQsIGZyb206IHsga2V5czogc3RyaW5nW107IGNvbnRlbnRzOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB9IHwgdW5kZWZpbmVkKSB7XG5cdGNvbnN0IGFkZGVkID0gdG9cblx0XHQ/IGZyb20gPyB0by5rZXlzLmZpbHRlcihrZXkgPT4gZnJvbS5rZXlzLmluZGV4T2Yoa2V5KSA9PT0gLTEpIDogWy4uLnRvLmtleXNdXG5cdFx0OiBbXTtcblx0Y29uc3QgcmVtb3ZlZCA9IGZyb21cblx0XHQ/IHRvID8gZnJvbS5rZXlzLmZpbHRlcihrZXkgPT4gdG8ua2V5cy5pbmRleE9mKGtleSkgPT09IC0xKSA6IFsuLi5mcm9tLmtleXNdXG5cdFx0OiBbXTtcblx0Y29uc3QgdXBkYXRlZDogc3RyaW5nW10gPSBbXTtcblxuXHRpZiAodG8gJiYgZnJvbSkge1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGZyb20ua2V5cykge1xuXHRcdFx0aWYgKHRvLmtleXMuaW5kZXhPZihrZXkpICE9PSAtMSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZTEgPSBnZXRDb25maWd1cmF0aW9uVmFsdWUoZnJvbS5jb250ZW50cywga2V5KTtcblx0XHRcdFx0Y29uc3QgdmFsdWUyID0gZ2V0Q29uZmlndXJhdGlvblZhbHVlKHRvLmNvbnRlbnRzLCBrZXkpO1xuXHRcdFx0XHRpZiAoIW9iamVjdHMuZXF1YWxzKHZhbHVlMSwgdmFsdWUyKSkge1xuXHRcdFx0XHRcdHVwZGF0ZWQucHVzaChrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkLCB1cGRhdGVkIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFFeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsVUFBVSxtQkFBbUI7QUFDdEMsWUFBWSxhQUFhO0FBRXpCLFlBQVksV0FBVztBQUN2QixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZ0JBQXFDLHVCQUFzUCxxQkFBcUIsb0JBQW9CO0FBQzdVLFNBQVMsb0JBQW9CLFlBQWtFLDRCQUE0QiwrQkFBdUU7QUFDbE0sU0FBUyxxQkFBbUM7QUFFNUMsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxPQUFVLE1BQVk7QUFDOUIsU0FBTyxPQUFPLFNBQVMsSUFBSSxJQUFJLE9BQU8sUUFBUSxXQUFXLElBQUk7QUFDOUQ7QUFJTyxNQUFNLG1CQUFrRDtBQUFBLEVBUTlELFlB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
