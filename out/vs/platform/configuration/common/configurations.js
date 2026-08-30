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
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { deepClone, equals } from "../../../base/common/objects.js";
import { isEmptyObject, isString } from "../../../base/common/types.js";
import { ConfigurationModel } from "./configurationModels.js";
import { Extensions } from "./configurationRegistry.js";
import { ILogService, NullLogService } from "../../log/common/log.js";
import { IPolicyService } from "../../policy/common/policy.js";
import { Registry } from "../../registry/common/platform.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import * as json from "../../../base/common/json.js";
class DefaultConfiguration extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._configurationModel = ConfigurationModel.createEmptyModel(logService);
  }
  get configurationModel() {
    return this._configurationModel;
  }
  async initialize() {
    this.resetConfigurationModel();
    this._register(Registry.as(Extensions.Configuration).onDidUpdateConfiguration(({ properties, defaultsOverrides }) => this.onDidUpdateConfiguration(Array.from(properties), defaultsOverrides)));
    return this.configurationModel;
  }
  reload() {
    this.resetConfigurationModel();
    return this.configurationModel;
  }
  onDidUpdateConfiguration(properties, defaultsOverrides) {
    this.updateConfigurationModel(properties, Registry.as(Extensions.Configuration).getConfigurationProperties());
    this._onDidChangeConfiguration.fire({ defaults: this.configurationModel, properties });
  }
  getConfigurationDefaultOverrides() {
    return {};
  }
  resetConfigurationModel() {
    this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
    const properties = Registry.as(Extensions.Configuration).getConfigurationProperties();
    this.updateConfigurationModel(Object.keys(properties), properties);
  }
  updateConfigurationModel(properties, configurationProperties) {
    const configurationDefaultsOverrides = this.getConfigurationDefaultOverrides();
    for (const key of properties) {
      const defaultOverrideValue = configurationDefaultsOverrides[key];
      const propertySchema = configurationProperties[key];
      if (defaultOverrideValue !== void 0) {
        this._configurationModel.setValue(key, defaultOverrideValue);
      } else if (propertySchema) {
        this._configurationModel.setValue(key, this.getDefaultValue(key, propertySchema));
      } else {
        this._configurationModel.removeValue(key);
      }
    }
  }
  getDefaultValue(_key, propertySchema) {
    return deepClone(propertySchema.default);
  }
}
class NullPolicyConfiguration {
  constructor() {
    this.onDidChangeConfiguration = Event.None;
    this.configurationModel = ConfigurationModel.createEmptyModel(new NullLogService());
  }
  async initialize() {
    return this.configurationModel;
  }
}
let PolicyConfiguration = class extends Disposable {
  constructor(defaultConfiguration, policyService, logService) {
    super();
    this.defaultConfiguration = defaultConfiguration;
    this.policyService = policyService;
    this.logService = logService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    /** Last definition submitted per policy name; avoids redundant re-registration. */
    this._submittedPolicyDefinitions = /* @__PURE__ */ new Map();
    /** Maps each policy-controlled setting key to its policy name, so removed keys can be re-resolved. */
    this._policyNameByKey = /* @__PURE__ */ new Map();
    this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
    this.configurationRegistry = Registry.as(Extensions.Configuration);
  }
  get configurationModel() {
    return this._configurationModel;
  }
  async initialize() {
    this.logService.trace("PolicyConfiguration#initialize");
    this.update(await this.updatePolicyDefinitions(this.defaultConfiguration.configurationModel.keys), false);
    this.update(await this.updatePolicyDefinitions(Object.keys(this.configurationRegistry.getExcludedConfigurationProperties())), false);
    this._register(this.policyService.onDidChange((policyNames) => this.onDidChangePolicies(policyNames)));
    this._register(this.defaultConfiguration.onDidChangeConfiguration(async ({ properties }) => this.update(await this.updatePolicyDefinitions(properties), true)));
    return this._configurationModel;
  }
  toPolicyDefinitionType(configType, policyName) {
    const configTypes = Array.isArray(configType) ? configType : [configType];
    const supportedTypes = configTypes.filter((type) => type === "string" || type === "number" || type === "array" || type === "object" || type === "boolean");
    if (supportedTypes.length === 0) {
      this.logService.warn(`PolicyConfiguration#updatePolicyDefinitions - policy '${policyName}' has unsupported type '${configType}'`);
      return void 0;
    }
    return supportedTypes.includes("number") ? "number" : supportedTypes.includes("boolean") ? "boolean" : "string";
  }
  async updatePolicyDefinitions(properties) {
    this.logService.trace("PolicyConfiguration#updatePolicyDefinitions", properties);
    const keys = [];
    const policyNames = /* @__PURE__ */ new Set();
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
    for (const key of properties) {
      const config = configurationProperties[key] ?? excludedConfigurationProperties[key];
      if (!config) {
        keys.push(key);
        const removedPolicyName = this._policyNameByKey.get(key);
        if (removedPolicyName !== void 0) {
          this._policyNameByKey.delete(key);
          policyNames.add(removedPolicyName);
        }
        continue;
      }
      const policyName = config.policy?.name ?? config.policyReference?.name;
      if (policyName) {
        keys.push(key);
        policyNames.add(policyName);
        this._policyNameByKey.set(key, policyName);
      }
    }
    const changedDefinitions = {};
    for (const policyName of policyNames) {
      const definition = this.resolvePolicyDefinition(policyName);
      if (definition && !this.isSamePolicyDefinition(this._submittedPolicyDefinitions.get(policyName), definition)) {
        this._submittedPolicyDefinitions.set(policyName, definition);
        changedDefinitions[policyName] = definition;
      }
    }
    if (!isEmptyObject(changedDefinitions)) {
      await this.policyService.updatePolicyDefinitions(changedDefinitions);
    }
    return keys;
  }
  isSamePolicyDefinition(a, b) {
    return !!a && a.type === b.type && a.value === b.value && a.managedSettings === b.managedSettings && a.restrictedValue === b.restrictedValue;
  }
  /** Resolve the authoritative definition: owner wins; references provide a bare type fallback. */
  resolvePolicyDefinition(policyName) {
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
    const ownerKey = this.configurationRegistry.getPolicyConfigurations().get(policyName);
    if (ownerKey !== void 0) {
      const config = configurationProperties[ownerKey] ?? excludedConfigurationProperties[ownerKey];
      if (config?.policy) {
        const type = this.toPolicyDefinitionType(config.type, policyName);
        const { value, managedSettings, restrictedValue } = config.policy;
        return type ? { type, value, managedSettings, restrictedValue } : void 0;
      }
    }
    const referenceKeys = this.configurationRegistry.getPolicyReferenceConfigurations().get(policyName);
    for (const referenceKey of referenceKeys ?? []) {
      const config = configurationProperties[referenceKey] ?? excludedConfigurationProperties[referenceKey];
      if (config?.policyReference) {
        const type = this.toPolicyDefinitionType(config.type, policyName);
        return type ? { type } : void 0;
      }
    }
    return void 0;
  }
  onDidChangePolicies(policyNames) {
    this.logService.trace("PolicyConfiguration#onDidChangePolicies", policyNames);
    const policyConfigurations = this.configurationRegistry.getPolicyConfigurations();
    const policyReferenceConfigurations = this.configurationRegistry.getPolicyReferenceConfigurations();
    const keys = [];
    for (const policyName of policyNames) {
      const owner = policyConfigurations.get(policyName);
      if (owner) {
        keys.push(owner);
      }
      const references = policyReferenceConfigurations.get(policyName);
      if (references) {
        keys.push(...references);
      }
    }
    this.update(keys, true);
  }
  update(keys, trigger) {
    this.logService.trace("PolicyConfiguration#update", keys);
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
    const changed = [];
    const wasEmpty = this._configurationModel.isEmpty();
    for (const key of keys) {
      const property = configurationProperties[key] ?? excludedConfigurationProperties[key];
      const policyName = property?.policy?.name ?? property?.policyReference?.name;
      if (policyName) {
        let policyValue = this.policyService.getPolicyValue(policyName);
        const acceptsStringType = Array.isArray(property.type) ? property.type.includes("string") : property.type === "string";
        if (isString(policyValue) && !acceptsStringType) {
          try {
            policyValue = this.parse(policyValue);
          } catch (e) {
            this.logService.error(`Error parsing policy value ${policyName}:`, getErrorMessage(e));
            continue;
          }
        }
        if (wasEmpty ? policyValue !== void 0 : !equals(this._configurationModel.getValue(key), policyValue)) {
          changed.push([key, policyValue]);
        }
      } else {
        if (this._configurationModel.getValue(key) !== void 0) {
          changed.push([key, void 0]);
        }
      }
    }
    if (changed.length) {
      this.logService.trace("PolicyConfiguration#changed", changed);
      const old = this._configurationModel;
      this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
      for (const key of old.keys) {
        this._configurationModel.setValue(key, old.getValue(key));
      }
      for (const [key, policyValue] of changed) {
        if (policyValue === void 0) {
          this._configurationModel.removeValue(key);
        } else {
          this._configurationModel.setValue(key, policyValue);
        }
      }
      if (trigger) {
        this._onDidChangeConfiguration.fire(this._configurationModel);
      }
    }
  }
  parse(content) {
    let raw = {};
    let currentProperty = null;
    let currentParent = [];
    const previousParents = [];
    const parseErrors = [];
    function onValue(value) {
      if (Array.isArray(currentParent)) {
        currentParent.push(value);
      } else if (currentProperty !== null) {
        if (currentParent[currentProperty] !== void 0) {
          throw new Error(`Duplicate property found: ${currentProperty}`);
        }
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
      json.visit(content, visitor);
      raw = currentParent[0] || raw;
    }
    if (parseErrors.length > 0) {
      throw new Error(parseErrors.map((e) => getErrorMessage(e.error)).join("\n"));
    }
    return raw;
  }
};
PolicyConfiguration = __decorateClass([
  __decorateParam(1, IPolicyService),
  __decorateParam(2, ILogService)
], PolicyConfiguration);
export {
  DefaultConfiguration,
  NullPolicyConfiguration,
  PolicyConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29uZmlndXJhdGlvblxcY29tbW9uXFxjb25maWd1cmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSwgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc0VtcHR5T2JqZWN0LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25Nb2RlbCB9IGZyb20gJy4vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBJUmVnaXN0ZXJlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9IGZyb20gJy4vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQb2xpY3lTZXJ2aWNlLCBQb2xpY3lEZWZpbml0aW9uLCBQb2xpY3lWYWx1ZSB9IGZyb20gJy4uLy4uL3BvbGljeS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgKiBhcyBqc29uIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgUG9saWN5TmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BvbGljeS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0Q29uZmlndXJhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZGVmYXVsdHM6IENvbmZpZ3VyYXRpb25Nb2RlbDsgcHJvcGVydGllczogc3RyaW5nW10gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbDtcblx0Z2V0IGNvbmZpZ3VyYXRpb25Nb2RlbCgpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uTW9kZWw7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwgPSBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHR0aGlzLnJlc2V0Q29uZmlndXJhdGlvbk1vZGVsKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24oKHsgcHJvcGVydGllcywgZGVmYXVsdHNPdmVycmlkZXMgfSkgPT4gdGhpcy5vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24oQXJyYXkuZnJvbShwcm9wZXJ0aWVzKSwgZGVmYXVsdHNPdmVycmlkZXMpKSk7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0cmVsb2FkKCk6IENvbmZpZ3VyYXRpb25Nb2RlbCB7XG5cdFx0dGhpcy5yZXNldENvbmZpZ3VyYXRpb25Nb2RlbCgpO1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24ocHJvcGVydGllczogc3RyaW5nW10sIGRlZmF1bHRzT3ZlcnJpZGVzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlQ29uZmlndXJhdGlvbk1vZGVsKHByb3BlcnRpZXMsIFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmZpcmUoeyBkZWZhdWx0czogdGhpcy5jb25maWd1cmF0aW9uTW9kZWwsIHByb3BlcnRpZXMgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXMoKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4ge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXRDb25maWd1cmF0aW9uTW9kZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbk1vZGVsID0gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdHRoaXMudXBkYXRlQ29uZmlndXJhdGlvbk1vZGVsKE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLCBwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvbk1vZGVsKHByb3BlcnRpZXM6IHN0cmluZ1tdLCBjb25maWd1cmF0aW9uUHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+KTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzID0gdGhpcy5nZXRDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlcygpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHByb3BlcnRpZXMpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRPdmVycmlkZVZhbHVlID0gY29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzW2tleV07XG5cdFx0XHRjb25zdCBwcm9wZXJ0eVNjaGVtYSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRpZiAoZGVmYXVsdE92ZXJyaWRlVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwuc2V0VmFsdWUoa2V5LCBkZWZhdWx0T3ZlcnJpZGVWYWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHByb3BlcnR5U2NoZW1hKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5zZXRWYWx1ZShrZXksIHRoaXMuZ2V0RGVmYXVsdFZhbHVlKGtleSwgcHJvcGVydHlTY2hlbWEpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5yZW1vdmVWYWx1ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXREZWZhdWx0VmFsdWUoX2tleTogc3RyaW5nLCBwcm9wZXJ0eVNjaGVtYTogSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiB1bmtub3duIHtcblx0XHRyZXR1cm4gZGVlcENsb25lKHByb3BlcnR5U2NoZW1hLmRlZmF1bHQpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUG9saWN5Q29uZmlndXJhdGlvbiB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRXZlbnQ8Q29uZmlndXJhdGlvbk1vZGVsPjtcblx0cmVhZG9ubHkgY29uZmlndXJhdGlvbk1vZGVsOiBDb25maWd1cmF0aW9uTW9kZWw7XG5cdGluaXRpYWxpemUoKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+O1xufVxuXG5leHBvcnQgY2xhc3MgTnVsbFBvbGljeUNvbmZpZ3VyYXRpb24gaW1wbGVtZW50cyBJUG9saWN5Q29uZmlndXJhdGlvbiB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25Nb2RlbCA9IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0YXN5bmMgaW5pdGlhbGl6ZSgpIHsgcmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbk1vZGVsOyB9XG59XG5cbnR5cGUgUGFyc2VkVHlwZSA9IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgQXJyYXk8dW5rbm93bj47XG5cbmV4cG9ydCBjbGFzcyBQb2xpY3lDb25maWd1cmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQb2xpY3lDb25maWd1cmF0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDb25maWd1cmF0aW9uTW9kZWw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uUmVnaXN0cnk6IElDb25maWd1cmF0aW9uUmVnaXN0cnk7XG5cblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvbk1vZGVsOiBDb25maWd1cmF0aW9uTW9kZWw7XG5cdGdldCBjb25maWd1cmF0aW9uTW9kZWwoKSB7IHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uTW9kZWw7IH1cblxuXHQvKiogTGFzdCBkZWZpbml0aW9uIHN1Ym1pdHRlZCBwZXIgcG9saWN5IG5hbWU7IGF2b2lkcyByZWR1bmRhbnQgcmUtcmVnaXN0cmF0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJtaXR0ZWRQb2xpY3lEZWZpbml0aW9ucyA9IG5ldyBNYXA8UG9saWN5TmFtZSwgUG9saWN5RGVmaW5pdGlvbj4oKTtcblxuXHQvKiogTWFwcyBlYWNoIHBvbGljeS1jb250cm9sbGVkIHNldHRpbmcga2V5IHRvIGl0cyBwb2xpY3kgbmFtZSwgc28gcmVtb3ZlZCBrZXlzIGNhbiBiZSByZS1yZXNvbHZlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcG9saWN5TmFtZUJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIFBvbGljeU5hbWU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0Q29uZmlndXJhdGlvbjogRGVmYXVsdENvbmZpZ3VyYXRpb24sXG5cdFx0QElQb2xpY3lTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcG9saWN5U2VydmljZTogSVBvbGljeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwgPSBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0fVxuXG5cdGFzeW5jIGluaXRpYWxpemUoKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1BvbGljeUNvbmZpZ3VyYXRpb24jaW5pdGlhbGl6ZScpO1xuXG5cdFx0dGhpcy51cGRhdGUoYXdhaXQgdGhpcy51cGRhdGVQb2xpY3lEZWZpbml0aW9ucyh0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5rZXlzKSwgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKGF3YWl0IHRoaXMudXBkYXRlUG9saWN5RGVmaW5pdGlvbnMoT2JqZWN0LmtleXModGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0RXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcygpKSksIGZhbHNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBvbGljeVNlcnZpY2Uub25EaWRDaGFuZ2UocG9saWN5TmFtZXMgPT4gdGhpcy5vbkRpZENoYW5nZVBvbGljaWVzKHBvbGljeU5hbWVzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGFzeW5jICh7IHByb3BlcnRpZXMgfSkgPT4gdGhpcy51cGRhdGUoYXdhaXQgdGhpcy51cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhwcm9wZXJ0aWVzKSwgdHJ1ZSkpKTtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1BvbGljeURlZmluaXRpb25UeXBlKGNvbmZpZ1R5cGU6IHVua25vd24sIHBvbGljeU5hbWU6IFBvbGljeU5hbWUpOiAnc3RyaW5nJyB8ICdudW1iZXInIHwgJ2Jvb2xlYW4nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBgY29uZmlnVHlwZWAgbWF5IGJlIGEgc2luZ2xlIHR5cGUgb3IgYSB1bmlvbiAoZS5nLiBgWydhcnJheScsICdudWxsJ11gKS5cblx0XHQvLyBOb3JtYWxpemUgdG8gYW4gYXJyYXkgYW5kIGtlZXAgb25seSB0aGUgdHlwZXMgd2UgY2FuIHJlcHJlc2VudCBhcyBwb2xpY2llcy5cblx0XHRjb25zdCBjb25maWdUeXBlcyA9IEFycmF5LmlzQXJyYXkoY29uZmlnVHlwZSkgPyBjb25maWdUeXBlIDogW2NvbmZpZ1R5cGVdO1xuXHRcdGNvbnN0IHN1cHBvcnRlZFR5cGVzID0gY29uZmlnVHlwZXMuZmlsdGVyKHR5cGUgPT4gdHlwZSA9PT0gJ3N0cmluZycgfHwgdHlwZSA9PT0gJ251bWJlcicgfHwgdHlwZSA9PT0gJ2FycmF5JyB8fCB0eXBlID09PSAnb2JqZWN0JyB8fCB0eXBlID09PSAnYm9vbGVhbicpO1xuXHRcdGlmIChzdXBwb3J0ZWRUeXBlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBQb2xpY3lDb25maWd1cmF0aW9uI3VwZGF0ZVBvbGljeURlZmluaXRpb25zIC0gcG9saWN5ICcke3BvbGljeU5hbWV9JyBoYXMgdW5zdXBwb3J0ZWQgdHlwZSAnJHtjb25maWdUeXBlfSdgKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBwb3J0ZWRUeXBlcy5pbmNsdWRlcygnbnVtYmVyJykgPyAnbnVtYmVyJyA6IHN1cHBvcnRlZFR5cGVzLmluY2x1ZGVzKCdib29sZWFuJykgPyAnYm9vbGVhbicgOiAnc3RyaW5nJztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMocHJvcGVydGllczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdQb2xpY3lDb25maWd1cmF0aW9uI3VwZGF0ZVBvbGljeURlZmluaXRpb25zJywgcHJvcGVydGllcyk7XG5cdFx0Y29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwb2xpY3lOYW1lcyA9IG5ldyBTZXQ8UG9saWN5TmFtZT4oKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldEV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblxuXHRcdGZvciAoY29uc3Qga2V5IG9mIHByb3BlcnRpZXMpIHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV0gPz8gZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldO1xuXHRcdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdFx0a2V5cy5wdXNoKGtleSk7IC8vIGRlcmVnaXN0ZXJlZCBcdTIwMTQgdXBkYXRlKCkgd2lsbCBjbGVhciB0aGlzIGtleSdzIGFwcGxpZWQgcG9saWN5IHZhbHVlXG5cdFx0XHRcdGNvbnN0IHJlbW92ZWRQb2xpY3lOYW1lID0gdGhpcy5fcG9saWN5TmFtZUJ5S2V5LmdldChrZXkpO1xuXHRcdFx0XHRpZiAocmVtb3ZlZFBvbGljeU5hbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3BvbGljeU5hbWVCeUtleS5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHRwb2xpY3lOYW1lcy5hZGQocmVtb3ZlZFBvbGljeU5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcG9saWN5TmFtZSA9IGNvbmZpZy5wb2xpY3k/Lm5hbWUgPz8gY29uZmlnLnBvbGljeVJlZmVyZW5jZT8ubmFtZTtcblx0XHRcdGlmIChwb2xpY3lOYW1lKSB7XG5cdFx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0XHRwb2xpY3lOYW1lcy5hZGQocG9saWN5TmFtZSk7XG5cdFx0XHRcdHRoaXMuX3BvbGljeU5hbWVCeUtleS5zZXQoa2V5LCBwb2xpY3lOYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VkRGVmaW5pdGlvbnM6IElTdHJpbmdEaWN0aW9uYXJ5PFBvbGljeURlZmluaXRpb24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBwb2xpY3lOYW1lIG9mIHBvbGljeU5hbWVzKSB7XG5cdFx0XHRjb25zdCBkZWZpbml0aW9uID0gdGhpcy5yZXNvbHZlUG9saWN5RGVmaW5pdGlvbihwb2xpY3lOYW1lKTtcblx0XHRcdGlmIChkZWZpbml0aW9uICYmICF0aGlzLmlzU2FtZVBvbGljeURlZmluaXRpb24odGhpcy5fc3VibWl0dGVkUG9saWN5RGVmaW5pdGlvbnMuZ2V0KHBvbGljeU5hbWUpLCBkZWZpbml0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9zdWJtaXR0ZWRQb2xpY3lEZWZpbml0aW9ucy5zZXQocG9saWN5TmFtZSwgZGVmaW5pdGlvbik7XG5cdFx0XHRcdGNoYW5nZWREZWZpbml0aW9uc1twb2xpY3lOYW1lXSA9IGRlZmluaXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0VtcHR5T2JqZWN0KGNoYW5nZWREZWZpbml0aW9ucykpIHtcblx0XHRcdGF3YWl0IHRoaXMucG9saWN5U2VydmljZS51cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhjaGFuZ2VkRGVmaW5pdGlvbnMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBrZXlzO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NhbWVQb2xpY3lEZWZpbml0aW9uKGE6IFBvbGljeURlZmluaXRpb24gfCB1bmRlZmluZWQsIGI6IFBvbGljeURlZmluaXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFhICYmIGEudHlwZSA9PT0gYi50eXBlICYmIGEudmFsdWUgPT09IGIudmFsdWUgJiYgYS5tYW5hZ2VkU2V0dGluZ3MgPT09IGIubWFuYWdlZFNldHRpbmdzICYmIGEucmVzdHJpY3RlZFZhbHVlID09PSBiLnJlc3RyaWN0ZWRWYWx1ZTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlIHRoZSBhdXRob3JpdGF0aXZlIGRlZmluaXRpb246IG93bmVyIHdpbnM7IHJlZmVyZW5jZXMgcHJvdmlkZSBhIGJhcmUgdHlwZSBmYWxsYmFjay4gKi9cblx0cHJpdmF0ZSByZXNvbHZlUG9saWN5RGVmaW5pdGlvbihwb2xpY3lOYW1lOiBQb2xpY3lOYW1lKTogUG9saWN5RGVmaW5pdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cblx0XHRjb25zdCBvd25lcktleSA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCkuZ2V0KHBvbGljeU5hbWUpO1xuXHRcdGlmIChvd25lcktleSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBjb25maWd1cmF0aW9uUHJvcGVydGllc1tvd25lcktleV0gPz8gZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllc1tvd25lcktleV07XG5cdFx0XHRpZiAoY29uZmlnPy5wb2xpY3kpIHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IHRoaXMudG9Qb2xpY3lEZWZpbml0aW9uVHlwZShjb25maWcudHlwZSwgcG9saWN5TmFtZSk7XG5cdFx0XHRcdGNvbnN0IHsgdmFsdWUsIG1hbmFnZWRTZXR0aW5ncywgcmVzdHJpY3RlZFZhbHVlIH0gPSBjb25maWcucG9saWN5O1xuXHRcdFx0XHRyZXR1cm4gdHlwZSA/IHsgdHlwZSwgdmFsdWUsIG1hbmFnZWRTZXR0aW5ncywgcmVzdHJpY3RlZFZhbHVlIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmZXJlbmNlS2V5cyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zKCkuZ2V0KHBvbGljeU5hbWUpO1xuXHRcdGZvciAoY29uc3QgcmVmZXJlbmNlS2V5IG9mIHJlZmVyZW5jZUtleXMgPz8gW10pIHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW3JlZmVyZW5jZUtleV0gPz8gZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllc1tyZWZlcmVuY2VLZXldO1xuXHRcdFx0aWYgKGNvbmZpZz8ucG9saWN5UmVmZXJlbmNlKSB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSB0aGlzLnRvUG9saWN5RGVmaW5pdGlvblR5cGUoY29uZmlnLnR5cGUsIHBvbGljeU5hbWUpO1xuXHRcdFx0XHRyZXR1cm4gdHlwZSA/IHsgdHlwZSB9IDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlUG9saWNpZXMocG9saWN5TmFtZXM6IHJlYWRvbmx5IFBvbGljeU5hbWVbXSk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnUG9saWN5Q29uZmlndXJhdGlvbiNvbkRpZENoYW5nZVBvbGljaWVzJywgcG9saWN5TmFtZXMpO1xuXHRcdGNvbnN0IHBvbGljeUNvbmZpZ3VyYXRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5Q29uZmlndXJhdGlvbnMoKTtcblx0XHRjb25zdCBwb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zKCk7XG5cdFx0Y29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHBvbGljeU5hbWUgb2YgcG9saWN5TmFtZXMpIHtcblx0XHRcdGNvbnN0IG93bmVyID0gcG9saWN5Q29uZmlndXJhdGlvbnMuZ2V0KHBvbGljeU5hbWUpO1xuXHRcdFx0aWYgKG93bmVyKSB7XG5cdFx0XHRcdGtleXMucHVzaChvd25lcik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWZlcmVuY2VzID0gcG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMuZ2V0KHBvbGljeU5hbWUpO1xuXHRcdFx0aWYgKHJlZmVyZW5jZXMpIHtcblx0XHRcdFx0a2V5cy5wdXNoKC4uLnJlZmVyZW5jZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZShrZXlzLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKGtleXM6IHN0cmluZ1tdLCB0cmlnZ2VyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdQb2xpY3lDb25maWd1cmF0aW9uI3VwZGF0ZScsIGtleXMpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBleGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0RXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGNoYW5nZWQ6IFtzdHJpbmcsIHVua25vd25dW10gPSBbXTtcblx0XHRjb25zdCB3YXNFbXB0eSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5pc0VtcHR5KCk7XG5cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0eSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2tleV0gPz8gZXhjbHVkZWRDb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldO1xuXHRcdFx0Y29uc3QgcG9saWN5TmFtZSA9IHByb3BlcnR5Py5wb2xpY3k/Lm5hbWUgPz8gcHJvcGVydHk/LnBvbGljeVJlZmVyZW5jZT8ubmFtZTtcblx0XHRcdGlmIChwb2xpY3lOYW1lKSB7XG5cdFx0XHRcdGxldCBwb2xpY3lWYWx1ZTogUG9saWN5VmFsdWUgfCBQYXJzZWRUeXBlIHwgdW5kZWZpbmVkID0gdGhpcy5wb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKHBvbGljeU5hbWUpO1xuXHRcdFx0XHQvLyBgcHJvcGVydHkudHlwZWAgbWF5IGJlIGEgc2luZ2xlIHR5cGUgb3IgYSB1bmlvbiAoZS5nLiBgWydhcnJheScsICdudWxsJ11gKS5cblx0XHRcdFx0Ly8gQSBzdHJpbmcgcG9saWN5IHZhbHVlIGNhcnJpZXMgYSBKU09OIHBheWxvYWQgdGhhdCBtdXN0IGJlIHBhcnNlZCB1bmxlc3MgdGhlXG5cdFx0XHRcdC8vIHNldHRpbmcgaXRzZWxmIGlzIChvciBjYW4gYmUpIGEgcGxhaW4gc3RyaW5nLlxuXHRcdFx0XHRjb25zdCBhY2NlcHRzU3RyaW5nVHlwZSA9IEFycmF5LmlzQXJyYXkocHJvcGVydHkudHlwZSkgPyBwcm9wZXJ0eS50eXBlLmluY2x1ZGVzKCdzdHJpbmcnKSA6IHByb3BlcnR5LnR5cGUgPT09ICdzdHJpbmcnO1xuXHRcdFx0XHRpZiAoaXNTdHJpbmcocG9saWN5VmFsdWUpICYmICFhY2NlcHRzU3RyaW5nVHlwZSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRwb2xpY3lWYWx1ZSA9IHRoaXMucGFyc2UocG9saWN5VmFsdWUpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3IgcGFyc2luZyBwb2xpY3kgdmFsdWUgJHtwb2xpY3lOYW1lfTpgLCBnZXRFcnJvck1lc3NhZ2UoZSkpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh3YXNFbXB0eSA/IHBvbGljeVZhbHVlICE9PSB1bmRlZmluZWQgOiAhZXF1YWxzKHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZShrZXkpLCBwb2xpY3lWYWx1ZSkpIHtcblx0XHRcdFx0XHRjaGFuZ2VkLnB1c2goW2tleSwgcG9saWN5VmFsdWVdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZShrZXkpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjaGFuZ2VkLnB1c2goW2tleSwgdW5kZWZpbmVkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnUG9saWN5Q29uZmlndXJhdGlvbiNjaGFuZ2VkJywgY2hhbmdlZCk7XG5cdFx0XHRjb25zdCBvbGQgPSB0aGlzLl9jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uTW9kZWwgPSBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygb2xkLmtleXMpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbk1vZGVsLnNldFZhbHVlKGtleSwgb2xkLmdldFZhbHVlKGtleSkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCBwb2xpY3lWYWx1ZV0gb2YgY2hhbmdlZCkge1xuXHRcdFx0XHRpZiAocG9saWN5VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5yZW1vdmVWYWx1ZShrZXkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25Nb2RlbC5zZXRWYWx1ZShrZXksIHBvbGljeVZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRyaWdnZXIpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmZpcmUodGhpcy5fY29uZmlndXJhdGlvbk1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlKGNvbnRlbnQ6IHN0cmluZyk6IFBhcnNlZFR5cGUge1xuXHRcdGxldCByYXc6IFBhcnNlZFR5cGUgPSB7fTtcblx0XHRsZXQgY3VycmVudFByb3BlcnR5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgY3VycmVudFBhcmVudDogUGFyc2VkVHlwZSA9IFtdO1xuXHRcdGNvbnN0IHByZXZpb3VzUGFyZW50czogQXJyYXk8UGFyc2VkVHlwZT4gPSBbXTtcblx0XHRjb25zdCBwYXJzZUVycm9yczoganNvbi5QYXJzZUVycm9yW10gPSBbXTtcblxuXHRcdGZ1bmN0aW9uIG9uVmFsdWUodmFsdWU6IHVua25vd24pIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRQYXJlbnQpKSB7XG5cdFx0XHRcdGN1cnJlbnRQYXJlbnQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRQcm9wZXJ0eSAhPT0gbnVsbCkge1xuXHRcdFx0XHRpZiAoY3VycmVudFBhcmVudFtjdXJyZW50UHJvcGVydHldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYER1cGxpY2F0ZSBwcm9wZXJ0eSBmb3VuZDogJHtjdXJyZW50UHJvcGVydHl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudFBhcmVudFtjdXJyZW50UHJvcGVydHldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaXRvcjoganNvbi5KU09OVmlzaXRvciA9IHtcblx0XHRcdG9uT2JqZWN0QmVnaW46ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JqZWN0ID0ge307XG5cdFx0XHRcdG9uVmFsdWUob2JqZWN0KTtcblx0XHRcdFx0cHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG5cdFx0XHRcdGN1cnJlbnRQYXJlbnQgPSBvYmplY3Q7XG5cdFx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG5cdFx0XHR9LFxuXHRcdFx0b25PYmplY3RQcm9wZXJ0eTogKG5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjdXJyZW50UHJvcGVydHkgPSBuYW1lO1xuXHRcdFx0fSxcblx0XHRcdG9uT2JqZWN0RW5kOiAoKSA9PiB7XG5cdFx0XHRcdGN1cnJlbnRQYXJlbnQgPSBwcmV2aW91c1BhcmVudHMucG9wKCkhO1xuXHRcdFx0fSxcblx0XHRcdG9uQXJyYXlCZWdpbjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhcnJheTogdW5rbm93bltdID0gW107XG5cdFx0XHRcdG9uVmFsdWUoYXJyYXkpO1xuXHRcdFx0XHRwcmV2aW91c1BhcmVudHMucHVzaChjdXJyZW50UGFyZW50KTtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IGFycmF5O1xuXHRcdFx0XHRjdXJyZW50UHJvcGVydHkgPSBudWxsO1xuXHRcdFx0fSxcblx0XHRcdG9uQXJyYXlFbmQ6ICgpID0+IHtcblx0XHRcdFx0Y3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKSE7XG5cdFx0XHR9LFxuXHRcdFx0b25MaXRlcmFsVmFsdWU6IG9uVmFsdWUsXG5cdFx0XHRvbkVycm9yOiAoZXJyb3I6IGpzb24uUGFyc2VFcnJvckNvZGUsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRwYXJzZUVycm9ycy5wdXNoKHsgZXJyb3IsIG9mZnNldCwgbGVuZ3RoIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0anNvbi52aXNpdChjb250ZW50LCB2aXNpdG9yKTtcblx0XHRcdHJhdyA9IChjdXJyZW50UGFyZW50WzBdIGFzIFBhcnNlZFR5cGUgfCB1bmRlZmluZWQpIHx8IHJhdztcblx0XHR9XG5cblx0XHRpZiAocGFyc2VFcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHBhcnNlRXJyb3JzLm1hcChlID0+IGdldEVycm9yTWVzc2FnZShlLmVycm9yKSkuam9pbignXFxuJykpO1xuXHRcdH1cblxuXHRcdHJldHVybiByYXc7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLGNBQWM7QUFDbEMsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrRjtBQUMzRixTQUFTLGFBQWEsc0JB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
