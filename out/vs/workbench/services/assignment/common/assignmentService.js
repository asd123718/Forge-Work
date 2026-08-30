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
import { localize } from "../../../../nls.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Memento } from "../../../common/memento.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY, AssignmentFilterProvider, TargetPopulation, VSCodeCoreAssignmentsFilterProvider, WindowKind } from "../../../../platform/assignment/common/assignment.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { resolveAmdNodeModulePath } from "../../../../amdX.js";
import { asJson, IRequestService } from "../../../../platform/request/common/request.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { timeout } from "../../../../base/common/async.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { CopilotAssignmentFilterProvider, GitHubCoreAssignmentsFilterProvider } from "./assignmentFilters.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { AssignmentContextFilter } from "./assignmentContextFilter.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { experimentsEnabled } from "../../telemetry/common/workbenchTelemetryUtils.js";
const IWorkbenchAssignmentService = createDecorator("assignmentService");
class MementoKeyValueStorage {
  constructor(memento) {
    this.memento = memento;
    this.mementoObj = memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  async getValue(key, defaultValue) {
    const value = await this.mementoObj[key];
    return value || defaultValue;
  }
  setValue(key, value) {
    this.mementoObj[key] = value;
    this.memento.saveMemento();
  }
}
class WorkbenchAssignmentServiceTelemetry extends Disposable {
  constructor(telemetryService, productService, contextFilter) {
    super();
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.contextFilter = contextFilter;
    this._onDidUpdateAssignmentContext = this._register(new Emitter());
    this.onDidUpdateAssignmentContext = this._onDidUpdateAssignmentContext.event;
    this._register(this.contextFilter.onDidChange(() => {
      if (this._previousAssignmentContext) {
        this._setAssignmentContext(this._previousAssignmentContext);
      }
    }));
  }
  get assignmentContext() {
    return this._lastAssignmentContext?.split(";");
  }
  _setAssignmentContext(value) {
    const filteredValue = this.contextFilter.filter(value);
    this._lastAssignmentContext = filteredValue;
    this._onDidUpdateAssignmentContext.fire();
    if (this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
      this.telemetryService.setExperimentProperty(this.productService.tasConfig.assignmentContextTelemetryPropertyName, filteredValue);
    }
  }
  // __GDPR__COMMON__ "abexp.assignmentcontext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
  setSharedProperty(name, value) {
    if (name === this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
      this._previousAssignmentContext = value;
      return this._setAssignmentContext(value);
    }
    this.telemetryService.setExperimentProperty(name, value);
  }
  postEvent(eventName, props) {
    const data = {};
    for (const [key, value] of props.entries()) {
      data[key] = value;
    }
    this.telemetryService.publicLog(eventName, data);
  }
}
let WorkbenchAssignmentService = class extends Disposable {
  constructor(telemetryService, storageService, configurationService, productService, environmentService, instantiationService, defaultAccountService, requestService) {
    super();
    this.telemetryService = telemetryService;
    this.configurationService = configurationService;
    this.productService = productService;
    this.environmentService = environmentService;
    this.instantiationService = instantiationService;
    this.defaultAccountService = defaultAccountService;
    this.requestService = requestService;
    this.tasSetupDisposables = this._register(new DisposableStore());
    this.networkInitialized = false;
    this.setupGeneration = 0;
    this._onDidRefetchAssignments = this._register(new Emitter());
    this.onDidRefetchAssignments = this._onDidRefetchAssignments.event;
    /**
     * Transport for the new assignments endpoint, backed by the main-process request service
     * (avoids renderer CORS). Shape matches tas-client's injectable `assignmentsFetch`.
     */
    this.assignmentsFetch = async (url, init) => {
      const context = await this.requestService.request({
        type: init.method,
        url,
        data: init.body,
        headers: init.headers,
        disableCache: true,
        callSite: "assignmentService.assignments"
      }, CancellationToken.None);
      return {
        status: context.res.statusCode ?? 0,
        json: async () => await asJson(context) ?? {}
      };
    };
    this.experimentsEnabled = experimentsEnabled(configurationService, productService, this.environmentService);
    if (this.experimentsEnabled) {
      this.tasClient = this.setupTASClient();
      this.defaultAccountService.getDefaultAccount().then(() => this.recreateTasClientIfEndpointChanged());
      this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.recreateTasClientIfEndpointChanged()));
      this._register(toDisposable(() => {
        this.revokeCurrentSetup?.();
        WorkbenchAssignmentService.disposeTasClient(this.tasClient);
      }));
    }
    this.contextFilter = this._register(new AssignmentContextFilter(storageService));
    this.telemetry = this._register(new WorkbenchAssignmentServiceTelemetry(telemetryService, productService, this.contextFilter));
    this._register(this.telemetry.onDidUpdateAssignmentContext(() => this._onDidRefetchAssignments.fire()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("experiments.override")) {
        this._onDidRefetchAssignments.fire();
      }
    }));
    this.keyValueStorage = new MementoKeyValueStorage(new Memento("experiment.service.memento", storageService));
    const overrideDelaySetting = configurationService.getValue("experiments.overrideDelay");
    const overrideDelay = typeof overrideDelaySetting === "number" ? overrideDelaySetting : 0;
    this.overrideInitDelay = timeout(overrideDelay);
  }
  async getTreatment(name) {
    const result = await this.doGetTreatment(name);
    this.telemetryService.publicLog2("tasClientReadTreatmentComplete", {
      treatmentName: name,
      treatmentValue: JSON.stringify(result)
    });
    return result;
  }
  async doGetTreatment(name) {
    await this.overrideInitDelay;
    const override = this.configurationService.getValue(`experiments.override.${name}`);
    if (override !== void 0) {
      return override;
    }
    if (!this.tasClient) {
      return void 0;
    }
    if (!this.experimentsEnabled) {
      return void 0;
    }
    let result;
    const client = await this.tasClient;
    if (this.networkInitialized) {
      result = client.getTreatmentVariable("vscode", name);
    } else {
      result = await client.getTreatmentVariableAsync("vscode", name, true);
    }
    result = client.getTreatmentVariable("vscode", name);
    return result;
  }
  /**
   * Resolves the new TAS assignments API URL from the account entitlements `exp` endpoint,
   * or `undefined` when no account/endpoint is available.
   */
  getAssignmentsEndpoint() {
    const account = this.defaultAccountService.currentDefaultAccount;
    const endpoints = account?.entitlementsData?.endpoints;
    const exp = endpoints?.exp;
    if (!exp) {
      return void 0;
    }
    return `${exp.replace(/\/+$/, "")}/api/v1/assignments`;
  }
  /** Recreates the TAS client when the resolved assignments endpoint has changed. */
  recreateTasClientIfEndpointChanged() {
    if (this._store.isDisposed) {
      return;
    }
    const next = this.getAssignmentsEndpoint();
    if (next !== this.assignmentsEndpoint) {
      this.tasClient = this.setupTASClient();
    }
  }
  async setupTASClient() {
    this.tasSetupDisposables.clear();
    const generation = ++this.setupGeneration;
    this.networkInitialized = false;
    this.revokeCurrentSetup?.();
    WorkbenchAssignmentService.disposeTasClient(this.tasClient);
    let revoked = false;
    this.revokeCurrentSetup = () => {
      revoked = true;
    };
    const service = this;
    const keyValueStorage = {
      getValue(key, defaultValue) {
        return service.keyValueStorage.getValue(key, defaultValue);
      },
      setValue(key, value) {
        if (!revoked) {
          service.keyValueStorage.setValue(key, value);
        }
      }
    };
    const telemetry = {
      setSharedProperty(name, value) {
        if (!revoked) {
          service.telemetry.setSharedProperty(name, value);
        }
      },
      postEvent(eventName, props) {
        if (!revoked) {
          service.telemetry.postEvent(eventName, props);
        }
      }
    };
    const targetPopulation = this.productService.quality === "stable" ? TargetPopulation.Public : this.productService.quality === "exploration" ? TargetPopulation.Exploration : TargetPopulation.Insiders;
    const filterProvider = new AssignmentFilterProvider(
      this.productService.version,
      this.productService.nameLong,
      this.telemetryService.machineId,
      this.telemetryService.devDeviceId,
      targetPopulation,
      this.productService.date ?? "",
      this.environmentService.isSessionsWindow ? WindowKind.Agents : WindowKind.Editor
    );
    const extensionsFilterProvider = this.instantiationService.createInstance(CopilotAssignmentFilterProvider);
    this.tasSetupDisposables.add(extensionsFilterProvider);
    this.tasSetupDisposables.add(extensionsFilterProvider.onDidChangeFilters(() => this.refetchAssignments()));
    const assignmentsEndpoint = this.getAssignmentsEndpoint();
    this.assignmentsEndpoint = assignmentsEndpoint;
    let assignmentsFilterProviders;
    if (assignmentsEndpoint) {
      const coreAssignmentsFilterProvider = new VSCodeCoreAssignmentsFilterProvider(
        this.productService.version,
        this.productService.nameLong,
        this.telemetryService.devDeviceId,
        targetPopulation,
        this.productService.date ?? "",
        this.environmentService.isSessionsWindow ? WindowKind.Agents : WindowKind.Editor
      );
      const githubAssignmentsFilterProvider = this.instantiationService.createInstance(GitHubCoreAssignmentsFilterProvider);
      this.tasSetupDisposables.add(githubAssignmentsFilterProvider);
      this.tasSetupDisposables.add(githubAssignmentsFilterProvider.onDidChangeFilters(() => this.refetchAssignments()));
      assignmentsFilterProviders = [coreAssignmentsFilterProvider, githubAssignmentsFilterProvider];
    }
    const tasConfig = this.productService.tasConfig;
    const tasClientUrl = resolveAmdNodeModulePath("tas-client", "dist/tas-client.min.js");
    const tasClientModule = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      `${tasClientUrl}`
    );
    const fetchStopWatch = StopWatch.create();
    const tasClient = new tasClientModule.ExperimentationService({
      filterProviders: [filterProvider, extensionsFilterProvider],
      telemetry,
      storageKey: ASSIGNMENT_STORAGE_KEY,
      keyValueStorage,
      assignmentContextTelemetryPropertyName: tasConfig.assignmentContextTelemetryPropertyName,
      telemetryEventName: tasConfig.telemetryEventName,
      endpoint: tasConfig.endpoint,
      extensionName: "vscode-core",
      assignmentsEndpoint,
      assignmentsFilterProviders,
      // Route the assignments request through the main-process request service so it is
      // not subject to renderer CORS (parity with how core reaches api.github.com).
      assignmentsFetch: assignmentsEndpoint ? (url, init) => revoked ? Promise.resolve({ status: 0, json: async () => ({}) }) : service.assignmentsFetch(url, init) : void 0,
      refetchInterval: ASSIGNMENT_REFETCH_INTERVAL
    });
    await tasClient.initializePromise;
    tasClient.initialFetch.then(() => {
      if (generation !== this.setupGeneration) {
        return;
      }
      this.networkInitialized = true;
      this.logFetchLatency("initial", fetchStopWatch.elapsed());
    }).catch(() => void 0);
    return tasClient;
  }
  logFetchLatency(fetchType, durationMs) {
    this.telemetryService.publicLog2("tasClientFetchLatency", {
      fetchType,
      durationMs
    });
  }
  async refetchAssignments() {
    if (!this.tasClient) {
      return;
    }
    const tasClient = await this.tasClient;
    await tasClient.initialFetch;
    const refetchStopWatch = StopWatch.create();
    await tasClient.getTreatmentVariableAsync("vscode", "refresh", false);
    this.logFetchLatency("refetch", refetchStopWatch.elapsed());
  }
  async getCurrentExperiments() {
    if (!this.tasClient) {
      return void 0;
    }
    if (!this.experimentsEnabled) {
      return void 0;
    }
    await this.tasClient;
    return this.telemetry.assignmentContext;
  }
  addTelemetryAssignmentFilter(filter) {
    this.contextFilter.addFilter(filter);
  }
  /** Stops a TAS client's auto-polling once it resolves. Safe to call with `undefined`. */
  static disposeTasClient(client) {
    client?.then((c) => c.dispose()).catch(() => void 0);
  }
};
WorkbenchAssignmentService = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IDefaultAccountService),
  __decorateParam(7, IRequestService)
], WorkbenchAssignmentService);
registerSingleton(IWorkbenchAssignmentService, WorkbenchAssignmentService, InstantiationType.Delayed);
const registry = Registry.as(ConfigurationExtensions.Configuration);
registry.registerConfiguration({
  ...workbenchConfigurationNodeBase,
  "properties": {
    "workbench.enableExperiments": {
      "type": "boolean",
      "description": localize("workbench.enableExperiments", "Fetches experiments to run from a Microsoft online service."),
      "default": true,
      "scope": ConfigurationScope.APPLICATION,
      "restricted": true,
      "tags": ["usesOnlineServices"]
    }
  }
});
export {
  IWorkbenchAssignmentService,
  WorkbenchAssignmentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhc3NpZ25tZW50XFxjb21tb25cXGFzc2lnbm1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgSUtleVZhbHVlU3RvcmFnZSwgSUV4cGVyaW1lbnRhdGlvblRlbGVtZXRyeSwgSUV4cGVyaW1lbnRhdGlvbkZpbHRlclByb3ZpZGVyLCBFeHBlcmltZW50YXRpb25TZXJ2aWNlIGFzIFRBU0NsaWVudCB9IGZyb20gJ3Rhcy1jbGllbnQnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQVNTSUdOTUVOVF9SRUZFVENIX0lOVEVSVkFMLCBBU1NJR05NRU5UX1NUT1JBR0VfS0VZLCBBc3NpZ25tZW50RmlsdGVyUHJvdmlkZXIsIElBc3NpZ25tZW50U2VydmljZSwgVGFyZ2V0UG9wdWxhdGlvbiwgVlNDb2RlQ29yZUFzc2lnbm1lbnRzRmlsdGVyUHJvdmlkZXIsIFdpbmRvd0tpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQW1kTm9kZU1vZHVsZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IGFzSnNvbiwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IENvcGlsb3RBc3NpZ25tZW50RmlsdGVyUHJvdmlkZXIsIEdpdEh1YkNvcmVBc3NpZ25tZW50c0ZpbHRlclByb3ZpZGVyIH0gZnJvbSAnLi9hc3NpZ25tZW50RmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IEFzc2lnbm1lbnRDb250ZXh0RmlsdGVyIH0gZnJvbSAnLi9hc3NpZ25tZW50Q29udGV4dEZpbHRlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGV4cGVyaW1lbnRzRW5hYmxlZCB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vd29ya2JlbmNoVGVsZW1ldHJ5VXRpbHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBc3NpZ25tZW50RmlsdGVyIHtcblx0LyoqXG5cdCAqIFN0YWJsZSBpZGVudGlmaWVyIGZvciB0aGlzIGZpbHRlci4gVXNlZCB0byBwZXJzaXN0IGFuZCByZWNvbmNpbGUgdGhlIHNldCBvZlxuXHQgKiBhc3NpZ25tZW50LWNvbnRleHQgaWRzIHRoaXMgZmlsdGVyIGhhcyBleGNsdWRlZCwgaW5kZXBlbmRlbnRseSBvZiBvdGhlciBmaWx0ZXJzLlxuXHQgKi9cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0ZXhjbHVkZShhc3NpZ25tZW50OiBzdHJpbmcpOiBib29sZWFuO1xuXHRvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG59XG5cbmV4cG9ydCBjb25zdCBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlPignYXNzaWdubWVudFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgZXh0ZW5kcyBJQXNzaWdubWVudFNlcnZpY2Uge1xuXHRnZXRDdXJyZW50RXhwZXJpbWVudHMoKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cdGFkZFRlbGVtZXRyeUFzc2lnbm1lbnRGaWx0ZXIoZmlsdGVyOiBJQXNzaWdubWVudEZpbHRlcik6IHZvaWQ7XG59XG5cbmNsYXNzIE1lbWVudG9LZXlWYWx1ZVN0b3JhZ2UgaW1wbGVtZW50cyBJS2V5VmFsdWVTdG9yYWdlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1lbWVudG9PYmo6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbWVtZW50bzogTWVtZW50bzxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4pIHtcblx0XHR0aGlzLm1lbWVudG9PYmogPSBtZW1lbnRvLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VmFsdWU8VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IFQgfCB1bmRlZmluZWQpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMubWVtZW50b09ialtrZXldIGFzIFQgfCB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4gdmFsdWUgfHwgZGVmYXVsdFZhbHVlO1xuXHR9XG5cblx0c2V0VmFsdWU8VD4oa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0dGhpcy5tZW1lbnRvT2JqW2tleV0gPSB2YWx1ZTtcblx0XHR0aGlzLm1lbWVudG8uc2F2ZU1lbWVudG8oKTtcblx0fVxufVxuXG5jbGFzcyBXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZVRlbGVtZXRyeSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXhwZXJpbWVudGF0aW9uVGVsZW1ldHJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZUFzc2lnbm1lbnRDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlQXNzaWdubWVudENvbnRleHQgPSB0aGlzLl9vbkRpZFVwZGF0ZUFzc2lnbm1lbnRDb250ZXh0LmV2ZW50O1xuXG5cdHByaXZhdGUgX3ByZXZpb3VzQXNzaWdubWVudENvbnRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEFzc2lnbm1lbnRDb250ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBhc3NpZ25tZW50Q29udGV4dCgpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RBc3NpZ25tZW50Q29udGV4dD8uc3BsaXQoJzsnKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEZpbHRlcjogQXNzaWdubWVudENvbnRleHRGaWx0ZXJcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlLWFwcGx5IHRoZSBmaWx0ZXJzIHdoZW5ldmVyIGEgZmlsdGVyIGlzIGFkZGVkIG9yIGNoYW5nZXMgaXRzIGV4Y2x1c2lvbiBkZWNpc2lvbnMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0RmlsdGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9wcmV2aW91c0Fzc2lnbm1lbnRDb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMuX3NldEFzc2lnbm1lbnRDb250ZXh0KHRoaXMuX3ByZXZpb3VzQXNzaWdubWVudENvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEFzc2lnbm1lbnRDb250ZXh0KHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBmaWx0ZXJlZFZhbHVlID0gdGhpcy5jb250ZXh0RmlsdGVyLmZpbHRlcih2YWx1ZSk7XG5cdFx0dGhpcy5fbGFzdEFzc2lnbm1lbnRDb250ZXh0ID0gZmlsdGVyZWRWYWx1ZTtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUFzc2lnbm1lbnRDb250ZXh0LmZpcmUoKTtcblxuXHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLnRhc0NvbmZpZz8uYXNzaWdubWVudENvbnRleHRUZWxlbWV0cnlQcm9wZXJ0eU5hbWUpIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5zZXRFeHBlcmltZW50UHJvcGVydHkodGhpcy5wcm9kdWN0U2VydmljZS50YXNDb25maWcuYXNzaWdubWVudENvbnRleHRUZWxlbWV0cnlQcm9wZXJ0eU5hbWUsIGZpbHRlcmVkVmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIF9fR0RQUl9fQ09NTU9OX18gXCJhYmV4cC5hc3NpZ25tZW50Y29udGV4dFwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9XG5cdHNldFNoYXJlZFByb3BlcnR5KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChuYW1lID09PSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnRhc0NvbmZpZz8uYXNzaWdubWVudENvbnRleHRUZWxlbWV0cnlQcm9wZXJ0eU5hbWUpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzQXNzaWdubWVudENvbnRleHQgPSB2YWx1ZTtcblx0XHRcdHJldHVybiB0aGlzLl9zZXRBc3NpZ25tZW50Q29udGV4dCh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnNldEV4cGVyaW1lbnRQcm9wZXJ0eShuYW1lLCB2YWx1ZSk7XG5cdH1cblxuXHRwb3N0RXZlbnQoZXZlbnROYW1lOiBzdHJpbmcsIHByb3BzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YTogSVRlbGVtZXRyeURhdGEgPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBwcm9wcy5lbnRyaWVzKCkpIHtcblx0XHRcdGRhdGFba2V5XSA9IHZhbHVlO1xuXHRcdH1cblxuXHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcInF1ZXJ5LWV4cGZlYXR1cmVcIiA6IHtcblx0XHRcdFx0XCJvd25lclwiOiBcInNiYXR0ZW5cIixcblx0XHRcdFx0XCJjb21tZW50XCI6IFwiTG9ncyBxdWVyaWVzIHRvIHRoZSBleHBlcmltZW50IHNlcnZpY2UgYnkgZmVhdHVyZSBmb3IgbWV0cmljIGNhbGN1bGF0aW9uc1wiLFxuXHRcdFx0XHRcIkFCRXhwLnF1ZXJpZWRGZWF0dXJlXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiY29tbWVudFwiOiBcIlRoZSBleHBlcmltZW50YWwgZmVhdHVyZSBiZWluZyBxdWVyaWVkXCIgfVxuXHRcdFx0fVxuXHRcdCovXG5cdFx0LyogX19HRFBSX19cblx0XHRcdFwiYXNzaWdubWVudHMtdmFsaWRhdGlvblwiIDoge1xuXHRcdFx0XHRcIm93bmVyXCI6IFwic2JhdHRlblwiLFxuXHRcdFx0XHRcImNvbW1lbnRcIjogXCJWYWxpZGF0aW9uIGRhdGEgZm9yIHRoZSBuZXcgVEFTIGFzc2lnbm1lbnRzIGVuZHBvaW50LCBjb21wYXJlZCBhZ2FpbnN0IHRoZSBsZWdhY3kgZW5kcG9pbnRcIixcblx0XHRcdFx0XCJGZWF0dXJlVmFyaWFibGVDb3VudFwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImNvbW1lbnRcIjogXCJOdW1iZXIgb2YgZmVhdHVyZSB2YXJpYWJsZXMgcmV0dXJuZWQgYnkgdGhlIG5ldyBhc3NpZ25tZW50cyBlbmRwb2ludFwiIH0sXG5cdFx0XHRcdFwiQXNzaWduZWRWYXJpYW50Q291bnRcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJjb21tZW50XCI6IFwiTnVtYmVyIG9mIGFzc2lnbmVkIHZhcmlhbnRzIHJldHVybmVkIGJ5IHRoZSBuZXcgYXNzaWdubWVudHMgZW5kcG9pbnRcIiB9LFxuXHRcdFx0XHRcIkRhdGFWZXJzaW9uXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiY29tbWVudFwiOiBcIkRhdGEgdmVyc2lvbiByZXR1cm5lZCBieSB0aGUgbmV3IGFzc2lnbm1lbnRzIGVuZHBvaW50XCIgfSxcblx0XHRcdFx0XCJBc3NpZ25tZW50Q29udGV4dFwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImNvbW1lbnRcIjogXCJBc3NpZ25tZW50IGNvbnRleHQgcmV0dXJuZWQgYnkgdGhlIG5ldyBhc3NpZ25tZW50cyBlbmRwb2ludFwiIH1cblx0XHRcdH1cblx0XHQqL1xuXHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcImNhbGwtYXNzaWdubWVudHMtZXJyb3JcIiA6IHtcblx0XHRcdFx0XCJvd25lclwiOiBcInNiYXR0ZW5cIixcblx0XHRcdFx0XCJjb21tZW50XCI6IFwiTG9ncyBlcnJvcnMgd2hlbiBjYWxsaW5nIHRoZSBuZXcgVEFTIGFzc2lnbm1lbnRzIGVuZHBvaW50XCIsXG5cdFx0XHRcdFwiRXJyb3JUeXBlXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiY29tbWVudFwiOiBcIlRoZSB0eXBlIG9mIGVycm9yIGVuY291bnRlcmVkIHdoZW4gY2FsbGluZyB0aGUgbmV3IGFzc2lnbm1lbnRzIGVuZHBvaW50XCIgfVxuXHRcdFx0fVxuXHRcdCovXG5cdFx0LyogX19HRFBSX19cblx0XHRcdFwidGFzLWNhbGxcIiA6IHtcblx0XHRcdFx0XCJvd25lclwiOiBcInNiYXR0ZW5cIixcblx0XHRcdFx0XCJjb21tZW50XCI6IFwiTG9ncyBlYWNoIFRBUyBjYWxsIChsZWdhY3kgYW5kIG5ldyBhc3NpZ25tZW50cyBlbmRwb2ludCkgd2l0aCBpdHMgb3V0Y29tZSwgdG8gY29uZmlybSBjYWxscyBhcmUgbWFkZSBhbmQgc3VjY2VlZGluZyBwZXIgZXh0ZW5zaW9uXCIsXG5cdFx0XHRcdFwiY2FsbFR5cGVcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJjb21tZW50XCI6IFwiV2hpY2ggZW5kcG9pbnQgd2FzIGNhbGxlZDogbGVnYWN5IG9yIGFzc2lnbm1lbnRzXCIgfSxcblx0XHRcdFx0XCJvdXRjb21lXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiY29tbWVudFwiOiBcIkNhbGwgb3V0Y29tZTogU3VjY2VzcywgU2VydmVyRXJyb3IsIE5vUmVzcG9uc2UsIG9yIEdlbmVyaWNFcnJvclwiIH0sXG5cdFx0XHRcdFwiZXh0ZW5zaW9uTmFtZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiLCBcImNvbW1lbnRcIjogXCJUaGUgZXh0ZW5zaW9uL2hvc3QgdGhlIFRBUyBjYWxsIHdhcyBtYWRlIGZvclwiIH0sXG5cdFx0XHRcdFwiYXNzaWdubWVudENvbnRleHRcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJjb21tZW50XCI6IFwiVGhlIGFzc2lnbm1lbnQgY29udGV4dCByZXR1cm5lZCBieSB0aGlzIGNhbGwncyBlbmRwb2ludFwiIH1cblx0XHRcdH1cblx0XHQqL1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coZXZlbnROYW1lLCBkYXRhKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFzc2lnbm1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHRhc0NsaWVudDogUHJvbWlzZTxUQVNDbGllbnQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRhc1NldHVwRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgYXNzaWdubWVudHNFbmRwb2ludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgbmV0d29ya0luaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgc2V0dXBHZW5lcmF0aW9uID0gMDtcblx0LyoqIFJldm9rZXMgdGhlIGN1cnJlbnQgc2V0dXAncyBzdG9yYWdlL3RlbGVtZXRyeS9mZXRjaCB3cmFwcGVycywgbmV1dHJhbGl6aW5nIGEgc3VwZXJzZWRlZCBpbi1mbGlnaHQgY2xpZW50LiAqL1xuXHRwcml2YXRlIHJldm9rZUN1cnJlbnRTZXR1cDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJyaWRlSW5pdERlbGF5OiBQcm9taXNlPHZvaWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEZpbHRlcjogQXNzaWdubWVudENvbnRleHRGaWx0ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5OiBXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZVRlbGVtZXRyeTtcblx0cHJpdmF0ZSByZWFkb25seSBrZXlWYWx1ZVN0b3JhZ2U6IElLZXlWYWx1ZVN0b3JhZ2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHBlcmltZW50c0VuYWJsZWQ6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWZldGNoQXNzaWdubWVudHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzID0gdGhpcy5fb25EaWRSZWZldGNoQXNzaWdubWVudHMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5leHBlcmltZW50c0VuYWJsZWQgPSBleHBlcmltZW50c0VuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRpZiAodGhpcy5leHBlcmltZW50c0VuYWJsZWQpIHtcblx0XHRcdHRoaXMudGFzQ2xpZW50ID0gdGhpcy5zZXR1cFRBU0NsaWVudCgpO1xuXG5cdFx0XHQvLyBUaGUgYXNzaWdubWVudHMgZW5kcG9pbnQgaXMgc291cmNlZCBmcm9tIGFjY291bnQgZW50aXRsZW1lbnRzLCB3aGljaCBsb2FkXG5cdFx0XHQvLyBhc3luY2hyb25vdXNseS4gVGhlIGluaXRpYWwgYWNjb3VudCBsb2FkIHJlc29sdmVzIHRoZSByZWFkaW5lc3MgYmFycmllciB3aXRob3V0XG5cdFx0XHQvLyBmaXJpbmcgb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCwgc28gcHJvYWN0aXZlbHkgcmUtY2hlY2sgb25jZSBpdCBpcyByZWFkeSwgYW5kXG5cdFx0XHQvLyBhZ2FpbiB3aGVuZXZlciB0aGUgYWNjb3VudCBjaGFuZ2VzIGxhdGVyLlxuXHRcdFx0dGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnQoKS50aGVuKCgpID0+IHRoaXMucmVjcmVhdGVUYXNDbGllbnRJZkVuZHBvaW50Q2hhbmdlZCgpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQoKCkgPT4gdGhpcy5yZWNyZWF0ZVRhc0NsaWVudElmRW5kcG9pbnRDaGFuZ2VkKCkpKTtcblxuXHRcdFx0Ly8gU3RvcCB0aGUgZmluYWwgY2xpZW50J3MgYXV0by1wb2xsaW5nIGFuZCByZXZva2UgaXRzIHdyYXBwZXJzIHdoZW4gdGhlIHNlcnZpY2UgaXMgZGlzcG9zZWQuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnJldm9rZUN1cnJlbnRTZXR1cD8uKCk7XG5cdFx0XHRcdFdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLmRpc3Bvc2VUYXNDbGllbnQodGhpcy50YXNDbGllbnQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dEZpbHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBc3NpZ25tZW50Q29udGV4dEZpbHRlcihzdG9yYWdlU2VydmljZSkpO1xuXHRcdHRoaXMudGVsZW1ldHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlVGVsZW1ldHJ5KHRlbGVtZXRyeVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0aGlzLmNvbnRleHRGaWx0ZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRlbGVtZXRyeS5vbkRpZFVwZGF0ZUFzc2lnbm1lbnRDb250ZXh0KCgpID0+IHRoaXMuX29uRGlkUmVmZXRjaEFzc2lnbm1lbnRzLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGVyaW1lbnRzLm92ZXJyaWRlJykpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZWZldGNoQXNzaWdubWVudHMuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMua2V5VmFsdWVTdG9yYWdlID0gbmV3IE1lbWVudG9LZXlWYWx1ZVN0b3JhZ2UobmV3IE1lbWVudG88UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KCdleHBlcmltZW50LnNlcnZpY2UubWVtZW50bycsIHN0b3JhZ2VTZXJ2aWNlKSk7XG5cblx0XHQvLyBGb3IgZGV2ZWxvcG1lbnQgcHVycG9zZXMsIGNvbmZpZ3VyZSB0aGUgZGVsYXkgdW50aWwgdGFzIGxvY2FsIHRhcyB0cmVhdG1lbnQgb3Z2ZXJyaWRlcyBhcmUgYXZhaWxhYmxlXG5cdFx0Y29uc3Qgb3ZlcnJpZGVEZWxheVNldHRpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZXhwZXJpbWVudHMub3ZlcnJpZGVEZWxheScpO1xuXHRcdGNvbnN0IG92ZXJyaWRlRGVsYXkgPSB0eXBlb2Ygb3ZlcnJpZGVEZWxheVNldHRpbmcgPT09ICdudW1iZXInID8gb3ZlcnJpZGVEZWxheVNldHRpbmcgOiAwO1xuXHRcdHRoaXMub3ZlcnJpZGVJbml0RGVsYXkgPSB0aW1lb3V0KG92ZXJyaWRlRGVsYXkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VHJlYXRtZW50PFQgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRvR2V0VHJlYXRtZW50PFQ+KG5hbWUpO1xuXG5cdFx0dHlwZSBUQVNDbGllbnRSZWFkVHJlYXRtZW50RGF0YSA9IHtcblx0XHRcdHRyZWF0bWVudE5hbWU6IHN0cmluZztcblx0XHRcdHRyZWF0bWVudFZhbHVlOiBzdHJpbmc7XG5cdFx0fTtcblxuXHRcdHR5cGUgVEFTQ2xpZW50UmVhZFRyZWF0bWVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYmF0dGVuJztcblx0XHRcdGNvbW1lbnQ6ICdMb2dnZWQgd2hlbiBhIHRyZWF0bWVudCB2YWx1ZSBpcyByZWFkIGZyb20gdGhlIGV4cGVyaW1lbnQgc2VydmljZSc7XG5cdFx0XHR0cmVhdG1lbnRWYWx1ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSB2YWx1ZSBvZiB0aGUgcmVhZCB0cmVhdG1lbnQnIH07XG5cdFx0XHR0cmVhdG1lbnROYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIHRyZWF0bWVudCB0aGF0IHdhcyByZWFkJyB9O1xuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxUQVNDbGllbnRSZWFkVHJlYXRtZW50RGF0YSwgVEFTQ2xpZW50UmVhZFRyZWF0bWVudENsYXNzaWZpY2F0aW9uPigndGFzQ2xpZW50UmVhZFRyZWF0bWVudENvbXBsZXRlJywge1xuXHRcdFx0dHJlYXRtZW50TmFtZTogbmFtZSxcblx0XHRcdHRyZWF0bWVudFZhbHVlOiBKU09OLnN0cmluZ2lmeShyZXN1bHQpXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0dldFRyZWF0bWVudDxUIGV4dGVuZHMgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbj4obmFtZTogc3RyaW5nKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXdhaXQgdGhpcy5vdmVycmlkZUluaXREZWxheTsgLy8gRm9yIGRldmVsb3BtZW50IHB1cnBvc2VzLCBhbGxvdyBvdmVycmlkaW5nIHRhcyBhc3NpZ25tZW50cyB0byB0ZXN0IHZhcmlhbnRzIGxvY2FsbHkuXG5cblx0XHRjb25zdCBvdmVycmlkZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VD4oYGV4cGVyaW1lbnRzLm92ZXJyaWRlLiR7bmFtZX1gKTtcblx0XHRpZiAob3ZlcnJpZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIG92ZXJyaWRlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy50YXNDbGllbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmV4cGVyaW1lbnRzRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBUIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMudGFzQ2xpZW50O1xuXG5cdFx0Ly8gVGhlIFRBUyBjbGllbnQgaXMgaW5pdGlhbGl6ZWQgYnV0IHdlIG5lZWQgdG8gY2hlY2sgaWYgdGhlIGluaXRpYWwgZmV0Y2ggaGFzIGNvbXBsZXRlZCB5ZXRcblx0XHQvLyBJZiBpdCBpcyBjb21wbGV0ZSwgcmV0dXJuIGEgY2FjaGVkIHZhbHVlIGZvciB0aGUgdHJlYXRtZW50XG5cdFx0Ly8gSWYgbm90LCB1c2UgdGhlIGFzeW5jIGNhbGwgd2l0aCBgY2hlY2tDYWNoZTogdHJ1ZWAuIFRoaXMgd2lsbCBhbGxvdyB0aGUgbW9kdWxlIHRvIHJldHVybiBhIGNhY2hlZCB2YWx1ZSBpZiBpdCBpcyBwcmVzZW50LlxuXHRcdC8vIE90aGVyd2lzZSBpdCB3aWxsIGF3YWl0IHRoZSBpbml0aWFsIGZldGNoIHRvIHJldHVybiB0aGUgbW9zdCB1cCB0byBkYXRlIHZhbHVlLlxuXHRcdGlmICh0aGlzLm5ldHdvcmtJbml0aWFsaXplZCkge1xuXHRcdFx0cmVzdWx0ID0gY2xpZW50LmdldFRyZWF0bWVudFZhcmlhYmxlPFQ+KCd2c2NvZGUnLCBuYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgY2xpZW50LmdldFRyZWF0bWVudFZhcmlhYmxlQXN5bmM8VD4oJ3ZzY29kZScsIG5hbWUsIHRydWUpO1xuXHRcdH1cblxuXHRcdHJlc3VsdCA9IGNsaWVudC5nZXRUcmVhdG1lbnRWYXJpYWJsZTxUPigndnNjb2RlJywgbmFtZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgbmV3IFRBUyBhc3NpZ25tZW50cyBBUEkgVVJMIGZyb20gdGhlIGFjY291bnQgZW50aXRsZW1lbnRzIGBleHBgIGVuZHBvaW50LFxuXHQgKiBvciBgdW5kZWZpbmVkYCB3aGVuIG5vIGFjY291bnQvZW5kcG9pbnQgaXMgYXZhaWxhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRBc3NpZ25tZW50c0VuZHBvaW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWNjb3VudCA9IHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmN1cnJlbnREZWZhdWx0QWNjb3VudDtcblx0XHRjb25zdCBlbmRwb2ludHMgPSBhY2NvdW50Py5lbnRpdGxlbWVudHNEYXRhPy5lbmRwb2ludHM7XG5cdFx0Y29uc3QgZXhwID0gZW5kcG9pbnRzPy5leHA7XG5cdFx0aWYgKCFleHApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtleHAucmVwbGFjZSgvXFwvKyQvLCAnJyl9L2FwaS92MS9hc3NpZ25tZW50c2A7XG5cdH1cblxuXHQvKiogUmVjcmVhdGVzIHRoZSBUQVMgY2xpZW50IHdoZW4gdGhlIHJlc29sdmVkIGFzc2lnbm1lbnRzIGVuZHBvaW50IGhhcyBjaGFuZ2VkLiAqL1xuXHRwcml2YXRlIHJlY3JlYXRlVGFzQ2xpZW50SWZFbmRwb2ludENoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjsgLy8gdGhlIHNlcnZpY2Ugd2FzIGRpc3Bvc2VkIGJlZm9yZSB0aGUgKGFzeW5jKSBhY2NvdW50IGxvYWQgcmVzb2x2ZWRcblx0XHR9XG5cdFx0Y29uc3QgbmV4dCA9IHRoaXMuZ2V0QXNzaWdubWVudHNFbmRwb2ludCgpO1xuXHRcdGlmIChuZXh0ICE9PSB0aGlzLmFzc2lnbm1lbnRzRW5kcG9pbnQpIHtcblx0XHRcdHRoaXMudGFzQ2xpZW50ID0gdGhpcy5zZXR1cFRBU0NsaWVudCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc3BvcnQgZm9yIHRoZSBuZXcgYXNzaWdubWVudHMgZW5kcG9pbnQsIGJhY2tlZCBieSB0aGUgbWFpbi1wcm9jZXNzIHJlcXVlc3Qgc2VydmljZVxuXHQgKiAoYXZvaWRzIHJlbmRlcmVyIENPUlMpLiBTaGFwZSBtYXRjaGVzIHRhcy1jbGllbnQncyBpbmplY3RhYmxlIGBhc3NpZ25tZW50c0ZldGNoYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgYXNzaWdubWVudHNGZXRjaCA9IGFzeW5jICh1cmw6IHN0cmluZywgaW5pdDogeyBtZXRob2Q6ICdQT1NUJzsgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYm9keTogc3RyaW5nIH0pOiBQcm9taXNlPHsgc3RhdHVzOiBudW1iZXI7IGpzb24oKTogUHJvbWlzZTx1bmtub3duPiB9PiA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR0eXBlOiBpbml0Lm1ldGhvZCxcblx0XHRcdHVybCxcblx0XHRcdGRhdGE6IGluaXQuYm9keSxcblx0XHRcdGhlYWRlcnM6IGluaXQuaGVhZGVycyxcblx0XHRcdGRpc2FibGVDYWNoZTogdHJ1ZSxcblx0XHRcdGNhbGxTaXRlOiAnYXNzaWdubWVudFNlcnZpY2UuYXNzaWdubWVudHMnLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGF0dXM6IGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPz8gMCxcblx0XHRcdGpzb246IGFzeW5jICgpID0+IChhd2FpdCBhc0pzb24oY29udGV4dCkpID8/IHt9LFxuXHRcdH07XG5cdH07XG5cblx0cHJpdmF0ZSBhc3luYyBzZXR1cFRBU0NsaWVudCgpOiBQcm9taXNlPFRBU0NsaWVudD4ge1xuXHRcdHRoaXMudGFzU2V0dXBEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gRWFjaCBzZXR1cCBzdXBlcnNlZGVzIHRoZSBwcmV2aW91cyBjbGllbnQ7IHRyYWNrIGEgZ2VuZXJhdGlvbiBzbyBhIHN0YWxlIGNsaWVudCdzXG5cdFx0Ly8gaW5pdGlhbEZldGNoIGNhbm5vdCBmbGlwIG5ldHdvcmtJbml0aWFsaXplZCBmb3IgYSBuZXdlciBjbGllbnQuXG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrdGhpcy5zZXR1cEdlbmVyYXRpb247XG5cdFx0dGhpcy5uZXR3b3JrSW5pdGlhbGl6ZWQgPSBmYWxzZTtcblxuXHRcdC8vIFJldm9rZSB0aGUgcHJldmlvdXMgc2V0dXAncyB3cmFwcGVycywgdGhlbiBkaXNwb3NlIGl0cyBjbGllbnQuIFJldm9raW5nIG5ldXRyYWxpemVzIGFcblx0XHQvLyBzdXBlcnNlZGVkLCBzdGlsbC1pbi1mbGlnaHQgY2xpZW50OiBhZnRlciByZXBsYWNlbWVudCBpdCBjYW4gbm8gbG9uZ2VyIHdyaXRlIHRoZSBzaGFyZWRcblx0XHQvLyBtZW1lbnRvLCBlbWl0IHRlbGVtZXRyeSwgb3IgaGl0IHRoZSBhc3NpZ25tZW50cyBlbmRwb2ludC4gVGhpcyBpcyBuZWVkZWQgYmVjYXVzZSB0aGVcblx0XHQvLyB0YXMtY2xpZW50J3MgZGlzcG9zZSgpIG9ubHkgc3RvcHMgaXRzIHBvbGxpbmcgdGltZXIsIG5vdCBhbiBhbHJlYWR5LXJ1bm5pbmcgZmV0Y2guXG5cdFx0dGhpcy5yZXZva2VDdXJyZW50U2V0dXA/LigpO1xuXHRcdFdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLmRpc3Bvc2VUYXNDbGllbnQodGhpcy50YXNDbGllbnQpO1xuXG5cdFx0bGV0IHJldm9rZWQgPSBmYWxzZTtcblx0XHR0aGlzLnJldm9rZUN1cnJlbnRTZXR1cCA9ICgpID0+IHsgcmV2b2tlZCA9IHRydWU7IH07XG5cblx0XHQvLyBSZWZlcmVuY2UgdGhlIHNoYXJlZCBtZW1lbnRvL3RlbGVtZXRyeS9mZXRjaCBsYXppbHkgKGF0IGNhbGwgdGltZSk6IHRoZXkgYXJlIGFzc2lnbmVkIGluXG5cdFx0Ly8gdGhlIGNvbnN0cnVjdG9yIGJvZHkgYWZ0ZXIgdGhlIGluaXRpYWwgc2V0dXBUQVNDbGllbnQoKSBjYWxsIGhhcyBhbHJlYWR5IHN0YXJ0ZWQuXG5cdFx0Y29uc3Qgc2VydmljZSA9IHRoaXM7XG5cblx0XHRjb25zdCBrZXlWYWx1ZVN0b3JhZ2U6IElLZXlWYWx1ZVN0b3JhZ2UgPSB7XG5cdFx0XHRnZXRWYWx1ZTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogVCk6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRyZXR1cm4gc2VydmljZS5rZXlWYWx1ZVN0b3JhZ2UuZ2V0VmFsdWU8VD4oa2V5LCBkZWZhdWx0VmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdHNldFZhbHVlPFQ+KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IHZvaWQge1xuXHRcdFx0XHRpZiAoIXJldm9rZWQpIHtcblx0XHRcdFx0XHRzZXJ2aWNlLmtleVZhbHVlU3RvcmFnZS5zZXRWYWx1ZTxUPihrZXksIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGVsZW1ldHJ5OiBJRXhwZXJpbWVudGF0aW9uVGVsZW1ldHJ5ID0ge1xuXHRcdFx0c2V0U2hhcmVkUHJvcGVydHkobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdGlmICghcmV2b2tlZCkge1xuXHRcdFx0XHRcdHNlcnZpY2UudGVsZW1ldHJ5LnNldFNoYXJlZFByb3BlcnR5KG5hbWUsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHBvc3RFdmVudChldmVudE5hbWU6IHN0cmluZywgcHJvcHM6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiB2b2lkIHtcblx0XHRcdFx0aWYgKCFyZXZva2VkKSB7XG5cdFx0XHRcdFx0c2VydmljZS50ZWxlbWV0cnkucG9zdEV2ZW50KGV2ZW50TmFtZSwgcHJvcHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCB0YXJnZXRQb3B1bGF0aW9uID0gdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJyA/XG5cdFx0XHRUYXJnZXRQb3B1bGF0aW9uLlB1YmxpYyA6ICh0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdleHBsb3JhdGlvbicgP1xuXHRcdFx0XHRUYXJnZXRQb3B1bGF0aW9uLkV4cGxvcmF0aW9uIDogVGFyZ2V0UG9wdWxhdGlvbi5JbnNpZGVycyk7XG5cblx0XHRjb25zdCBmaWx0ZXJQcm92aWRlciA9IG5ldyBBc3NpZ25tZW50RmlsdGVyUHJvdmlkZXIoXG5cdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLFxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLm1hY2hpbmVJZCxcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5kZXZEZXZpY2VJZCxcblx0XHRcdHRhcmdldFBvcHVsYXRpb24sXG5cdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUgPz8gJycsXG5cdFx0XHR0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ID8gV2luZG93S2luZC5BZ2VudHMgOiBXaW5kb3dLaW5kLkVkaXRvclxuXHRcdCk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zRmlsdGVyUHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvcGlsb3RBc3NpZ25tZW50RmlsdGVyUHJvdmlkZXIpO1xuXHRcdHRoaXMudGFzU2V0dXBEaXNwb3NhYmxlcy5hZGQoZXh0ZW5zaW9uc0ZpbHRlclByb3ZpZGVyKTtcblx0XHR0aGlzLnRhc1NldHVwRGlzcG9zYWJsZXMuYWRkKGV4dGVuc2lvbnNGaWx0ZXJQcm92aWRlci5vbkRpZENoYW5nZUZpbHRlcnMoKCkgPT4gdGhpcy5yZWZldGNoQXNzaWdubWVudHMoKSkpO1xuXG5cdFx0Ly8gTmV3IFRBUyBhc3NpZ25tZW50cyBBUEkuIEl0cyBlbmRwb2ludCBpcyBzb3VyY2VkIGZyb20gYWNjb3VudCBlbnRpdGxlbWVudHMgYW5kIGl0XG5cdFx0Ly8gdXNlcyBkZWRpY2F0ZWQgcHJvdmlkZXJzIHRoYXQgZW1pdCB0aGUgbmV3IHVzZXJQYXJhbSBrZXkgbmFtZXMsIHNvIHRoZSBsZWdhY3kgZmlsdGVyXG5cdFx0Ly8ga2V5cyBuZXZlciByZWFjaCBpdC4gSXRzIGFzc2lnbm1lbnRzIGFyZSBtZXJnZWQgd2l0aCB0aGUgbGVnYWN5IHByb3ZpZGVyJ3MgcmVzdWx0cy5cblx0XHRjb25zdCBhc3NpZ25tZW50c0VuZHBvaW50ID0gdGhpcy5nZXRBc3NpZ25tZW50c0VuZHBvaW50KCk7XG5cdFx0dGhpcy5hc3NpZ25tZW50c0VuZHBvaW50ID0gYXNzaWdubWVudHNFbmRwb2ludDtcblx0XHRsZXQgYXNzaWdubWVudHNGaWx0ZXJQcm92aWRlcnM6IElFeHBlcmltZW50YXRpb25GaWx0ZXJQcm92aWRlcltdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhc3NpZ25tZW50c0VuZHBvaW50KSB7XG5cdFx0XHRjb25zdCBjb3JlQXNzaWdubWVudHNGaWx0ZXJQcm92aWRlciA9IG5ldyBWU0NvZGVDb3JlQXNzaWdubWVudHNGaWx0ZXJQcm92aWRlcihcblx0XHRcdFx0dGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLFxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UuZGV2RGV2aWNlSWQsXG5cdFx0XHRcdHRhcmdldFBvcHVsYXRpb24sXG5cdFx0XHRcdHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSA/PyAnJyxcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyA/IFdpbmRvd0tpbmQuQWdlbnRzIDogV2luZG93S2luZC5FZGl0b3Jcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBnaXRodWJBc3NpZ25tZW50c0ZpbHRlclByb3ZpZGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHaXRIdWJDb3JlQXNzaWdubWVudHNGaWx0ZXJQcm92aWRlcik7XG5cdFx0XHR0aGlzLnRhc1NldHVwRGlzcG9zYWJsZXMuYWRkKGdpdGh1YkFzc2lnbm1lbnRzRmlsdGVyUHJvdmlkZXIpO1xuXHRcdFx0dGhpcy50YXNTZXR1cERpc3Bvc2FibGVzLmFkZChnaXRodWJBc3NpZ25tZW50c0ZpbHRlclByb3ZpZGVyLm9uRGlkQ2hhbmdlRmlsdGVycygoKSA9PiB0aGlzLnJlZmV0Y2hBc3NpZ25tZW50cygpKSk7XG5cdFx0XHRhc3NpZ25tZW50c0ZpbHRlclByb3ZpZGVycyA9IFtjb3JlQXNzaWdubWVudHNGaWx0ZXJQcm92aWRlciwgZ2l0aHViQXNzaWdubWVudHNGaWx0ZXJQcm92aWRlcl07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFzQ29uZmlnID0gdGhpcy5wcm9kdWN0U2VydmljZS50YXNDb25maWchO1xuXG5cdFx0Ly8gdGFzLWNsaWVudCBzaGlwcyBhcyBwdXJlIEVTTTsgbG9hZCBpdCB2aWEgYSBydW50aW1lLXJlc29sdmVkIFVSTCBzbyBidW5kbGVycyBkbyBub3Rcblx0XHQvLyByZXdyaXRlIHRoZSBpbXBvcnQgKG1pcnJvcnMgaG93IHRoZSBlZGl0b3IgbG9hZHMgdGhlIGBAdnNjb2RlL2RpZmZgIG1vZHVsZSkuXG5cdFx0Y29uc3QgdGFzQ2xpZW50VXJsID0gcmVzb2x2ZUFtZE5vZGVNb2R1bGVQYXRoKCd0YXMtY2xpZW50JywgJ2Rpc3QvdGFzLWNsaWVudC5taW4uanMnKTtcblx0XHRjb25zdCB0YXNDbGllbnRNb2R1bGUgPSBhd2FpdCBpbXBvcnQoLyogd2VicGFja0lnbm9yZTogdHJ1ZSAqLyAvKiBAdml0ZS1pZ25vcmUgKi8gYCR7dGFzQ2xpZW50VXJsfWApIGFzIHR5cGVvZiBpbXBvcnQoJ3Rhcy1jbGllbnQnKTtcblxuXHRcdC8vIE1lYXN1cmUgdGhlIGNsaWVudC1zaWRlIGxhdGVuY3kgb2YgdGhlIGZpcnN0IG5ldHdvcmsgY2FsbCB0byB0aGVcblx0XHQvLyBUcmVhdG1lbnQgQXNzaWdubWVudCBTZXJ2aWNlLiBUaGUgZmV0Y2ggaXMgdHJpZ2dlcmVkIGJ5IGNvbnN0cnVjdGluZ1xuXHRcdC8vIHRoZSBjbGllbnQsIHNvIHN0YXJ0IHRpbWluZyByaWdodCBiZWZvcmUgY29uc3RydWN0aW9uIHRvIGV4Y2x1ZGVcblx0XHQvLyBtb2R1bGUgbG9hZGluZyB0aW1lIGZyb20gdGhlIG1lYXN1cmVtZW50LlxuXHRcdGNvbnN0IGZldGNoU3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRcdGNvbnN0IHRhc0NsaWVudCA9IG5ldyB0YXNDbGllbnRNb2R1bGUuRXhwZXJpbWVudGF0aW9uU2VydmljZSh7XG5cdFx0XHRmaWx0ZXJQcm92aWRlcnM6IFtmaWx0ZXJQcm92aWRlciwgZXh0ZW5zaW9uc0ZpbHRlclByb3ZpZGVyXSxcblx0XHRcdHRlbGVtZXRyeSxcblx0XHRcdHN0b3JhZ2VLZXk6IEFTU0lHTk1FTlRfU1RPUkFHRV9LRVksXG5cdFx0XHRrZXlWYWx1ZVN0b3JhZ2UsXG5cdFx0XHRhc3NpZ25tZW50Q29udGV4dFRlbGVtZXRyeVByb3BlcnR5TmFtZTogdGFzQ29uZmlnLmFzc2lnbm1lbnRDb250ZXh0VGVsZW1ldHJ5UHJvcGVydHlOYW1lLFxuXHRcdFx0dGVsZW1ldHJ5RXZlbnROYW1lOiB0YXNDb25maWcudGVsZW1ldHJ5RXZlbnROYW1lLFxuXHRcdFx0ZW5kcG9pbnQ6IHRhc0NvbmZpZy5lbmRwb2ludCxcblx0XHRcdGV4dGVuc2lvbk5hbWU6ICd2c2NvZGUtY29yZScsXG5cdFx0XHRhc3NpZ25tZW50c0VuZHBvaW50LFxuXHRcdFx0YXNzaWdubWVudHNGaWx0ZXJQcm92aWRlcnMsXG5cdFx0XHQvLyBSb3V0ZSB0aGUgYXNzaWdubWVudHMgcmVxdWVzdCB0aHJvdWdoIHRoZSBtYWluLXByb2Nlc3MgcmVxdWVzdCBzZXJ2aWNlIHNvIGl0IGlzXG5cdFx0XHQvLyBub3Qgc3ViamVjdCB0byByZW5kZXJlciBDT1JTIChwYXJpdHkgd2l0aCBob3cgY29yZSByZWFjaGVzIGFwaS5naXRodWIuY29tKS5cblx0XHRcdGFzc2lnbm1lbnRzRmV0Y2g6IGFzc2lnbm1lbnRzRW5kcG9pbnRcblx0XHRcdFx0PyAodXJsLCBpbml0KSA9PiAocmV2b2tlZCA/IFByb21pc2UucmVzb2x2ZSh7IHN0YXR1czogMCwganNvbjogYXN5bmMgKCkgPT4gKHt9KSB9KSA6IHNlcnZpY2UuYXNzaWdubWVudHNGZXRjaCh1cmwsIGluaXQpKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlZmV0Y2hJbnRlcnZhbDogQVNTSUdOTUVOVF9SRUZFVENIX0lOVEVSVkFMLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGFzQ2xpZW50LmluaXRpYWxpemVQcm9taXNlO1xuXHRcdHRhc0NsaWVudC5pbml0aWFsRmV0Y2gudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5zZXR1cEdlbmVyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBzdXBlcnNlZGVkIGJ5IGEgbmV3ZXIgc2V0dXBcblx0XHRcdH1cblx0XHRcdHRoaXMubmV0d29ya0luaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdHRoaXMubG9nRmV0Y2hMYXRlbmN5KCdpbml0aWFsJywgZmV0Y2hTdG9wV2F0Y2guZWxhcHNlZCgpKTtcblx0XHR9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXG5cdFx0cmV0dXJuIHRhc0NsaWVudDtcblx0fVxuXG5cdHByaXZhdGUgbG9nRmV0Y2hMYXRlbmN5KGZldGNoVHlwZTogJ2luaXRpYWwnIHwgJ3JlZmV0Y2gnLCBkdXJhdGlvbk1zOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0eXBlIFRBU0NsaWVudEZldGNoTGF0ZW5jeURhdGEgPSB7XG5cdFx0XHRmZXRjaFR5cGU6IHN0cmluZztcblx0XHRcdGR1cmF0aW9uTXM6IG51bWJlcjtcblx0XHR9O1xuXG5cdFx0dHlwZSBUQVNDbGllbnRGZXRjaExhdGVuY3lDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2JhdHRlbic7XG5cdFx0XHRjb21tZW50OiAnTWVhc3VyZXMgdGhlIGNsaWVudC1zaWRlIGxhdGVuY3kgb2YgZmV0Y2hpbmcgdHJlYXRtZW50IGFzc2lnbm1lbnRzIGZyb20gdGhlIGV4cGVyaW1lbnQgc2VydmljZSAoVEFTKSc7XG5cdFx0XHRmZXRjaFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoaXMgd2FzIHRoZSBpbml0aWFsIGZldGNoIG9yIGEgcmVmZXRjaCcgfTtcblx0XHRcdGR1cmF0aW9uTXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaW1lIGluIG1pbGxpc2Vjb25kcyB0aGUgZmV0Y2ggdG9vayB0byBjb21wbGV0ZScgfTtcblx0XHR9O1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VEFTQ2xpZW50RmV0Y2hMYXRlbmN5RGF0YSwgVEFTQ2xpZW50RmV0Y2hMYXRlbmN5Q2xhc3NpZmljYXRpb24+KCd0YXNDbGllbnRGZXRjaExhdGVuY3knLCB7XG5cdFx0XHRmZXRjaFR5cGUsXG5cdFx0XHRkdXJhdGlvbk1zXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZmV0Y2hBc3NpZ25tZW50cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudGFzQ2xpZW50KSB7XG5cdFx0XHRyZXR1cm47IC8vIFNldHVwIGhhcyBub3Qgc3RhcnRlZCwgYXNzaWdubWVudHMgd2lsbCB1c2UgbGF0ZXN0IGZpbHRlcnNcblx0XHR9XG5cblx0XHQvLyBBd2FpdCB0aGUgY2xpZW50IHRvIGJlIHNldHVwIGFuZCB0aGUgaW5pdGlhbCBmZXRjaCB0byBjb21wbGV0ZVxuXHRcdGNvbnN0IHRhc0NsaWVudCA9IGF3YWl0IHRoaXMudGFzQ2xpZW50O1xuXHRcdGF3YWl0IHRhc0NsaWVudC5pbml0aWFsRmV0Y2g7XG5cblx0XHQvLyBSZWZyZXNoIHRoZSBhc3NpZ25tZW50cyBhbmQgbWVhc3VyZSB0aGUgbmV0d29yayBsYXRlbmN5IG9mIHRoZSByZWZldGNoLlxuXHRcdGNvbnN0IHJlZmV0Y2hTdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0YXdhaXQgdGFzQ2xpZW50LmdldFRyZWF0bWVudFZhcmlhYmxlQXN5bmMoJ3ZzY29kZScsICdyZWZyZXNoJywgZmFsc2UpO1xuXHRcdHRoaXMubG9nRmV0Y2hMYXRlbmN5KCdyZWZldGNoJywgcmVmZXRjaFN0b3BXYXRjaC5lbGFwc2VkKCkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q3VycmVudEV4cGVyaW1lbnRzKCk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMudGFzQ2xpZW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5leHBlcmltZW50c0VuYWJsZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy50YXNDbGllbnQ7XG5cblx0XHRyZXR1cm4gdGhpcy50ZWxlbWV0cnkuYXNzaWdubWVudENvbnRleHQ7XG5cdH1cblxuXHRhZGRUZWxlbWV0cnlBc3NpZ25tZW50RmlsdGVyKGZpbHRlcjogSUFzc2lnbm1lbnRGaWx0ZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRleHRGaWx0ZXIuYWRkRmlsdGVyKGZpbHRlcik7XG5cdH1cblxuXHQvKiogU3RvcHMgYSBUQVMgY2xpZW50J3MgYXV0by1wb2xsaW5nIG9uY2UgaXQgcmVzb2x2ZXMuIFNhZmUgdG8gY2FsbCB3aXRoIGB1bmRlZmluZWRgLiAqL1xuXHRwcml2YXRlIHN0YXRpYyBkaXNwb3NlVGFzQ2xpZW50KGNsaWVudDogUHJvbWlzZTxUQVNDbGllbnQ+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y2xpZW50Py50aGVuKGMgPT4gYy5kaXNwb3NlKCkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLCBXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbmNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5yZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQuLi53b3JrYmVuY2hDb25maWd1cmF0aW9uTm9kZUJhc2UsXG5cdCdwcm9wZXJ0aWVzJzoge1xuXHRcdCd3b3JrYmVuY2guZW5hYmxlRXhwZXJpbWVudHMnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCd3b3JrYmVuY2guZW5hYmxlRXhwZXJpbWVudHMnLCBcIkZldGNoZXMgZXhwZXJpbWVudHMgdG8gcnVuIGZyb20gYSBNaWNyb3NvZnQgb25saW5lIHNlcnZpY2UuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0J3Jlc3RyaWN0ZWQnOiB0cnVlLFxuXHRcdFx0J3RhZ3MnOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsNkJBQTZCO0FBRXZELFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUU3RCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7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
