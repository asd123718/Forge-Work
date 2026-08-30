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
import { Disposable, DisposableMap } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { isFalsyOrWhitespace } from "../../../../../base/common/strings.js";
import { localize } from "../../../../../nls.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import * as extensionsRegistry from "../../../../services/extensions/common/extensionsRegistry.js";
import { mcpActivationEvent, mcpContributionPoint } from "../mcpConfiguration.js";
import { IMcpRegistry } from "../mcpRegistryTypes.js";
import { extensionPrefixedIdentifier, McpCollectionSortOrder, McpServerDefinition, McpServerTrust } from "../mcpTypes.js";
const cacheKey = "mcp.extCachedServers";
const _mcpExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint(mcpContributionPoint);
var PersistWhen = /* @__PURE__ */ ((PersistWhen2) => {
  PersistWhen2[PersistWhen2["CollectionExists"] = 0] = "CollectionExists";
  PersistWhen2[PersistWhen2["Always"] = 1] = "Always";
  return PersistWhen2;
})(PersistWhen || {});
let ExtensionMcpDiscovery = class extends Disposable {
  constructor(_mcpRegistry, storageService, _extensionService, _contextKeyService) {
    super();
    this._mcpRegistry = _mcpRegistry;
    this._extensionService = _extensionService;
    this._contextKeyService = _contextKeyService;
    this.fromGallery = false;
    this._extensionCollectionIdsToPersist = /* @__PURE__ */ new Map();
    this._conditionalCollections = this._register(new DisposableMap());
    this.cachedServers = storageService.getObject(cacheKey, StorageScope.WORKSPACE, {});
    this._register(storageService.onWillSaveState(() => {
      let updated = false;
      for (const [collectionId, behavior] of this._extensionCollectionIdsToPersist.entries()) {
        const collection = this._mcpRegistry.collections.get().find((c) => c.id === collectionId);
        let defs = collection?.serverDefinitions.get();
        if (!collection || collection.lazy) {
          if (behavior === 1 /* Always */) {
            defs = [];
          } else {
            continue;
          }
        }
        if (defs) {
          updated = true;
          this.cachedServers[collectionId] = { servers: defs.map(McpServerDefinition.toSerialized) };
        }
      }
      if (updated) {
        storageService.store(cacheKey, this.cachedServers, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    }));
  }
  start() {
    const extensionCollections = this._register(new DisposableMap());
    this._register(_mcpExtensionPoint.setHandler((_extensions, delta) => {
      const { added, removed } = delta;
      for (const collections of removed) {
        for (const coll of collections.value) {
          const id = extensionPrefixedIdentifier(collections.description.identifier, coll.id);
          extensionCollections.deleteAndDispose(id);
          this._conditionalCollections.deleteAndDispose(id);
        }
      }
      for (const collections of added) {
        if (!ExtensionMcpDiscovery._validate(collections)) {
          continue;
        }
        for (const coll of collections.value) {
          const id = extensionPrefixedIdentifier(collections.description.identifier, coll.id);
          this._extensionCollectionIdsToPersist.set(id, 0 /* CollectionExists */);
          if (coll.when) {
            this._registerConditionalCollection(id, coll, collections, extensionCollections);
          } else {
            this._registerCollection(id, coll, collections, extensionCollections);
          }
        }
      }
    }));
  }
  _registerCollection(id, coll, collections, extensionCollections) {
    const serverDefs = this.cachedServers.hasOwnProperty(id) ? this.cachedServers[id].servers : void 0;
    const dispo = this._mcpRegistry.registerCollection({
      id,
      label: coll.label,
      remoteAuthority: null,
      trustBehavior: McpServerTrust.Kind.Trusted,
      scope: StorageScope.WORKSPACE,
      configTarget: ConfigurationTarget.USER,
      order: McpCollectionSortOrder.Extension,
      serverDefinitions: observableValue(this, serverDefs?.map(McpServerDefinition.fromSerialized) || []),
      lazy: {
        isCached: !!serverDefs,
        load: () => this._activateExtensionServers(coll.id).then(() => {
          this._extensionCollectionIdsToPersist.set(id, 1 /* Always */);
        }),
        removed: () => {
          extensionCollections.deleteAndDispose(id);
          this._conditionalCollections.deleteAndDispose(id);
        }
      },
      source: collections.description.identifier
    });
    extensionCollections.set(id, dispo);
  }
  _registerConditionalCollection(id, coll, collections, extensionCollections) {
    const whenClause = ContextKeyExpr.deserialize(coll.when);
    if (!whenClause) {
      return;
    }
    const evaluate = () => {
      const nowSatisfied = this._contextKeyService.contextMatchesRules(whenClause);
      const isRegistered = extensionCollections.has(id);
      if (nowSatisfied && !isRegistered) {
        this._registerCollection(id, coll, collections, extensionCollections);
      } else if (!nowSatisfied && isRegistered) {
        extensionCollections.deleteAndDispose(id);
      }
    };
    const contextKeyListener = this._contextKeyService.onDidChangeContext(evaluate);
    evaluate();
    this._conditionalCollections.set(id, contextKeyListener);
  }
  async _activateExtensionServers(collectionId) {
    await this._extensionService.activateByEvent(mcpActivationEvent(collectionId));
    await Promise.all(this._mcpRegistry.delegates.get().map((r) => r.waitForInitialProviderPromises()));
  }
  static _validate(user) {
    if (!Array.isArray(user.value)) {
      user.collector.error(localize("invalidData", "Expected an array of MCP collections"));
      return false;
    }
    for (const contribution of user.value) {
      if (typeof contribution.id !== "string" || isFalsyOrWhitespace(contribution.id)) {
        user.collector.error(localize("invalidId", "Expected 'id' to be a non-empty string."));
        return false;
      }
      if (typeof contribution.label !== "string" || isFalsyOrWhitespace(contribution.label)) {
        user.collector.error(localize("invalidLabel", "Expected 'label' to be a non-empty string."));
        return false;
      }
      if (contribution.when !== void 0 && (typeof contribution.when !== "string" || isFalsyOrWhitespace(contribution.when))) {
        user.collector.error(localize("invalidWhen", "Expected 'when' to be a non-empty string."));
        return false;
      }
    }
    return true;
  }
};
ExtensionMcpDiscovery = __decorateClass([
  __decorateParam(0, IMcpRegistry),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IContextKeyService)
], ExtensionMcpDiscovery);
export {
  ExtensionMcpDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxkaXNjb3ZlcnlcXGV4dGVuc2lvbk1jcERpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTWNwQ29sbGVjdGlvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBleHRlbnNpb25zUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IG1jcEFjdGl2YXRpb25FdmVudCwgbWNwQ29udHJpYnV0aW9uUG9pbnQgfSBmcm9tICcuLi9tY3BDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgZXh0ZW5zaW9uUHJlZml4ZWRJZGVudGlmaWVyLCBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJUcnVzdCB9IGZyb20gJy4uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BEaXNjb3ZlcnkgfSBmcm9tICcuL21jcERpc2NvdmVyeS5qcyc7XG5cbmNvbnN0IGNhY2hlS2V5ID0gJ21jcC5leHRDYWNoZWRTZXJ2ZXJzJztcblxuaW50ZXJmYWNlIElTZXJ2ZXJDYWNoZUVudHJ5IHtcblx0cmVhZG9ubHkgc2VydmVyczogcmVhZG9ubHkgTWNwU2VydmVyRGVmaW5pdGlvbi5TZXJpYWxpemVkW107XG59XG5cbmNvbnN0IF9tY3BFeHRlbnNpb25Qb2ludCA9IGV4dGVuc2lvbnNSZWdpc3RyeS5FeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludChtY3BDb250cmlidXRpb25Qb2ludCk7XG5cbmNvbnN0IGVudW0gUGVyc2lzdFdoZW4ge1xuXHRDb2xsZWN0aW9uRXhpc3RzLFxuXHRBbHdheXMsXG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NY3BEaXNjb3ZlcnkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcERpc2NvdmVyeSB7XG5cblx0cmVhZG9ubHkgZnJvbUdhbGxlcnkgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Db2xsZWN0aW9uSWRzVG9QZXJzaXN0ID0gbmV3IE1hcDxzdHJpbmcsIFBlcnNpc3RXaGVuPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlZFNlcnZlcnM6IHsgW2NvbGxjZXRpb25JZDogc3RyaW5nXTogSVNlcnZlckNhY2hlRW50cnkgfTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZGl0aW9uYWxDb2xsZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IF9tY3BSZWdpc3RyeTogSU1jcFJlZ2lzdHJ5LFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY2FjaGVkU2VydmVycyA9IHN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChjYWNoZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwge30pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdGxldCB1cGRhdGVkID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IFtjb2xsZWN0aW9uSWQsIGJlaGF2aW9yXSBvZiB0aGlzLl9leHRlbnNpb25Db2xsZWN0aW9uSWRzVG9QZXJzaXN0LmVudHJpZXMoKSkge1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0aW9uID0gdGhpcy5fbWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IGNvbGxlY3Rpb25JZCk7XG5cdFx0XHRcdGxldCBkZWZzID0gY29sbGVjdGlvbj8uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCk7XG5cdFx0XHRcdGlmICghY29sbGVjdGlvbiB8fCBjb2xsZWN0aW9uLmxhenkpIHtcblx0XHRcdFx0XHRpZiAoYmVoYXZpb3IgPT09IFBlcnNpc3RXaGVuLkFsd2F5cykge1xuXHRcdFx0XHRcdFx0ZGVmcyA9IFtdO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZGVmcykge1xuXHRcdFx0XHRcdHVwZGF0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuY2FjaGVkU2VydmVyc1tjb2xsZWN0aW9uSWRdID0geyBzZXJ2ZXJzOiBkZWZzLm1hcChNY3BTZXJ2ZXJEZWZpbml0aW9uLnRvU2VyaWFsaXplZCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodXBkYXRlZCkge1xuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShjYWNoZUtleSwgdGhpcy5jYWNoZWRTZXJ2ZXJzLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBzdGFydCgpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25Db2xsZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX21jcEV4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoKF9leHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Y29uc3QgeyBhZGRlZCwgcmVtb3ZlZCB9ID0gZGVsdGE7XG5cblx0XHRcdGZvciAoY29uc3QgY29sbGVjdGlvbnMgb2YgcmVtb3ZlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbGwgb2YgY29sbGVjdGlvbnMudmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGV4dGVuc2lvblByZWZpeGVkSWRlbnRpZmllcihjb2xsZWN0aW9ucy5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBjb2xsLmlkKTtcblx0XHRcdFx0XHRleHRlbnNpb25Db2xsZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHRcdFx0XHR0aGlzLl9jb25kaXRpb25hbENvbGxlY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgY29sbGVjdGlvbnMgb2YgYWRkZWQpIHtcblxuXHRcdFx0XHRpZiAoIUV4dGVuc2lvbk1jcERpc2NvdmVyeS5fdmFsaWRhdGUoY29sbGVjdGlvbnMpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbGwgb2YgY29sbGVjdGlvbnMudmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGV4dGVuc2lvblByZWZpeGVkSWRlbnRpZmllcihjb2xsZWN0aW9ucy5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBjb2xsLmlkKTtcblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25Db2xsZWN0aW9uSWRzVG9QZXJzaXN0LnNldChpZCwgUGVyc2lzdFdoZW4uQ29sbGVjdGlvbkV4aXN0cyk7XG5cblx0XHRcdFx0XHQvLyBIYW5kbGUgY29uZGl0aW9uYWwgY29sbGVjdGlvbnMgd2l0aCAnd2hlbicgY2xhdXNlXG5cdFx0XHRcdFx0aWYgKGNvbGwud2hlbikge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJDb25kaXRpb25hbENvbGxlY3Rpb24oaWQsIGNvbGwsIGNvbGxlY3Rpb25zLCBleHRlbnNpb25Db2xsZWN0aW9ucyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFJlZ2lzdGVyIGNvbGxlY3Rpb24gaW1tZWRpYXRlbHkgaWYgbm8gJ3doZW4nIGNsYXVzZVxuXHRcdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJDb2xsZWN0aW9uKGlkLCBjb2xsLCBjb2xsZWN0aW9ucywgZXh0ZW5zaW9uQ29sbGVjdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQ29sbGVjdGlvbihcblx0XHRpZDogc3RyaW5nLFxuXHRcdGNvbGw6IElNY3BDb2xsZWN0aW9uQ29udHJpYnV0aW9uLFxuXHRcdGNvbGxlY3Rpb25zOiBleHRlbnNpb25zUmVnaXN0cnkuSUV4dGVuc2lvblBvaW50VXNlcjxJTWNwQ29sbGVjdGlvbkNvbnRyaWJ1dGlvbltdPixcblx0XHRleHRlbnNpb25Db2xsZWN0aW9uczogRGlzcG9zYWJsZU1hcDxzdHJpbmc+XG5cdCkge1xuXHRcdGNvbnN0IHNlcnZlckRlZnMgPSB0aGlzLmNhY2hlZFNlcnZlcnMuaGFzT3duUHJvcGVydHkoaWQpID8gdGhpcy5jYWNoZWRTZXJ2ZXJzW2lkXS5zZXJ2ZXJzIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRpc3BvID0gdGhpcy5fbWNwUmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKHtcblx0XHRcdGlkLFxuXHRcdFx0bGFiZWw6IGNvbGwubGFiZWwsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IG51bGwsXG5cdFx0XHR0cnVzdEJlaGF2aW9yOiBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWQsXG5cdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRSxcblx0XHRcdGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0b3JkZXI6IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuRXh0ZW5zaW9uLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZTxNY3BTZXJ2ZXJEZWZpbml0aW9uW10+KHRoaXMsIHNlcnZlckRlZnM/Lm1hcChNY3BTZXJ2ZXJEZWZpbml0aW9uLmZyb21TZXJpYWxpemVkKSB8fCBbXSksXG5cdFx0XHRsYXp5OiB7XG5cdFx0XHRcdGlzQ2FjaGVkOiAhIXNlcnZlckRlZnMsXG5cdFx0XHRcdGxvYWQ6ICgpID0+IHRoaXMuX2FjdGl2YXRlRXh0ZW5zaW9uU2VydmVycyhjb2xsLmlkKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHQvLyBwZXJzaXN0IChhbiBlbXB0eSBjb2xsZWN0aW9uKSBpbiBjYXNlIHRoZSBleHRlbnNpb24gZG9lc24ndCBlbmQgdXAgcHVibGlzaGluZyBvbmVcblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25Db2xsZWN0aW9uSWRzVG9QZXJzaXN0LnNldChpZCwgUGVyc2lzdFdoZW4uQWx3YXlzKTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdHJlbW92ZWQ6ICgpID0+IHtcblx0XHRcdFx0XHRleHRlbnNpb25Db2xsZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHRcdFx0XHR0aGlzLl9jb25kaXRpb25hbENvbGxlY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHNvdXJjZTogY29sbGVjdGlvbnMuZGVzY3JpcHRpb24uaWRlbnRpZmllclxuXHRcdH0pO1xuXG5cdFx0ZXh0ZW5zaW9uQ29sbGVjdGlvbnMuc2V0KGlkLCBkaXNwbyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckNvbmRpdGlvbmFsQ29sbGVjdGlvbihcblx0XHRpZDogc3RyaW5nLFxuXHRcdGNvbGw6IElNY3BDb2xsZWN0aW9uQ29udHJpYnV0aW9uLFxuXHRcdGNvbGxlY3Rpb25zOiBleHRlbnNpb25zUmVnaXN0cnkuSUV4dGVuc2lvblBvaW50VXNlcjxJTWNwQ29sbGVjdGlvbkNvbnRyaWJ1dGlvbltdPixcblx0XHRleHRlbnNpb25Db2xsZWN0aW9uczogRGlzcG9zYWJsZU1hcDxzdHJpbmc+XG5cdCkge1xuXHRcdGNvbnN0IHdoZW5DbGF1c2UgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShjb2xsLndoZW4hKTtcblx0XHRpZiAoIXdoZW5DbGF1c2UpIHtcblx0XHRcdC8vIEludmFsaWQgd2hlbiBjbGF1c2UsIHRyZWF0IGFzIGFsd2F5cyBmYWxzZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV2YWx1YXRlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm93U2F0aXNmaWVkID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh3aGVuQ2xhdXNlKTtcblx0XHRcdGNvbnN0IGlzUmVnaXN0ZXJlZCA9IGV4dGVuc2lvbkNvbGxlY3Rpb25zLmhhcyhpZCk7XG5cdFx0XHRpZiAobm93U2F0aXNmaWVkICYmICFpc1JlZ2lzdGVyZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJDb2xsZWN0aW9uKGlkLCBjb2xsLCBjb2xsZWN0aW9ucywgZXh0ZW5zaW9uQ29sbGVjdGlvbnMpO1xuXHRcdFx0fSBlbHNlIGlmICghbm93U2F0aXNmaWVkICYmIGlzUmVnaXN0ZXJlZCkge1xuXHRcdFx0XHRleHRlbnNpb25Db2xsZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY29udGV4dEtleUxpc3RlbmVyID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGV2YWx1YXRlKTtcblx0XHRldmFsdWF0ZSgpO1xuXG5cdFx0Ly8gU3RvcmUgZGlzcG9zYWJsZSBmb3IgdGhpcyBjb25kaXRpb25hbCBjb2xsZWN0aW9uXG5cdFx0dGhpcy5fY29uZGl0aW9uYWxDb2xsZWN0aW9ucy5zZXQoaWQsIGNvbnRleHRLZXlMaXN0ZW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY3RpdmF0ZUV4dGVuc2lvblNlcnZlcnMoY29sbGVjdGlvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChtY3BBY3RpdmF0aW9uRXZlbnQoY29sbGVjdGlvbklkKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy5fbWNwUmVnaXN0cnkuZGVsZWdhdGVzLmdldCgpXG5cdFx0XHQubWFwKHIgPT4gci53YWl0Rm9ySW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3ZhbGlkYXRlKHVzZXI6IGV4dGVuc2lvbnNSZWdpc3RyeS5JRXh0ZW5zaW9uUG9pbnRVc2VyPElNY3BDb2xsZWN0aW9uQ29udHJpYnV0aW9uW10+KTogYm9vbGVhbiB7XG5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodXNlci52YWx1ZSkpIHtcblx0XHRcdHVzZXIuY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdpbnZhbGlkRGF0YScsIFwiRXhwZWN0ZWQgYW4gYXJyYXkgb2YgTUNQIGNvbGxlY3Rpb25zXCIpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiB1c2VyLnZhbHVlKSB7XG5cdFx0XHRpZiAodHlwZW9mIGNvbnRyaWJ1dGlvbi5pZCAhPT0gJ3N0cmluZycgfHwgaXNGYWxzeU9yV2hpdGVzcGFjZShjb250cmlidXRpb24uaWQpKSB7XG5cdFx0XHRcdHVzZXIuY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdpbnZhbGlkSWQnLCBcIkV4cGVjdGVkICdpZCcgdG8gYmUgYSBub24tZW1wdHkgc3RyaW5nLlwiKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgY29udHJpYnV0aW9uLmxhYmVsICE9PSAnc3RyaW5nJyB8fCBpc0ZhbHN5T3JXaGl0ZXNwYWNlKGNvbnRyaWJ1dGlvbi5sYWJlbCkpIHtcblx0XHRcdFx0dXNlci5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2ludmFsaWRMYWJlbCcsIFwiRXhwZWN0ZWQgJ2xhYmVsJyB0byBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRyaWJ1dGlvbi53aGVuICE9PSB1bmRlZmluZWQgJiYgKHR5cGVvZiBjb250cmlidXRpb24ud2hlbiAhPT0gJ3N0cmluZycgfHwgaXNGYWxzeU9yV2hpdGVzcGFjZShjb250cmlidXRpb24ud2hlbikpKSB7XG5cdFx0XHRcdHVzZXIuY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdpbnZhbGlkV2hlbicsIFwiRXhwZWN0ZWQgJ3doZW4nIHRvIGJlIGEgbm9uLWVtcHR5IHN0cmluZy5cIikpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHFCQUFxQjtBQUMxQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUFn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
