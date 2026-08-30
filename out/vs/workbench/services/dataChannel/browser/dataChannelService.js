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
import { disposableTimeout } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IDataChannelService, ILinkPresentationService, parseLinkPresentation } from "../../../../platform/dataChannel/common/dataChannel.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
const cachedPresentationLimit = 100;
const cachedPresentationStorageKey = "linkPresentation.cache.v1";
const watcherReleaseDelay = 5e3;
const uriPatternLengthLimit = 1024;
const linkPresentationProviderExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "linkPresentationProviders",
  jsonSchema: {
    description: localize("linkPresentationProviderExtensionPoint", "Contributes link presentation providers selected by URI regular expressions."),
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["id", "uriPattern", "initialKind"],
      properties: {
        id: {
          type: "string",
          description: localize("linkPresentationProvider.id", "Unique identifier used to register this link presentation provider.")
        },
        uriPattern: {
          type: "string",
          description: localize("linkPresentationProvider.uriPattern", "Anchored regular expression matched against the canonical URI string before the extension is activated.")
        },
        initialKind: {
          type: "string",
          enum: ["resource", "issue", "pullRequest", "commit", "file", "folder", "session", "repository", "branch"],
          description: localize("linkPresentationProvider.initialKind", "The initial semantic kind shown while the provider resolves its first presentation.")
        },
        enablement: {
          type: "string",
          description: localize("linkPresentationProvider.enablement", "Configuration key that must be enabled before this provider is selected.")
        }
      }
    }
  },
  activationEventsGenerator: function* (providers) {
    for (const provider of providers) {
      if (provider.id) {
        yield `onLinkPresentation:${provider.id}`;
      }
    }
  }
});
class DataChannelService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidSendData = this._register(new Emitter());
    this.onDidSendData = this._onDidSendData.event;
  }
  getDataChannel(channelId) {
    return new CoreDataChannelImpl(channelId, this._onDidSendData);
  }
}
class CoreDataChannelImpl {
  constructor(channelId, _onDidSendData) {
    this.channelId = channelId;
    this._onDidSendData = _onDidSendData;
  }
  sendData(data) {
    this._onDidSendData.fire({
      channelId: this.channelId,
      data
    });
  }
}
let LinkPresentationService = class extends Disposable {
  constructor(_extensionService, _logService, _configurationService, _storageService) {
    super();
    this._extensionService = _extensionService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._onDidChangeLinkPresentationRules = this._register(new Emitter());
    this.onDidChangeLinkPresentationRules = this._onDidChangeLinkPresentationRules.event;
    this._coreProviders = /* @__PURE__ */ new Map();
    this._declaredExtensionProviders = /* @__PURE__ */ new Map();
    this._registeredExtensionProviders = /* @__PURE__ */ new Map();
    this._entries = this._register(new DisposableMap());
    this._cache = /* @__PURE__ */ new Map();
    this._restoreCache();
    this._register(linkPresentationProviderExtensionPoint.setHandler((extensions) => {
      this._declaredExtensionProviders.clear();
      for (const extension of extensions) {
        for (const contribution of extension.value) {
          const regexp = readUriPattern(contribution.uriPattern);
          if (!contribution.id || !regexp) {
            extension.collector.error(localize(
              "linkPresentationProvider.invalidPattern",
              "Link presentation provider '{0}' must use a valid anchored URI regular expression of at most {1} characters.",
              contribution.id,
              uriPatternLengthLimit
            ));
            continue;
          }
          if (this._coreProviders.has(contribution.id)) {
            extension.collector.error(localize(
              "linkPresentationProvider.coreDuplicateId",
              "Link presentation provider identifier '{0}' is already registered by the core.",
              contribution.id
            ));
            continue;
          }
          if (this._declaredExtensionProviders.has(contribution.id)) {
            extension.collector.error(localize(
              "linkPresentationProvider.duplicateId",
              "Link presentation provider identifier '{0}' is already contributed.",
              contribution.id
            ));
            continue;
          }
          this._declaredExtensionProviders.set(contribution.id, {
            ...contribution,
            extensionId: extension.description.identifier.value,
            regexp
          });
        }
      }
      this._refreshEntries();
      this._onDidChangeLinkPresentationRules.fire();
    }));
    this._register(this._configurationService.onDidChangeConfiguration((event) => {
      const enablements = [
        ...Array.from(this._coreProviders.values(), (provider) => provider.registration.enablement),
        ...Array.from(this._declaredExtensionProviders.values(), (provider) => provider.enablement)
      ];
      if (enablements.some((enablement) => enablement && event.affectsConfiguration(enablement))) {
        this._refreshEntries();
        this._onDidChangeLinkPresentationRules.fire();
      }
    }));
  }
  get linkPresentationRules() {
    return [
      ...Array.from(this._coreProviders.values()).filter((provider) => this._isEnabled(provider.registration.enablement)).map((provider) => ({ id: provider.registration.id, uriPattern: provider.regexp, initialKind: provider.registration.initialKind })),
      ...Array.from(this._declaredExtensionProviders.values()).filter((provider) => this._isEnabled(provider.enablement)).map((provider) => ({ id: provider.id, uriPattern: provider.regexp, initialKind: provider.initialKind }))
    ].map((rule) => ({ ...rule, uriPattern: normalizeUriPattern(rule.uriPattern) }));
  }
  registerLinkPresentationProvider(registration, provider) {
    if (this._coreProviders.has(registration.id) || this._declaredExtensionProviders.has(registration.id)) {
      throw new Error(`Link presentation provider '${registration.id}' is already registered.`);
    }
    const value = {
      registration,
      regexp: normalizeUriPattern(registration.uriPattern),
      provider
    };
    this._coreProviders.set(registration.id, value);
    this._refreshEntries();
    this._onDidChangeLinkPresentationRules.fire();
    return toDisposable(() => {
      if (this._coreProviders.get(registration.id) === value) {
        this._coreProviders.delete(registration.id);
        this._refreshEntries();
        this._onDidChangeLinkPresentationRules.fire();
      }
    });
  }
  registerExtensionLinkPresentationProvider(extensionId, providerId, provider) {
    const declaration = this._declaredExtensionProviders.get(providerId);
    if (!declaration) {
      throw new Error(`Link presentation provider '${providerId}' is not declared in the extension manifest.`);
    }
    if (!ExtensionIdentifier.equals(declaration.extensionId, extensionId)) {
      throw new Error(`Link presentation provider '${providerId}' was declared by extension '${declaration.extensionId}', not '${extensionId}'.`);
    }
    if (this._registeredExtensionProviders.has(providerId)) {
      throw new Error(`Link presentation provider '${providerId}' is already registered.`);
    }
    const registration = { extensionId, provider };
    this._registeredExtensionProviders.set(providerId, registration);
    return toDisposable(() => {
      if (this._registeredExtensionProviders.get(providerId) === registration) {
        this._registeredExtensionProviders.delete(providerId);
        this._refreshEntries(providerId);
      }
    });
  }
  declareExtensionLinkPresentationProvider(extensionId, contribution) {
    if (this._declaredExtensionProviders.has(contribution.id) || this._coreProviders.has(contribution.id)) {
      throw new Error(`Link presentation provider '${contribution.id}' is already declared.`);
    }
    const regexp = readUriPattern(contribution.uriPattern);
    if (!regexp) {
      throw new Error(`Link presentation provider '${contribution.id}' has an invalid URI pattern.`);
    }
    const declaration = { ...contribution, extensionId, regexp };
    this._declaredExtensionProviders.set(contribution.id, declaration);
    this._refreshEntries();
    this._onDidChangeLinkPresentationRules.fire();
    return toDisposable(() => {
      if (this._declaredExtensionProviders.get(contribution.id) === declaration) {
        this._declaredExtensionProviders.delete(contribution.id);
        this._refreshEntries();
        this._onDidChangeLinkPresentationRules.fire();
      }
    });
  }
  getLinkPresentationRule(resource) {
    const provider = this._selectProvider(resource);
    return provider ? { id: provider.id, uriPattern: provider.regexp, initialKind: provider.initialKind } : void 0;
  }
  createLinkPresentationWatcher(providerId, resource) {
    const provider = this._selectProvider(resource, providerId);
    if (!provider) {
      return void 0;
    }
    const key = canonicalizeResource(providerId, resource);
    let entry = this._entries.get(key);
    if (!entry) {
      entry = new SharedLinkPresentationEntry(providerId, resource, () => {
        if (this._entries.get(key) === entry) {
          this._entries.deleteAndDispose(key);
        }
      });
      this._entries.set(key, entry);
      this._refreshEntry(entry);
    }
    return entry.acquire();
  }
  _refreshEntries(forceProviderId) {
    for (const entry of this._entries.values()) {
      const selectedProviderId = this._selectProvider(entry.resource, entry.ruleId)?.id;
      if (selectedProviderId !== entry.providerId || forceProviderId === entry.providerId) {
        this._refreshEntry(entry);
      }
    }
  }
  _refreshEntry(entry) {
    const generation = entry.reset();
    const provider = this._selectProvider(entry.resource, entry.ruleId);
    entry.providerId = provider?.id;
    if (!provider) {
      entry.setPresentation(void 0);
      return;
    }
    const cached = this._getCachedPresentation(entry.key, provider.id);
    entry.setPresentation(cached ? { ...cached, isLoading: true } : void 0);
    if (provider.coreProvider) {
      try {
        this._attachProviderWatcher(entry, provider.coreProvider.createLinkPresentationWatcher(entry.resource), generation);
      } catch (error) {
        this._handleProviderError(entry, generation, error);
      }
      return;
    }
    void this._activateExtensionProvider(entry, provider, generation);
  }
  async _activateExtensionProvider(entry, provider, generation) {
    try {
      await this._extensionService.activateByEvent(`onLinkPresentation:${provider.id}`);
      const registration = this._registeredExtensionProviders.get(provider.id);
      if (!registration || !provider.extensionId || !ExtensionIdentifier.equals(registration.extensionId, provider.extensionId)) {
        throw new Error(`Extension '${provider.extensionId}' did not register link presentation provider '${provider.id}'.`);
      }
      this._attachProviderWatcher(entry, registration.provider.createLinkPresentationWatcher(entry.resource), generation);
    } catch (error) {
      this._handleProviderError(entry, generation, error);
    }
  }
  _attachProviderWatcher(entry, watcher, generation) {
    if (!entry.isCurrent(generation)) {
      watcher.dispose();
      return;
    }
    const store = new DisposableStore();
    store.add(watcher);
    store.add(autorun((reader) => {
      const presentation = watcher.presentation.read(reader);
      if (presentation && entry.isCurrent(generation) && entry.providerId) {
        entry.setPresentation(presentation);
        this._cachePresentation(entry.key, entry.providerId, presentation);
      }
    }));
    entry.attach(store, generation);
  }
  _handleProviderError(entry, generation, error) {
    if (!entry.isCurrent(generation)) {
      return;
    }
    this._logService.error(`Failed to create a link presentation watcher for '${entry.resource.toString(true)}'.`, error);
    if (!entry.presentation.get()) {
      entry.setPresentation({
        kind: "resource",
        status: { kind: "error", label: localize("linkPresentation.unavailable", "Not available") },
        tooltip: localize("linkPresentation.unavailableTooltip", "The link presentation provider failed to load."),
        ariaLabel: localize("linkPresentation.unavailableAriaLabel", "Link presentation is not available")
      });
    }
  }
  _selectProvider(resource, providerId) {
    const value = resource.toString(true);
    for (const candidate of this._coreProviders.values()) {
      if (providerId !== void 0 && candidate.registration.id !== providerId) {
        continue;
      }
      if (this._isEnabled(candidate.registration.enablement) && matchesUriPattern(candidate.regexp, value)) {
        return {
          id: candidate.registration.id,
          regexp: candidate.regexp,
          initialKind: candidate.registration.initialKind,
          enablement: candidate.registration.enablement,
          coreProvider: candidate.provider
        };
      }
    }
    for (const candidate of this._declaredExtensionProviders.values()) {
      if (providerId !== void 0 && candidate.id !== providerId) {
        continue;
      }
      if (this._isEnabled(candidate.enablement) && matchesUriPattern(candidate.regexp, value)) {
        return {
          id: candidate.id,
          regexp: candidate.regexp,
          initialKind: candidate.initialKind,
          enablement: candidate.enablement,
          extensionId: candidate.extensionId
        };
      }
    }
    return void 0;
  }
  _isEnabled(enablement) {
    return !enablement || this._configurationService.getValue(enablement) === true;
  }
  _getCachedPresentation(key, providerId) {
    const cached = this._cache.get(key);
    if (!cached || cached.providerId !== providerId) {
      return void 0;
    }
    this._cache.delete(key);
    this._cache.set(key, cached);
    return cached.presentation;
  }
  _cachePresentation(key, providerId, presentation) {
    this._cache.delete(key);
    this._cache.set(key, { providerId, presentation: { ...presentation, isLoading: void 0 } });
    while (this._cache.size > cachedPresentationLimit) {
      const oldest = this._cache.keys().next().value;
      if (oldest === void 0) {
        break;
      }
      this._cache.delete(oldest);
    }
    this._persistCache();
  }
  _restoreCache() {
    const stored = this._storageService.get(cachedPresentationStorageKey, StorageScope.PROFILE);
    if (!stored) {
      return;
    }
    try {
      const value = JSON.parse(stored);
      if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
        throw new Error("Invalid persisted link presentation cache.");
      }
      for (const entry of value.entries.slice(-cachedPresentationLimit)) {
        if (!isRecord(entry) || typeof entry.key !== "string" || typeof entry.providerId !== "string") {
          throw new Error("Invalid persisted link presentation cache entry.");
        }
        this._cache.set(entry.key, {
          providerId: entry.providerId,
          presentation: { ...parseLinkPresentation(entry.presentation), isLoading: void 0 }
        });
      }
    } catch (error) {
      this._logService.error("Failed to restore the link presentation cache.", error);
      this._cache.clear();
    }
  }
  _persistCache() {
    this._storageService.store(cachedPresentationStorageKey, JSON.stringify({
      version: 1,
      entries: Array.from(this._cache, ([key, entry]) => ({ key, ...entry }))
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
};
LinkPresentationService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IStorageService)
], LinkPresentationService);
class SharedLinkPresentationEntry extends Disposable {
  constructor(ruleId, resource, onDidBecomeUnused) {
    super();
    this._source = this._register(new MutableDisposable());
    this._releaseTimer = this._register(new MutableDisposable());
    this._generation = 0;
    this._references = 0;
    this.ruleId = ruleId;
    this.resource = resource;
    this.key = canonicalizeResource(ruleId, resource);
    this._onDidBecomeUnused = onDidBecomeUnused;
    this.presentation = observableValue(`linkPresentation:${this.key}`, void 0);
  }
  acquire() {
    this._releaseTimer.clear();
    this._references++;
    let disposed = false;
    return {
      presentation: this.presentation,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        this._references--;
        if (this._references === 0) {
          this._releaseTimer.value = disposableTimeout(this._onDidBecomeUnused, watcherReleaseDelay);
        }
      }
    };
  }
  reset() {
    this._source.clear();
    return ++this._generation;
  }
  isCurrent(generation) {
    return !this._store.isDisposed && generation === this._generation;
  }
  attach(source, generation) {
    if (!this.isCurrent(generation)) {
      source.dispose();
      return;
    }
    this._source.value = source;
  }
  setPresentation(presentation) {
    this.presentation.set(presentation, void 0);
  }
}
function canonicalizeResource(providerId, resource) {
  return `${providerId}\0${resource.toString(true)}`;
}
function readUriPattern(source) {
  if (source.length > uriPatternLengthLimit || !source.startsWith("^") || !source.endsWith("$")) {
    return void 0;
  }
  try {
    return new RegExp(source, "i");
  } catch {
    return void 0;
  }
}
function normalizeUriPattern(pattern) {
  const flags = pattern.flags.replace(/[gy]/g, "");
  return new RegExp(pattern.source, flags);
}
function matchesUriPattern(pattern, value) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
registerSingleton(IDataChannelService, DataChannelService, InstantiationType.Delayed);
registerSingleton(ILinkPresentationService, LinkPresentationService, InstantiationType.Delayed);
export {
  DataChannelService,
  LinkPresentationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxkYXRhQ2hhbm5lbFxcYnJvd3NlclxcZGF0YUNoYW5uZWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb3JlRGF0YUNoYW5uZWwsIElEYXRhQ2hhbm5lbEV2ZW50LCBJRGF0YUNoYW5uZWxTZXJ2aWNlLCBJTGlua1ByZXNlbnRhdGlvbiwgSUxpbmtQcmVzZW50YXRpb25Qcm92aWRlciwgSUxpbmtQcmVzZW50YXRpb25Qcm92aWRlclJlZ2lzdHJhdGlvbiwgSUxpbmtQcmVzZW50YXRpb25SdWxlLCBJTGlua1ByZXNlbnRhdGlvblNlcnZpY2UsIElMaW5rUHJlc2VudGF0aW9uV2F0Y2hlciwgTGlua1ByZXNlbnRhdGlvbktpbmQsIHBhcnNlTGlua1ByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2NvbW1vbi9kYXRhQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5cbmNvbnN0IGNhY2hlZFByZXNlbnRhdGlvbkxpbWl0ID0gMTAwO1xuY29uc3QgY2FjaGVkUHJlc2VudGF0aW9uU3RvcmFnZUtleSA9ICdsaW5rUHJlc2VudGF0aW9uLmNhY2hlLnYxJztcbmNvbnN0IHdhdGNoZXJSZWxlYXNlRGVsYXkgPSA1XzAwMDtcbmNvbnN0IHVyaVBhdHRlcm5MZW5ndGhMaW1pdCA9IDFfMDI0O1xuXG5leHBvcnQgaW50ZXJmYWNlIElMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXJDb250cmlidXRpb24ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB1cmlQYXR0ZXJuOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluaXRpYWxLaW5kOiBMaW5rUHJlc2VudGF0aW9uS2luZDtcblx0cmVhZG9ubHkgZW5hYmxlbWVudD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElEZWNsYXJlZExpbmtQcmVzZW50YXRpb25Qcm92aWRlciBleHRlbmRzIElMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXJDb250cmlidXRpb24ge1xuXHRyZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSByZWdleHA6IFJlZ0V4cDtcbn1cblxuaW50ZXJmYWNlIElSZWdpc3RlcmVkRXh0ZW5zaW9uTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyIHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXI6IElMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXI7XG59XG5cbmludGVyZmFjZSBJQ29yZUxpbmtQcmVzZW50YXRpb25Qcm92aWRlciB7XG5cdHJlYWRvbmx5IHJlZ2lzdHJhdGlvbjogSUxpbmtQcmVzZW50YXRpb25Qcm92aWRlclJlZ2lzdHJhdGlvbjtcblx0cmVhZG9ubHkgcmVnZXhwOiBSZWdFeHA7XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBJTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyO1xufVxuXG5pbnRlcmZhY2UgSVNlbGVjdGVkTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVnZXhwOiBSZWdFeHA7XG5cdHJlYWRvbmx5IGluaXRpYWxLaW5kOiBMaW5rUHJlc2VudGF0aW9uS2luZDtcblx0cmVhZG9ubHkgZW5hYmxlbWVudD86IHN0cmluZztcblx0cmVhZG9ubHkgY29yZVByb3ZpZGVyPzogSUxpbmtQcmVzZW50YXRpb25Qcm92aWRlcjtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJQ2FjaGVkTGlua1ByZXNlbnRhdGlvbiB7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcHJlc2VudGF0aW9uOiBJTGlua1ByZXNlbnRhdGlvbjtcbn1cblxuY29uc3QgbGlua1ByZXNlbnRhdGlvblByb3ZpZGVyRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyQ29udHJpYnV0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdsaW5rUHJlc2VudGF0aW9uUHJvdmlkZXJzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbGlua1ByZXNlbnRhdGlvblByb3ZpZGVyRXh0ZW5zaW9uUG9pbnQnLCBcIkNvbnRyaWJ1dGVzIGxpbmsgcHJlc2VudGF0aW9uIHByb3ZpZGVycyBzZWxlY3RlZCBieSBVUkkgcmVndWxhciBleHByZXNzaW9ucy5cIiksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRyZXF1aXJlZDogWydpZCcsICd1cmlQYXR0ZXJuJywgJ2luaXRpYWxLaW5kJ10sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdsaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIuaWQnLCBcIlVuaXF1ZSBpZGVudGlmaWVyIHVzZWQgdG8gcmVnaXN0ZXIgdGhpcyBsaW5rIHByZXNlbnRhdGlvbiBwcm92aWRlci5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVyaVBhdHRlcm46IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xpbmtQcmVzZW50YXRpb25Qcm92aWRlci51cmlQYXR0ZXJuJywgXCJBbmNob3JlZCByZWd1bGFyIGV4cHJlc3Npb24gbWF0Y2hlZCBhZ2FpbnN0IHRoZSBjYW5vbmljYWwgVVJJIHN0cmluZyBiZWZvcmUgdGhlIGV4dGVuc2lvbiBpcyBhY3RpdmF0ZWQuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbml0aWFsS2luZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsncmVzb3VyY2UnLCAnaXNzdWUnLCAncHVsbFJlcXVlc3QnLCAnY29tbWl0JywgJ2ZpbGUnLCAnZm9sZGVyJywgJ3Nlc3Npb24nLCAncmVwb3NpdG9yeScsICdicmFuY2gnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xpbmtQcmVzZW50YXRpb25Qcm92aWRlci5pbml0aWFsS2luZCcsIFwiVGhlIGluaXRpYWwgc2VtYW50aWMga2luZCBzaG93biB3aGlsZSB0aGUgcHJvdmlkZXIgcmVzb2x2ZXMgaXRzIGZpcnN0IHByZXNlbnRhdGlvbi5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xpbmtQcmVzZW50YXRpb25Qcm92aWRlci5lbmFibGVtZW50JywgXCJDb25maWd1cmF0aW9uIGtleSB0aGF0IG11c3QgYmUgZW5hYmxlZCBiZWZvcmUgdGhpcyBwcm92aWRlciBpcyBzZWxlY3RlZC5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH0sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAocHJvdmlkZXJzKSB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBwcm92aWRlcnMpIHtcblx0XHRcdGlmIChwcm92aWRlci5pZCkge1xuXHRcdFx0XHR5aWVsZCBgb25MaW5rUHJlc2VudGF0aW9uOiR7cHJvdmlkZXIuaWR9YDtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG59KTtcblxuZXhwb3J0IGNsYXNzIERhdGFDaGFubmVsU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGF0YUNoYW5uZWxTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZW5kRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElEYXRhQ2hhbm5lbEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTZW5kRGF0YSA9IHRoaXMuX29uRGlkU2VuZERhdGEuZXZlbnQ7XG5cblx0Z2V0RGF0YUNoYW5uZWw8VD4oY2hhbm5lbElkOiBzdHJpbmcpOiBDb3JlRGF0YUNoYW5uZWw8VD4ge1xuXHRcdHJldHVybiBuZXcgQ29yZURhdGFDaGFubmVsSW1wbDxUPihjaGFubmVsSWQsIHRoaXMuX29uRGlkU2VuZERhdGEpO1xuXHR9XG59XG5cbmNsYXNzIENvcmVEYXRhQ2hhbm5lbEltcGw8VD4gaW1wbGVtZW50cyBDb3JlRGF0YUNoYW5uZWw8VD4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNoYW5uZWxJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VuZERhdGE6IEVtaXR0ZXI8SURhdGFDaGFubmVsRXZlbnQ+XG5cdCkgeyB9XG5cblx0c2VuZERhdGEoZGF0YTogVCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU2VuZERhdGEuZmlyZSh7XG5cdFx0XHRjaGFubmVsSWQ6IHRoaXMuY2hhbm5lbElkLFxuXHRcdFx0ZGF0YVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5rUHJlc2VudGF0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGlua1ByZXNlbnRhdGlvblNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxpbmtQcmVzZW50YXRpb25SdWxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxpbmtQcmVzZW50YXRpb25SdWxlcyA9IHRoaXMuX29uRGlkQ2hhbmdlTGlua1ByZXNlbnRhdGlvblJ1bGVzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb3JlUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElDb3JlTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJRGVjbGFyZWRMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdGVyZWRFeHRlbnNpb25Qcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgSVJlZ2lzdGVyZWRFeHRlbnNpb25MaW5rUHJlc2VudGF0aW9uUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIFNoYXJlZExpbmtQcmVzZW50YXRpb25FbnRyeT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIElDYWNoZWRMaW5rUHJlc2VudGF0aW9uPigpO1xuXG5cdGdldCBsaW5rUHJlc2VudGF0aW9uUnVsZXMoKTogcmVhZG9ubHkgSUxpbmtQcmVzZW50YXRpb25SdWxlW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHQuLi5BcnJheS5mcm9tKHRoaXMuX2NvcmVQcm92aWRlcnMudmFsdWVzKCkpXG5cdFx0XHRcdC5maWx0ZXIocHJvdmlkZXIgPT4gdGhpcy5faXNFbmFibGVkKHByb3ZpZGVyLnJlZ2lzdHJhdGlvbi5lbmFibGVtZW50KSlcblx0XHRcdFx0Lm1hcChwcm92aWRlciA9PiAoeyBpZDogcHJvdmlkZXIucmVnaXN0cmF0aW9uLmlkLCB1cmlQYXR0ZXJuOiBwcm92aWRlci5yZWdleHAsIGluaXRpYWxLaW5kOiBwcm92aWRlci5yZWdpc3RyYXRpb24uaW5pdGlhbEtpbmQgfSkpLFxuXHRcdFx0Li4uQXJyYXkuZnJvbSh0aGlzLl9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycy52YWx1ZXMoKSlcblx0XHRcdFx0LmZpbHRlcihwcm92aWRlciA9PiB0aGlzLl9pc0VuYWJsZWQocHJvdmlkZXIuZW5hYmxlbWVudCkpXG5cdFx0XHRcdC5tYXAocHJvdmlkZXIgPT4gKHsgaWQ6IHByb3ZpZGVyLmlkLCB1cmlQYXR0ZXJuOiBwcm92aWRlci5yZWdleHAsIGluaXRpYWxLaW5kOiBwcm92aWRlci5pbml0aWFsS2luZCB9KSksXG5cdFx0XS5tYXAocnVsZSA9PiAoeyAuLi5ydWxlLCB1cmlQYXR0ZXJuOiBub3JtYWxpemVVcmlQYXR0ZXJuKHJ1bGUudXJpUGF0dGVybikgfSkpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Jlc3RvcmVDYWNoZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpbmtQcmVzZW50YXRpb25Qcm92aWRlckV4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHR0aGlzLl9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycy5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCByZWdleHAgPSByZWFkVXJpUGF0dGVybihjb250cmlidXRpb24udXJpUGF0dGVybik7XG5cdFx0XHRcdFx0aWYgKCFjb250cmlidXRpb24uaWQgfHwgIXJlZ2V4cCkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0J2xpbmtQcmVzZW50YXRpb25Qcm92aWRlci5pbnZhbGlkUGF0dGVybicsXG5cdFx0XHRcdFx0XHRcdFwiTGluayBwcmVzZW50YXRpb24gcHJvdmlkZXIgJ3swfScgbXVzdCB1c2UgYSB2YWxpZCBhbmNob3JlZCBVUkkgcmVndWxhciBleHByZXNzaW9uIG9mIGF0IG1vc3QgezF9IGNoYXJhY3RlcnMuXCIsXG5cdFx0XHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5pZCxcblx0XHRcdFx0XHRcdFx0dXJpUGF0dGVybkxlbmd0aExpbWl0LFxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2NvcmVQcm92aWRlcnMuaGFzKGNvbnRyaWJ1dGlvbi5pZCkpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCdsaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIuY29yZUR1cGxpY2F0ZUlkJyxcblx0XHRcdFx0XHRcdFx0XCJMaW5rIHByZXNlbnRhdGlvbiBwcm92aWRlciBpZGVudGlmaWVyICd7MH0nIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCBieSB0aGUgY29yZS5cIixcblx0XHRcdFx0XHRcdFx0Y29udHJpYnV0aW9uLmlkLFxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2RlY2xhcmVkRXh0ZW5zaW9uUHJvdmlkZXJzLmhhcyhjb250cmlidXRpb24uaWQpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHQnbGlua1ByZXNlbnRhdGlvblByb3ZpZGVyLmR1cGxpY2F0ZUlkJyxcblx0XHRcdFx0XHRcdFx0XCJMaW5rIHByZXNlbnRhdGlvbiBwcm92aWRlciBpZGVudGlmaWVyICd7MH0nIGlzIGFscmVhZHkgY29udHJpYnV0ZWQuXCIsXG5cdFx0XHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5pZCxcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2RlY2xhcmVkRXh0ZW5zaW9uUHJvdmlkZXJzLnNldChjb250cmlidXRpb24uaWQsIHtcblx0XHRcdFx0XHRcdC4uLmNvbnRyaWJ1dGlvbixcblx0XHRcdFx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0XHRcdHJlZ2V4cCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVmcmVzaEVudHJpZXMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGlua1ByZXNlbnRhdGlvblJ1bGVzLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRzID0gW1xuXHRcdFx0XHQuLi5BcnJheS5mcm9tKHRoaXMuX2NvcmVQcm92aWRlcnMudmFsdWVzKCksIHByb3ZpZGVyID0+IHByb3ZpZGVyLnJlZ2lzdHJhdGlvbi5lbmFibGVtZW50KSxcblx0XHRcdFx0Li4uQXJyYXkuZnJvbSh0aGlzLl9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycy52YWx1ZXMoKSwgcHJvdmlkZXIgPT4gcHJvdmlkZXIuZW5hYmxlbWVudCksXG5cdFx0XHRdO1xuXHRcdFx0aWYgKGVuYWJsZW1lbnRzLnNvbWUoZW5hYmxlbWVudCA9PiBlbmFibGVtZW50ICYmIGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKGVuYWJsZW1lbnQpKSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoRW50cmllcygpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxpbmtQcmVzZW50YXRpb25SdWxlcy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cmVnaXN0ZXJMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIocmVnaXN0cmF0aW9uOiBJTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyUmVnaXN0cmF0aW9uLCBwcm92aWRlcjogSUxpbmtQcmVzZW50YXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fY29yZVByb3ZpZGVycy5oYXMocmVnaXN0cmF0aW9uLmlkKSB8fCB0aGlzLl9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycy5oYXMocmVnaXN0cmF0aW9uLmlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMaW5rIHByZXNlbnRhdGlvbiBwcm92aWRlciAnJHtyZWdpc3RyYXRpb24uaWR9JyBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlOiBJQ29yZUxpbmtQcmVzZW50YXRpb25Qcm92aWRlciA9IHtcblx0XHRcdHJlZ2lzdHJhdGlvbixcblx0XHRcdHJlZ2V4cDogbm9ybWFsaXplVXJpUGF0dGVybihyZWdpc3RyYXRpb24udXJpUGF0dGVybiksXG5cdFx0XHRwcm92aWRlcixcblx0XHR9O1xuXHRcdHRoaXMuX2NvcmVQcm92aWRlcnMuc2V0KHJlZ2lzdHJhdGlvbi5pZCwgdmFsdWUpO1xuXHRcdHRoaXMuX3JlZnJlc2hFbnRyaWVzKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VMaW5rUHJlc2VudGF0aW9uUnVsZXMuZmlyZSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvcmVQcm92aWRlcnMuZ2V0KHJlZ2lzdHJhdGlvbi5pZCkgPT09IHZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX2NvcmVQcm92aWRlcnMuZGVsZXRlKHJlZ2lzdHJhdGlvbi5pZCk7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hFbnRyaWVzKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGlua1ByZXNlbnRhdGlvblJ1bGVzLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJlZ2lzdGVyRXh0ZW5zaW9uTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyKGV4dGVuc2lvbklkOiBzdHJpbmcsIHByb3ZpZGVySWQ6IHN0cmluZywgcHJvdmlkZXI6IElMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGVjbGFyYXRpb24gPSB0aGlzLl9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFkZWNsYXJhdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMaW5rIHByZXNlbnRhdGlvbiBwcm92aWRlciAnJHtwcm92aWRlcklkfScgaXMgbm90IGRlY2xhcmVkIGluIHRoZSBleHRlbnNpb24gbWFuaWZlc3QuYCk7XG5cdFx0fVxuXHRcdGlmICghRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZGVjbGFyYXRpb24uZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbklkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMaW5rIHByZXNlbnRhdGlvbiBwcm92aWRlciAnJHtwcm92aWRlcklkfScgd2FzIGRlY2xhcmVkIGJ5IGV4dGVuc2lvbiAnJHtkZWNsYXJhdGlvbi5leHRlbnNpb25JZH0nLCBub3QgJyR7ZXh0ZW5zaW9uSWR9Jy5gKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3JlZ2lzdGVyZWRFeHRlbnNpb25Qcm92aWRlcnMuaGFzKHByb3ZpZGVySWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExpbmsgcHJlc2VudGF0aW9uIHByb3ZpZGVyICcke3Byb3ZpZGVySWR9JyBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0geyBleHRlbnNpb25JZCwgcHJvdmlkZXIgfTtcblx0XHR0aGlzLl9yZWdpc3RlcmVkRXh0ZW5zaW9uUHJvdmlkZXJzLnNldChwcm92aWRlcklkLCByZWdpc3RyYXRpb24pO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3JlZ2lzdGVyZWRFeHRlbnNpb25Qcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpID09PSByZWdpc3RyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJlZEV4dGVuc2lvblByb3ZpZGVycy5kZWxldGUocHJvdmlkZXJJZCk7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hFbnRyaWVzKHByb3ZpZGVySWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGVjbGFyZUV4dGVuc2lvbkxpbmtQcmVzZW50YXRpb25Qcm92aWRlcihleHRlbnNpb25JZDogc3RyaW5nLCBjb250cmlidXRpb246IElMaW5rUHJlc2VudGF0aW9uUHJvdmlkZXJDb250cmlidXRpb24pOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX2RlY2xhcmVkRXh0ZW5zaW9uUHJvdmlkZXJzLmhhcyhjb250cmlidXRpb24uaWQpIHx8IHRoaXMuX2NvcmVQcm92aWRlcnMuaGFzKGNvbnRyaWJ1dGlvbi5pZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTGluayBwcmVzZW50YXRpb24gcHJvdmlkZXIgJyR7Y29udHJpYnV0aW9uLmlkfScgaXMgYWxyZWFkeSBkZWNsYXJlZC5gKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVnZXhwID0gcmVhZFVyaVBhdHRlcm4oY29udHJpYnV0aW9uLnVyaVBhdHRlcm4pO1xuXHRcdGlmICghcmVnZXhwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExpbmsgcHJlc2VudGF0aW9uIHByb3ZpZGVyICcke2NvbnRyaWJ1dGlvbi5pZH0nIGhhcyBhbiBpbnZhbGlkIFVSSSBwYXR0ZXJuLmApO1xuXHRcdH1cblx0XHRjb25zdCBkZWNsYXJhdGlvbjogSURlY2xhcmVkTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyID0geyAuLi5jb250cmlidXRpb24sIGV4dGVuc2lvbklkLCByZWdleHAgfTtcblx0XHR0aGlzLl9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycy5zZXQoY29udHJpYnV0aW9uLmlkLCBkZWNsYXJhdGlvbik7XG5cdFx0dGhpcy5fcmVmcmVzaEVudHJpZXMoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUxpbmtQcmVzZW50YXRpb25SdWxlcy5maXJlKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGVjbGFyZWRFeHRlbnNpb25Qcm92aWRlcnMuZ2V0KGNvbnRyaWJ1dGlvbi5pZCkgPT09IGRlY2xhcmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2RlY2xhcmVkRXh0ZW5zaW9uUHJvdmlkZXJzLmRlbGV0ZShjb250cmlidXRpb24uaWQpO1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoRW50cmllcygpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxpbmtQcmVzZW50YXRpb25SdWxlcy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRMaW5rUHJlc2VudGF0aW9uUnVsZShyZXNvdXJjZTogVVJJKTogSUxpbmtQcmVzZW50YXRpb25SdWxlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3NlbGVjdFByb3ZpZGVyKHJlc291cmNlKTtcblx0XHRyZXR1cm4gcHJvdmlkZXIgPyB7IGlkOiBwcm92aWRlci5pZCwgdXJpUGF0dGVybjogcHJvdmlkZXIucmVnZXhwLCBpbml0aWFsS2luZDogcHJvdmlkZXIuaW5pdGlhbEtpbmQgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNyZWF0ZUxpbmtQcmVzZW50YXRpb25XYXRjaGVyKHByb3ZpZGVySWQ6IHN0cmluZywgcmVzb3VyY2U6IFVSSSk6IElMaW5rUHJlc2VudGF0aW9uV2F0Y2hlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZWxlY3RQcm92aWRlcihyZXNvdXJjZSwgcHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSBjYW5vbmljYWxpemVSZXNvdXJjZShwcm92aWRlcklkLCByZXNvdXJjZSk7XG5cdFx0bGV0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQoa2V5KTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRlbnRyeSA9IG5ldyBTaGFyZWRMaW5rUHJlc2VudGF0aW9uRW50cnkocHJvdmlkZXJJZCwgcmVzb3VyY2UsICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2VudHJpZXMuZ2V0KGtleSkgPT09IGVudHJ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZW50cmllcy5zZXQoa2V5LCBlbnRyeSk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoRW50cnkoZW50cnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnkuYWNxdWlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaEVudHJpZXMoZm9yY2VQcm92aWRlcklkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9lbnRyaWVzLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZFByb3ZpZGVySWQgPSB0aGlzLl9zZWxlY3RQcm92aWRlcihlbnRyeS5yZXNvdXJjZSwgZW50cnkucnVsZUlkKT8uaWQ7XG5cdFx0XHRpZiAoc2VsZWN0ZWRQcm92aWRlcklkICE9PSBlbnRyeS5wcm92aWRlcklkIHx8IGZvcmNlUHJvdmlkZXJJZCA9PT0gZW50cnkucHJvdmlkZXJJZCkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoRW50cnkoZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hFbnRyeShlbnRyeTogU2hhcmVkTGlua1ByZXNlbnRhdGlvbkVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9IGVudHJ5LnJlc2V0KCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZWxlY3RQcm92aWRlcihlbnRyeS5yZXNvdXJjZSwgZW50cnkucnVsZUlkKTtcblx0XHRlbnRyeS5wcm92aWRlcklkID0gcHJvdmlkZXI/LmlkO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdGVudHJ5LnNldFByZXNlbnRhdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX2dldENhY2hlZFByZXNlbnRhdGlvbihlbnRyeS5rZXksIHByb3ZpZGVyLmlkKTtcblx0XHRlbnRyeS5zZXRQcmVzZW50YXRpb24oY2FjaGVkID8geyAuLi5jYWNoZWQsIGlzTG9hZGluZzogdHJ1ZSB9IDogdW5kZWZpbmVkKTtcblx0XHRpZiAocHJvdmlkZXIuY29yZVByb3ZpZGVyKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9hdHRhY2hQcm92aWRlcldhdGNoZXIoZW50cnksIHByb3ZpZGVyLmNvcmVQcm92aWRlci5jcmVhdGVMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcihlbnRyeS5yZXNvdXJjZSksIGdlbmVyYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlUHJvdmlkZXJFcnJvcihlbnRyeSwgZ2VuZXJhdGlvbiwgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2b2lkIHRoaXMuX2FjdGl2YXRlRXh0ZW5zaW9uUHJvdmlkZXIoZW50cnksIHByb3ZpZGVyLCBnZW5lcmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FjdGl2YXRlRXh0ZW5zaW9uUHJvdmlkZXIoZW50cnk6IFNoYXJlZExpbmtQcmVzZW50YXRpb25FbnRyeSwgcHJvdmlkZXI6IElTZWxlY3RlZExpbmtQcmVzZW50YXRpb25Qcm92aWRlciwgZ2VuZXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkxpbmtQcmVzZW50YXRpb246JHtwcm92aWRlci5pZH1gKTtcblx0XHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyZWRFeHRlbnNpb25Qcm92aWRlcnMuZ2V0KHByb3ZpZGVyLmlkKTtcblx0XHRcdGlmICghcmVnaXN0cmF0aW9uIHx8ICFwcm92aWRlci5leHRlbnNpb25JZCB8fCAhRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMocmVnaXN0cmF0aW9uLmV4dGVuc2lvbklkLCBwcm92aWRlci5leHRlbnNpb25JZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHRlbnNpb24gJyR7cHJvdmlkZXIuZXh0ZW5zaW9uSWR9JyBkaWQgbm90IHJlZ2lzdGVyIGxpbmsgcHJlc2VudGF0aW9uIHByb3ZpZGVyICcke3Byb3ZpZGVyLmlkfScuYCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hdHRhY2hQcm92aWRlcldhdGNoZXIoZW50cnksIHJlZ2lzdHJhdGlvbi5wcm92aWRlci5jcmVhdGVMaW5rUHJlc2VudGF0aW9uV2F0Y2hlcihlbnRyeS5yZXNvdXJjZSksIGdlbmVyYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVQcm92aWRlckVycm9yKGVudHJ5LCBnZW5lcmF0aW9uLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXR0YWNoUHJvdmlkZXJXYXRjaGVyKGVudHJ5OiBTaGFyZWRMaW5rUHJlc2VudGF0aW9uRW50cnksIHdhdGNoZXI6IElMaW5rUHJlc2VudGF0aW9uV2F0Y2hlciwgZ2VuZXJhdGlvbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCFlbnRyeS5pc0N1cnJlbnQoZ2VuZXJhdGlvbikpIHtcblx0XHRcdHdhdGNoZXIuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQod2F0Y2hlcik7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IHdhdGNoZXIucHJlc2VudGF0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwcmVzZW50YXRpb24gJiYgZW50cnkuaXNDdXJyZW50KGdlbmVyYXRpb24pICYmIGVudHJ5LnByb3ZpZGVySWQpIHtcblx0XHRcdFx0ZW50cnkuc2V0UHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0XHRcdHRoaXMuX2NhY2hlUHJlc2VudGF0aW9uKGVudHJ5LmtleSwgZW50cnkucHJvdmlkZXJJZCwgcHJlc2VudGF0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZW50cnkuYXR0YWNoKHN0b3JlLCBnZW5lcmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVByb3ZpZGVyRXJyb3IoZW50cnk6IFNoYXJlZExpbmtQcmVzZW50YXRpb25FbnRyeSwgZ2VuZXJhdGlvbjogbnVtYmVyLCBlcnJvcjogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICghZW50cnkuaXNDdXJyZW50KGdlbmVyYXRpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBjcmVhdGUgYSBsaW5rIHByZXNlbnRhdGlvbiB3YXRjaGVyIGZvciAnJHtlbnRyeS5yZXNvdXJjZS50b1N0cmluZyh0cnVlKX0nLmAsIGVycm9yKTtcblx0XHRpZiAoIWVudHJ5LnByZXNlbnRhdGlvbi5nZXQoKSkge1xuXHRcdFx0ZW50cnkuc2V0UHJlc2VudGF0aW9uKHtcblx0XHRcdFx0a2luZDogJ3Jlc291cmNlJyxcblx0XHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdlcnJvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbGlua1ByZXNlbnRhdGlvbi51bmF2YWlsYWJsZScsIFwiTm90IGF2YWlsYWJsZVwiKSB9LFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbGlua1ByZXNlbnRhdGlvbi51bmF2YWlsYWJsZVRvb2x0aXAnLCBcIlRoZSBsaW5rIHByZXNlbnRhdGlvbiBwcm92aWRlciBmYWlsZWQgdG8gbG9hZC5cIiksXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2xpbmtQcmVzZW50YXRpb24udW5hdmFpbGFibGVBcmlhTGFiZWwnLCBcIkxpbmsgcHJlc2VudGF0aW9uIGlzIG5vdCBhdmFpbGFibGVcIiksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3RQcm92aWRlcihyZXNvdXJjZTogVVJJLCBwcm92aWRlcklkPzogc3RyaW5nKTogSVNlbGVjdGVkTGlua1ByZXNlbnRhdGlvblByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHJlc291cmNlLnRvU3RyaW5nKHRydWUpO1xuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuX2NvcmVQcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChwcm92aWRlcklkICE9PSB1bmRlZmluZWQgJiYgY2FuZGlkYXRlLnJlZ2lzdHJhdGlvbi5pZCAhPT0gcHJvdmlkZXJJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9pc0VuYWJsZWQoY2FuZGlkYXRlLnJlZ2lzdHJhdGlvbi5lbmFibGVtZW50KSAmJiBtYXRjaGVzVXJpUGF0dGVybihjYW5kaWRhdGUucmVnZXhwLCB2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogY2FuZGlkYXRlLnJlZ2lzdHJhdGlvbi5pZCxcblx0XHRcdFx0XHRyZWdleHA6IGNhbmRpZGF0ZS5yZWdleHAsXG5cdFx0XHRcdFx0aW5pdGlhbEtpbmQ6IGNhbmRpZGF0ZS5yZWdpc3RyYXRpb24uaW5pdGlhbEtpbmQsXG5cdFx0XHRcdFx0ZW5hYmxlbWVudDogY2FuZGlkYXRlLnJlZ2lzdHJhdGlvbi5lbmFibGVtZW50LFxuXHRcdFx0XHRcdGNvcmVQcm92aWRlcjogY2FuZGlkYXRlLnByb3ZpZGVyLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiB0aGlzLl9kZWNsYXJlZEV4dGVuc2lvblByb3ZpZGVycy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHByb3ZpZGVySWQgIT09IHVuZGVmaW5lZCAmJiBjYW5kaWRhdGUuaWQgIT09IHByb3ZpZGVySWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faXNFbmFibGVkKGNhbmRpZGF0ZS5lbmFibGVtZW50KSAmJiBtYXRjaGVzVXJpUGF0dGVybihjYW5kaWRhdGUucmVnZXhwLCB2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogY2FuZGlkYXRlLmlkLFxuXHRcdFx0XHRcdHJlZ2V4cDogY2FuZGlkYXRlLnJlZ2V4cCxcblx0XHRcdFx0XHRpbml0aWFsS2luZDogY2FuZGlkYXRlLmluaXRpYWxLaW5kLFxuXHRcdFx0XHRcdGVuYWJsZW1lbnQ6IGNhbmRpZGF0ZS5lbmFibGVtZW50LFxuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiBjYW5kaWRhdGUuZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VuYWJsZWQoZW5hYmxlbWVudDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFlbmFibGVtZW50IHx8IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KGVuYWJsZW1lbnQpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q2FjaGVkUHJlc2VudGF0aW9uKGtleTogc3RyaW5nLCBwcm92aWRlcklkOiBzdHJpbmcpOiBJTGlua1ByZXNlbnRhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fY2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKCFjYWNoZWQgfHwgY2FjaGVkLnByb3ZpZGVySWQgIT09IHByb3ZpZGVySWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMuX2NhY2hlLnNldChrZXksIGNhY2hlZCk7XG5cdFx0cmV0dXJuIGNhY2hlZC5wcmVzZW50YXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZVByZXNlbnRhdGlvbihrZXk6IHN0cmluZywgcHJvdmlkZXJJZDogc3RyaW5nLCBwcmVzZW50YXRpb246IElMaW5rUHJlc2VudGF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fY2FjaGUuc2V0KGtleSwgeyBwcm92aWRlcklkLCBwcmVzZW50YXRpb246IHsgLi4ucHJlc2VudGF0aW9uLCBpc0xvYWRpbmc6IHVuZGVmaW5lZCB9IH0pO1xuXHRcdHdoaWxlICh0aGlzLl9jYWNoZS5zaXplID4gY2FjaGVkUHJlc2VudGF0aW9uTGltaXQpIHtcblx0XHRcdGNvbnN0IG9sZGVzdCA9IHRoaXMuX2NhY2hlLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRpZiAob2xkZXN0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jYWNoZS5kZWxldGUob2xkZXN0KTtcblx0XHR9XG5cdFx0dGhpcy5fcGVyc2lzdENhY2hlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlQ2FjaGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmVkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KGNhY2hlZFByZXNlbnRhdGlvblN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoIXN0b3JlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdmFsdWU6IHVua25vd24gPSBKU09OLnBhcnNlKHN0b3JlZCk7XG5cdFx0XHRpZiAoIWlzUmVjb3JkKHZhbHVlKSB8fCB2YWx1ZS52ZXJzaW9uICE9PSAxIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlLmVudHJpZXMpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBwZXJzaXN0ZWQgbGluayBwcmVzZW50YXRpb24gY2FjaGUuJyk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHZhbHVlLmVudHJpZXMuc2xpY2UoLWNhY2hlZFByZXNlbnRhdGlvbkxpbWl0KSkge1xuXHRcdFx0XHRpZiAoIWlzUmVjb3JkKGVudHJ5KSB8fCB0eXBlb2YgZW50cnkua2V5ICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgZW50cnkucHJvdmlkZXJJZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcGVyc2lzdGVkIGxpbmsgcHJlc2VudGF0aW9uIGNhY2hlIGVudHJ5LicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NhY2hlLnNldChlbnRyeS5rZXksIHtcblx0XHRcdFx0XHRwcm92aWRlcklkOiBlbnRyeS5wcm92aWRlcklkLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogeyAuLi5wYXJzZUxpbmtQcmVzZW50YXRpb24oZW50cnkucHJlc2VudGF0aW9uKSwgaXNMb2FkaW5nOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byByZXN0b3JlIHRoZSBsaW5rIHByZXNlbnRhdGlvbiBjYWNoZS4nLCBlcnJvcik7XG5cdFx0XHR0aGlzLl9jYWNoZS5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BlcnNpc3RDYWNoZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShjYWNoZWRQcmVzZW50YXRpb25TdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0ZW50cmllczogQXJyYXkuZnJvbSh0aGlzLl9jYWNoZSwgKFtrZXksIGVudHJ5XSkgPT4gKHsga2V5LCAuLi5lbnRyeSB9KSksXG5cdFx0fSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG59XG5cbmNsYXNzIFNoYXJlZExpbmtQcmVzZW50YXRpb25FbnRyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBrZXk6IHN0cmluZztcblx0cmVhZG9ubHkgcHJlc2VudGF0aW9uOiBJU2V0dGFibGVPYnNlcnZhYmxlPElMaW5rUHJlc2VudGF0aW9uIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgcnVsZUlkOiBzdHJpbmc7XG5cdHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zb3VyY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVsZWFzZVRpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCZWNvbWVVbnVzZWQ6ICgpID0+IHZvaWQ7XG5cdHByaXZhdGUgX2dlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIF9yZWZlcmVuY2VzID0gMDtcblxuXHRjb25zdHJ1Y3RvcihydWxlSWQ6IHN0cmluZywgcmVzb3VyY2U6IFVSSSwgb25EaWRCZWNvbWVVbnVzZWQ6ICgpID0+IHZvaWQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucnVsZUlkID0gcnVsZUlkO1xuXHRcdHRoaXMucmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHR0aGlzLmtleSA9IGNhbm9uaWNhbGl6ZVJlc291cmNlKHJ1bGVJZCwgcmVzb3VyY2UpO1xuXHRcdHRoaXMuX29uRGlkQmVjb21lVW51c2VkID0gb25EaWRCZWNvbWVVbnVzZWQ7XG5cdFx0dGhpcy5wcmVzZW50YXRpb24gPSBvYnNlcnZhYmxlVmFsdWUoYGxpbmtQcmVzZW50YXRpb246JHt0aGlzLmtleX1gLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0YWNxdWlyZSgpOiBJTGlua1ByZXNlbnRhdGlvbldhdGNoZXIge1xuXHRcdHRoaXMuX3JlbGVhc2VUaW1lci5jbGVhcigpO1xuXHRcdHRoaXMuX3JlZmVyZW5jZXMrKztcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlc2VudGF0aW9uOiB0aGlzLnByZXNlbnRhdGlvbixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fcmVmZXJlbmNlcy0tO1xuXHRcdFx0XHRpZiAodGhpcy5fcmVmZXJlbmNlcyA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbGVhc2VUaW1lci52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KHRoaXMuX29uRGlkQmVjb21lVW51c2VkLCB3YXRjaGVyUmVsZWFzZURlbGF5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cmVzZXQoKTogbnVtYmVyIHtcblx0XHR0aGlzLl9zb3VyY2UuY2xlYXIoKTtcblx0XHRyZXR1cm4gKyt0aGlzLl9nZW5lcmF0aW9uO1xuXHR9XG5cblx0aXNDdXJyZW50KGdlbmVyYXRpb246IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCAmJiBnZW5lcmF0aW9uID09PSB0aGlzLl9nZW5lcmF0aW9uO1xuXHR9XG5cblx0YXR0YWNoKHNvdXJjZTogRGlzcG9zYWJsZVN0b3JlLCBnZW5lcmF0aW9uOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNDdXJyZW50KGdlbmVyYXRpb24pKSB7XG5cdFx0XHRzb3VyY2UuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zb3VyY2UudmFsdWUgPSBzb3VyY2U7XG5cdH1cblxuXHRzZXRQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uOiBJTGlua1ByZXNlbnRhdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMucHJlc2VudGF0aW9uLnNldChwcmVzZW50YXRpb24sIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY2Fub25pY2FsaXplUmVzb3VyY2UocHJvdmlkZXJJZDogc3RyaW5nLCByZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke3Byb3ZpZGVySWR9XFwwJHtyZXNvdXJjZS50b1N0cmluZyh0cnVlKX1gO1xufVxuXG5mdW5jdGlvbiByZWFkVXJpUGF0dGVybihzb3VyY2U6IHN0cmluZyk6IFJlZ0V4cCB8IHVuZGVmaW5lZCB7XG5cdGlmIChzb3VyY2UubGVuZ3RoID4gdXJpUGF0dGVybkxlbmd0aExpbWl0IHx8ICFzb3VyY2Uuc3RhcnRzV2l0aCgnXicpIHx8ICFzb3VyY2UuZW5kc1dpdGgoJyQnKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRyZXR1cm4gbmV3IFJlZ0V4cChzb3VyY2UsICdpJyk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplVXJpUGF0dGVybihwYXR0ZXJuOiBSZWdFeHApOiBSZWdFeHAge1xuXHRjb25zdCBmbGFncyA9IHBhdHRlcm4uZmxhZ3MucmVwbGFjZSgvW2d5XS9nLCAnJyk7XG5cdHJldHVybiBuZXcgUmVnRXhwKHBhdHRlcm4uc291cmNlLCBmbGFncyk7XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXNVcmlQYXR0ZXJuKHBhdHRlcm46IFJlZ0V4cCwgdmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRwYXR0ZXJuLmxhc3RJbmRleCA9IDA7XG5cdHJldHVybiBwYXR0ZXJuLnRlc3QodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBpc1JlY29yZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGw7XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElEYXRhQ2hhbm5lbFNlcnZpY2UsIERhdGFDaGFubmVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTGlua1ByZXNlbnRhdGlvblNlcnZpY2UsIExpbmtQcmVzZW50YXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxlQUFlLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQ3pHLFNBQVMsU0FBOEIsdUJBQXVCO0FBRTlELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTZDLHFCQUFpSSwwQkFBMEUsNkJBQTZCO0FBQ3JSLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLCtCQUErQjtBQUNyQyxNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHdCQUF3QjtBQXVDOUIsTUFBTSx5Q0FBeUMsbUJBQW1CLHVCQUFn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
