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
import { mixin, deepClone } from "../../../base/common/objects.js";
import { Emitter } from "../../../base/common/event.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { MainContext } from "./extHost.protocol.js";
import { ConfigurationTarget as ExtHostConfigurationTarget } from "./extHostTypes.js";
import { ConfigurationTarget } from "../../../platform/configuration/common/configuration.js";
import { Configuration, ConfigurationChangeEvent } from "../../../platform/configuration/common/configurationModels.js";
import { ConfigurationScope, OVERRIDE_PROPERTY_REGEX } from "../../../platform/configuration/common/configurationRegistry.js";
import { isObject } from "../../../base/common/types.js";
import { Barrier } from "../../../base/common/async.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { URI } from "../../../base/common/uri.js";
function lookUp(tree, key) {
  if (key) {
    const parts = key.split(".");
    let node = tree;
    for (let i = 0; node && i < parts.length; i++) {
      node = node[parts[i]];
    }
    return node;
  }
  return void 0;
}
function isUri(thing) {
  return thing instanceof URI;
}
function isResourceLanguage(thing) {
  return isObject(thing) && thing.uri instanceof URI && !!thing.languageId && typeof thing.languageId === "string";
}
function isLanguage(thing) {
  return isObject(thing) && !thing.uri && !!thing.languageId && typeof thing.languageId === "string";
}
function isWorkspaceFolder(thing) {
  return isObject(thing) && thing.uri instanceof URI && (!thing.name || typeof thing.name === "string") && (!thing.index || typeof thing.index === "number");
}
function scopeToOverrides(scope) {
  if (isUri(scope)) {
    return { resource: scope };
  }
  if (isResourceLanguage(scope)) {
    return { resource: scope.uri, overrideIdentifier: scope.languageId };
  }
  if (isLanguage(scope)) {
    return { overrideIdentifier: scope.languageId };
  }
  if (isWorkspaceFolder(scope)) {
    return { resource: scope.uri };
  }
  if (scope === null) {
    return { resource: null };
  }
  return void 0;
}
let ExtHostConfiguration = class {
  constructor(extHostRpc, extHostWorkspace, logService) {
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadConfiguration);
    this._extHostWorkspace = extHostWorkspace;
    this._logService = logService;
    this._barrier = new Barrier();
    this._actual = null;
  }
  getConfigProvider() {
    return this._barrier.wait().then((_) => this._actual);
  }
  $initializeConfiguration(data) {
    this._actual = new ExtHostConfigProvider(this._proxy, this._extHostWorkspace, data, this._logService);
    this._extHostWorkspace.$setConfigProvider(this._actual);
    this._barrier.open();
  }
  $acceptConfigurationChanged(data, change) {
    this.getConfigProvider().then((provider) => provider.$acceptConfigurationChanged(data, change));
  }
};
ExtHostConfiguration = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, ILogService)
], ExtHostConfiguration);
class ExtHostConfigProvider {
  constructor(proxy, extHostWorkspace, data, logService) {
    this._onDidChangeConfiguration = new Emitter();
    this._proxy = proxy;
    this._logService = logService;
    this._extHostWorkspace = extHostWorkspace;
    this._configuration = Configuration.parse(data, logService);
    this._configurationScopes = this._toMap(data.configurationScopes);
  }
  get onDidChangeConfiguration() {
    return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
  }
  $acceptConfigurationChanged(data, change) {
    const previous = { data: this._configuration.toData(), workspace: this._extHostWorkspace.workspace };
    this._configuration = Configuration.parse(data, this._logService);
    this._configurationScopes = this._toMap(data.configurationScopes);
    this._onDidChangeConfiguration.fire(this._toConfigurationChangeEvent(change, previous));
  }
  getConfiguration(section, scope, extensionDescription) {
    const overrides = scopeToOverrides(scope) || {};
    const config = this._toReadonlyValue(this._configuration.getValue(section, overrides, this._extHostWorkspace.workspace));
    if (section) {
      this._validateConfigurationAccess(section, overrides, extensionDescription?.identifier);
    }
    function parseConfigurationTarget(arg) {
      if (arg === void 0 || arg === null) {
        return null;
      }
      if (typeof arg === "boolean") {
        return arg ? ConfigurationTarget.USER : ConfigurationTarget.WORKSPACE;
      }
      switch (arg) {
        case ExtHostConfigurationTarget.Global:
          return ConfigurationTarget.USER;
        case ExtHostConfigurationTarget.Workspace:
          return ConfigurationTarget.WORKSPACE;
        case ExtHostConfigurationTarget.WorkspaceFolder:
          return ConfigurationTarget.WORKSPACE_FOLDER;
      }
    }
    const result = {
      has(key) {
        return typeof lookUp(config, key) !== "undefined";
      },
      get: (key, defaultValue) => {
        this._validateConfigurationAccess(section ? `${section}.${key}` : key, overrides, extensionDescription?.identifier);
        let result2 = lookUp(config, key);
        if (typeof result2 === "undefined") {
          result2 = defaultValue;
        } else {
          let clonedConfig = void 0;
          const cloneOnWriteProxy = (target, accessor) => {
            if (isObject(target)) {
              let clonedTarget = void 0;
              const cloneTarget = () => {
                clonedConfig = clonedConfig ? clonedConfig : deepClone(config);
                clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
              };
              return new Proxy(target, {
                get: (target2, property) => {
                  if (typeof property === "string" && property.toLowerCase() === "tojson") {
                    cloneTarget();
                    return () => clonedTarget;
                  }
                  if (clonedConfig) {
                    clonedTarget = clonedTarget ? clonedTarget : lookUp(clonedConfig, accessor);
                    return clonedTarget[property];
                  }
                  const result3 = target2[property];
                  if (typeof property === "string") {
                    return cloneOnWriteProxy(result3, `${accessor}.${property}`);
                  }
                  return result3;
                },
                set: (_target, property, value) => {
                  cloneTarget();
                  if (clonedTarget) {
                    clonedTarget[property] = value;
                  }
                  return true;
                },
                deleteProperty: (_target, property) => {
                  cloneTarget();
                  if (clonedTarget) {
                    delete clonedTarget[property];
                  }
                  return true;
                },
                defineProperty: (_target, property, descriptor) => {
                  cloneTarget();
                  if (clonedTarget) {
                    Object.defineProperty(clonedTarget, property, descriptor);
                  }
                  return true;
                }
              });
            }
            if (Array.isArray(target)) {
              return deepClone(target);
            }
            return target;
          };
          result2 = cloneOnWriteProxy(result2, key);
        }
        return result2;
      },
      update: (key, value, extHostConfigurationTarget, scopeToLanguage) => {
        key = section ? `${section}.${key}` : key;
        const target = parseConfigurationTarget(extHostConfigurationTarget);
        if (value !== void 0) {
          return this._proxy.$updateConfigurationOption(target, key, value, overrides, scopeToLanguage);
        } else {
          return this._proxy.$removeConfigurationOption(target, key, overrides, scopeToLanguage);
        }
      },
      inspect: (key) => {
        key = section ? `${section}.${key}` : key;
        const config2 = this._configuration.inspect(key, overrides, this._extHostWorkspace.workspace);
        if (config2) {
          return {
            key,
            defaultValue: deepClone(config2.policy?.value ?? config2.default?.value),
            globalLocalValue: deepClone(config2.userLocal?.value),
            globalRemoteValue: deepClone(config2.userRemote?.value),
            globalValue: deepClone(config2.user?.value ?? config2.application?.value),
            workspaceValue: deepClone(config2.workspace?.value),
            workspaceFolderValue: deepClone(config2.workspaceFolder?.value),
            defaultLanguageValue: deepClone(config2.default?.override),
            globalLocalLanguageValue: deepClone(config2.userLocal?.override),
            globalRemoteLanguageValue: deepClone(config2.userRemote?.override),
            globalLanguageValue: deepClone(config2.user?.override ?? config2.application?.override),
            workspaceLanguageValue: deepClone(config2.workspace?.override),
            workspaceFolderLanguageValue: deepClone(config2.workspaceFolder?.override),
            languageIds: deepClone(config2.overrideIdentifiers)
          };
        }
        return void 0;
      }
    };
    if (typeof config === "object") {
      mixin(result, config, false);
    }
    return Object.freeze(result);
  }
  _toReadonlyValue(result) {
    const readonlyProxy = (target) => {
      return isObject(target) ? new Proxy(target, {
        get: (target2, property) => readonlyProxy(target2[property]),
        set: (_target, property, _value) => {
          throw new Error(`TypeError: Cannot assign to read only property '${String(property)}' of object`);
        },
        deleteProperty: (_target, property) => {
          throw new Error(`TypeError: Cannot delete read only property '${String(property)}' of object`);
        },
        defineProperty: (_target, property) => {
          throw new Error(`TypeError: Cannot define property '${String(property)}' for a readonly object`);
        },
        setPrototypeOf: (_target) => {
          throw new Error(`TypeError: Cannot set prototype for a readonly object`);
        },
        isExtensible: () => false,
        preventExtensions: () => true
      }) : target;
    };
    return readonlyProxy(result);
  }
  _validateConfigurationAccess(key, overrides, extensionId) {
    const scope = OVERRIDE_PROPERTY_REGEX.test(key) ? ConfigurationScope.RESOURCE : this._configurationScopes.get(key);
    const extensionIdText = extensionId ? `[${extensionId.value}] ` : "";
    if (ConfigurationScope.RESOURCE === scope) {
      if (typeof overrides?.resource === "undefined") {
        this._logService.warn(`${extensionIdText}Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for '${key}', provide the URI of a resource or 'null' for any resource.`);
      }
      return;
    }
    if (ConfigurationScope.WINDOW === scope) {
      if (overrides?.resource) {
        this._logService.warn(`${extensionIdText}Accessing a window scoped configuration for a resource is not expected. To associate '${key}' to a resource, define its scope to 'resource' in configuration contributions in 'package.json'.`);
      }
      return;
    }
  }
  _toConfigurationChangeEvent(change, previous) {
    const event = new ConfigurationChangeEvent(change, previous, this._configuration, this._extHostWorkspace.workspace, this._logService);
    return Object.freeze({
      affectsConfiguration: (section, scope) => event.affectsConfiguration(section, scopeToOverrides(scope))
    });
  }
  _toMap(scopes) {
    return scopes.reduce((result, scope) => {
      result.set(scope[0], scope[1]);
      return result;
    }, /* @__PURE__ */ new Map());
  }
}
const IExtHostConfiguration = createDecorator("IExtHostConfiguration");
export {
  ExtHostConfigProvider,
  ExtHostConfiguration,
  IExtHostConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1peGluLCBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV4dEhvc3RXb3Jrc3BhY2UsIElFeHRIb3N0V29ya3NwYWNlIH0gZnJvbSAnLi9leHRIb3N0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb25maWd1cmF0aW9uU2hhcGUsIE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGUsIElDb25maWd1cmF0aW9uSW5pdERhdGEsIE1haW5Db250ZXh0IH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgYXMgRXh0SG9zdENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvbkNoYW5nZSwgSUNvbmZpZ3VyYXRpb25EYXRhLCBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbiwgQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIE9WRVJSSURFX1BST1BFUlRZX1JFR0VYIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBCYXJyaWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuZnVuY3Rpb24gbG9va1VwKHRyZWU6IHVua25vd24sIGtleTogc3RyaW5nKSB7XG5cdGlmIChrZXkpIHtcblx0XHRjb25zdCBwYXJ0cyA9IGtleS5zcGxpdCgnLicpO1xuXHRcdGxldCBub2RlID0gdHJlZTtcblx0XHRmb3IgKGxldCBpID0gMDsgbm9kZSAmJiBpIDwgcGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdG5vZGUgPSAobm9kZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcGFydHNbaV1dO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9kZTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgdHlwZSBDb25maWd1cmF0aW9uSW5zcGVjdDxUPiA9IHtcblx0a2V5OiBzdHJpbmc7XG5cblx0ZGVmYXVsdFZhbHVlPzogVDtcblx0Z2xvYmFsTG9jYWxWYWx1ZT86IFQ7XG5cdGdsb2JhbFJlbW90ZVZhbHVlPzogVDtcblx0Z2xvYmFsVmFsdWU/OiBUO1xuXHR3b3Jrc3BhY2VWYWx1ZT86IFQ7XG5cdHdvcmtzcGFjZUZvbGRlclZhbHVlPzogVDtcblxuXHRkZWZhdWx0TGFuZ3VhZ2VWYWx1ZT86IFQ7XG5cdGdsb2JhbExvY2FsTGFuZ3VhZ2VWYWx1ZT86IFQ7XG5cdGdsb2JhbFJlbW90ZUxhbmd1YWdlVmFsdWU/OiBUO1xuXHRnbG9iYWxMYW5ndWFnZVZhbHVlPzogVDtcblx0d29ya3NwYWNlTGFuZ3VhZ2VWYWx1ZT86IFQ7XG5cdHdvcmtzcGFjZUZvbGRlckxhbmd1YWdlVmFsdWU/OiBUO1xuXG5cdGxhbmd1YWdlSWRzPzogc3RyaW5nW107XG59O1xuXG5mdW5jdGlvbiBpc1VyaSh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIHZzY29kZS5Vcmkge1xuXHRyZXR1cm4gdGhpbmcgaW5zdGFuY2VvZiBVUkk7XG59XG5cbmZ1bmN0aW9uIGlzUmVzb3VyY2VMYW5ndWFnZSh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIHsgdXJpOiBVUkk7IGxhbmd1YWdlSWQ6IHN0cmluZyB9IHtcblx0cmV0dXJuIGlzT2JqZWN0KHRoaW5nKVxuXHRcdCYmICh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikudXJpIGluc3RhbmNlb2YgVVJJXG5cdFx0JiYgISEodGhpbmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmxhbmd1YWdlSWRcblx0XHQmJiB0eXBlb2YgKHRoaW5nIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5sYW5ndWFnZUlkID09PSAnc3RyaW5nJztcbn1cblxuZnVuY3Rpb24gaXNMYW5ndWFnZSh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIHsgbGFuZ3VhZ2VJZDogc3RyaW5nIH0ge1xuXHRyZXR1cm4gaXNPYmplY3QodGhpbmcpXG5cdFx0JiYgISh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikudXJpXG5cdFx0JiYgISEodGhpbmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmxhbmd1YWdlSWRcblx0XHQmJiB0eXBlb2YgKHRoaW5nIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5sYW5ndWFnZUlkID09PSAnc3RyaW5nJztcbn1cblxuZnVuY3Rpb24gaXNXb3Jrc3BhY2VGb2xkZXIodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHtcblx0cmV0dXJuIGlzT2JqZWN0KHRoaW5nKVxuXHRcdCYmICh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikudXJpIGluc3RhbmNlb2YgVVJJXG5cdFx0JiYgKCEodGhpbmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLm5hbWUgfHwgdHlwZW9mICh0aGluZyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikubmFtZSA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKCEodGhpbmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmluZGV4IHx8IHR5cGVvZiAodGhpbmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmluZGV4ID09PSAnbnVtYmVyJyk7XG59XG5cbmZ1bmN0aW9uIHNjb3BlVG9PdmVycmlkZXMoc2NvcGU6IHZzY29kZS5Db25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWQgfCBudWxsKTogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMgfCB1bmRlZmluZWQge1xuXHRpZiAoaXNVcmkoc2NvcGUpKSB7XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHNjb3BlIH07XG5cdH1cblx0aWYgKGlzUmVzb3VyY2VMYW5ndWFnZShzY29wZSkpIHtcblx0XHRyZXR1cm4geyByZXNvdXJjZTogc2NvcGUudXJpLCBvdmVycmlkZUlkZW50aWZpZXI6IHNjb3BlLmxhbmd1YWdlSWQgfTtcblx0fVxuXHRpZiAoaXNMYW5ndWFnZShzY29wZSkpIHtcblx0XHRyZXR1cm4geyBvdmVycmlkZUlkZW50aWZpZXI6IHNjb3BlLmxhbmd1YWdlSWQgfTtcblx0fVxuXHRpZiAoaXNXb3Jrc3BhY2VGb2xkZXIoc2NvcGUpKSB7XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHNjb3BlLnVyaSB9O1xuXHR9XG5cdGlmIChzY29wZSA9PT0gbnVsbCkge1xuXHRcdHJldHVybiB7IHJlc291cmNlOiBudWxsIH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RDb25maWd1cmF0aW9uIGltcGxlbWVudHMgRXh0SG9zdENvbmZpZ3VyYXRpb25TaGFwZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdFdvcmtzcGFjZTogRXh0SG9zdFdvcmtzcGFjZTtcblx0cHJpdmF0ZSByZWFkb25seSBfYmFycmllcjogQmFycmllcjtcblx0cHJpdmF0ZSBfYWN0dWFsOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFdvcmtzcGFjZSBleHRIb3N0V29ya3NwYWNlOiBJRXh0SG9zdFdvcmtzcGFjZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkQ29uZmlndXJhdGlvbik7XG5cdFx0dGhpcy5fZXh0SG9zdFdvcmtzcGFjZSA9IGV4dEhvc3RXb3Jrc3BhY2U7XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdFx0dGhpcy5fYmFycmllciA9IG5ldyBCYXJyaWVyKCk7XG5cdFx0dGhpcy5fYWN0dWFsID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb25maWdQcm92aWRlcigpOiBQcm9taXNlPEV4dEhvc3RDb25maWdQcm92aWRlcj4ge1xuXHRcdHJldHVybiB0aGlzLl9iYXJyaWVyLndhaXQoKS50aGVuKF8gPT4gdGhpcy5fYWN0dWFsISk7XG5cdH1cblxuXHQkaW5pdGlhbGl6ZUNvbmZpZ3VyYXRpb24oZGF0YTogSUNvbmZpZ3VyYXRpb25Jbml0RGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdHVhbCA9IG5ldyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIodGhpcy5fcHJveHksIHRoaXMuX2V4dEhvc3RXb3Jrc3BhY2UsIGRhdGEsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdC8vIFB1c2ggdGhlIGNvbmZpZyBwcm92aWRlciBpbnRvIEV4dEhvc3RXb3Jrc3BhY2Ugc28gaXQgY2FuIHJlYWQgc2V0dGluZ3Mgc3luY2hyb25vdXNseVxuXHRcdC8vIChESSBjeWNsZTogRXh0SG9zdENvbmZpZ3VyYXRpb24gZGVwZW5kcyBvbiBFeHRIb3N0V29ya3NwYWNlLCBzbyB3ZSBjYW5ub3QgaW5qZWN0IHRoZSByZXZlcnNlKS5cblx0XHR0aGlzLl9leHRIb3N0V29ya3NwYWNlLiRzZXRDb25maWdQcm92aWRlcih0aGlzLl9hY3R1YWwpO1xuXHRcdHRoaXMuX2JhcnJpZXIub3BlbigpO1xuXHR9XG5cblx0JGFjY2VwdENvbmZpZ3VyYXRpb25DaGFuZ2VkKGRhdGE6IElDb25maWd1cmF0aW9uSW5pdERhdGEsIGNoYW5nZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLmdldENvbmZpZ1Byb3ZpZGVyKCkudGhlbihwcm92aWRlciA9PiBwcm92aWRlci4kYWNjZXB0Q29uZmlndXJhdGlvbkNoYW5nZWQoZGF0YSwgY2hhbmdlKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RDb25maWdQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gbmV3IEVtaXR0ZXI8dnNjb2RlLkNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RXb3Jrc3BhY2U6IEV4dEhvc3RXb3Jrc3BhY2U7XG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb25TY29wZXM6IE1hcDxzdHJpbmcsIENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKHByb3h5OiBNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlLCBleHRIb3N0V29ya3NwYWNlOiBFeHRIb3N0V29ya3NwYWNlLCBkYXRhOiBJQ29uZmlndXJhdGlvbkluaXREYXRhLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkge1xuXHRcdHRoaXMuX3Byb3h5ID0gcHJveHk7XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdFx0dGhpcy5fZXh0SG9zdFdvcmtzcGFjZSA9IGV4dEhvc3RXb3Jrc3BhY2U7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbiA9IENvbmZpZ3VyYXRpb24ucGFyc2UoZGF0YSwgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNjb3BlcyA9IHRoaXMuX3RvTWFwKGRhdGEuY29uZmlndXJhdGlvblNjb3Blcyk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCk6IEV2ZW50PHZzY29kZS5Db25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uICYmIHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblx0fVxuXG5cdCRhY2NlcHRDb25maWd1cmF0aW9uQ2hhbmdlZChkYXRhOiBJQ29uZmlndXJhdGlvbkluaXREYXRhLCBjaGFuZ2U6IElDb25maWd1cmF0aW9uQ2hhbmdlKSB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB7IGRhdGE6IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCksIHdvcmtzcGFjZTogdGhpcy5fZXh0SG9zdFdvcmtzcGFjZS53b3Jrc3BhY2UgfTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gQ29uZmlndXJhdGlvbi5wYXJzZShkYXRhLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2NvcGVzID0gdGhpcy5fdG9NYXAoZGF0YS5jb25maWd1cmF0aW9uU2NvcGVzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZSh0aGlzLl90b0NvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChjaGFuZ2UsIHByZXZpb3VzKSk7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uKHNlY3Rpb24/OiBzdHJpbmcsIHNjb3BlPzogdnNjb2RlLkNvbmZpZ3VyYXRpb25TY29wZSB8IG51bGwsIGV4dGVuc2lvbkRlc2NyaXB0aW9uPzogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdnNjb2RlLldvcmtzcGFjZUNvbmZpZ3VyYXRpb24ge1xuXHRcdGNvbnN0IG92ZXJyaWRlcyA9IHNjb3BlVG9PdmVycmlkZXMoc2NvcGUpIHx8IHt9O1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX3RvUmVhZG9ubHlWYWx1ZSh0aGlzLl9jb25maWd1cmF0aW9uLmdldFZhbHVlKHNlY3Rpb24sIG92ZXJyaWRlcywgdGhpcy5fZXh0SG9zdFdvcmtzcGFjZS53b3Jrc3BhY2UpKTtcblxuXHRcdGlmIChzZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0ZUNvbmZpZ3VyYXRpb25BY2Nlc3Moc2VjdGlvbiwgb3ZlcnJpZGVzLCBleHRlbnNpb25EZXNjcmlwdGlvbj8uaWRlbnRpZmllcik7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcGFyc2VDb25maWd1cmF0aW9uVGFyZ2V0KGFyZzogYm9vbGVhbiB8IEV4dEhvc3RDb25maWd1cmF0aW9uVGFyZ2V0KTogQ29uZmlndXJhdGlvblRhcmdldCB8IG51bGwge1xuXHRcdFx0aWYgKGFyZyA9PT0gdW5kZWZpbmVkIHx8IGFyZyA9PT0gbnVsbCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgYXJnID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0cmV0dXJuIGFyZyA/IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiA6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdFx0fVxuXG5cdFx0XHRzd2l0Y2ggKGFyZykge1xuXHRcdFx0XHRjYXNlIEV4dEhvc3RDb25maWd1cmF0aW9uVGFyZ2V0Lkdsb2JhbDogcmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjtcblx0XHRcdFx0Y2FzZSBFeHRIb3N0Q29uZmlndXJhdGlvblRhcmdldC5Xb3Jrc3BhY2U6IHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTtcblx0XHRcdFx0Y2FzZSBFeHRIb3N0Q29uZmlndXJhdGlvblRhcmdldC5Xb3Jrc3BhY2VGb2xkZXI6IHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuV29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdGhhcyhrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIGxvb2tVcChjb25maWcsIGtleSkgIT09ICd1bmRlZmluZWQnO1xuXHRcdFx0fSxcblx0XHRcdGdldDogPFQ+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU/OiBUKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3ZhbGlkYXRlQ29uZmlndXJhdGlvbkFjY2VzcyhzZWN0aW9uID8gYCR7c2VjdGlvbn0uJHtrZXl9YCA6IGtleSwgb3ZlcnJpZGVzLCBleHRlbnNpb25EZXNjcmlwdGlvbj8uaWRlbnRpZmllcik7XG5cdFx0XHRcdGxldCByZXN1bHQ6IHVua25vd24gPSBsb29rVXAoY29uZmlnLCBrZXkpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBkZWZhdWx0VmFsdWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGV0IGNsb25lZENvbmZpZzogdW5rbm93biB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBjbG9uZU9uV3JpdGVQcm94eSA9ICh0YXJnZXQ6IHVua25vd24sIGFjY2Vzc29yOiBzdHJpbmcpOiB1bmtub3duID0+IHtcblx0XHRcdFx0XHRcdGlmIChpc09iamVjdCh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0XHRcdGxldCBjbG9uZWRUYXJnZXQ6IHVua25vd24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNsb25lVGFyZ2V0ID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNsb25lZENvbmZpZyA9IGNsb25lZENvbmZpZyA/IGNsb25lZENvbmZpZyA6IGRlZXBDbG9uZShjb25maWcpO1xuXHRcdFx0XHRcdFx0XHRcdGNsb25lZFRhcmdldCA9IGNsb25lZFRhcmdldCA/IGNsb25lZFRhcmdldCA6IGxvb2tVcChjbG9uZWRDb25maWcsIGFjY2Vzc29yKTtcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm94eSh0YXJnZXQsIHtcblx0XHRcdFx0XHRcdFx0XHRnZXQ6ICh0YXJnZXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogUHJvcGVydHlLZXkpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcHJvcGVydHkgPT09ICdzdHJpbmcnICYmIHByb3BlcnR5LnRvTG93ZXJDYXNlKCkgPT09ICd0b2pzb24nKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNsb25lVGFyZ2V0KCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAoKSA9PiBjbG9uZWRUYXJnZXQ7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY2xvbmVkQ29uZmlnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNsb25lZFRhcmdldCA9IGNsb25lZFRhcmdldCA/IGNsb25lZFRhcmdldCA6IGxvb2tVcChjbG9uZWRDb25maWcsIGFjY2Vzc29yKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIChjbG9uZWRUYXJnZXQgYXMgUmVjb3JkPFByb3BlcnR5S2V5LCB1bmtub3duPilbcHJvcGVydHldO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gKHRhcmdldCBhcyBSZWNvcmQ8UHJvcGVydHlLZXksIHVua25vd24+KVtwcm9wZXJ0eV07XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIHByb3BlcnR5ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gY2xvbmVPbldyaXRlUHJveHkocmVzdWx0LCBgJHthY2Nlc3Nvcn0uJHtwcm9wZXJ0eX1gKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRzZXQ6IChfdGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IFByb3BlcnR5S2V5LCB2YWx1ZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2xvbmVUYXJnZXQoKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChjbG9uZWRUYXJnZXQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0KGNsb25lZFRhcmdldCBhcyBSZWNvcmQ8UHJvcGVydHlLZXksIHVua25vd24+KVtwcm9wZXJ0eV0gPSB2YWx1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVsZXRlUHJvcGVydHk6IChfdGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IFByb3BlcnR5S2V5KSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbG9uZVRhcmdldCgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGNsb25lZFRhcmdldCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZWxldGUgKGNsb25lZFRhcmdldCBhcyBSZWNvcmQ8UHJvcGVydHlLZXksIHVua25vd24+KVtwcm9wZXJ0eV07XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGRlZmluZVByb3BlcnR5OiAoX3RhcmdldDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBQcm9wZXJ0eUtleSwgZGVzY3JpcHRvcjogUHJvcGVydHlEZXNjcmlwdG9yKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbG9uZVRhcmdldCgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGNsb25lZFRhcmdldCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoY2xvbmVkVGFyZ2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eSwgZGVzY3JpcHRvcik7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZGVlcENsb25lKHRhcmdldCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmVzdWx0ID0gY2xvbmVPbldyaXRlUHJveHkocmVzdWx0LCBrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9LFxuXHRcdFx0dXBkYXRlOiAoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBleHRIb3N0Q29uZmlndXJhdGlvblRhcmdldDogRXh0SG9zdENvbmZpZ3VyYXRpb25UYXJnZXQgfCBib29sZWFuLCBzY29wZVRvTGFuZ3VhZ2U/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGtleSA9IHNlY3Rpb24gPyBgJHtzZWN0aW9ufS4ke2tleX1gIDoga2V5O1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBwYXJzZUNvbmZpZ3VyYXRpb25UYXJnZXQoZXh0SG9zdENvbmZpZ3VyYXRpb25UYXJnZXQpO1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kdXBkYXRlQ29uZmlndXJhdGlvbk9wdGlvbih0YXJnZXQsIGtleSwgdmFsdWUsIG92ZXJyaWRlcywgc2NvcGVUb0xhbmd1YWdlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlbW92ZUNvbmZpZ3VyYXRpb25PcHRpb24odGFyZ2V0LCBrZXksIG92ZXJyaWRlcywgc2NvcGVUb0xhbmd1YWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGluc3BlY3Q6IDxUPihrZXk6IHN0cmluZyk6IENvbmZpZ3VyYXRpb25JbnNwZWN0PFQ+IHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0a2V5ID0gc2VjdGlvbiA/IGAke3NlY3Rpb259LiR7a2V5fWAgOiBrZXk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uaW5zcGVjdDxUPihrZXksIG92ZXJyaWRlcywgdGhpcy5fZXh0SG9zdFdvcmtzcGFjZS53b3Jrc3BhY2UpO1xuXHRcdFx0XHRpZiAoY29uZmlnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGtleSxcblxuXHRcdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLnBvbGljeT8udmFsdWUgPz8gY29uZmlnLmRlZmF1bHQ/LnZhbHVlKSxcblx0XHRcdFx0XHRcdGdsb2JhbExvY2FsVmFsdWU6IGRlZXBDbG9uZShjb25maWcudXNlckxvY2FsPy52YWx1ZSksXG5cdFx0XHRcdFx0XHRnbG9iYWxSZW1vdGVWYWx1ZTogZGVlcENsb25lKGNvbmZpZy51c2VyUmVtb3RlPy52YWx1ZSksXG5cdFx0XHRcdFx0XHRnbG9iYWxWYWx1ZTogZGVlcENsb25lKGNvbmZpZy51c2VyPy52YWx1ZSA/PyBjb25maWcuYXBwbGljYXRpb24/LnZhbHVlKSxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZVZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLndvcmtzcGFjZT8udmFsdWUpLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyVmFsdWU6IGRlZXBDbG9uZShjb25maWcud29ya3NwYWNlRm9sZGVyPy52YWx1ZSksXG5cblx0XHRcdFx0XHRcdGRlZmF1bHRMYW5ndWFnZVZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLmRlZmF1bHQ/Lm92ZXJyaWRlKSxcblx0XHRcdFx0XHRcdGdsb2JhbExvY2FsTGFuZ3VhZ2VWYWx1ZTogZGVlcENsb25lKGNvbmZpZy51c2VyTG9jYWw/Lm92ZXJyaWRlKSxcblx0XHRcdFx0XHRcdGdsb2JhbFJlbW90ZUxhbmd1YWdlVmFsdWU6IGRlZXBDbG9uZShjb25maWcudXNlclJlbW90ZT8ub3ZlcnJpZGUpLFxuXHRcdFx0XHRcdFx0Z2xvYmFsTGFuZ3VhZ2VWYWx1ZTogZGVlcENsb25lKGNvbmZpZy51c2VyPy5vdmVycmlkZSA/PyBjb25maWcuYXBwbGljYXRpb24/Lm92ZXJyaWRlKSxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUxhbmd1YWdlVmFsdWU6IGRlZXBDbG9uZShjb25maWcud29ya3NwYWNlPy5vdmVycmlkZSksXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJMYW5ndWFnZVZhbHVlOiBkZWVwQ2xvbmUoY29uZmlnLndvcmtzcGFjZUZvbGRlcj8ub3ZlcnJpZGUpLFxuXG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkczogZGVlcENsb25lKGNvbmZpZy5vdmVycmlkZUlkZW50aWZpZXJzKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKHR5cGVvZiBjb25maWcgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRtaXhpbihyZXN1bHQsIGNvbmZpZywgZmFsc2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIF90b1JlYWRvbmx5VmFsdWUocmVzdWx0OiB1bmtub3duKTogdW5rbm93biB7XG5cdFx0Y29uc3QgcmVhZG9ubHlQcm94eSA9ICh0YXJnZXQ6IHVua25vd24pOiB1bmtub3duID0+IHtcblx0XHRcdHJldHVybiBpc09iamVjdCh0YXJnZXQpID9cblx0XHRcdFx0bmV3IFByb3h5KHRhcmdldCwge1xuXHRcdFx0XHRcdGdldDogKHRhcmdldDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBQcm9wZXJ0eUtleSkgPT4gcmVhZG9ubHlQcm94eSgodGFyZ2V0IGFzIFJlY29yZDxQcm9wZXJ0eUtleSwgdW5rbm93bj4pW3Byb3BlcnR5XSksXG5cdFx0XHRcdFx0c2V0OiAoX3RhcmdldDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBQcm9wZXJ0eUtleSwgX3ZhbHVlOiB1bmtub3duKSA9PiB7IHRocm93IG5ldyBFcnJvcihgVHlwZUVycm9yOiBDYW5ub3QgYXNzaWduIHRvIHJlYWQgb25seSBwcm9wZXJ0eSAnJHtTdHJpbmcocHJvcGVydHkpfScgb2Ygb2JqZWN0YCk7IH0sXG5cdFx0XHRcdFx0ZGVsZXRlUHJvcGVydHk6IChfdGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IFByb3BlcnR5S2V5KSA9PiB7IHRocm93IG5ldyBFcnJvcihgVHlwZUVycm9yOiBDYW5ub3QgZGVsZXRlIHJlYWQgb25seSBwcm9wZXJ0eSAnJHtTdHJpbmcocHJvcGVydHkpfScgb2Ygb2JqZWN0YCk7IH0sXG5cdFx0XHRcdFx0ZGVmaW5lUHJvcGVydHk6IChfdGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IFByb3BlcnR5S2V5KSA9PiB7IHRocm93IG5ldyBFcnJvcihgVHlwZUVycm9yOiBDYW5ub3QgZGVmaW5lIHByb3BlcnR5ICcke1N0cmluZyhwcm9wZXJ0eSl9JyBmb3IgYSByZWFkb25seSBvYmplY3RgKTsgfSxcblx0XHRcdFx0XHRzZXRQcm90b3R5cGVPZjogKF90YXJnZXQ6IHVua25vd24pID0+IHsgdGhyb3cgbmV3IEVycm9yKGBUeXBlRXJyb3I6IENhbm5vdCBzZXQgcHJvdG90eXBlIGZvciBhIHJlYWRvbmx5IG9iamVjdGApOyB9LFxuXHRcdFx0XHRcdGlzRXh0ZW5zaWJsZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0cHJldmVudEV4dGVuc2lvbnM6ICgpID0+IHRydWVcblx0XHRcdFx0fSkgOiB0YXJnZXQ7XG5cdFx0fTtcblx0XHRyZXR1cm4gcmVhZG9ubHlQcm94eShyZXN1bHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVDb25maWd1cmF0aW9uQWNjZXNzKGtleTogc3RyaW5nLCBvdmVycmlkZXM/OiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgZXh0ZW5zaW9uSWQ/OiBFeHRlbnNpb25JZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NvcGUgPSBPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkgPyBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UgOiB0aGlzLl9jb25maWd1cmF0aW9uU2NvcGVzLmdldChrZXkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkVGV4dCA9IGV4dGVuc2lvbklkID8gYFske2V4dGVuc2lvbklkLnZhbHVlfV0gYCA6ICcnO1xuXHRcdGlmIChDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UgPT09IHNjb3BlKSB7XG5cdFx0XHRpZiAodHlwZW9mIG92ZXJyaWRlcz8ucmVzb3VyY2UgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtleHRlbnNpb25JZFRleHR9QWNjZXNzaW5nIGEgcmVzb3VyY2Ugc2NvcGVkIGNvbmZpZ3VyYXRpb24gd2l0aG91dCBwcm92aWRpbmcgYSByZXNvdXJjZSBpcyBub3QgZXhwZWN0ZWQuIFRvIGdldCB0aGUgZWZmZWN0aXZlIHZhbHVlIGZvciAnJHtrZXl9JywgcHJvdmlkZSB0aGUgVVJJIG9mIGEgcmVzb3VyY2Ugb3IgJ251bGwnIGZvciBhbnkgcmVzb3VyY2UuYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XID09PSBzY29wZSkge1xuXHRcdFx0aWYgKG92ZXJyaWRlcz8ucmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke2V4dGVuc2lvbklkVGV4dH1BY2Nlc3NpbmcgYSB3aW5kb3cgc2NvcGVkIGNvbmZpZ3VyYXRpb24gZm9yIGEgcmVzb3VyY2UgaXMgbm90IGV4cGVjdGVkLiBUbyBhc3NvY2lhdGUgJyR7a2V5fScgdG8gYSByZXNvdXJjZSwgZGVmaW5lIGl0cyBzY29wZSB0byAncmVzb3VyY2UnIGluIGNvbmZpZ3VyYXRpb24gY29udHJpYnV0aW9ucyBpbiAncGFja2FnZS5qc29uJy5gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90b0NvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChjaGFuZ2U6IElDb25maWd1cmF0aW9uQ2hhbmdlLCBwcmV2aW91czogeyBkYXRhOiBJQ29uZmlndXJhdGlvbkRhdGE7IHdvcmtzcGFjZTogV29ya3NwYWNlIHwgdW5kZWZpbmVkIH0pOiB2c2NvZGUuQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQoY2hhbmdlLCBwcmV2aW91cywgdGhpcy5fY29uZmlndXJhdGlvbiwgdGhpcy5fZXh0SG9zdFdvcmtzcGFjZS53b3Jrc3BhY2UsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoc2VjdGlvbjogc3RyaW5nLCBzY29wZT86IHZzY29kZS5Db25maWd1cmF0aW9uU2NvcGUpID0+IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKHNlY3Rpb24sIHNjb3BlVG9PdmVycmlkZXMoc2NvcGUpKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9NYXAoc2NvcGVzOiBbc3RyaW5nLCBDb25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWRdW10pOiBNYXA8c3RyaW5nLCBDb25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gc2NvcGVzLnJlZHVjZSgocmVzdWx0LCBzY29wZSkgPT4geyByZXN1bHQuc2V0KHNjb3BlWzBdLCBzY29wZVsxXSk7IHJldHVybiByZXN1bHQ7IH0sIG5ldyBNYXA8c3RyaW5nLCBDb25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWQ+KCkpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0Q29uZmlndXJhdGlvbiA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdENvbmZpZ3VyYXRpb24+KCdJRXh0SG9zdENvbmZpZ3VyYXRpb24nKTtcbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RDb25maWd1cmF0aW9uIGV4dGVuZHMgRXh0SG9zdENvbmZpZ3VyYXRpb24geyB9XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsT0FBTyxpQkFBaUI7QUFDakMsU0FBZ0IsZUFBZTtBQUUvQixTQUEyQix5QkFBeUI7QUFDcEQsU0FBMEYsbUJBQW1CO0FBQzdHLFNBQVMsdUJBQXVCLGtDQUFrQztBQUNsRSxTQUFTLDJCQUE4RjtBQUN2RyxTQUFTLGVBQWUsZ0NBQWdDO0FBQ3hELFNBQVMsb0JBQW9CLCtCQUErQjtBQUM1RCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsT0FBTyxNQUFlLEtBQWE7QUFDM0MsTUFBSSxLQUFLO0FBQ1IsVUFBTSxRQUFRLElBQUksTUFBTSxHQUFHO0FBQzNCLFFBQUksT0FBTztBQUNYLGFBQVMsSUFBSSxHQUFHLFFBQVEsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUM5QyxhQUFRLEtBQWlDLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDbEQ7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjtBQXNCQSxTQUFTLE1BQU0sT0FBcUM7QUFDbkQsU0FBTyxpQkFBaUI7QUFDekI7QUFFQSxTQUFTLG1CQUFtQixPQUEyRDtBQUN0RixTQUFPLFNBQVMsS0FBSyxLQUNoQixNQUFrQyxlQUFlLE9BQ2xELENBQUMsQ0FBRSxNQUFrQyxjQUNyQyxPQUFRLE1BQWtDLGVBQWU7QUFDOUQ7QUFFQSxTQUFTLFdBQVcsT0FBaUQ7QUFDcEUsU0FBTyxTQUFTLEtBQUssS0FDakIsQ0FBRSxNQUFrQyxPQUNwQyxDQUFDLENBQUUsTUFBa0MsY0FDckMsT0FBUSxNQUFrQyxlQUFlO0FBQzlEO0FBRUEsU0FBUyxrQkFBa0IsT0FBaUQ7QUFDM0UsU0FBTyxTQUFTLEtBQUssS0FDaEIsTUFBa0MsZUFBZSxRQUNqRCxDQUFFLE1BQWtDLFFBQVEsT0FBUSxNQUFrQyxTQUFTLGNBQy9GLENBQUUsTUFBa0MsU0FBUyxPQUFRLE1BQWtDLFVBQVU7QUFDdkc7QUFFQSxTQUFTLGlCQUFpQixPQUEwRjtBQUNuSCxNQUFJLE1BQU0sS0FBSyxHQUFHO0FBQ2pCLFdBQU8sRUFBRSxVQUFVLE1BQU07QUFBQSxFQUMxQjtBQUNBLE1BQUksbUJBQW1CLEtBQUssR0FBRztBQUM5QixXQUFPLEVBQUUsVUFBVSxNQUFNLEtBQUssb0JBQW9CLE1BQU0sV0FBVztBQUFBLEVBQ3BFO0FBQ0EsTUFBSSxXQUFXLEtBQUssR0FBRztBQUN0QixXQUFPLEVBQUUsb0JBQW9CLE1BQU0sV0FBVztBQUFBLEVBQy9DO0FBQ0EsTUFBSSxrQkFBa0IsS0FBSyxHQUFHO0FBQzdCLFdBQU8sRUFBRSxVQUFVLE1BQU0sSUFBSTtBQUFBLEVBQzlCO0FBQ0EsTUFBSSxVQUFVLE1BQU07QUFDbkIsV0FBTyxFQUFFLFVBQVUsS0FBSztBQUFBLEVBQ3pCO0FBQ0EsU0FBTztBQUNSO0FBRU8sSUFBTSx1QkFBTixNQUFnRTtBQUFBLEVBVXRFLFlBQ3FCLFlBQ0Qsa0JBQ04sWUFDWjtBQUNELFNBQUssU0FBUyxXQUFXLFNBQVMsWUFBWSx1QkFBdUI7QUFDckUsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxjQUFjO0FBQ25CLFNBQUssV0FBVyxJQUFJLFFBQVE7QUFDNUIsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUVPLG9CQUFvRDtBQUMxRCxXQUFPLEtBQUssU0FBUyxLQUFLLEVBQUUsS0FBSyxPQUFLLEtBQUssT0FBUTtBQUFBLEVBQ3BEO0FBQUEsRUFFQSx5QkFBeUIsTUFBb0M7QUFDNUQsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssUUFBUSxLQUFLLG1CQUFtQixNQUFNLEtBQUssV0FBVztBQUdwRyxTQUFLLGtCQUFrQixtQkFBbUIsS0FBSyxPQUFPO0FBQ3RELFNBQUssU0FBUyxLQUFLO0FBQUEsRUFDcEI7QUFBQSxFQUVBLDRCQUE0QixNQUE4QixRQUFvQztBQUM3RixTQUFLLGtCQUFrQixFQUFFLEtBQUssY0FBWSxTQUFTLDRCQUE0QixNQUFNLE1BQU0sQ0FBQztBQUFBLEVBQzdGO0FBQ0Q7QUFyQ2EsdUJBQU47QUFBQSxFQVdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWJVO0FBdUNOLE1BQU0sc0JBQXNCO0FBQUEsRUFTbEMsWUFBWSxPQUFxQyxrQkFBb0MsTUFBOEIsWUFBeUI7QUFQNUksU0FBaUIsNEJBQTRCLElBQUksUUFBeUM7QUFRekYsU0FBSyxTQUFTO0FBQ2QsU0FBSyxjQUFjO0FBQ25CLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssaUJBQWlCLGNBQWMsTUFBTSxNQUFNLFVBQVU7QUFDMUQsU0FBSyx1QkFBdUIsS0FBSyxPQUFPLEtBQUssbUJBQW1CO0FBQUEsRUFDakU7QUFBQSxFQUVBLElBQUksMkJBQW1FO0FBQ3RFLFdBQU8sS0FBSyw2QkFBNkIsS0FBSywwQkFBMEI7QUFBQSxFQUN6RTtBQUFBLEVBRUEsNEJBQTRCLE1BQThCLFFBQThCO0FBQ3ZGLFVBQU0sV0FBVyxFQUFFLE1BQU0sS0FBSyxlQUFlLE9BQU8sR0FBRyxXQUFXLEtBQUssa0JBQWtCLFVBQVU7QUFDbkcsU0FBSyxpQkFBaUIsY0FBYyxNQUFNLE1BQU0sS0FBSyxXQUFXO0FBQ2hFLFNBQUssdUJBQXVCLEtBQUssT0FBTyxLQUFLLG1CQUFtQjtBQUNoRSxTQUFLLDBCQUEwQixLQUFLLEtBQUssNEJBQTRCLFFBQVEsUUFBUSxDQUFDO0FBQUEsRUFDdkY7QUFBQSxFQUVBLGlCQUFpQixTQUFrQixPQUEwQyxzQkFBNkU7QUFDekosVUFBTSxZQUFZLGlCQUFpQixLQUFLLEtBQUssQ0FBQztBQUM5QyxVQUFNLFNBQVMsS0FBSyxpQkFBaUIsS0FBSyxlQUFlLFNBQVMsU0FBUyxXQUFXLEtBQUssa0JBQWtCLFNBQVMsQ0FBQztBQUV2SCxRQUFJLFNBQVM7QUFDWixXQUFLLDZCQUE2QixTQUFTLFdBQVcsc0JBQXNCLFVBQVU7QUFBQSxJQUN2RjtBQUVBLGFBQVMseUJBQXlCLEtBQXVFO0FBQ3hHLFVBQUksUUFBUSxVQUFhLFFBQVEsTUFBTTtBQUN0QyxlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksT0FBTyxRQUFRLFdBQVc7QUFDN0IsZUFBTyxNQUFNLG9CQUFvQixPQUFPLG9CQUFvQjtBQUFBLE1BQzdEO0FBRUEsY0FBUSxLQUFLO0FBQUEsUUFDWixLQUFLLDJCQUEyQjtBQUFRLGlCQUFPLG9CQUFvQjtBQUFBLFFBQ25FLEtBQUssMkJBQTJCO0FBQVcsaUJBQU8sb0JBQW9CO0FBQUEsUUFDdEUsS0FBSywyQkFBMkI7QUFBaUIsaUJBQU8sb0JBQW9CO0FBQUEsTUFDN0U7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUF3QztBQUFBLE1BQzdDLElBQUksS0FBc0I7QUFDekIsZUFBTyxPQUFPLE9BQU8sUUFBUSxHQUFHLE1BQU07QUFBQSxNQUN2QztBQUFBLE1BQ0EsS0FBSyxDQUFJLEtBQWEsaUJBQXFCO0FBQzFDLGFBQUssNkJBQTZCLFVBQVUsR0FBRyxPQUFPLElBQUksR0FBRyxLQUFLLEtBQUssV0FBVyxzQkFBc0IsVUFBVTtBQUNsSCxZQUFJQSxVQUFrQixPQUFPLFFBQVEsR0FBRztBQUN4QyxZQUFJLE9BQU9BLFlBQVcsYUFBYTtBQUNsQyxVQUFBQSxVQUFTO0FBQUEsUUFDVixPQUFPO0FBQ04sY0FBSSxlQUFvQztBQUN4QyxnQkFBTSxvQkFBb0IsQ0FBQyxRQUFpQixhQUE4QjtBQUN6RSxnQkFBSSxTQUFTLE1BQU0sR0FBRztBQUNyQixrQkFBSSxlQUFvQztBQUN4QyxvQkFBTSxjQUFjLE1BQU07QUFDekIsK0JBQWUsZUFBZSxlQUFlLFVBQVUsTUFBTTtBQUM3RCwrQkFBZSxlQUFlLGVBQWUsT0FBTyxjQUFjLFFBQVE7QUFBQSxjQUMzRTtBQUNBLHFCQUFPLElBQUksTUFBTSxRQUFRO0FBQUEsZ0JBQ3hCLEtBQUssQ0FBQ0MsU0FBaUMsYUFBMEI7QUFDaEUsc0JBQUksT0FBTyxhQUFhLFlBQVksU0FBUyxZQUFZLE1BQU0sVUFBVTtBQUN4RSxnQ0FBWTtBQUNaLDJCQUFPLE1BQU07QUFBQSxrQkFDZDtBQUNBLHNCQUFJLGNBQWM7QUFDakIsbUNBQWUsZUFBZSxlQUFlLE9BQU8sY0FBYyxRQUFRO0FBQzFFLDJCQUFRLGFBQThDLFFBQVE7QUFBQSxrQkFDL0Q7QUFDQSx3QkFBTUQsVUFBVUMsUUFBd0MsUUFBUTtBQUNoRSxzQkFBSSxPQUFPLGFBQWEsVUFBVTtBQUNqQywyQkFBTyxrQkFBa0JELFNBQVEsR0FBRyxRQUFRLElBQUksUUFBUSxFQUFFO0FBQUEsa0JBQzNEO0FBQ0EseUJBQU9BO0FBQUEsZ0JBQ1I7QUFBQSxnQkFDQSxLQUFLLENBQUMsU0FBa0MsVUFBdUIsVUFBbUI7QUFDakYsOEJBQVk7QUFDWixzQkFBSSxjQUFjO0FBQ2pCLG9CQUFDLGFBQThDLFFBQVEsSUFBSTtBQUFBLGtCQUM1RDtBQUNBLHlCQUFPO0FBQUEsZ0JBQ1I7QUFBQSxnQkFDQSxnQkFBZ0IsQ0FBQyxTQUFrQyxhQUEwQjtBQUM1RSw4QkFBWTtBQUNaLHNCQUFJLGNBQWM7QUFDakIsMkJBQVEsYUFBOEMsUUFBUTtBQUFBLGtCQUMvRDtBQUNBLHlCQUFPO0FBQUEsZ0JBQ1I7QUFBQSxnQkFDQSxnQkFBZ0IsQ0FBQyxTQUFrQyxVQUF1QixlQUFtQztBQUM1Ryw4QkFBWTtBQUNaLHNCQUFJLGNBQWM7QUFDakIsMkJBQU8sZUFBZSxjQUF5QyxVQUFVLFVBQVU7QUFBQSxrQkFDcEY7QUFDQSx5QkFBTztBQUFBLGdCQUNSO0FBQUEsY0FDRCxDQUFDO0FBQUEsWUFDRjtBQUNBLGdCQUFJLE1BQU0sUUFBUSxNQUFNLEdBQUc7QUFDMUIscUJBQU8sVUFBVSxNQUFNO0FBQUEsWUFDeEI7QUFDQSxtQkFBTztBQUFBLFVBQ1I7QUFDQSxVQUFBQSxVQUFTLGtCQUFrQkEsU0FBUSxHQUFHO0FBQUEsUUFDdkM7QUFDQSxlQUFPQTtBQUFBLE1BQ1I7QUFBQSxNQUNBLFFBQVEsQ0FBQyxLQUFhLE9BQWdCLDRCQUFrRSxvQkFBOEI7QUFDckksY0FBTSxVQUFVLEdBQUcsT0FBTyxJQUFJLEdBQUcsS0FBSztBQUN0QyxjQUFNLFNBQVMseUJBQXlCLDBCQUEwQjtBQUNsRSxZQUFJLFVBQVUsUUFBVztBQUN4QixpQkFBTyxLQUFLLE9BQU8sMkJBQTJCLFFBQVEsS0FBSyxPQUFPLFdBQVcsZUFBZTtBQUFBLFFBQzdGLE9BQU87QUFDTixpQkFBTyxLQUFLLE9BQU8sMkJBQTJCLFFBQVEsS0FBSyxXQUFXLGVBQWU7QUFBQSxRQUN0RjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsQ0FBSSxRQUFxRDtBQUNqRSxjQUFNLFVBQVUsR0FBRyxPQUFPLElBQUksR0FBRyxLQUFLO0FBQ3RDLGNBQU1FLFVBQVMsS0FBSyxlQUFlLFFBQVcsS0FBSyxXQUFXLEtBQUssa0JBQWtCLFNBQVM7QUFDOUYsWUFBSUEsU0FBUTtBQUNYLGlCQUFPO0FBQUEsWUFDTjtBQUFBLFlBRUEsY0FBYyxVQUFVQSxRQUFPLFFBQVEsU0FBU0EsUUFBTyxTQUFTLEtBQUs7QUFBQSxZQUNyRSxrQkFBa0IsVUFBVUEsUUFBTyxXQUFXLEtBQUs7QUFBQSxZQUNuRCxtQkFBbUIsVUFBVUEsUUFBTyxZQUFZLEtBQUs7QUFBQSxZQUNyRCxhQUFhLFVBQVVBLFFBQU8sTUFBTSxTQUFTQSxRQUFPLGFBQWEsS0FBSztBQUFBLFlBQ3RFLGdCQUFnQixVQUFVQSxRQUFPLFdBQVcsS0FBSztBQUFBLFlBQ2pELHNCQUFzQixVQUFVQSxRQUFPLGlCQUFpQixLQUFLO0FBQUEsWUFFN0Qsc0JBQXNCLFVBQVVBLFFBQU8sU0FBUyxRQUFRO0FBQUEsWUFDeEQsMEJBQTBCLFVBQVVBLFFBQU8sV0FBVyxRQUFRO0FBQUEsWUFDOUQsMkJBQTJCLFVBQVVBLFFBQU8sWUFBWSxRQUFRO0FBQUEsWUFDaEUscUJBQXFCLFVBQVVBLFFBQU8sTUFBTSxZQUFZQSxRQUFPLGFBQWEsUUFBUTtBQUFBLFlBQ3BGLHdCQUF3QixVQUFVQSxRQUFPLFdBQVcsUUFBUTtBQUFBLFlBQzVELDhCQUE4QixVQUFVQSxRQUFPLGlCQUFpQixRQUFRO0FBQUEsWUFFeEUsYUFBYSxVQUFVQSxRQUFPLG1CQUFtQjtBQUFBLFVBQ2xEO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFFBQUksT0FBTyxXQUFXLFVBQVU7QUFDL0IsWUFBTSxRQUFRLFFBQVEsS0FBSztBQUFBLElBQzVCO0FBRUEsV0FBTyxPQUFPLE9BQU8sTUFBTTtBQUFBLEVBQzVCO0FBQUEsRUFFUSxpQkFBaUIsUUFBMEI7QUFDbEQsVUFBTSxnQkFBZ0IsQ0FBQyxXQUE2QjtBQUNuRCxhQUFPLFNBQVMsTUFBTSxJQUNyQixJQUFJLE1BQU0sUUFBUTtBQUFBLFFBQ2pCLEtBQUssQ0FBQ0QsU0FBaUMsYUFBMEIsY0FBZUEsUUFBd0MsUUFBUSxDQUFDO0FBQUEsUUFDakksS0FBSyxDQUFDLFNBQWtDLFVBQXVCLFdBQW9CO0FBQUUsZ0JBQU0sSUFBSSxNQUFNLG1EQUFtRCxPQUFPLFFBQVEsQ0FBQyxhQUFhO0FBQUEsUUFBRztBQUFBLFFBQ3hMLGdCQUFnQixDQUFDLFNBQWtDLGFBQTBCO0FBQUUsZ0JBQU0sSUFBSSxNQUFNLGdEQUFnRCxPQUFPLFFBQVEsQ0FBQyxhQUFhO0FBQUEsUUFBRztBQUFBLFFBQy9LLGdCQUFnQixDQUFDLFNBQWtDLGFBQTBCO0FBQUUsZ0JBQU0sSUFBSSxNQUFNLHNDQUFzQyxPQUFPLFFBQVEsQ0FBQyx5QkFBeUI7QUFBQSxRQUFHO0FBQUEsUUFDakwsZ0JBQWdCLENBQUMsWUFBcUI7QUFBRSxnQkFBTSxJQUFJLE1BQU0sdURBQXVEO0FBQUEsUUFBRztBQUFBLFFBQ2xILGNBQWMsTUFBTTtBQUFBLFFBQ3BCLG1CQUFtQixNQUFNO0FBQUEsTUFDMUIsQ0FBQyxJQUFJO0FBQUEsSUFDUDtBQUNBLFdBQU8sY0FBYyxNQUFNO0FBQUEsRUFDNUI7QUFBQSxFQUVRLDZCQUE2QixLQUFhLFdBQXFDLGFBQXlDO0FBQy9ILFVBQU0sUUFBUSx3QkFBd0IsS0FBSyxHQUFHLElBQUksbUJBQW1CLFdBQVcsS0FBSyxxQkFBcUIsSUFBSSxHQUFHO0FBQ2pILFVBQU0sa0JBQWtCLGNBQWMsSUFBSSxZQUFZLEtBQUssT0FBTztBQUNsRSxRQUFJLG1CQUFtQixhQUFhLE9BQU87QUFDMUMsVUFBSSxPQUFPLFdBQVcsYUFBYSxhQUFhO0FBQy9DLGFBQUssWUFBWSxLQUFLLEdBQUcsZUFBZSwySEFBMkgsR0FBRyw4REFBOEQ7QUFBQSxNQUNyTztBQUNBO0FBQUEsSUFDRDtBQUNBLFFBQUksbUJBQW1CLFdBQVcsT0FBTztBQUN4QyxVQUFJLFdBQVcsVUFBVTtBQUN4QixhQUFLLFlBQVksS0FBSyxHQUFHLGVBQWUseUZBQXlGLEdBQUcsbUdBQW1HO0FBQUEsTUFDeE87QUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSw0QkFBNEIsUUFBOEIsVUFBMkc7QUFDNUssVUFBTSxRQUFRLElBQUkseUJBQXlCLFFBQVEsVUFBVSxLQUFLLGdCQUFnQixLQUFLLGtCQUFrQixXQUFXLEtBQUssV0FBVztBQUNwSSxXQUFPLE9BQU8sT0FBTztBQUFBLE1BQ3BCLHNCQUFzQixDQUFDLFNBQWlCLFVBQXNDLE1BQU0scUJBQXFCLFNBQVMsaUJBQWlCLEtBQUssQ0FBQztBQUFBLElBQzFJLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxPQUFPLFFBQWlHO0FBQy9HLFdBQU8sT0FBTyxPQUFPLENBQUMsUUFBUSxVQUFVO0FBQUUsYUFBTyxJQUFJLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0FBQUcsYUFBTztBQUFBLElBQVEsR0FBRyxvQkFBSSxJQUE0QyxDQUFDO0FBQUEsRUFDOUk7QUFFRDtBQUVPLE1BQU0sd0JBQXdCLGdCQUF1Qyx1QkFBdUI7IiwKICAibmFtZXMiOiBbInJlc3VsdCIsICJ0YXJnZXQiLCAiY29uZmlnIl0KfQo=
