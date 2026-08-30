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
import { equals } from "../../../../../base/common/arrays.js";
import { Throttler } from "../../../../../base/common/async.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { StorageScope } from "../../../../../platform/storage/common/storage.js";
import { getMcpServerMapping } from "../mcpConfigFileUtils.js";
import { mcpConfigurationSection } from "../mcpConfiguration.js";
import { IMcpRegistry } from "../mcpRegistryTypes.js";
import { IMcpWorkbenchService, MCP_CONFIGURATION_COLLECTION_ID_PREFIX, McpCollectionDefinition, McpCollectionSortOrder, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust } from "../mcpTypes.js";
let InstalledMcpServersDiscovery = class extends Disposable {
  constructor(mcpWorkbenchService, mcpRegistry, textModelService, logService) {
    super();
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.mcpRegistry = mcpRegistry;
    this.textModelService = textModelService;
    this.logService = logService;
    this.fromGallery = true;
    this.collections = this._register(new DisposableMap());
  }
  start() {
    const throttler = this._register(new Throttler());
    this._register(this.mcpWorkbenchService.onChange(() => throttler.queue(() => this.sync())));
    this.sync();
  }
  async getServerIdMapping(resource, pathToServers) {
    const store = new DisposableStore();
    try {
      const ref = await this.textModelService.createModelReference(resource);
      store.add(ref);
      const serverIdMapping = getMcpServerMapping({ model: ref.object.textEditorModel, pathToServers });
      return serverIdMapping;
    } catch {
      return /* @__PURE__ */ new Map();
    } finally {
      store.dispose();
    }
  }
  async sync() {
    try {
      const collections = /* @__PURE__ */ new Map();
      const mcpConfigPathInfos = new ResourceMap();
      for (const server of this.mcpWorkbenchService.getEnabledLocalMcpServers()) {
        let mcpConfigPathPromise = mcpConfigPathInfos.get(server.mcpResource);
        if (!mcpConfigPathPromise) {
          mcpConfigPathPromise = (async (local) => {
            const mcpConfigPath2 = this.mcpWorkbenchService.getMcpConfigPath(local);
            const locations = mcpConfigPath2?.uri ? await this.getServerIdMapping(mcpConfigPath2?.uri, mcpConfigPath2.section ? [...mcpConfigPath2.section, "servers"] : ["servers"]) : /* @__PURE__ */ new Map();
            return mcpConfigPath2 ? { ...mcpConfigPath2, locations } : void 0;
          })(server);
          mcpConfigPathInfos.set(server.mcpResource, mcpConfigPathPromise);
        }
        const config = server.config;
        const mcpConfigPath = await mcpConfigPathPromise;
        const collectionId = `${MCP_CONFIGURATION_COLLECTION_ID_PREFIX}${mcpConfigPath ? mcpConfigPath.id : "unknown"}`;
        let definitions = collections.get(collectionId);
        if (!definitions) {
          definitions = [mcpConfigPath, []];
          collections.set(collectionId, definitions);
        }
        const launch = config.type === "http" ? {
          type: McpServerTransportType.HTTP,
          uri: URI.parse(config.url),
          headers: Object.entries(config.headers || {}),
          oauth: config.oauth
        } : {
          type: McpServerTransportType.Stdio,
          command: config.command,
          args: config.args || [],
          env: config.env || {},
          envFile: config.envFile,
          cwd: config.cwd,
          sandbox: server.rootSandbox
        };
        definitions[1].push({
          id: `${collectionId}.${server.name}`,
          label: server.name,
          launch,
          sandboxEnabled: config.type === "http" ? void 0 : config.sandboxEnabled,
          cacheNonce: await McpServerLaunch.hash(launch),
          roots: mcpConfigPath?.workspaceFolder ? [mcpConfigPath.workspaceFolder.uri] : void 0,
          variableReplacement: {
            folder: mcpConfigPath?.workspaceFolder,
            section: mcpConfigurationSection,
            target: mcpConfigPath?.target ?? ConfigurationTarget.USER
          },
          devMode: config.dev,
          presentation: {
            order: mcpConfigPath?.order,
            origin: mcpConfigPath?.locations.get(server.name)
          }
        });
      }
      for (const [id] of this.collections) {
        if (!collections.has(id)) {
          this.collections.deleteAndDispose(id);
        }
      }
      for (const [id, [mcpConfigPath, serverDefinitions]] of collections) {
        const newServerDefinitions = observableValue(this, serverDefinitions);
        const newCollection = {
          id,
          label: mcpConfigPath?.label ?? "",
          order: mcpConfigPath?.order ?? McpCollectionSortOrder.User,
          presentation: {
            origin: mcpConfigPath?.uri
          },
          remoteAuthority: mcpConfigPath?.remoteAuthority ?? null,
          serverDefinitions: newServerDefinitions,
          trustBehavior: McpServerTrust.Kind.Trusted,
          configTarget: mcpConfigPath?.target ?? ConfigurationTarget.USER,
          scope: mcpConfigPath?.scope ?? StorageScope.PROFILE
        };
        const existingCollection = this.collections.get(id);
        const collectionDefinitionsChanged = existingCollection ? !McpCollectionDefinition.equals(existingCollection.definition, newCollection) : true;
        if (!collectionDefinitionsChanged) {
          const serverDefinitionsChanged = existingCollection ? !equals(existingCollection.definition.serverDefinitions.get(), newCollection.serverDefinitions.get(), McpServerDefinition.equals) : true;
          if (serverDefinitionsChanged) {
            existingCollection?.serverDefinitions.set(serverDefinitions, void 0);
          }
          continue;
        }
        this.collections.deleteAndDispose(id);
        const disposable = this.mcpRegistry.registerCollection(newCollection);
        this.collections.set(id, {
          definition: newCollection,
          serverDefinitions: newServerDefinitions,
          dispose: () => disposable.dispose()
        });
      }
    } catch (error) {
      this.logService.error(error);
    }
  }
};
InstalledMcpServersDiscovery = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService),
  __decorateParam(1, IMcpRegistry),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ILogService)
], InstalledMcpServersDiscovery);
export {
  InstalledMcpServersDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxkaXNjb3ZlcnlcXGluc3RhbGxlZE1jcFNlcnZlcnNEaXNjb3ZlcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlciB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL21jcC9jb21tb24vbWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0TWNwU2VydmVyTWFwcGluZyB9IGZyb20gJy4uL21jcENvbmZpZ0ZpbGVVdGlscy5qcyc7XG5pbXBvcnQgeyBtY3BDb25maWd1cmF0aW9uU2VjdGlvbiB9IGZyb20gJy4uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwQ29uZmlnUGF0aCwgSU1jcFdvcmtiZW5jaFNlcnZpY2UsIE1DUF9DT05GSUdVUkFUSU9OX0NPTExFQ1RJT05fSURfUFJFRklYLCBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgTWNwQ29sbGVjdGlvblNvcnRPcmRlciwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLCBNY3BTZXJ2ZXJUcnVzdCB9IGZyb20gJy4uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BEaXNjb3ZlcnkgfSBmcm9tICcuL21jcERpc2NvdmVyeS5qcyc7XG5cbmludGVyZmFjZSBDb2xsZWN0aW9uU3RhdGUgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGRlZmluaXRpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uO1xuXHRzZXJ2ZXJEZWZpbml0aW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBNY3BTZXJ2ZXJEZWZpbml0aW9uW10+O1xufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbGVkTWNwU2VydmVyc0Rpc2NvdmVyeSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwRGlzY292ZXJ5IHtcblxuXHRyZWFkb25seSBmcm9tR2FsbGVyeSA9IHRydWU7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29sbGVjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIENvbGxlY3Rpb25TdGF0ZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElNY3BSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IG1jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnksXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhcnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoKCkgPT4gdGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMuc3luYygpKSkpO1xuXHRcdHRoaXMuc3luYygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXJ2ZXJJZE1hcHBpbmcocmVzb3VyY2U6IFVSSSwgcGF0aFRvU2VydmVyczogc3RyaW5nW10pOiBQcm9taXNlPE1hcDxzdHJpbmcsIExvY2F0aW9uPj4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZik7XG5cdFx0XHRjb25zdCBzZXJ2ZXJJZE1hcHBpbmcgPSBnZXRNY3BTZXJ2ZXJNYXBwaW5nKHsgbW9kZWw6IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBwYXRoVG9TZXJ2ZXJzIH0pO1xuXHRcdFx0cmV0dXJuIHNlcnZlcklkTWFwcGluZztcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBuZXcgTWFwKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN5bmMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbGxlY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIFtJTWNwQ29uZmlnUGF0aCB8IHVuZGVmaW5lZCwgTWNwU2VydmVyRGVmaW5pdGlvbltdXT4oKTtcblx0XHRcdGNvbnN0IG1jcENvbmZpZ1BhdGhJbmZvcyA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPElNY3BDb25maWdQYXRoICYgeyBsb2NhdGlvbnM6IE1hcDxzdHJpbmcsIExvY2F0aW9uPiB9IHwgdW5kZWZpbmVkPj4oKTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkpIHtcblx0XHRcdFx0bGV0IG1jcENvbmZpZ1BhdGhQcm9taXNlID0gbWNwQ29uZmlnUGF0aEluZm9zLmdldChzZXJ2ZXIubWNwUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIW1jcENvbmZpZ1BhdGhQcm9taXNlKSB7XG5cdFx0XHRcdFx0bWNwQ29uZmlnUGF0aFByb21pc2UgPSAoYXN5bmMgKGxvY2FsOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXIpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IG1jcENvbmZpZ1BhdGggPSB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuZ2V0TWNwQ29uZmlnUGF0aChsb2NhbCk7XG5cdFx0XHRcdFx0XHRjb25zdCBsb2NhdGlvbnMgPSBtY3BDb25maWdQYXRoPy51cmkgPyBhd2FpdCB0aGlzLmdldFNlcnZlcklkTWFwcGluZyhtY3BDb25maWdQYXRoPy51cmksIG1jcENvbmZpZ1BhdGguc2VjdGlvbiA/IFsuLi5tY3BDb25maWdQYXRoLnNlY3Rpb24sICdzZXJ2ZXJzJ10gOiBbJ3NlcnZlcnMnXSkgOiBuZXcgTWFwKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbWNwQ29uZmlnUGF0aCA/IHsgLi4ubWNwQ29uZmlnUGF0aCwgbG9jYXRpb25zIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSkoc2VydmVyKTtcblx0XHRcdFx0XHRtY3BDb25maWdQYXRoSW5mb3Muc2V0KHNlcnZlci5tY3BSZXNvdXJjZSwgbWNwQ29uZmlnUGF0aFByb21pc2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY29uZmlnID0gc2VydmVyLmNvbmZpZztcblx0XHRcdFx0Y29uc3QgbWNwQ29uZmlnUGF0aCA9IGF3YWl0IG1jcENvbmZpZ1BhdGhQcm9taXNlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0aW9uSWQgPSBgJHtNQ1BfQ09ORklHVVJBVElPTl9DT0xMRUNUSU9OX0lEX1BSRUZJWH0ke21jcENvbmZpZ1BhdGggPyBtY3BDb25maWdQYXRoLmlkIDogJ3Vua25vd24nfWA7XG5cblx0XHRcdFx0bGV0IGRlZmluaXRpb25zID0gY29sbGVjdGlvbnMuZ2V0KGNvbGxlY3Rpb25JZCk7XG5cdFx0XHRcdGlmICghZGVmaW5pdGlvbnMpIHtcblx0XHRcdFx0XHRkZWZpbml0aW9ucyA9IFttY3BDb25maWdQYXRoLCBbXV07XG5cdFx0XHRcdFx0Y29sbGVjdGlvbnMuc2V0KGNvbGxlY3Rpb25JZCwgZGVmaW5pdGlvbnMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2ggPSBjb25maWcudHlwZSA9PT0gJ2h0dHAnID8ge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCxcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjb25maWcudXJsKSxcblx0XHRcdFx0XHRoZWFkZXJzOiBPYmplY3QuZW50cmllcyhjb25maWcuaGVhZGVycyB8fCB7fSksXG5cdFx0XHRcdFx0b2F1dGg6IGNvbmZpZy5vYXV0aCxcblx0XHRcdFx0fSA6IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGNvbmZpZy5jb21tYW5kLFxuXHRcdFx0XHRcdGFyZ3M6IGNvbmZpZy5hcmdzIHx8IFtdLFxuXHRcdFx0XHRcdGVudjogY29uZmlnLmVudiB8fCB7fSxcblx0XHRcdFx0XHRlbnZGaWxlOiBjb25maWcuZW52RmlsZSxcblx0XHRcdFx0XHRjd2Q6IGNvbmZpZy5jd2QsXG5cdFx0XHRcdFx0c2FuZGJveDogc2VydmVyLnJvb3RTYW5kYm94XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0ZGVmaW5pdGlvbnNbMV0ucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IGAke2NvbGxlY3Rpb25JZH0uJHtzZXJ2ZXIubmFtZX1gLFxuXHRcdFx0XHRcdGxhYmVsOiBzZXJ2ZXIubmFtZSxcblx0XHRcdFx0XHRsYXVuY2gsXG5cdFx0XHRcdFx0c2FuZGJveEVuYWJsZWQ6IGNvbmZpZy50eXBlID09PSAnaHR0cCcgPyB1bmRlZmluZWQgOiBjb25maWcuc2FuZGJveEVuYWJsZWQsXG5cdFx0XHRcdFx0Y2FjaGVOb25jZTogYXdhaXQgTWNwU2VydmVyTGF1bmNoLmhhc2gobGF1bmNoKSxcblx0XHRcdFx0XHRyb290czogbWNwQ29uZmlnUGF0aD8ud29ya3NwYWNlRm9sZGVyID8gW21jcENvbmZpZ1BhdGgud29ya3NwYWNlRm9sZGVyLnVyaV0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dmFyaWFibGVSZXBsYWNlbWVudDoge1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiBtY3BDb25maWdQYXRoPy53b3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHRcdFx0XHRzZWN0aW9uOiBtY3BDb25maWd1cmF0aW9uU2VjdGlvbixcblx0XHRcdFx0XHRcdHRhcmdldDogbWNwQ29uZmlnUGF0aD8udGFyZ2V0ID8/IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRldk1vZGU6IGNvbmZpZy5kZXYsXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiB7XG5cdFx0XHRcdFx0XHRvcmRlcjogbWNwQ29uZmlnUGF0aD8ub3JkZXIsXG5cdFx0XHRcdFx0XHRvcmlnaW46IG1jcENvbmZpZ1BhdGg/LmxvY2F0aW9ucy5nZXQoc2VydmVyLm5hbWUpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBbaWRdIG9mIHRoaXMuY29sbGVjdGlvbnMpIHtcblx0XHRcdFx0aWYgKCFjb2xsZWN0aW9ucy5oYXMoaWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5jb2xsZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IFtpZCwgW21jcENvbmZpZ1BhdGgsIHNlcnZlckRlZmluaXRpb25zXV0gb2YgY29sbGVjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgbmV3U2VydmVyRGVmaW5pdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgTWNwU2VydmVyRGVmaW5pdGlvbltdPih0aGlzLCBzZXJ2ZXJEZWZpbml0aW9ucyk7XG5cdFx0XHRcdGNvbnN0IG5ld0NvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uID0ge1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdGxhYmVsOiBtY3BDb25maWdQYXRoPy5sYWJlbCA/PyAnJyxcblx0XHRcdFx0XHRvcmRlcjogbWNwQ29uZmlnUGF0aD8ub3JkZXIgPz8gTWNwQ29sbGVjdGlvblNvcnRPcmRlci5Vc2VyLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHRcdFx0b3JpZ2luOiBtY3BDb25maWdQYXRoPy51cmksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IG1jcENvbmZpZ1BhdGg/LnJlbW90ZUF1dGhvcml0eSA/PyBudWxsLFxuXHRcdFx0XHRcdHNlcnZlckRlZmluaXRpb25zOiBuZXdTZXJ2ZXJEZWZpbml0aW9ucyxcblx0XHRcdFx0XHR0cnVzdEJlaGF2aW9yOiBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWQsXG5cdFx0XHRcdFx0Y29uZmlnVGFyZ2V0OiBtY3BDb25maWdQYXRoPy50YXJnZXQgPz8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRcdHNjb3BlOiBtY3BDb25maWdQYXRoPy5zY29wZSA/PyBTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdDb2xsZWN0aW9uID0gdGhpcy5jb2xsZWN0aW9ucy5nZXQoaWQpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbGxlY3Rpb25EZWZpbml0aW9uc0NoYW5nZWQgPSBleGlzdGluZ0NvbGxlY3Rpb24gPyAhTWNwQ29sbGVjdGlvbkRlZmluaXRpb24uZXF1YWxzKGV4aXN0aW5nQ29sbGVjdGlvbi5kZWZpbml0aW9uLCBuZXdDb2xsZWN0aW9uKSA6IHRydWU7XG5cdFx0XHRcdGlmICghY29sbGVjdGlvbkRlZmluaXRpb25zQ2hhbmdlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHNlcnZlckRlZmluaXRpb25zQ2hhbmdlZCA9IGV4aXN0aW5nQ29sbGVjdGlvbiA/ICFlcXVhbHMoZXhpc3RpbmdDb2xsZWN0aW9uLmRlZmluaXRpb24uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCksIG5ld0NvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCksIE1jcFNlcnZlckRlZmluaXRpb24uZXF1YWxzKSA6IHRydWU7XG5cdFx0XHRcdFx0aWYgKHNlcnZlckRlZmluaXRpb25zQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0ZXhpc3RpbmdDb2xsZWN0aW9uPy5zZXJ2ZXJEZWZpbml0aW9ucy5zZXQoc2VydmVyRGVmaW5pdGlvbnMsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5jb2xsZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMubWNwUmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKG5ld0NvbGxlY3Rpb24pO1xuXHRcdFx0XHR0aGlzLmNvbGxlY3Rpb25zLnNldChpZCwge1xuXHRcdFx0XHRcdGRlZmluaXRpb246IG5ld0NvbGxlY3Rpb24sXG5cdFx0XHRcdFx0c2VydmVyRGVmaW5pdGlvbnM6IG5ld1NlcnZlckRlZmluaXRpb25zLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFlBQVksZUFBZSx1QkFBb0M7QUFDeEUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBOEIsdUJBQXVCO0FBQ3JELFNBQVMsV0FBVztBQUVwQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQjtBQUM3QixTQUF5QixzQkFBc0Isd0NBQXdDLHlCQUF5Qix3QkFBd0IscUJBQXFCLGlCQUFpQix3QkFBd0Isc0JBQXNCO0FBUXJOLElBQU0sK0JBQU4sY0FBMkMsV0FBb0M7QUFBQSxFQUtyRixZQUN3QyxxQkFDUixhQUNLLGtCQUNOLFlBQzdCO0FBQ0QsVUFBTTtBQUxpQztBQUNSO0FBQ0s7QUFDTjtBQVAvQixTQUFTLGNBQWM7QUFDdkIsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSxjQUF1QyxDQUFDO0FBQUEsRUFTMUY7QUFBQSxFQUVPLFFBQWM7QUFDcEIsVUFBTSxZQUFZLEtBQUssVUFBVSxJQUFJLFVBQVUsQ0FBQztBQUNoRCxTQUFLLFVBQVUsS0FBSyxvQkFBb0IsU0FBUyxNQUFNLFVBQVUsTUFBTSxNQUFNLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQztBQUMxRixTQUFLLEtBQUs7QUFBQSxFQUNYO0FBQUEsRUFFQSxNQUFjLG1CQUFtQixVQUFlLGVBQXlEO0FBQ3hHLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxRQUFJO0FBQ0gsWUFBTSxNQUFNLE1BQU0sS0FBSyxpQkFBaUIscUJBQXFCLFFBQVE7QUFD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QVksaUJBQWlCLEVBQUU7QUFBQSxRQUNyQztBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxDQUFDLElBQUksQ0FBQyxlQUFlLGlCQUFpQixDQUFDLEtBQUssYUFBYTtBQUNuRSxjQUFNLHVCQUF1QixnQkFBZ0QsTUFBTSxpQkFBaUI7QUFDcEcsY0FBTSxnQkFBeUM7QUFBQSxVQUM5QztBQUFBLFVBQ0EsT0FBTyxlQUFlLFNBQVM7QUFBQSxVQUMvQixPQUFPLGVBQWUsU0FBUyx1QkFBdUI7QUFBQSxVQUN0RCxjQUFjO0FBQUEsWUFDYixRQUFRLGVBQWU7QUFBQSxVQUN4QjtBQUFBLFVBQ0EsaUJBQWlCLGVBQWUsbUJBQW1CO0FBQUEsVUFDbkQsbUJBQW1CO0FBQUEsVUFDbkIsZUFBZSxlQUFlLEtBQUs7QUFBQSxVQUNuQyxjQUFjLGVBQWUsVUFBVSxvQkFBb0I7QUFBQSxVQUMzRCxPQUFPLGVBQWUsU0FBUyxhQUFhO0FBQUEsUUFDN0M7QUFDQSxjQUFNLHFCQUFxQixLQUFLLFlBQVksSUFBSSxFQUFFO0FBRWxELGNBQU0sK0JBQStCLHFCQUFxQixDQUFDLHdCQUF3QixPQUFPLG1CQUFtQixZQUFZLGFBQWEsSUFBSTtBQUMxSSxZQUFJLENBQUMsOEJBQThCO0FBQ2xDLGdCQUFNLDJCQUEyQixxQkFBcUIsQ0FBQyxPQUFPLG1CQUFtQixXQUFXLGtCQUFrQixJQUFJLEdBQUcsY0FBYyxrQkFBa0IsSUFBSSxHQUFHLG9CQUFvQixNQUFNLElBQUk7QUFDMUwsY0FBSSwwQkFBMEI7QUFDN0IsZ0NBQW9CLGtCQUFrQixJQUFJLG1CQUFtQixNQUFTO0FBQUEsVUFDdkU7QUFDQTtBQUFBLFFBQ0Q7QUFFQSxhQUFLLFlBQVksaUJBQWlCLEVBQUU7QUFDcEMsY0FBTSxhQUFhLEtBQUssWUFBWSxtQkFBbUIsYUFBYTtBQUNwRSxhQUFLLFlBQVksSUFBSSxJQUFJO0FBQUEsVUFDeEIsWUFBWTtBQUFBLFVBQ1osbUJBQW1CO0FBQUEsVUFDbkIsU0FBUyxNQUFNLFdBQVcsUUFBUTtBQUFBLFFBQ25DLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFFRCxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSxLQUFLO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQ0Q7QUEzSWEsK0JBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFsibWNwQ29uZmlnUGF0aCJdCn0K
