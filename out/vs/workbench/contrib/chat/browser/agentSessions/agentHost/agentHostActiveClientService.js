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
import { DeferredPromise, Delayer } from "../../../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { hash } from "../../../../../../base/common/hash.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { equals } from "../../../../../../base/common/objects.js";
import { autorun, derived, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { AgentHostCopilotMultiRootEnabledSettingId } from "../../../../../../platform/agentHost/common/agentService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IAgentPluginService } from "../../../common/plugins/agentPluginService.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { ILanguageModelToolsService } from "../../../common/tools/languageModelToolsService.js";
import { IMcpService } from "../../../../mcp/common/mcpTypes.js";
import { IConfigurationResolverService } from "../../../../../services/configurationResolver/common/configurationResolver.js";
import { AgentCustomizationSyncProvider } from "./agentCustomizationSyncProvider.js";
import { resolveCustomizationRefs, resolveLocalCustomAgents, shouldSyncWorkspaceDotMcp } from "./agentHostLocalCustomizations.js";
import { toolDataToDefinition } from "./agentHostToolUtils.js";
import { IAgentHostToolSetEnablementService, isToolEnabledInSet } from "./agentHostToolSetEnablementService.js";
import { SyncedCustomizationBundler } from "./syncedCustomizationBundler.js";
const IAgentHostActiveClientService = createDecorator("agentHostActiveClientService");
class AgentRegistration extends Disposable {
  constructor(_sessionType, _options, _instantiationService, storageService, _getClientTools, _onDispose) {
    super();
    this._sessionType = _sessionType;
    this._options = _options;
    this._instantiationService = _instantiationService;
    this._getClientTools = _getClientTools;
    this._onDispose = _onDispose;
    this._scopes = /* @__PURE__ */ new Map();
    this._isDisposed = false;
    this.syncProvider = this._register(new AgentCustomizationSyncProvider(_sessionType, storageService));
  }
  acquireScope(roots) {
    const normalizedRoots = normalizeRoots(roots);
    const scopeKey = getScopeKey(normalizedRoots);
    let scope = this._scopes.get(scopeKey);
    if (!scope) {
      const createdScope = this._instantiationService.createInstance(
        AgentCustomizationScope,
        this._sessionType,
        normalizedRoots,
        this.syncProvider,
        this._options,
        this._getClientTools,
        () => this._removeScope(scopeKey, createdScope)
      );
      scope = createdScope;
      this._scopes.set(scopeKey, scope);
    }
    return scope.acquire();
  }
  getOrigin(syncedUri) {
    for (const scope of this._scopes.values()) {
      const origin = scope.getOrigin(syncedUri);
      if (origin) {
        return origin;
      }
    }
    return void 0;
  }
  isBundledMcpServer(pluginUri, serverName) {
    return [...this._scopes.values()].some((scope) => scope.isBundledMcpServer(pluginUri, serverName));
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    const scopes = [...this._scopes.values()];
    this._scopes.clear();
    for (const scope of scopes) {
      scope.dispose();
    }
    super.dispose();
    this._onDispose();
  }
  _removeScope(scopeKey, scope) {
    if (this._scopes.get(scopeKey) === scope) {
      this._scopes.delete(scopeKey);
    }
  }
}
let AgentCustomizationScope = class extends Disposable {
  constructor(_sessionType, _roots, _syncProvider, _options, _getClientTools, _onDispose, _fileService, _promptsService, _agentPluginService, instantiationService, _mcpService, _configurationResolverService, _configurationService) {
    super();
    this._sessionType = _sessionType;
    this._roots = _roots;
    this._syncProvider = _syncProvider;
    this._options = _options;
    this._getClientTools = _getClientTools;
    this._onDispose = _onDispose;
    this._fileService = _fileService;
    this._promptsService = _promptsService;
    this._agentPluginService = _agentPluginService;
    this._mcpService = _mcpService;
    this._configurationResolverService = _configurationResolverService;
    this._configurationService = _configurationService;
    this._customizations = observableValue("agentCustomizations", []);
    this._customAgents = observableValue("agentCustomAgents", []);
    this._isResolved = observableValue("agentCustomizationsResolved", false);
    this._initialResolution = new DeferredPromise();
    this._activeClients = /* @__PURE__ */ new Map();
    this._refCount = 0;
    this._updateSeq = 0;
    this._isDisposed = false;
    this._bundler = this._register(instantiationService.createInstance(SyncedCustomizationBundler, createScopeAuthority(_sessionType, _roots)));
    this._updateDelayer = this._register(new Delayer(CUSTOMIZATION_UPDATE_DEBOUNCE_DELAY));
    const updateCustomizations = async () => {
      const seq = ++this._updateSeq;
      let completedInitialResolution = false;
      try {
        const [refs, agents] = await Promise.all([
          resolveCustomizationRefs(
            this._fileService,
            this._promptsService,
            this._syncProvider,
            this._agentPluginService,
            this._mcpService,
            this._configurationResolverService,
            this._bundler,
            this._sessionType,
            shouldSyncWorkspaceDotMcp(this._sessionType, this._roots, this._configurationService.getValue(AgentHostCopilotMultiRootEnabledSettingId) === true),
            this._options
          ),
          resolveLocalCustomAgents(this._fileService, this._promptsService, this._syncProvider, this._agentPluginService, this._sessionType, this._options)
        ]);
        if (seq !== this._updateSeq) {
          return;
        }
        transaction((tx) => {
          if (!equals(this._customizations.get(), refs)) {
            this._customizations.set(refs, tx);
          }
          if (!equals(this._customAgents.get(), agents)) {
            this._customAgents.set(agents, tx);
          }
          this._isResolved.set(true, tx);
        });
        completedInitialResolution = true;
      } catch (err) {
        onUnexpectedError(err);
        if (seq === this._updateSeq) {
          transaction((tx) => this._isResolved.set(true, tx));
          completedInitialResolution = true;
        }
      } finally {
        if (completedInitialResolution && !this._initialResolution.isSettled) {
          this._initialResolution.complete();
        }
      }
    };
    const scheduleUpdate = () => {
      this._updateDelayer.trigger(() => updateCustomizations()).catch(() => {
      });
    };
    this._register(this._syncProvider.onDidChange(() => scheduleUpdate()));
    this._register(Event.any(
      this._promptsService.onDidChangeCustomAgents,
      this._promptsService.onDidChangeSlashCommands,
      this._promptsService.onDidChangeSkills,
      this._promptsService.onDidChangeInstructions
    )(() => scheduleUpdate()));
    this._register(autorun((reader) => {
      for (const plugin of this._agentPluginService.plugins.read(reader)) {
        plugin.enablement.read(reader);
        plugin.hooks.read(reader);
        plugin.commands.read(reader);
        plugin.skills.read(reader);
        plugin.agents.read(reader);
        plugin.instructions.read(reader);
        plugin.mcpServerDefinitions.read(reader);
      }
      scheduleUpdate();
    }));
    this._register(autorun((reader) => {
      for (const server of this._mcpService.servers.read(reader)) {
        server.enablement.read(reader);
        server.readDefinitions().read(reader);
      }
      scheduleUpdate();
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AgentHostCopilotMultiRootEnabledSettingId)) {
        scheduleUpdate();
      }
    }));
  }
  get customizations() {
    return this._customizations;
  }
  get customAgents() {
    return this._customAgents;
  }
  get tools() {
    return this._getClientTools(this._sessionType);
  }
  get isResolved() {
    return this._isResolved;
  }
  acquire() {
    this._refCount++;
    let released = false;
    return {
      customizations: this.customizations,
      customAgents: this.customAgents,
      tools: this.tools,
      isResolved: this.isResolved,
      whenResolved: () => this._initialResolution.p,
      activeClient: (clientId) => this.activeClient(clientId),
      dispose: () => {
        if (!released) {
          released = true;
          this._release();
        }
      }
    };
  }
  getOrigin(syncedUri) {
    return this._bundler.getOrigin(syncedUri);
  }
  isBundledMcpServer(pluginUri, serverName) {
    return this._bundler.isBundledMcpServer(pluginUri, serverName);
  }
  activeClient(clientId) {
    let activeClient = this._activeClients.get(clientId);
    if (!activeClient) {
      activeClient = derived((reader) => {
        this._customAgents.read(reader);
        return {
          clientId,
          tools: [...this.tools.read(reader)],
          customizations: [...this._customizations.read(reader)]
        };
      });
      this._activeClients.set(clientId, activeClient);
    }
    return activeClient;
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._updateSeq++;
    if (!this._initialResolution.isSettled) {
      this._initialResolution.complete();
    }
    super.dispose();
    this._onDispose();
  }
  _release() {
    if (--this._refCount === 0) {
      this.dispose();
    }
  }
};
AgentCustomizationScope = __decorateClass([
  __decorateParam(6, IFileService),
  __decorateParam(7, IPromptsService),
  __decorateParam(8, IAgentPluginService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IMcpService),
  __decorateParam(11, IConfigurationResolverService),
  __decorateParam(12, IConfigurationService)
], AgentCustomizationScope);
let AgentHostActiveClientService = class extends Disposable {
  constructor(_toolsService, _storageService, _instantiationService, _toolSetEnablementService) {
    super();
    this._toolsService = _toolsService;
    this._storageService = _storageService;
    this._instantiationService = _instantiationService;
    this._toolSetEnablementService = _toolSetEnablementService;
    this._clientToolsByType = /* @__PURE__ */ new Map();
    this._registrationsByType = /* @__PURE__ */ new Map();
    this._isDisposed = false;
    this._allToolsObs = this._toolsService.observeTools(void 0);
    this._allToolSetsObs = this._toolsService.toolSets;
  }
  registerForAgent(sessionType, options) {
    const registration = new AgentRegistration(
      sessionType,
      options,
      this._instantiationService,
      this._storageService,
      (type) => this._getClientTools(type),
      () => {
        if (this._registrationsByType.get(sessionType) === registration) {
          this._registrationsByType.delete(sessionType);
        }
      }
    );
    this._registrationsByType.set(sessionType, registration);
    return registration;
  }
  acquireScope(sessionType, roots) {
    return this._registrationsByType.get(sessionType)?.acquireScope(roots);
  }
  isBundledMcpServer(pluginUri, serverName) {
    return [...this._registrationsByType.values()].some((registration) => registration.isBundledMcpServer(pluginUri, serverName));
  }
  _getClientTools(sessionType) {
    let obs = this._clientToolsByType.get(sessionType);
    if (!obs) {
      obs = derived((reader) => {
        const tools = this._allToolsObs.read(reader);
        const toolSets = this._allToolSetsObs.read(reader);
        const enablement = this._toolSetEnablementService.observe(sessionType).read(reader);
        const enabledToolIds = /* @__PURE__ */ new Set();
        for (const ts of toolSets) {
          if (ts.deprecated) {
            continue;
          }
          for (const tool of ts.getTools(reader)) {
            if (isToolEnabledInSet(enablement, ts.id, tool.id)) {
              enabledToolIds.add(tool.id);
            }
          }
        }
        return tools.filter((t) => enabledToolIds.has(t.id)).map(toolDataToDefinition);
      });
      this._clientToolsByType.set(sessionType, obs);
    }
    return obs;
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    const registrations = [...this._registrationsByType.values()];
    this._registrationsByType.clear();
    for (const registration of registrations) {
      registration.dispose();
    }
    super.dispose();
  }
};
AgentHostActiveClientService = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IAgentHostToolSetEnablementService)
], AgentHostActiveClientService);
function normalizeRoots(roots) {
  const rootsByUri = new ResourceMap((root) => extUriBiasedIgnorePathCase.getComparisonKey(root));
  for (const root of roots) {
    rootsByUri.set(root, root);
  }
  return [...rootsByUri.values()].sort((a, b) => {
    const left = extUriBiasedIgnorePathCase.getComparisonKey(a);
    const right = extUriBiasedIgnorePathCase.getComparisonKey(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
function areCustomizationScopeRootsEqual(first, second) {
  const toComparisonKey = (root) => extUriBiasedIgnorePathCase.getComparisonKey(root);
  const firstRoots = new ResourceSet(first ?? [], toComparisonKey);
  const secondRoots = new ResourceSet(second, toComparisonKey);
  return firstRoots.size === secondRoots.size && [...firstRoots].every((root) => secondRoots.has(root));
}
function getScopeKey(roots) {
  return roots.map((root) => extUriBiasedIgnorePathCase.getComparisonKey(root)).join("\n");
}
function createScopeAuthority(sessionType, roots) {
  return `${sessionType}-${hash(getScopeKey(roots))}`;
}
const CUSTOMIZATION_UPDATE_DEBOUNCE_DELAY = 50;
registerSingleton(IAgentHostActiveClientService, AgentHostActiveClientService, InstantiationType.Delayed);
export {
  AgentHostActiveClientService,
  IAgentHostActiveClientService,
  areCustomizationScopeRootsEqual
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRDdXN0b21pemF0aW9uLCBTZXNzaW9uQWN0aXZlQ2xpZW50LCBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvblN5bmNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgSVRvb2xTZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb25TeW5jUHJvdmlkZXIgfSBmcm9tICcuL2FnZW50Q3VzdG9taXphdGlvblN5bmNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyB0eXBlIElMb2NhbEN1c3RvbWl6YXRpb25TeW5jT3B0aW9ucywgcmVzb2x2ZUN1c3RvbWl6YXRpb25SZWZzLCByZXNvbHZlTG9jYWxDdXN0b21BZ2VudHMsIHNob3VsZFN5bmNXb3Jrc3BhY2VEb3RNY3AgfSBmcm9tICcuL2FnZW50SG9zdExvY2FsQ3VzdG9taXphdGlvbnMuanMnO1xuaW1wb3J0IHsgdG9vbERhdGFUb0RlZmluaXRpb24gfSBmcm9tICcuL2FnZW50SG9zdFRvb2xVdGlscy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlLCBpc1Rvb2xFbmFibGVkSW5TZXQgfSBmcm9tICcuL2FnZW50SG9zdFRvb2xTZXRFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElTeW5jZWRDdXN0b21pemF0aW9uT3JpZ2luLCBTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlciB9IGZyb20gJy4vc3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIuanMnO1xuXG5leHBvcnQgY29uc3QgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2U+KCdhZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlJyk7XG5cbi8qKiBJZGVudGl0eSBhIHB1Ymxpc2hlZCBjdXN0b21pemF0aW9uIHNldCBpcyByZXNvbHZlZCBhZ2FpbnN0LiBSZWZjb3VudGVkOyBkaXNwb3NlZCBieSBlYWNoIGhvbGRlci4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50Q3VzdG9taXphdGlvblNjb3BlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdPjtcblx0cmVhZG9ubHkgY3VzdG9tQWdlbnRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXT47XG5cdC8qKiBUb29scyBhdmFpbGFibGUgdG8gdGhpcyBzY29wZSdzIGFjdGl2ZSBjbGllbnQuICovXG5cdHJlYWRvbmx5IHRvb2xzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBUb29sRGVmaW5pdGlvbltdPjtcblx0LyoqIENvbXBvc2VkIGFjdGl2ZS1jbGllbnQgdmlldyBmb3IgdGhpcyBzY29wZS4gKi9cblx0YWN0aXZlQ2xpZW50KGNsaWVudElkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxTZXNzaW9uQWN0aXZlQ2xpZW50Pjtcblx0LyoqXG5cdCAqIGBmYWxzZWAgdW50aWwgdGhlIGluaXRpYWwgY3VzdG9taXphdGlvbiByZXNvbHV0aW9uIGNvbXBsZXRlcy4gUHVibGlzaGluZyBhblxuXHQgKiB1bnJlc29sdmVkIHNjb3BlIHdvdWxkIHRyYW5zaWVudGx5IHdpcGUgdGhlIGhvc3QncyBjdXN0b21pemF0aW9uIHN0YXRlLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNSZXNvbHZlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdC8qKiBSZXNvbHZlcyBvbmNlIHRoZSBzY29wZSdzIGluaXRpYWwgY3VzdG9taXphdGlvbiByZXNvbHV0aW9uIGhhcyBjb21wbGV0ZWQuICovXG5cdHdoZW5SZXNvbHZlZCgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKiogUmVnaXN0cmF0aW9uLWxldmVsIGN1c3RvbWl6YXRpb24gc3RhdGUgZm9yIGFuIGFnZW50IGhhcm5lc3MuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFJlZ2lzdHJhdGlvbiBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgc3luY1Byb3ZpZGVyOiBJQ3VzdG9taXphdGlvblN5bmNQcm92aWRlcjtcblx0LyoqIEFjcXVpcmVzIChvciBzaGFyZXMpIHRoZSBzY29wZSBmb3IgYHJvb3RzYC4gUmVmY291bnRlZDogdG9ybiBkb3duIHdoZW4gdGhlIGxhc3QgaG9sZGVyIGRpc3Bvc2VzLiAqL1xuXHRhY3F1aXJlU2NvcGUocm9vdHM6IHJlYWRvbmx5IFVSSVtdKTogSUFnZW50Q3VzdG9taXphdGlvblNjb3BlO1xuXHQvKiogUmVjb3ZlcnMgcHJvdmVuYW5jZSBmb3IgYSBzeW5jZWQgVVJJIHByb2R1Y2VkIGJ5IGFueSBzY29wZSBvZiB0aGlzIGFnZW50LiAqL1xuXHRnZXRPcmlnaW4oc3luY2VkVXJpOiBVUkkpOiBJU3luY2VkQ3VzdG9taXphdGlvbk9yaWdpbiB8IHVuZGVmaW5lZDtcblx0aXNCdW5kbGVkTWNwU2VydmVyKHBsdWdpblVyaTogc3RyaW5nLCBzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBJQWdlbnRSZWdpc3RyYXRpb25PcHRpb25zID0gSUxvY2FsQ3VzdG9taXphdGlvblN5bmNPcHRpb25zO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKiBSZWdpc3RlcnMgYW4gYWdlbnQgaGFybmVzcyBhbmQgaXRzIHJlZ2lzdHJhdGlvbi1sZXZlbCBjdXN0b21pemF0aW9uIHN5bmMgcHJvdmlkZXIuICovXG5cdHJlZ2lzdGVyRm9yQWdlbnQoc2Vzc2lvblR5cGU6IHN0cmluZywgb3B0aW9ucz86IElBZ2VudFJlZ2lzdHJhdGlvbk9wdGlvbnMpOiBJQWdlbnRSZWdpc3RyYXRpb247XG5cblx0LyoqIEFjcXVpcmVzIGEgY3VzdG9taXphdGlvbiBzY29wZSBmb3IgYSByZWdpc3RlcmVkIGFnZW50LiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gYHNlc3Npb25UeXBlYCBoYXMgbm8gcmVnaXN0cmF0aW9uLiAqL1xuXHRhY3F1aXJlU2NvcGUoc2Vzc2lvblR5cGU6IHN0cmluZywgcm9vdHM6IHJlYWRvbmx5IFVSSVtdKTogSUFnZW50Q3VzdG9taXphdGlvblNjb3BlIHwgdW5kZWZpbmVkO1xuXHRpc0J1bmRsZWRNY3BTZXJ2ZXIocGx1Z2luVXJpOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IGJvb2xlYW47XG59XG5cbmNsYXNzIEFnZW50UmVnaXN0cmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudFJlZ2lzdHJhdGlvbiB7XG5cblx0cmVhZG9ubHkgc3luY1Byb3ZpZGVyOiBJQ3VzdG9taXphdGlvblN5bmNQcm92aWRlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zY29wZXMgPSBuZXcgTWFwPHN0cmluZywgQWdlbnRDdXN0b21pemF0aW9uU2NvcGU+KCk7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVHlwZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElBZ2VudFJlZ2lzdHJhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldENsaWVudFRvb2xzOiAoc2Vzc2lvblR5cGU6IHN0cmluZykgPT4gSU9ic2VydmFibGU8cmVhZG9ubHkgVG9vbERlZmluaXRpb25bXT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaXNwb3NlOiAoKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc3luY1Byb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50Q3VzdG9taXphdGlvblN5bmNQcm92aWRlcihfc2Vzc2lvblR5cGUsIHN0b3JhZ2VTZXJ2aWNlKSk7XG5cdH1cblxuXHRhY3F1aXJlU2NvcGUocm9vdHM6IHJlYWRvbmx5IFVSSVtdKTogSUFnZW50Q3VzdG9taXphdGlvblNjb3BlIHtcblx0XHRjb25zdCBub3JtYWxpemVkUm9vdHMgPSBub3JtYWxpemVSb290cyhyb290cyk7XG5cdFx0Y29uc3Qgc2NvcGVLZXkgPSBnZXRTY29wZUtleShub3JtYWxpemVkUm9vdHMpO1xuXHRcdGxldCBzY29wZSA9IHRoaXMuX3Njb3Blcy5nZXQoc2NvcGVLZXkpO1xuXHRcdGlmICghc2NvcGUpIHtcblx0XHRcdC8vIFJlZmVyZW5jZWQgYnkgdGhlIHRlYXJkb3duIGNhbGxiYWNrIGJlbG93LCB3aGljaCBvbmx5IHJ1bnMgb25jZSB0aGVcblx0XHRcdC8vIHNjb3BlIGhhcyBiZWVuIGNvbnN0cnVjdGVkLlxuXHRcdFx0Y29uc3QgY3JlYXRlZFNjb3BlOiBBZ2VudEN1c3RvbWl6YXRpb25TY29wZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudEN1c3RvbWl6YXRpb25TY29wZSxcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblR5cGUsXG5cdFx0XHRcdG5vcm1hbGl6ZWRSb290cyxcblx0XHRcdFx0dGhpcy5zeW5jUHJvdmlkZXIsXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMsXG5cdFx0XHRcdHRoaXMuX2dldENsaWVudFRvb2xzLFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9yZW1vdmVTY29wZShzY29wZUtleSwgY3JlYXRlZFNjb3BlKSxcblx0XHRcdCk7XG5cdFx0XHRzY29wZSA9IGNyZWF0ZWRTY29wZTtcblx0XHRcdHRoaXMuX3Njb3Blcy5zZXQoc2NvcGVLZXksIHNjb3BlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNjb3BlLmFjcXVpcmUoKTtcblx0fVxuXG5cdGdldE9yaWdpbihzeW5jZWRVcmk6IFVSSSk6IElTeW5jZWRDdXN0b21pemF0aW9uT3JpZ2luIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHNjb3BlIG9mIHRoaXMuX3Njb3Blcy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3Qgb3JpZ2luID0gc2NvcGUuZ2V0T3JpZ2luKHN5bmNlZFVyaSk7XG5cdFx0XHRpZiAob3JpZ2luKSB7XG5cdFx0XHRcdHJldHVybiBvcmlnaW47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpc0J1bmRsZWRNY3BTZXJ2ZXIocGx1Z2luVXJpOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc2NvcGVzLnZhbHVlcygpXS5zb21lKHNjb3BlID0+IHNjb3BlLmlzQnVuZGxlZE1jcFNlcnZlcihwbHVnaW5VcmksIHNlcnZlck5hbWUpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0Y29uc3Qgc2NvcGVzID0gWy4uLnRoaXMuX3Njb3Blcy52YWx1ZXMoKV07XG5cdFx0dGhpcy5fc2NvcGVzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBzY29wZSBvZiBzY29wZXMpIHtcblx0XHRcdHNjb3BlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlU2NvcGUoc2NvcGVLZXk6IHN0cmluZywgc2NvcGU6IEFnZW50Q3VzdG9taXphdGlvblNjb3BlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Njb3Blcy5nZXQoc2NvcGVLZXkpID09PSBzY29wZSkge1xuXHRcdFx0dGhpcy5fc2NvcGVzLmRlbGV0ZShzY29wZUtleSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBPd25zIHRoZSBjdXN0b21pemF0aW9uIGJ1bmRsZSBhbmQgcmVzb2x1dGlvbiBsaWZlY3ljbGUgZm9yIG9uZSB3b3JraW5nLWRpcmVjdG9yeSBzY29wZS4gKi9cbmNsYXNzIEFnZW50Q3VzdG9taXphdGlvblNjb3BlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnVuZGxlcjogU3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXT4oJ2FnZW50Q3VzdG9taXphdGlvbnMnLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbUFnZW50cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXT4oJ2FnZW50Q3VzdG9tQWdlbnRzJywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1Jlc29sdmVkID0gb2JzZXJ2YWJsZVZhbHVlKCdhZ2VudEN1c3RvbWl6YXRpb25zUmVzb2x2ZWQnLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxSZXNvbHV0aW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDbGllbnRzID0gbmV3IE1hcDxzdHJpbmcsIElPYnNlcnZhYmxlPFNlc3Npb25BY3RpdmVDbGllbnQ+PigpO1xuXHRwcml2YXRlIF9yZWZDb3VudCA9IDA7XG5cdHByaXZhdGUgX3VwZGF0ZVNlcSA9IDA7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRnZXQgY3VzdG9taXphdGlvbnMoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbWl6YXRpb25zO1xuXHR9XG5cblx0Z2V0IGN1c3RvbUFnZW50cygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21BZ2VudHM7XG5cdH1cblxuXHRnZXQgdG9vbHMoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgVG9vbERlZmluaXRpb25bXT4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDbGllbnRUb29scyh0aGlzLl9zZXNzaW9uVHlwZSk7XG5cdH1cblxuXHRnZXQgaXNSZXNvbHZlZCgpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzUmVzb2x2ZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVHlwZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RzOiByZWFkb25seSBVUklbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zeW5jUHJvdmlkZXI6IElDdXN0b21pemF0aW9uU3luY1Byb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElBZ2VudFJlZ2lzdHJhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0Q2xpZW50VG9vbHM6IChzZXNzaW9uVHlwZTogc3RyaW5nKSA9PiBJT2JzZXJ2YWJsZTxyZWFkb25seSBUb29sRGVmaW5pdGlvbltdPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2U6ICgpID0+IHZvaWQsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2J1bmRsZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlciwgY3JlYXRlU2NvcGVBdXRob3JpdHkoX3Nlc3Npb25UeXBlLCBfcm9vdHMpKSk7XG5cdFx0dGhpcy5fdXBkYXRlRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KENVU1RPTUlaQVRJT05fVVBEQVRFX0RFQk9VTkNFX0RFTEFZKSk7XG5cblx0XHRjb25zdCB1cGRhdGVDdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcSA9ICsrdGhpcy5fdXBkYXRlU2VxO1xuXHRcdFx0bGV0IGNvbXBsZXRlZEluaXRpYWxSZXNvbHV0aW9uID0gZmFsc2U7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBbcmVmcywgYWdlbnRzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRyZXNvbHZlQ3VzdG9taXphdGlvblJlZnMoXG5cdFx0XHRcdFx0XHR0aGlzLl9maWxlU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0dGhpcy5fc3luY1Byb3ZpZGVyLFxuXHRcdFx0XHRcdFx0dGhpcy5fYWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHRcdFx0XHRcdFx0dGhpcy5fbWNwU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0XHRcdFx0XHR0aGlzLl9idW5kbGVyLFxuXHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblR5cGUsXG5cdFx0XHRcdFx0XHRzaG91bGRTeW5jV29ya3NwYWNlRG90TWNwKHRoaXMuX3Nlc3Npb25UeXBlLCB0aGlzLl9yb290cywgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlKSxcblx0XHRcdFx0XHRcdHRoaXMuX29wdGlvbnMsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRyZXNvbHZlTG9jYWxDdXN0b21BZ2VudHModGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX3Byb21wdHNTZXJ2aWNlLCB0aGlzLl9zeW5jUHJvdmlkZXIsIHRoaXMuX2FnZW50UGx1Z2luU2VydmljZSwgdGhpcy5fc2Vzc2lvblR5cGUsIHRoaXMuX29wdGlvbnMpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0aWYgKHNlcSAhPT0gdGhpcy5fdXBkYXRlU2VxKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHRpZiAoIWVxdWFscyh0aGlzLl9jdXN0b21pemF0aW9ucy5nZXQoKSwgcmVmcykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zLnNldChyZWZzLCB0eCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghZXF1YWxzKHRoaXMuX2N1c3RvbUFnZW50cy5nZXQoKSwgYWdlbnRzKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY3VzdG9tQWdlbnRzLnNldChhZ2VudHMsIHR4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5faXNSZXNvbHZlZC5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29tcGxldGVkSW5pdGlhbFJlc29sdXRpb24gPSB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdGlmIChzZXEgPT09IHRoaXMuX3VwZGF0ZVNlcSkge1xuXHRcdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHRoaXMuX2lzUmVzb2x2ZWQuc2V0KHRydWUsIHR4KSk7XG5cdFx0XHRcdFx0Y29tcGxldGVkSW5pdGlhbFJlc29sdXRpb24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAoY29tcGxldGVkSW5pdGlhbFJlc29sdXRpb24gJiYgIXRoaXMuX2luaXRpYWxSZXNvbHV0aW9uLmlzU2V0dGxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2luaXRpYWxSZXNvbHV0aW9uLmNvbXBsZXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHNjaGVkdWxlVXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlRGVsYXllci50cmlnZ2VyKCgpID0+IHVwZGF0ZUN1c3RvbWl6YXRpb25zKCkpLmNhdGNoKCgpID0+IHsgLyogZGVsYXllciBkaXNwb3NlZCAqLyB9KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3luY1Byb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHNjaGVkdWxlVXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHR0aGlzLl9wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbUFnZW50cyxcblx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyxcblx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2tpbGxzLFxuXHRcdFx0dGhpcy5fcHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMsXG5cdFx0KSgoKSA9PiBzY2hlZHVsZVVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgdGhpcy5fYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHBsdWdpbi5lbmFibGVtZW50LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cGx1Z2luLmhvb2tzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cGx1Z2luLmNvbW1hbmRzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cGx1Z2luLnNraWxscy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHBsdWdpbi5hZ2VudHMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRwbHVnaW4uaW5zdHJ1Y3Rpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cGx1Z2luLm1jcFNlcnZlckRlZmluaXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdH1cblx0XHRcdHNjaGVkdWxlVXBkYXRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMuX21jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0c2VydmVyLmVuYWJsZW1lbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRzZXJ2ZXIucmVhZERlZmluaXRpb25zKCkucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0c2NoZWR1bGVVcGRhdGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHNjaGVkdWxlVXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YWNxdWlyZSgpOiBJQWdlbnRDdXN0b21pemF0aW9uU2NvcGUge1xuXHRcdHRoaXMuX3JlZkNvdW50Kys7XG5cdFx0bGV0IHJlbGVhc2VkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGN1c3RvbWl6YXRpb25zOiB0aGlzLmN1c3RvbWl6YXRpb25zLFxuXHRcdFx0Y3VzdG9tQWdlbnRzOiB0aGlzLmN1c3RvbUFnZW50cyxcblx0XHRcdHRvb2xzOiB0aGlzLnRvb2xzLFxuXHRcdFx0aXNSZXNvbHZlZDogdGhpcy5pc1Jlc29sdmVkLFxuXHRcdFx0d2hlblJlc29sdmVkOiAoKSA9PiB0aGlzLl9pbml0aWFsUmVzb2x1dGlvbi5wLFxuXHRcdFx0YWN0aXZlQ2xpZW50OiBjbGllbnRJZCA9PiB0aGlzLmFjdGl2ZUNsaWVudChjbGllbnRJZCksXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghcmVsZWFzZWQpIHtcblx0XHRcdFx0XHRyZWxlYXNlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fcmVsZWFzZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRnZXRPcmlnaW4oc3luY2VkVXJpOiBVUkkpOiBJU3luY2VkQ3VzdG9taXphdGlvbk9yaWdpbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1bmRsZXIuZ2V0T3JpZ2luKHN5bmNlZFVyaSk7XG5cdH1cblxuXHRpc0J1bmRsZWRNY3BTZXJ2ZXIocGx1Z2luVXJpOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9idW5kbGVyLmlzQnVuZGxlZE1jcFNlcnZlcihwbHVnaW5VcmksIHNlcnZlck5hbWUpO1xuXHR9XG5cblx0YWN0aXZlQ2xpZW50KGNsaWVudElkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxTZXNzaW9uQWN0aXZlQ2xpZW50PiB7XG5cdFx0bGV0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2FjdGl2ZUNsaWVudHMuZ2V0KGNsaWVudElkKTtcblx0XHRpZiAoIWFjdGl2ZUNsaWVudCkge1xuXHRcdFx0YWN0aXZlQ2xpZW50ID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHQvLyBLZWVwIGNoYW5nZXMgdG8gdGhlIGNvbXBsZXRlIHNjb3BlIHBpY3R1cmUgaW4gdGhlIGNvbXBvc2VkIHZpZXcnc1xuXHRcdFx0XHQvLyBkZXBlbmRlbmN5IHNldCBzbyBjb25zdW1lcnMgY2FuIGNvYWxlc2NlIGEgY3VzdG9taXphdGlvbiBidXJzdC5cblx0XHRcdFx0dGhpcy5fY3VzdG9tQWdlbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0XHR0b29sczogWy4uLnRoaXMudG9vbHMucmVhZChyZWFkZXIpXSxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogWy4uLnRoaXMuX2N1c3RvbWl6YXRpb25zLnJlYWQocmVhZGVyKV0sXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudHMuc2V0KGNsaWVudElkLCBhY3RpdmVDbGllbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aXZlQ2xpZW50O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl91cGRhdGVTZXErKztcblx0XHRpZiAoIXRoaXMuX2luaXRpYWxSZXNvbHV0aW9uLmlzU2V0dGxlZCkge1xuXHRcdFx0dGhpcy5faW5pdGlhbFJlc29sdXRpb24uY29tcGxldGUoKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVsZWFzZSgpOiB2b2lkIHtcblx0XHRpZiAoLS10aGlzLl9yZWZDb3VudCA9PT0gMCkge1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWxsVG9vbHNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElUb29sRGF0YVtdPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWxsVG9vbFNldHNPYnM6IElPYnNlcnZhYmxlPEl0ZXJhYmxlPElUb29sU2V0Pj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudFRvb2xzQnlUeXBlID0gbmV3IE1hcDxzdHJpbmcsIElPYnNlcnZhYmxlPHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb25zQnlUeXBlID0gbmV3IE1hcDxzdHJpbmcsIEFnZW50UmVnaXN0cmF0aW9uPigpO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdFRvb2xTZXRFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90b29sU2V0RW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYWxsVG9vbHNPYnMgPSB0aGlzLl90b29sc1NlcnZpY2Uub2JzZXJ2ZVRvb2xzKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYWxsVG9vbFNldHNPYnMgPSB0aGlzLl90b29sc1NlcnZpY2UudG9vbFNldHM7XG5cdH1cblxuXHRyZWdpc3RlckZvckFnZW50KHNlc3Npb25UeXBlOiBzdHJpbmcsIG9wdGlvbnM/OiBJQWdlbnRSZWdpc3RyYXRpb25PcHRpb25zKTogSUFnZW50UmVnaXN0cmF0aW9uIHtcblx0XHQvLyBSZWZlcmVuY2VkIGJ5IHRoZSB0ZWFyZG93biBjYWxsYmFjayBiZWxvdywgd2hpY2ggb25seSBydW5zIG9uY2UgdGhlXG5cdFx0Ly8gcmVnaXN0cmF0aW9uIGhhcyBiZWVuIGNvbnN0cnVjdGVkLlxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbjogQWdlbnRSZWdpc3RyYXRpb24gPSBuZXcgQWdlbnRSZWdpc3RyYXRpb24oXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0dHlwZSA9PiB0aGlzLl9nZXRDbGllbnRUb29scyh0eXBlKSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3JlZ2lzdHJhdGlvbnNCeVR5cGUuZ2V0KHNlc3Npb25UeXBlKSA9PT0gcmVnaXN0cmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9uc0J5VHlwZS5kZWxldGUoc2Vzc2lvblR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9uc0J5VHlwZS5zZXQoc2Vzc2lvblR5cGUsIHJlZ2lzdHJhdGlvbik7XG5cdFx0cmV0dXJuIHJlZ2lzdHJhdGlvbjtcblx0fVxuXG5cdGFjcXVpcmVTY29wZShzZXNzaW9uVHlwZTogc3RyaW5nLCByb290czogcmVhZG9ubHkgVVJJW10pOiBJQWdlbnRDdXN0b21pemF0aW9uU2NvcGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZWdpc3RyYXRpb25zQnlUeXBlLmdldChzZXNzaW9uVHlwZSk/LmFjcXVpcmVTY29wZShyb290cyk7XG5cdH1cblxuXHRpc0J1bmRsZWRNY3BTZXJ2ZXIocGx1Z2luVXJpOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fcmVnaXN0cmF0aW9uc0J5VHlwZS52YWx1ZXMoKV0uc29tZShyZWdpc3RyYXRpb24gPT4gcmVnaXN0cmF0aW9uLmlzQnVuZGxlZE1jcFNlcnZlcihwbHVnaW5VcmksIHNlcnZlck5hbWUpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENsaWVudFRvb2xzKHNlc3Npb25UeXBlOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBUb29sRGVmaW5pdGlvbltdPiB7XG5cdFx0bGV0IG9icyA9IHRoaXMuX2NsaWVudFRvb2xzQnlUeXBlLmdldChzZXNzaW9uVHlwZSk7XG5cdFx0aWYgKCFvYnMpIHtcblx0XHRcdG9icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgdG9vbHMgPSB0aGlzLl9hbGxUb29sc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHRvb2xTZXRzID0gdGhpcy5fYWxsVG9vbFNldHNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBlbmFibGVtZW50ID0gdGhpcy5fdG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlLm9ic2VydmUoc2Vzc2lvblR5cGUpLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZFRvb2xJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdFx0Zm9yIChjb25zdCB0cyBvZiB0b29sU2V0cykge1xuXHRcdFx0XHRcdGlmICh0cy5kZXByZWNhdGVkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRzLmdldFRvb2xzKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdGlmIChpc1Rvb2xFbmFibGVkSW5TZXQoZW5hYmxlbWVudCwgdHMuaWQsIHRvb2wuaWQpKSB7XG5cdFx0XHRcdFx0XHRcdGVuYWJsZWRUb29sSWRzLmFkZCh0b29sLmlkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRvb2xzLmZpbHRlcih0ID0+IGVuYWJsZWRUb29sSWRzLmhhcyh0LmlkKSkubWFwKHRvb2xEYXRhVG9EZWZpbml0aW9uKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fY2xpZW50VG9vbHNCeVR5cGUuc2V0KHNlc3Npb25UeXBlLCBvYnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2JzO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRjb25zdCByZWdpc3RyYXRpb25zID0gWy4uLnRoaXMuX3JlZ2lzdHJhdGlvbnNCeVR5cGUudmFsdWVzKCldO1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnNCeVR5cGUuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHJlZ2lzdHJhdGlvbiBvZiByZWdpc3RyYXRpb25zKSB7XG5cdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUm9vdHMocm9vdHM6IHJlYWRvbmx5IFVSSVtdKTogcmVhZG9ubHkgVVJJW10ge1xuXHRjb25zdCByb290c0J5VXJpID0gbmV3IFJlc291cmNlTWFwPFVSST4ocm9vdCA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHJvb3QpKTtcblx0Zm9yIChjb25zdCByb290IG9mIHJvb3RzKSB7XG5cdFx0cm9vdHNCeVVyaS5zZXQocm9vdCwgcm9vdCk7XG5cdH1cblx0Ly8gT3JkaW5hbCAobm90IGxvY2FsZSkgb3JkZXJpbmc6IHRoaXMgb3JkZXIgZmVlZHMgYGdldFNjb3BlS2V5YCwgd2hvc2UgaGFzaFxuXHQvLyBiZWNvbWVzIGFuIG9uLWRpc2sgcGx1Z2luIGNhY2hlIGRpcmVjdG9yeSBuYW1lIG9uIHRoZSBhZ2VudCBob3N0IHNpZGUuXG5cdHJldHVybiBbLi4ucm9vdHNCeVVyaS52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4ge1xuXHRcdGNvbnN0IGxlZnQgPSBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KGEpO1xuXHRcdGNvbnN0IHJpZ2h0ID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleShiKTtcblx0XHRyZXR1cm4gbGVmdCA8IHJpZ2h0ID8gLTEgOiBsZWZ0ID4gcmlnaHQgPyAxIDogMDtcblx0fSk7XG59XG5cbi8qKiBSZXR1cm5zIHdoZXRoZXIgdHdvIHdvcmtpbmctZGlyZWN0b3J5IHNldHMgZGVzY3JpYmUgdGhlIHNhbWUgY3VzdG9taXphdGlvbiBzY29wZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcmVDdXN0b21pemF0aW9uU2NvcGVSb290c0VxdWFsKGZpcnN0OiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCwgc2Vjb25kOiByZWFkb25seSBVUklbXSk6IGJvb2xlYW4ge1xuXHRjb25zdCB0b0NvbXBhcmlzb25LZXkgPSAocm9vdDogVVJJKSA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHJvb3QpO1xuXHRjb25zdCBmaXJzdFJvb3RzID0gbmV3IFJlc291cmNlU2V0KGZpcnN0ID8/IFtdLCB0b0NvbXBhcmlzb25LZXkpO1xuXHRjb25zdCBzZWNvbmRSb290cyA9IG5ldyBSZXNvdXJjZVNldChzZWNvbmQsIHRvQ29tcGFyaXNvbktleSk7XG5cdHJldHVybiBmaXJzdFJvb3RzLnNpemUgPT09IHNlY29uZFJvb3RzLnNpemUgJiYgWy4uLmZpcnN0Um9vdHNdLmV2ZXJ5KHJvb3QgPT4gc2Vjb25kUm9vdHMuaGFzKHJvb3QpKTtcbn1cblxuZnVuY3Rpb24gZ2V0U2NvcGVLZXkocm9vdHM6IHJlYWRvbmx5IFVSSVtdKTogc3RyaW5nIHtcblx0cmV0dXJuIHJvb3RzLm1hcChyb290ID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkocm9vdCkpLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTY29wZUF1dGhvcml0eShzZXNzaW9uVHlwZTogc3RyaW5nLCByb290czogcmVhZG9ubHkgVVJJW10pOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7c2Vzc2lvblR5cGV9LSR7aGFzaChnZXRTY29wZUtleShyb290cykpfWA7XG59XG5cbi8qKiBEZWJvdW5jZSB3aW5kb3cgKG1zKSB1c2VkIHRvIGNvYWxlc2NlIGJ1cnN0cyBvZiBjdXN0b21pemF0aW9uIGNoYW5nZSBldmVudHMgaW50byBhIHNpbmdsZSByZS1yZXNvbHV0aW9uLiAqL1xuY29uc3QgQ1VTVE9NSVpBVElPTl9VUERBVEVfREVCT1VOQ0VfREVMQVkgPSA1MDtcblxucmVnaXN0ZXJTaW5nbGV0b24oSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsIEFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLFNBQXNCLGlCQUFpQixtQkFBbUI7QUFDNUUsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyxpREFBaUQ7QUFHMUQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQWlCLDZCQUE2QjtBQUN2RCxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtDQUF1RDtBQUNoRSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHNDQUFzQztBQUMvQyxTQUE4QywwQkFBMEIsMEJBQTBCLGlDQUFpQztBQUNuSSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9DQUFvQywwQkFBMEI7QUFDdkUsU0FBMEMsa0NBQWtDO0FBRXJFLE1BQU0sZ0NBQWdDLGdCQUErQyw4QkFBOEI7QUEwQzFILE1BQU0sMEJBQTBCLFdBQXlDO0FBQUEsRUFPeEUsWUFDa0IsY0FDQSxVQUNBLHVCQUNqQixnQkFDaUIsaUJBQ0EsWUFDaEI7QUFDRCxVQUFNO0FBUFc7QUFDQTtBQUNBO0FBRUE7QUFDQTtBQVRsQixTQUFpQixVQUFVLG9CQUFJLElBQXFDO0FBQ3BFLFNBQVEsY0FBYztBQVdyQixTQUFLLGVBQWUsS0FBSyxVQUFVLElBQUksK0JBQStCLGNBQWMsY0FBYyxDQUFDO0FBQUEsRUFDcEc7QUFBQSxF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
