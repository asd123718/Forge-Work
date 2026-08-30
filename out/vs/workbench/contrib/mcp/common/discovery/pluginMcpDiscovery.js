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
import { hash } from "../../../../../base/common/hash.js";
import { Disposable, DisposableResourceMap } from "../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun } from "../../../../../base/common/observable.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { McpServerType } from "../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { StorageScope } from "../../../../../platform/storage/common/storage.js";
import {
  IAgentPluginService
} from "../../../chat/common/plugins/agentPluginService.js";
import { isContributionEnabled } from "../../../chat/common/enablement.js";
import { IMcpRegistry } from "../mcpRegistryTypes.js";
import { MCP_PLUGIN_COLLECTION_ID_PREFIX, McpCollectionProvenance, McpCollectionSortOrder, McpServerTransportType, McpServerTrust } from "../mcpTypes.js";
import { MCP_PLUGIN_COLLECTION_ID_PREFIX as MCP_PLUGIN_COLLECTION_ID_PREFIX2 } from "../mcpTypes.js";
let PluginMcpDiscovery = class extends Disposable {
  constructor(_agentPluginService, _mcpRegistry) {
    super();
    this._agentPluginService = _agentPluginService;
    this._mcpRegistry = _mcpRegistry;
    this.fromGallery = false;
    this._collections = this._register(new DisposableResourceMap());
  }
  start() {
    this._register(autorun((reader) => {
      const plugins = this._agentPluginService.plugins.read(reader);
      const seen = new ResourceSet();
      for (const plugin of plugins) {
        if (!isContributionEnabled(plugin.enablement.read(reader))) {
          continue;
        }
        const servers = plugin.mcpServerDefinitions.read(reader);
        if (servers.length === 0) {
          continue;
        }
        seen.add(plugin.uri);
        let collectionState = this._collections.get(plugin.uri);
        if (!collectionState) {
          collectionState = this.createCollectionState(plugin, servers[0].uri);
          this._collections.set(plugin.uri, collectionState);
        }
      }
      for (const [pluginUri] of this._collections) {
        if (!seen.has(pluginUri)) {
          this._collections.deleteAndDispose(pluginUri);
        }
      }
    }));
  }
  createCollectionState(plugin, manifestURI) {
    const collectionId = `${MCP_PLUGIN_COLLECTION_ID_PREFIX}${plugin.uri}`;
    return this._mcpRegistry.registerCollection({
      id: collectionId,
      provenance: McpCollectionProvenance.Plugin,
      label: `${plugin.label} (Agent Plugin)`,
      remoteAuthority: plugin.uri.scheme === Schemas.vscodeRemote ? plugin.uri.authority : null,
      configTarget: ConfigurationTarget.USER,
      scope: StorageScope.PROFILE,
      trustBehavior: McpServerTrust.Kind.Trusted,
      serverDefinitions: plugin.mcpServerDefinitions.map((defs) => defs.map((d) => this._toServerDefinition(collectionId, d)).filter(isDefined)),
      order: McpCollectionSortOrder.Plugin,
      presentation: {
        origin: manifestURI
      }
    });
  }
  _toServerDefinition(collectionId, { name, configuration }) {
    const launch = this._toLaunch(configuration);
    if (!launch) {
      return void 0;
    }
    return {
      id: `${collectionId}.${name}`,
      label: name,
      launch,
      variableReplacement: { target: ConfigurationTarget.USER },
      cacheNonce: String(hash(launch))
    };
  }
  _toLaunch(config) {
    if (config.type === McpServerType.LOCAL) {
      return {
        type: McpServerTransportType.Stdio,
        command: config.command,
        args: config.args ? [...config.args] : [],
        env: config.env ? { ...config.env } : {},
        envFile: config.envFile,
        cwd: config.cwd,
        sandbox: void 0
      };
    }
    try {
      return {
        type: McpServerTransportType.HTTP,
        uri: URI.parse(config.url),
        headers: Object.entries(config.headers ?? {}),
        oauth: config.oauth
      };
    } catch {
      return void 0;
    }
  }
};
PluginMcpDiscovery = __decorateClass([
  __decorateParam(0, IAgentPluginService),
  __decorateParam(1, IMcpRegistry)
], PluginMcpDiscovery);
export {
  MCP_PLUGIN_COLLECTION_ID_PREFIX2 as MCP_PLUGIN_COLLECTION_ID_PREFIX,
  PluginMcpDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxkaXNjb3ZlcnlcXHBsdWdpbk1jcERpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIE1jcFNlcnZlclR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQge1xuXHRJQWdlbnRQbHVnaW4sXG5cdElBZ2VudFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb24sXG5cdElBZ2VudFBsdWdpblNlcnZpY2Vcbn0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNDb250cmlidXRpb25FbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBJTWNwUmVnaXN0cnkgfSBmcm9tICcuLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IE1DUF9QTFVHSU5fQ09MTEVDVElPTl9JRF9QUkVGSVgsIE1jcENvbGxlY3Rpb25Qcm92ZW5hbmNlLCBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJMYXVuY2gsIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUsIE1jcFNlcnZlclRydXN0IH0gZnJvbSAnLi4vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcERpc2NvdmVyeSB9IGZyb20gJy4vbWNwRGlzY292ZXJ5LmpzJztcblxuLyoqXG4gKiBQcmVmaXggdXNlZCBmb3IgdGhlIHtAbGluayBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbi5pZCB8IGNvbGxlY3Rpb24gaWR9IG9mXG4gKiBNQ1AgY29sbGVjdGlvbnMgY29udHJpYnV0ZWQgYnkgYWdlbnQgcGx1Z2lucy4gVGhlIHJlbWFpbmRlciBvZiB0aGUgaWQgaXNcbiAqIHRoZSBwbHVnaW4ncyBVUkkuIENvbnN1bWVycyBjYW4gdXNlIHRoaXMgdG8gdGVsbCBwbHVnaW4tc291cmNlZCBNQ1Agc2VydmVyc1xuICogYXBhcnQgZnJvbSBzZXJ2ZXJzIGNvbmZpZ3VyZWQgZGlyZWN0bHkgaW4gVlMgQ29kZS5cbiAqL1xuZXhwb3J0IHsgTUNQX1BMVUdJTl9DT0xMRUNUSU9OX0lEX1BSRUZJWCB9IGZyb20gJy4uL21jcFR5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFBsdWdpbk1jcERpc2NvdmVyeSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwRGlzY292ZXJ5IHtcblx0cmVhZG9ubHkgZnJvbUdhbGxlcnkgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2xsZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXAoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHRcdEBJTWNwUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBzdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5zID0gdGhpcy5fYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2VlbiA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgcGx1Z2lucykge1xuXHRcdFx0XHRpZiAoIWlzQ29udHJpYnV0aW9uRW5hYmxlZChwbHVnaW4uZW5hYmxlbWVudC5yZWFkKHJlYWRlcikpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2VydmVycyA9IHBsdWdpbi5tY3BTZXJ2ZXJEZWZpbml0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChzZXJ2ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2Vlbi5hZGQocGx1Z2luLnVyaSk7XG5cblx0XHRcdFx0bGV0IGNvbGxlY3Rpb25TdGF0ZSA9IHRoaXMuX2NvbGxlY3Rpb25zLmdldChwbHVnaW4udXJpKTtcblx0XHRcdFx0aWYgKCFjb2xsZWN0aW9uU3RhdGUpIHtcblx0XHRcdFx0XHQvLyBub3RlOiBhbGwgcGx1Z2luIHNlcnZlcnMgYXJlIGN1cnJlbnRseSBkZWZpbmVkIGluIHRoZSBzYW1lIGZpbGVcblx0XHRcdFx0XHRjb2xsZWN0aW9uU3RhdGUgPSB0aGlzLmNyZWF0ZUNvbGxlY3Rpb25TdGF0ZShwbHVnaW4sIHNlcnZlcnNbMF0udXJpKTtcblx0XHRcdFx0XHR0aGlzLl9jb2xsZWN0aW9ucy5zZXQocGx1Z2luLnVyaSwgY29sbGVjdGlvblN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IFtwbHVnaW5VcmldIG9mIHRoaXMuX2NvbGxlY3Rpb25zKSB7XG5cdFx0XHRcdGlmICghc2Vlbi5oYXMocGx1Z2luVXJpKSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbGxlY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UocGx1Z2luVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29sbGVjdGlvblN0YXRlKHBsdWdpbjogSUFnZW50UGx1Z2luLCBtYW5pZmVzdFVSSTogVVJJKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbklkID0gYCR7TUNQX1BMVUdJTl9DT0xMRUNUSU9OX0lEX1BSRUZJWH0ke3BsdWdpbi51cml9YDtcblx0XHRyZXR1cm4gdGhpcy5fbWNwUmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKHtcblx0XHRcdGlkOiBjb2xsZWN0aW9uSWQsXG5cdFx0XHRwcm92ZW5hbmNlOiBNY3BDb2xsZWN0aW9uUHJvdmVuYW5jZS5QbHVnaW4sXG5cdFx0XHRsYWJlbDogYCR7cGx1Z2luLmxhYmVsfSAoQWdlbnQgUGx1Z2luKWAsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHBsdWdpbi51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSA/IHBsdWdpbi51cmkuYXV0aG9yaXR5IDogbnVsbCxcblx0XHRcdGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0dHJ1c3RCZWhhdmlvcjogTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbnM6IHBsdWdpbi5tY3BTZXJ2ZXJEZWZpbml0aW9ucy5tYXAoZGVmcyA9PlxuXHRcdFx0XHRkZWZzLm1hcChkID0+IHRoaXMuX3RvU2VydmVyRGVmaW5pdGlvbihjb2xsZWN0aW9uSWQsIGQpKS5maWx0ZXIoaXNEZWZpbmVkKSksXG5cdFx0XHRvcmRlcjogTWNwQ29sbGVjdGlvblNvcnRPcmRlci5QbHVnaW4sXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0b3JpZ2luOiBtYW5pZmVzdFVSSSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF90b1NlcnZlckRlZmluaXRpb24oXG5cdFx0Y29sbGVjdGlvbklkOiBzdHJpbmcsXG5cdFx0eyBuYW1lLCBjb25maWd1cmF0aW9uIH06IElBZ2VudFBsdWdpbk1jcFNlcnZlckRlZmluaXRpb24sXG5cdCk6IE1jcFNlcnZlckRlZmluaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhdW5jaCA9IHRoaXMuX3RvTGF1bmNoKGNvbmZpZ3VyYXRpb24pO1xuXHRcdGlmICghbGF1bmNoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogYCR7Y29sbGVjdGlvbklkfS4ke25hbWV9YCxcblx0XHRcdGxhYmVsOiBuYW1lLFxuXHRcdFx0bGF1bmNoLFxuXHRcdFx0dmFyaWFibGVSZXBsYWNlbWVudDogeyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiB9LFxuXHRcdFx0Y2FjaGVOb25jZTogU3RyaW5nKGhhc2gobGF1bmNoKSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvTGF1bmNoKGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiBNY3BTZXJ2ZXJMYXVuY2ggfCB1bmRlZmluZWQge1xuXHRcdGlmIChjb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbyxcblx0XHRcdFx0Y29tbWFuZDogY29uZmlnLmNvbW1hbmQsXG5cdFx0XHRcdGFyZ3M6IGNvbmZpZy5hcmdzID8gWy4uLmNvbmZpZy5hcmdzXSA6IFtdLFxuXHRcdFx0XHRlbnY6IGNvbmZpZy5lbnYgPyB7IC4uLmNvbmZpZy5lbnYgfSA6IHt9LFxuXHRcdFx0XHRlbnZGaWxlOiBjb25maWcuZW52RmlsZSxcblx0XHRcdFx0Y3dkOiBjb25maWcuY3dkLFxuXHRcdFx0XHRzYW5kYm94OiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFAsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGNvbmZpZy51cmwpLFxuXHRcdFx0XHRoZWFkZXJzOiBPYmplY3QuZW50cmllcyhjb25maWcuaGVhZGVycyA/PyB7fSksXG5cdFx0XHRcdG9hdXRoOiBjb25maWcub2F1dGgsXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSw2QkFBNkI7QUFDbEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBa0MscUJBQXFCO0FBQ3ZELFNBQVMsb0JBQW9CO0FBQzdCO0FBQUEsRUFHQztBQUFBLE9BQ007QUFDUCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlDQUFpQyx5QkFBeUIsd0JBQThELHdCQUF3QixzQkFBc0I7QUFTL0ssU0FBUyxtQ0FBQUEsd0NBQXVDO0FBRXpDLElBQU0scUJBQU4sY0FBaUMsV0FBb0M7QUFBQSxFQUszRSxZQUN1QyxxQkFDUCxjQUM5QjtBQUNELFVBQU07QUFIZ0M7QUFDUDtBQU5oQyxTQUFTLGNBQWM7QUFFdkIsU0FBaUIsZUFBZSxLQUFLLFVBQVUsSUFBSSxzQkFBc0IsQ0FBQztBQUFBLEVBTzFFO0FBQUEsRUFFTyxRQUFjO0FBQ3BCLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxVQUFVLEtBQUssb0JBQW9CLFFBQVEsS0FBSyxNQUFNO0FBQzVELFlBQU0sT0FBTyxJQUFJLFlBQVk7QUFDN0IsaUJBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQUksQ0FBQyxzQkFBc0IsT0FBTyxXQUFXLEtBQUssTUFBTSxDQUFDLEdBQUc7QUFDM0Q7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
