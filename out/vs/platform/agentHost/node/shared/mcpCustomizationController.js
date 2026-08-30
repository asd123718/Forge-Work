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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { ActionType } from "../../common/state/protocol/common/actions.js";
import { isCustomizationEnabled } from "../../common/customizationEnablement.js";
import { CustomizationType, McpServerStatus } from "../../common/state/protocol/channels-session/state.js";
import { DEFAULT_MCP_APP, DEFAULT_MCP_APP_CAPABILITIES } from "../../common/state/protocol/mcpAppDefaults.js";
import { IAgentHostStateManager } from "../agentHostStateManager.js";
function buildMcpTopLevelCustomizationId(providerId, sessionId, serverName) {
  return `mcp-top-level:${providerId}:${sessionId}:${serverName}`;
}
function buildMcpChannel(providerId, sessionId, serverName) {
  return `mcp://${providerId}/${encodeURIComponent(sessionId)}/${encodeURIComponent(serverName)}`;
}
let McpCustomizationController = class extends Disposable {
  constructor(_options, _stateManager) {
    super();
    this._options = _options;
    this._stateManager = _stateManager;
    /** Per-server live entries, keyed by server name. */
    this._live = observableValue(this, /* @__PURE__ */ new Map());
    this.runtimeStates = derived(this, (reader) => {
      const out = /* @__PURE__ */ new Map();
      for (const entry of this._live.read(reader).values()) {
        const id = entry.topLevelId ?? this._resolveChildId(entry.serverName);
        if (id === void 0) {
          continue;
        }
        out.set(id, { state: entry.state, channel: this._buildChannel(entry.serverName, entry.state) });
      }
      return out;
    });
  }
  /** Snapshot for inclusion in `getSessionCustomizations()` results. */
  topLevelCustomizations() {
    const out = [];
    for (const entry of this._live.get().values()) {
      if (entry.topLevelId === void 0) {
        continue;
      }
      out.push(this._buildTopLevel(entry.topLevelId, entry.serverName, entry.state, entry.enabled));
    }
    return out;
  }
  get pluginMcpServerSources() {
    return this._options.pluginMcpServerSources?.();
  }
  /**
   * Names of MCP servers currently in {@link McpServerStatus.Ready},
   * paired with their channel URI. Used by providers to drive
   * polling-based notification streams (e.g. re-fetch `tools/list`
   * after a refresh hint and fire
   * `notifications/tools/list_changed` if the result changed).
   */
  readyChannels() {
    const out = [];
    for (const entry of this._live.get().values()) {
      if (entry.state.kind !== McpServerStatus.Ready) {
        continue;
      }
      const channel = this._buildChannel(entry.serverName, entry.state);
      if (channel !== void 0) {
        out.push({ serverName: entry.serverName, channel });
      }
    }
    return out;
  }
  /**
   * Returns the customization id currently associated with the MCP
   * server named `serverName`, or `undefined` when no customization
   * exists. Top-level entries return the minted top-level id; child
   * entries return the child id published in session state for that server.
   * Used by providers to tag
   * {@link ToolCallMcpContributor.customizationId | tool-call contributors}
   * so clients can correlate MCP tool calls with the originating
   * server customization.
   */
  customizationIdForServer(serverName) {
    const live = this._live.get().get(serverName);
    if (live?.topLevelId !== void 0) {
      return live.topLevelId;
    }
    const published = this._findPublishedMcpCustomization(serverName);
    return published?.topLevelId ?? published?.childId;
  }
  /** Returns the live server name associated with a customization id. */
  serverNameForCustomizationId(id) {
    for (const entry of this._live.get().values()) {
      const entryId = entry.topLevelId ?? this._resolveChildId(entry.serverName);
      if (entryId === id) {
        return entry.serverName;
      }
    }
    return void 0;
  }
  /** Returns the last live state recorded for the MCP server named `serverName`. */
  stateForServer(serverName) {
    return this._live.get().get(serverName)?.state;
  }
  /** Snapshot used by providers to reconcile desired and observed enablement. */
  serverEnablement() {
    const result = [];
    for (const entry of this._live.get().values()) {
      const customizationId = entry.topLevelId ?? this._resolveChildId(entry.serverName);
      if (customizationId !== void 0) {
        result.push({ serverName: entry.serverName, customizationId, enabled: entry.enabled });
      }
    }
    return result;
  }
  /**
   * Returns the `mcp://` AHP channel URI currently advertised for the
   * MCP server named `serverName`, or `undefined` when the server is
   * not in {@link McpServerStatus.Ready}. Used by providers to attach
   * the channel to MCP App `_meta.ui` so clients can route App
   * sub-RPCs (tools/call, resources/read, sampling/createMessage)
   * back through {@link IAgentHostService.handleMcpRequest}.
   */
  channelForServer(serverName) {
    const live = this._live.get().get(serverName);
    if (!live || live.state.kind !== McpServerStatus.Ready) {
      return void 0;
    }
    return this._buildChannel(serverName, live.state);
  }
  /**
   * Replaces the live inventory with `servers`. Servers no longer
   * present are removed; new servers and changed servers are upserted.
   * Batched in a single transaction so {@link runtimeStates} observers
   * see one coalesced update.
   */
  applyAll(servers) {
    transaction((tx) => {
      const seen = /* @__PURE__ */ new Set();
      for (const server of servers) {
        seen.add(server.name);
        this._applyOne(server, tx);
      }
      for (const name of [...this._live.get().keys()]) {
        if (!seen.has(name)) {
          this._remove(name, tx);
        }
      }
    });
  }
  /** Upserts a single server. */
  applyOne(server) {
    transaction((tx) => this._applyOne(server, tx));
  }
  _applyOne(server, tx) {
    const previous = this._live.get().get(server.name);
    const state = this._stateForUpdate(previous?.state, server.state);
    const enabled = server.enabled ?? previous?.enabled ?? true;
    let topLevelId = previous?.topLevelId;
    if (topLevelId === void 0) {
      const published = this._findPublishedMcpCustomization(server.name);
      const childId = published?.childId;
      if (childId !== void 0) {
        this._setLiveEntry(server.name, { serverName: server.name, state, enabled, topLevelId: void 0 }, tx);
        this._options.emit({
          type: ActionType.SessionMcpServerStateChanged,
          id: childId,
          state,
          channel: this._buildChannel(server.name, state)
        });
        return;
      }
      topLevelId = published?.topLevelId ?? this._mintTopLevelId(server.name);
    }
    this._setLiveEntry(server.name, { serverName: server.name, state, enabled, topLevelId }, tx);
    this._options.emit({
      type: ActionType.SessionCustomizationUpdated,
      customization: this._buildTopLevel(topLevelId, server.name, state, enabled)
    });
  }
  /**
   * Removes a server from the live inventory. For top-level entries
   * (bare servers with no plugin-derived child) emits
   * {@link ActionType.SessionCustomizationRemoved} so the entry is
   * dropped from session state, not just from the in-memory live
   * inventory.
   *
   * For child entries we emit a final {@link ActionType.SessionMcpServerStateChanged}
   * carrying {@link McpServerStatus.Stopped} so the UI sees the
   * server settle into a terminal state; the plugin layer owns the
   * actual removal of the child container.
   */
  remove(serverName) {
    transaction((tx) => this._remove(serverName, tx));
  }
  _remove(serverName, tx) {
    const entry = this._live.get().get(serverName);
    if (!entry) {
      return;
    }
    this._deleteLiveEntry(serverName, tx);
    if (entry.topLevelId !== void 0) {
      this._options.emit({
        type: ActionType.SessionCustomizationRemoved,
        id: entry.topLevelId
      });
      return;
    }
    const childId = this._resolveChildId(serverName);
    if (childId === void 0) {
      return;
    }
    this._options.emit({
      type: ActionType.SessionMcpServerStateChanged,
      id: childId,
      state: { kind: McpServerStatus.Stopped }
    });
  }
  // ---- internals ---------------------------------------------------------
  /** Immutable upsert into the {@link _live} observable. */
  _setLiveEntry(serverName, entry, tx) {
    const next = new Map(this._live.get());
    next.set(serverName, entry);
    this._live.set(next, tx);
  }
  /** Immutable delete from the {@link _live} observable. */
  _deleteLiveEntry(serverName, tx) {
    const current = this._live.get();
    if (!current.has(serverName)) {
      return;
    }
    const next = new Map(current);
    next.delete(serverName);
    this._live.set(next, tx);
  }
  _stateForUpdate(previous, next) {
    if (previous?.kind === McpServerStatus.AuthRequired && next.kind === McpServerStatus.Starting) {
      return previous;
    }
    return next;
  }
  _mintTopLevelId(serverName) {
    return buildMcpTopLevelCustomizationId(this._options.providerId, this._options.sessionId, serverName);
  }
  _resolveChildId(serverName) {
    return this._findPublishedMcpCustomization(serverName)?.childId;
  }
  _findPublishedMcpCustomization(serverName) {
    const customizations = this._stateManager.getSessionState(this._options.sessionUri.toString())?.customizations ?? [];
    const topLevel = customizations.find((customization) => customization.type === CustomizationType.McpServer && customization.name === serverName);
    if (topLevel?.type === CustomizationType.McpServer) {
      return { topLevelId: topLevel.id };
    }
    const childId = findMcpChildId(customizations, serverName);
    return childId === void 0 ? void 0 : { childId };
  }
  _buildChannel(serverName, state) {
    if (state.kind !== McpServerStatus.Ready) {
      return void 0;
    }
    return buildMcpChannel(this._options.providerId, this._options.sessionId, serverName);
  }
  _buildTopLevel(id, serverName, state, enabled) {
    const channel = this._buildChannel(serverName, state);
    const owningPluginUri = this.pluginMcpServerSources?.get(serverName);
    const mcpApp = this._options.capabilities ? { capabilities: this._options.capabilities } : DEFAULT_MCP_APP;
    const existing = getMcpServerCustomizations(this._stateManager.getSessionState(this._options.sessionUri.toString())?.customizations ?? []).find((customization2) => customization2.id === id);
    const customization = {
      type: CustomizationType.McpServer,
      id,
      uri: this._mintTopLevelId(serverName),
      name: serverName,
      state,
      channel,
      mcpApp
    };
    const enablement = this._options.resolveEnablement?.(customization, owningPluginUri) ?? existing?.enablement;
    return enablement?.length ? { ...customization, enablement: [...enablement] } : customization;
  }
};
McpCustomizationController = __decorateClass([
  __decorateParam(1, IAgentHostStateManager)
], McpCustomizationController);
function findMcpChildId(customizations, serverName) {
  return getMcpServerCustomizations(customizations).find((server) => server.name === serverName)?.id;
}
function getMcpServerCustomizations(customizations) {
  const result = [];
  for (const top of customizations) {
    if (top.type === CustomizationType.McpServer) {
      result.push(top);
    } else {
      for (const child of top.children ?? []) {
        if (child.type === CustomizationType.McpServer) {
          result.push(child);
        }
      }
    }
  }
  return result;
}
function getEffectiveMcpServerCustomizations(customizations) {
  const result = [];
  for (const customization of customizations) {
    if (customization.type === CustomizationType.McpServer) {
      result.push({ server: customization, enabled: isCustomizationEnabled(customization) });
      continue;
    }
    const containerEnabled = customization.type === CustomizationType.Plugin ? isCustomizationEnabled(customization) : customization.enabled;
    for (const child of customization.children ?? []) {
      if (child.type === CustomizationType.McpServer) {
        result.push({ server: child, enabled: containerEnabled && isCustomizationEnabled(child) });
      }
    }
  }
  return result;
}
function applyMcpServerEnablement(customizations, desired) {
  const desiredById = new Map(getEffectiveMcpServerCustomizations(desired).map(({ server }) => [server.id, server.enablement]));
  return customizations.map((customization) => {
    if (customization.type === CustomizationType.McpServer) {
      return applyMcpEnablement(customization, desiredById);
    }
    let changed = false;
    const children = customization.children?.map((child) => {
      const next = child.type === CustomizationType.McpServer ? applyMcpEnablement(child, desiredById) : child;
      changed ||= next !== child;
      return next;
    });
    return changed ? { ...customization, children } : customization;
  });
}
function applyMcpEnablement(customization, desiredById) {
  if (!desiredById.has(customization.id)) {
    return customization;
  }
  const enablement = desiredById.get(customization.id);
  if (enablement === void 0) {
    return customization;
  }
  if (enablement?.length) {
    return { ...customization, enablement: [...enablement] };
  }
  const { enablement: _enablement, ...withoutEnablement } = customization;
  return withoutEnablement;
}
function findMcpServerName(customizations, id) {
  return getMcpServerCustomizations(customizations).find((server) => server.id === id)?.name;
}
function parseMcpChannelUri(uri) {
  const prefix = "mcp://";
  if (!uri.startsWith(prefix)) {
    return void 0;
  }
  const rest = uri.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return void 0;
  }
  const providerId = rest.slice(0, slash);
  const tail = rest.slice(slash + 1);
  const sep = tail.indexOf("/");
  if (sep <= 0 || sep === tail.length - 1) {
    return void 0;
  }
  let sessionId;
  let serverName;
  try {
    sessionId = decodeURIComponent(tail.slice(0, sep));
    serverName = decodeURIComponent(tail.slice(sep + 1));
  } catch {
    return void 0;
  }
  if (!providerId || !sessionId || !serverName) {
    return void 0;
  }
  return { providerId, sessionId, serverName };
}
export {
  DEFAULT_MCP_APP,
  DEFAULT_MCP_APP_CAPABILITIES,
  McpCustomizationController,
  applyMcpServerEnablement,
  buildMcpChannel,
  buildMcpTopLevelCustomizationId,
  findMcpChildId,
  findMcpServerName,
  getEffectiveMcpServerCustomizations,
  getMcpServerCustomizations,
  parseMcpChannelUri
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXG1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uLCB0eXBlIElPYnNlcnZhYmxlLCB0eXBlIElUcmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgaXNDdXN0b21pemF0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIEFocE1jcFVpSG9zdENhcGFiaWxpdGllcywgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb25FbmFibGVtZW50LCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24sIHR5cGUgTWNwU2VydmVyU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01DUF9BUFAsIERFRkFVTFRfTUNQX0FQUF9DQVBBQklMSVRJRVMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvbWNwQXBwRGVmYXVsdHMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgSUFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5cbi8qKlxuICogU0RLLW5ldXRyYWwgZGVzY3JpcHRpb24gb2YgYSBzaW5nbGUgTUNQIHNlcnZlciwgYXMgdGhlIGNvbnRyb2xsZXInc1xuICogY2FsbGVyIHNlZXMgaXQuIEVhY2ggcHJvdmlkZXIgYWRhcHRzIGl0cyBvd24gU0RLIGV2ZW50cyBpbnRvIHRoaXNcbiAqIHNoYXBlIChDb3BpbG90LCBDbGF1ZGUsIENvZGV4LCBcdTIwMjYpIGFuZCBmZWVkcyB0aGVtIHRvXG4gKiB7QGxpbmsgTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXJ9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZGtNY3BTZXJ2ZXIge1xuXHQvKiogU2VydmVyIG5hbWUgKHVzZWQgYm90aCBhcyB0aGUgY3VzdG9taXphdGlvbiBuYW1lIGFuZCB0aGUgY2hhbm5lbCBzdWZmaXgpLiAqL1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdC8qKiBDdXJyZW50IGxpZmVjeWNsZSBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgc3RhdGU6IE1jcFNlcnZlclN0YXRlO1xuXHQvKiogRXhwbGljaXQgcnVudGltZSBlbmFibGVtZW50IHdoZW4gdGhlIFNESyBkaXN0aW5ndWlzaGVzIGRpc2FibGVkIGZyb20gc3RvcHBlZC4gKi9cblx0cmVhZG9ubHkgZW5hYmxlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUnVudGltZSBmaWVsZHMgb2YgYW4gTUNQIHNlcnZlciBjdXN0b21pemF0aW9uIHRoYXQgdGhpcyBjb250cm9sbGVyXG4gKiBvd25zIFx1MjAxNCB0aGUgaGlnaC1mcmVxdWVuY3kgYHN0YXRlYC9gY2hhbm5lbGAgcGFpci4gQ29uc3VtZXJzIG92ZXJsYXlcbiAqIHRoZXNlIG9udG8gdGhlaXIgcHVibGlzaGVkIGN1c3RvbWl6YXRpb25zIChrZXllZCBieSBjdXN0b21pemF0aW9uIGlkKVxuICogc28gYSB3aG9sZXNhbGUgY3VzdG9taXphdGlvbiByZXB1Ymxpc2ggcHJlc2VydmVzIGxpdmUgTUNQIHN0YXR1c1xuICogcmF0aGVyIHRoYW4gcmVzZXR0aW5nIGl0IHRvIHRoZSBgU3RvcHBlZGAgZGVmYXVsdCBiYWtlZCBpbnRvXG4gKiBgbWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb25gLlxuICovXG5leHBvcnQgdHlwZSBJTWNwU2VydmVyUnVudGltZVN0YXRlID0gUGljazxNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCAnc3RhdGUnIHwgJ2NoYW5uZWwnPjtcblxuLyoqXG4gKiBSZS1leHBvcnQgc28gZXhpc3RpbmcgaW1wb3J0cyBvZiBgREVGQVVMVF9NQ1BfQVBQX0NBUEFCSUxJVElFU2AgZnJvbVxuICogdGhlIGNvbnRyb2xsZXIga2VlcCB3b3JraW5nIFx1MjAxNCB0aGUgY2Fub25pY2FsIGhvbWUgaXMgbm93XG4gKiBgYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9tY3BBcHBEZWZhdWx0cy50c2AuXG4gKi9cbmV4cG9ydCB7IERFRkFVTFRfTUNQX0FQUF9DQVBBQklMSVRJRVMsIERFRkFVTFRfTUNQX0FQUCB9O1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHtAbGluayBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlcn0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyT3B0aW9ucyB7XG5cdC8qKiBQcm92aWRlciBpZCAoZS5nLiBgJ2NvcGlsb3RjbGknYCkuIFVzZWQgYXMgdGhlIGNoYW5uZWwgVVJJIGF1dGhvcml0eS4gKi9cblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHQvKiogU2Vzc2lvbiBpZCAodGhlIHJhdyBpZCwgbm90IHRoZSBmdWxsIFVSSSkuIFVzZWQgYXMgdGhlIGNoYW5uZWwgcGF0aCBzZWdtZW50LiAqL1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqIENhbm9uaWNhbCBzZXNzaW9uIFVSSSB1c2VkIHRvIHJlc29sdmUgcGVyc2lzdGVkIGN1c3RvbWl6YXRpb24gc3RhdGUuICovXG5cdHJlYWRvbmx5IHNlc3Npb25Vcmk6IFVSSTtcblx0LyoqIEVtaXRzIGEge0BsaW5rIFNlc3Npb25BY3Rpb259IGludG8gdGhlIHNlc3Npb24ncyBhY3Rpb24gc3RyZWFtLiAqL1xuXHRyZWFkb25seSBlbWl0OiAoYWN0aW9uOiBTZXNzaW9uQWN0aW9uKSA9PiB2b2lkO1xuXHQvKiogUmV0dXJucyBkdXJhYmxlIHBsdWdpbiBzb3VyY2UgVVJJcyBmb3IgcGx1Z2luLXByb3ZpZGVkIE1DUCBzZXJ2ZXJzLiAqL1xuXHRyZWFkb25seSBwbHVnaW5NY3BTZXJ2ZXJTb3VyY2VzPzogKCkgPT4gUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHQvKiogUmVzb2x2ZXMgdGhlIHNjb3BlZCBlbmFibGVtZW50IHRvIHB1Ymxpc2ggZm9yIGEgdGVtcG9yYXJpbHkgdG9wLWxldmVsIHNlcnZlci4gKi9cblx0cmVhZG9ubHkgcmVzb2x2ZUVuYWJsZW1lbnQ/OiAoc2VydmVyOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCBvd25pbmdQbHVnaW5Vcmk6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIE1DUCBBcHAgY2FwYWJpbGl0aWVzIHRvIGFkdmVydGlzZSBvbiBldmVyeSByZWFkeSBzZXJ2ZXIuIERlZmF1bHRzXG5cdCAqIHRvIHtAbGluayBERUZBVUxUX01DUF9BUFBfQ0FQQUJJTElUSUVTfS5cblx0ICovXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcz86IEFocE1jcFVpSG9zdENhcGFiaWxpdGllcztcbn1cblxuaW50ZXJmYWNlIElMaXZlRW50cnkge1xuXHRyZWFkb25seSBzZXJ2ZXJOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXRlOiBNY3BTZXJ2ZXJTdGF0ZTtcblx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcblx0LyoqIFRvcC1sZXZlbCBjdXN0b21pemF0aW9uIGlkICh3aGVuIG5vIGNoaWxkIG1hdGNoIHdhcyBmb3VuZCkuICovXG5cdHJlYWRvbmx5IHRvcExldmVsSWQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZE1jcFRvcExldmVsQ3VzdG9taXphdGlvbklkKHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvbklkOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgbWNwLXRvcC1sZXZlbDoke3Byb3ZpZGVySWR9OiR7c2Vzc2lvbklkfToke3NlcnZlck5hbWV9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWNwQ2hhbm5lbChwcm92aWRlcklkOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nLCBzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYG1jcDovLyR7cHJvdmlkZXJJZH0vJHtlbmNvZGVVUklDb21wb25lbnQoc2Vzc2lvbklkKX0vJHtlbmNvZGVVUklDb21wb25lbnQoc2VydmVyTmFtZSl9YDtcbn1cblxuLyoqXG4gKiBUcmFuc2xhdGVzIGEgc3RyZWFtIG9mIFNESy1yZXBvcnRlZCBNQ1Agc2VydmVyIHN0YXRlcyBpbnRvIEFIUFxuICogY3VzdG9taXphdGlvbiBhY3Rpb25zOlxuICpcbiAqICAtIEZvciBzZXJ2ZXJzIGJhY2tlZCBieSBhbiBleGlzdGluZyBjaGlsZCBjdXN0b21pemF0aW9uIChwbHVnaW4tIG9yXG4gKiAgICBkaXJlY3RvcnktZGVyaXZlZCksIHRoZSBjb250cm9sbGVyIGVtaXRzXG4gKiAgICB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkfSBrZXllZCBvbiB0aGVcbiAqICAgIHJlc29sdmVkIGNoaWxkIGlkLiBUaGUgcmVkdWNlciBuYXJyb3dseSB1cGRhdGVzIGBzdGF0ZWAgYW5kXG4gKiAgICBgY2hhbm5lbGAgb24gdGhlIG1hdGNoaW5nIGNoaWxkLlxuICogIC0gRm9yIHNlcnZlcnMgd2l0aCBubyBtYXRjaGluZyBjaGlsZCAodHlwaWNhbGx5IGdsb2JhbGx5LWNvbmZpZ3VyZWRcbiAqICAgIE1DUCBzZXJ2ZXJzIHRoZSBTREsgcmVwb3J0cyksIHRoZSBjb250cm9sbGVyIGVtaXRzIGEgZnVsbFxuICogICAge0BsaW5rIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkfSBjYXJyeWluZyBhIGJhcmVcbiAqICAgIHRvcC1sZXZlbCB7QGxpbmsgTWNwU2VydmVyQ3VzdG9taXphdGlvbn0uIFRoZSBzYW1lIGlkIGlzIHJldXNlZFxuICogICAgYWNyb3NzIHVwZGF0ZXMsIHNvIHRoZSByZWR1Y2VyJ3MgdXBzZXJ0IGtlZXBzIGluLXBsYWNlLlxuICpcbiAqIFRoZSBjb250cm9sbGVyIGlzIFNESy1hZ25vc3RpYzogcHJvdmlkZXJzIHRyYW5zbGF0ZSB0aGVpciBvd24gZXZlbnRzXG4gKiBpbnRvIHtAbGluayBJU2RrTWNwU2VydmVyfSBhbmQgY2FsbCB7QGxpbmsgYXBwbHlBbGx9IC8ge0BsaW5rIGFwcGx5T25lfS5cbiAqIElmIGEgcHJvdmlkZXIgcmVwb3J0cyBhIGNvYXJzZSB7QGxpbmsgTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nfSB1cGRhdGVcbiAqIGFmdGVyIGEgcmljaGVyIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkfSBzdGF0ZSwgdGhlIGNvbnRyb2xsZXJcbiAqIHByZXNlcnZlcyB0aGUgYXV0aC1yZXF1aXJlZCBzdGF0ZSB1bnRpbCBhIGRlZmluaXRpdmVcbiAqIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHl9LCB7QGxpbmsgTWNwU2VydmVyU3RhdHVzLkVycm9yfSwgb3JcbiAqIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZH0gdXBkYXRlIGFycml2ZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8qKiBQZXItc2VydmVyIGxpdmUgZW50cmllcywga2V5ZWQgYnkgc2VydmVyIG5hbWUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpdmUgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlNYXA8c3RyaW5nLCBJTGl2ZUVudHJ5Pj4odGhpcywgbmV3IE1hcCgpKTtcblxuXHQvKipcblx0ICogU25hcHNob3Qgb2YgZXZlcnkgbGl2ZSBzZXJ2ZXIncyBydW50aW1lIHtAbGluayBJTWNwU2VydmVyUnVudGltZVN0YXRlfSxcblx0ICoga2V5ZWQgYnkgdGhlIGN1c3RvbWl6YXRpb24gaWQgdW5kZXIgd2hpY2ggaXQgaXMgcHVibGlzaGVkICh0aGVcblx0ICogbWludGVkIHRvcC1sZXZlbCBpZCwgb3IgdGhlIHBsdWdpbi1kZXJpdmVkIGNoaWxkIGlkIHJlc29sdmVkIGZyb20gc2Vzc2lvblxuXHQgKiBzdGF0ZSkuIERlcml2ZWQgZnJvbSB7QGxpbmsgX2xpdmV9LiBDYWxsZXJzIG1pcnJvclxuXHQgKiB0aGlzIGludG8gdGhlaXIgb3duIHB1Ymxpc2hlZCBjdXN0b21pemF0aW9ucyBzbyBhIHdob2xlc2FsZSByZXB1Ymxpc2hcblx0ICogcHJlc2VydmVzIGxpdmUgTUNQIHN0YXR1cy4gU2VydmVycyB3aG9zZSBjaGlsZCBpZCBjYW5ub3QgY3VycmVudGx5IGJlXG5cdCAqIHJlc29sdmVkIGFyZSBvbWl0dGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgcnVudGltZVN0YXRlczogSU9ic2VydmFibGU8UmVhZG9ubHlNYXA8c3RyaW5nLCBJTWNwU2VydmVyUnVudGltZVN0YXRlPj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSU1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyT3B0aW9ucyxcblx0XHRASUFnZW50SG9zdFN0YXRlTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJ1bnRpbWVTdGF0ZXMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBuZXcgTWFwPHN0cmluZywgSU1jcFNlcnZlclJ1bnRpbWVTdGF0ZT4oKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbGl2ZS5yZWFkKHJlYWRlcikudmFsdWVzKCkpIHtcblx0XHRcdFx0Y29uc3QgaWQgPSBlbnRyeS50b3BMZXZlbElkID8/IHRoaXMuX3Jlc29sdmVDaGlsZElkKGVudHJ5LnNlcnZlck5hbWUpO1xuXHRcdFx0XHRpZiAoaWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG91dC5zZXQoaWQsIHsgc3RhdGU6IGVudHJ5LnN0YXRlLCBjaGFubmVsOiB0aGlzLl9idWlsZENoYW5uZWwoZW50cnkuc2VydmVyTmFtZSwgZW50cnkuc3RhdGUpIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG91dDtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBTbmFwc2hvdCBmb3IgaW5jbHVzaW9uIGluIGBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoKWAgcmVzdWx0cy4gKi9cblx0dG9wTGV2ZWxDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uW10ge1xuXHRcdGNvbnN0IG91dDogTWNwU2VydmVyQ3VzdG9taXphdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9saXZlLmdldCgpLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoZW50cnkudG9wTGV2ZWxJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0b3V0LnB1c2godGhpcy5fYnVpbGRUb3BMZXZlbChlbnRyeS50b3BMZXZlbElkLCBlbnRyeS5zZXJ2ZXJOYW1lLCBlbnRyeS5zdGF0ZSwgZW50cnkuZW5hYmxlZCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cblx0Z2V0IHBsdWdpbk1jcFNlcnZlclNvdXJjZXMoKTogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucy5wbHVnaW5NY3BTZXJ2ZXJTb3VyY2VzPy4oKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOYW1lcyBvZiBNQ1Agc2VydmVycyBjdXJyZW50bHkgaW4ge0BsaW5rIE1jcFNlcnZlclN0YXR1cy5SZWFkeX0sXG5cdCAqIHBhaXJlZCB3aXRoIHRoZWlyIGNoYW5uZWwgVVJJLiBVc2VkIGJ5IHByb3ZpZGVycyB0byBkcml2ZVxuXHQgKiBwb2xsaW5nLWJhc2VkIG5vdGlmaWNhdGlvbiBzdHJlYW1zIChlLmcuIHJlLWZldGNoIGB0b29scy9saXN0YFxuXHQgKiBhZnRlciBhIHJlZnJlc2ggaGludCBhbmQgZmlyZVxuXHQgKiBgbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWRgIGlmIHRoZSByZXN1bHQgY2hhbmdlZCkuXG5cdCAqL1xuXHRyZWFkeUNoYW5uZWxzKCk6IHJlYWRvbmx5IHsgcmVhZG9ubHkgc2VydmVyTmFtZTogc3RyaW5nOyByZWFkb25seSBjaGFubmVsOiBzdHJpbmcgfVtdIHtcblx0XHRjb25zdCBvdXQ6IHsgc2VydmVyTmFtZTogc3RyaW5nOyBjaGFubmVsOiBzdHJpbmcgfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9saXZlLmdldCgpLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoZW50cnkuc3RhdGUua2luZCAhPT0gTWNwU2VydmVyU3RhdHVzLlJlYWR5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuX2J1aWxkQ2hhbm5lbChlbnRyeS5zZXJ2ZXJOYW1lLCBlbnRyeS5zdGF0ZSk7XG5cdFx0XHRpZiAoY2hhbm5lbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG91dC5wdXNoKHsgc2VydmVyTmFtZTogZW50cnkuc2VydmVyTmFtZSwgY2hhbm5lbCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjdXN0b21pemF0aW9uIGlkIGN1cnJlbnRseSBhc3NvY2lhdGVkIHdpdGggdGhlIE1DUFxuXHQgKiBzZXJ2ZXIgbmFtZWQgYHNlcnZlck5hbWVgLCBvciBgdW5kZWZpbmVkYCB3aGVuIG5vIGN1c3RvbWl6YXRpb25cblx0ICogZXhpc3RzLiBUb3AtbGV2ZWwgZW50cmllcyByZXR1cm4gdGhlIG1pbnRlZCB0b3AtbGV2ZWwgaWQ7IGNoaWxkXG5cdCAqIGVudHJpZXMgcmV0dXJuIHRoZSBjaGlsZCBpZCBwdWJsaXNoZWQgaW4gc2Vzc2lvbiBzdGF0ZSBmb3IgdGhhdCBzZXJ2ZXIuXG5cdCAqIFVzZWQgYnkgcHJvdmlkZXJzIHRvIHRhZ1xuXHQgKiB7QGxpbmsgVG9vbENhbGxNY3BDb250cmlidXRvci5jdXN0b21pemF0aW9uSWQgfCB0b29sLWNhbGwgY29udHJpYnV0b3JzfVxuXHQgKiBzbyBjbGllbnRzIGNhbiBjb3JyZWxhdGUgTUNQIHRvb2wgY2FsbHMgd2l0aCB0aGUgb3JpZ2luYXRpbmdcblx0ICogc2VydmVyIGN1c3RvbWl6YXRpb24uXG5cdCAqL1xuXHRjdXN0b21pemF0aW9uSWRGb3JTZXJ2ZXIoc2VydmVyTmFtZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsaXZlID0gdGhpcy5fbGl2ZS5nZXQoKS5nZXQoc2VydmVyTmFtZSk7XG5cdFx0aWYgKGxpdmU/LnRvcExldmVsSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGxpdmUudG9wTGV2ZWxJZDtcblx0XHR9XG5cdFx0Y29uc3QgcHVibGlzaGVkID0gdGhpcy5fZmluZFB1Ymxpc2hlZE1jcEN1c3RvbWl6YXRpb24oc2VydmVyTmFtZSk7XG5cdFx0cmV0dXJuIHB1Ymxpc2hlZD8udG9wTGV2ZWxJZCA/PyBwdWJsaXNoZWQ/LmNoaWxkSWQ7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgbGl2ZSBzZXJ2ZXIgbmFtZSBhc3NvY2lhdGVkIHdpdGggYSBjdXN0b21pemF0aW9uIGlkLiAqL1xuXHRzZXJ2ZXJOYW1lRm9yQ3VzdG9taXphdGlvbklkKGlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbGl2ZS5nZXQoKS52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgZW50cnlJZCA9IGVudHJ5LnRvcExldmVsSWQgPz8gdGhpcy5fcmVzb2x2ZUNoaWxkSWQoZW50cnkuc2VydmVyTmFtZSk7XG5cdFx0XHRpZiAoZW50cnlJZCA9PT0gaWQpIHtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LnNlcnZlck5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgbGFzdCBsaXZlIHN0YXRlIHJlY29yZGVkIGZvciB0aGUgTUNQIHNlcnZlciBuYW1lZCBgc2VydmVyTmFtZWAuICovXG5cdHN0YXRlRm9yU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IE1jcFNlcnZlclN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGl2ZS5nZXQoKS5nZXQoc2VydmVyTmFtZSk/LnN0YXRlO1xuXHR9XG5cblx0LyoqIFNuYXBzaG90IHVzZWQgYnkgcHJvdmlkZXJzIHRvIHJlY29uY2lsZSBkZXNpcmVkIGFuZCBvYnNlcnZlZCBlbmFibGVtZW50LiAqL1xuXHRzZXJ2ZXJFbmFibGVtZW50KCk6IHJlYWRvbmx5IHsgcmVhZG9ubHkgc2VydmVyTmFtZTogc3RyaW5nOyByZWFkb25seSBjdXN0b21pemF0aW9uSWQ6IHN0cmluZzsgcmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbiB9W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogeyBzZXJ2ZXJOYW1lOiBzdHJpbmc7IGN1c3RvbWl6YXRpb25JZDogc3RyaW5nOyBlbmFibGVkOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbGl2ZS5nZXQoKS52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbklkID0gZW50cnkudG9wTGV2ZWxJZCA/PyB0aGlzLl9yZXNvbHZlQ2hpbGRJZChlbnRyeS5zZXJ2ZXJOYW1lKTtcblx0XHRcdGlmIChjdXN0b21pemF0aW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHNlcnZlck5hbWU6IGVudHJ5LnNlcnZlck5hbWUsIGN1c3RvbWl6YXRpb25JZCwgZW5hYmxlZDogZW50cnkuZW5hYmxlZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBgbWNwOi8vYCBBSFAgY2hhbm5lbCBVUkkgY3VycmVudGx5IGFkdmVydGlzZWQgZm9yIHRoZVxuXHQgKiBNQ1Agc2VydmVyIG5hbWVkIGBzZXJ2ZXJOYW1lYCwgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2VydmVyIGlzXG5cdCAqIG5vdCBpbiB7QGxpbmsgTWNwU2VydmVyU3RhdHVzLlJlYWR5fS4gVXNlZCBieSBwcm92aWRlcnMgdG8gYXR0YWNoXG5cdCAqIHRoZSBjaGFubmVsIHRvIE1DUCBBcHAgYF9tZXRhLnVpYCBzbyBjbGllbnRzIGNhbiByb3V0ZSBBcHBcblx0ICogc3ViLVJQQ3MgKHRvb2xzL2NhbGwsIHJlc291cmNlcy9yZWFkLCBzYW1wbGluZy9jcmVhdGVNZXNzYWdlKVxuXHQgKiBiYWNrIHRocm91Z2gge0BsaW5rIElBZ2VudEhvc3RTZXJ2aWNlLmhhbmRsZU1jcFJlcXVlc3R9LlxuXHQgKi9cblx0Y2hhbm5lbEZvclNlcnZlcihzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxpdmUgPSB0aGlzLl9saXZlLmdldCgpLmdldChzZXJ2ZXJOYW1lKTtcblx0XHRpZiAoIWxpdmUgfHwgbGl2ZS5zdGF0ZS5raW5kICE9PSBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9idWlsZENoYW5uZWwoc2VydmVyTmFtZSwgbGl2ZS5zdGF0ZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGFjZXMgdGhlIGxpdmUgaW52ZW50b3J5IHdpdGggYHNlcnZlcnNgLiBTZXJ2ZXJzIG5vIGxvbmdlclxuXHQgKiBwcmVzZW50IGFyZSByZW1vdmVkOyBuZXcgc2VydmVycyBhbmQgY2hhbmdlZCBzZXJ2ZXJzIGFyZSB1cHNlcnRlZC5cblx0ICogQmF0Y2hlZCBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvbiBzbyB7QGxpbmsgcnVudGltZVN0YXRlc30gb2JzZXJ2ZXJzXG5cdCAqIHNlZSBvbmUgY29hbGVzY2VkIHVwZGF0ZS5cblx0ICovXG5cdGFwcGx5QWxsKHNlcnZlcnM6IHJlYWRvbmx5IElTZGtNY3BTZXJ2ZXJbXSk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHNlcnZlcnMpIHtcblx0XHRcdFx0c2Vlbi5hZGQoc2VydmVyLm5hbWUpO1xuXHRcdFx0XHR0aGlzLl9hcHBseU9uZShzZXJ2ZXIsIHR4KTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgbmFtZSBvZiBbLi4udGhpcy5fbGl2ZS5nZXQoKS5rZXlzKCldKSB7XG5cdFx0XHRcdGlmICghc2Vlbi5oYXMobmFtZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW1vdmUobmFtZSwgdHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKiogVXBzZXJ0cyBhIHNpbmdsZSBzZXJ2ZXIuICovXG5cdGFwcGx5T25lKHNlcnZlcjogSVNka01jcFNlcnZlcik6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHRoaXMuX2FwcGx5T25lKHNlcnZlciwgdHgpKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5T25lKHNlcnZlcjogSVNka01jcFNlcnZlciwgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fbGl2ZS5nZXQoKS5nZXQoc2VydmVyLm5hbWUpO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVGb3JVcGRhdGUocHJldmlvdXM/LnN0YXRlLCBzZXJ2ZXIuc3RhdGUpO1xuXHRcdGNvbnN0IGVuYWJsZWQgPSBzZXJ2ZXIuZW5hYmxlZCA/PyBwcmV2aW91cz8uZW5hYmxlZCA/PyB0cnVlO1xuXHRcdC8vIE9uY2UgcHJvbW90ZWQgdG8gYSB0b3AtbGV2ZWwgZW50cnksIHN0YXkgdG9wLWxldmVsIGZvciB0aGVcblx0XHQvLyBzZXNzaW9uIFx1MjAxNCBmbGlwcGluZyBiYWNrIHRvIGEgY2hpbGQgbWlkLXN0cmVhbSB3b3VsZCBvcnBoYW4gdGhlXG5cdFx0Ly8gcHJldmlvdXNseS1wdWJsaXNoZWQgdG9wLWxldmVsIGlkLlxuXHRcdGxldCB0b3BMZXZlbElkID0gcHJldmlvdXM/LnRvcExldmVsSWQ7XG5cdFx0aWYgKHRvcExldmVsSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgcHVibGlzaGVkID0gdGhpcy5fZmluZFB1Ymxpc2hlZE1jcEN1c3RvbWl6YXRpb24oc2VydmVyLm5hbWUpO1xuXHRcdFx0Y29uc3QgY2hpbGRJZCA9IHB1Ymxpc2hlZD8uY2hpbGRJZDtcblx0XHRcdGlmIChjaGlsZElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fc2V0TGl2ZUVudHJ5KHNlcnZlci5uYW1lLCB7IHNlcnZlck5hbWU6IHNlcnZlci5uYW1lLCBzdGF0ZSwgZW5hYmxlZCwgdG9wTGV2ZWxJZDogdW5kZWZpbmVkIH0sIHR4KTtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5lbWl0KHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRcdFx0aWQ6IGNoaWxkSWQsXG5cdFx0XHRcdFx0c3RhdGUsXG5cdFx0XHRcdFx0Y2hhbm5lbDogdGhpcy5fYnVpbGRDaGFubmVsKHNlcnZlci5uYW1lLCBzdGF0ZSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0b3BMZXZlbElkID0gcHVibGlzaGVkPy50b3BMZXZlbElkID8/IHRoaXMuX21pbnRUb3BMZXZlbElkKHNlcnZlci5uYW1lKTtcblx0XHR9XG5cdFx0dGhpcy5fc2V0TGl2ZUVudHJ5KHNlcnZlci5uYW1lLCB7IHNlcnZlck5hbWU6IHNlcnZlci5uYW1lLCBzdGF0ZSwgZW5hYmxlZCwgdG9wTGV2ZWxJZCB9LCB0eCk7XG5cdFx0dGhpcy5fb3B0aW9ucy5lbWl0KHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0Y3VzdG9taXphdGlvbjogdGhpcy5fYnVpbGRUb3BMZXZlbCh0b3BMZXZlbElkLCBzZXJ2ZXIubmFtZSwgc3RhdGUsIGVuYWJsZWQpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYSBzZXJ2ZXIgZnJvbSB0aGUgbGl2ZSBpbnZlbnRvcnkuIEZvciB0b3AtbGV2ZWwgZW50cmllc1xuXHQgKiAoYmFyZSBzZXJ2ZXJzIHdpdGggbm8gcGx1Z2luLWRlcml2ZWQgY2hpbGQpIGVtaXRzXG5cdCAqIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uUmVtb3ZlZH0gc28gdGhlIGVudHJ5IGlzXG5cdCAqIGRyb3BwZWQgZnJvbSBzZXNzaW9uIHN0YXRlLCBub3QganVzdCBmcm9tIHRoZSBpbi1tZW1vcnkgbGl2ZVxuXHQgKiBpbnZlbnRvcnkuXG5cdCAqXG5cdCAqIEZvciBjaGlsZCBlbnRyaWVzIHdlIGVtaXQgYSBmaW5hbCB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkfVxuXHQgKiBjYXJyeWluZyB7QGxpbmsgTWNwU2VydmVyU3RhdHVzLlN0b3BwZWR9IHNvIHRoZSBVSSBzZWVzIHRoZVxuXHQgKiBzZXJ2ZXIgc2V0dGxlIGludG8gYSB0ZXJtaW5hbCBzdGF0ZTsgdGhlIHBsdWdpbiBsYXllciBvd25zIHRoZVxuXHQgKiBhY3R1YWwgcmVtb3ZhbCBvZiB0aGUgY2hpbGQgY29udGFpbmVyLlxuXHQgKi9cblx0cmVtb3ZlKHNlcnZlck5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHRoaXMuX3JlbW92ZShzZXJ2ZXJOYW1lLCB0eCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlKHNlcnZlck5hbWU6IHN0cmluZywgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fbGl2ZS5nZXQoKS5nZXQoc2VydmVyTmFtZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kZWxldGVMaXZlRW50cnkoc2VydmVyTmFtZSwgdHgpO1xuXHRcdGlmIChlbnRyeS50b3BMZXZlbElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMuZW1pdCh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkLFxuXHRcdFx0XHRpZDogZW50cnkudG9wTGV2ZWxJZCxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZElkID0gdGhpcy5fcmVzb2x2ZUNoaWxkSWQoc2VydmVyTmFtZSk7XG5cdFx0aWYgKGNoaWxkSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vcHRpb25zLmVtaXQoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkLFxuXHRcdFx0aWQ6IGNoaWxkSWQsXG5cdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9LFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tLSBpbnRlcm5hbHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqIEltbXV0YWJsZSB1cHNlcnQgaW50byB0aGUge0BsaW5rIF9saXZlfSBvYnNlcnZhYmxlLiAqL1xuXHRwcml2YXRlIF9zZXRMaXZlRW50cnkoc2VydmVyTmFtZTogc3RyaW5nLCBlbnRyeTogSUxpdmVFbnRyeSwgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKHRoaXMuX2xpdmUuZ2V0KCkpO1xuXHRcdG5leHQuc2V0KHNlcnZlck5hbWUsIGVudHJ5KTtcblx0XHR0aGlzLl9saXZlLnNldChuZXh0LCB0eCk7XG5cdH1cblxuXHQvKiogSW1tdXRhYmxlIGRlbGV0ZSBmcm9tIHRoZSB7QGxpbmsgX2xpdmV9IG9ic2VydmFibGUuICovXG5cdHByaXZhdGUgX2RlbGV0ZUxpdmVFbnRyeShzZXJ2ZXJOYW1lOiBzdHJpbmcsIHR4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fbGl2ZS5nZXQoKTtcblx0XHRpZiAoIWN1cnJlbnQuaGFzKHNlcnZlck5hbWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKGN1cnJlbnQpO1xuXHRcdG5leHQuZGVsZXRlKHNlcnZlck5hbWUpO1xuXHRcdHRoaXMuX2xpdmUuc2V0KG5leHQsIHR4KTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXRlRm9yVXBkYXRlKHByZXZpb3VzOiBNY3BTZXJ2ZXJTdGF0ZSB8IHVuZGVmaW5lZCwgbmV4dDogTWNwU2VydmVyU3RhdGUpOiBNY3BTZXJ2ZXJTdGF0ZSB7XG5cdFx0aWYgKHByZXZpb3VzPy5raW5kID09PSBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkICYmIG5leHQua2luZCA9PT0gTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nKSB7XG5cdFx0XHRyZXR1cm4gcHJldmlvdXM7XG5cdFx0fVxuXHRcdHJldHVybiBuZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBfbWludFRvcExldmVsSWQoc2VydmVyTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYnVpbGRNY3BUb3BMZXZlbEN1c3RvbWl6YXRpb25JZCh0aGlzLl9vcHRpb25zLnByb3ZpZGVySWQsIHRoaXMuX29wdGlvbnMuc2Vzc2lvbklkLCBzZXJ2ZXJOYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDaGlsZElkKHNlcnZlck5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRQdWJsaXNoZWRNY3BDdXN0b21pemF0aW9uKHNlcnZlck5hbWUpPy5jaGlsZElkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZFB1Ymxpc2hlZE1jcEN1c3RvbWl6YXRpb24oc2VydmVyTmFtZTogc3RyaW5nKTogeyByZWFkb25seSB0b3BMZXZlbElkPzogc3RyaW5nOyByZWFkb25seSBjaGlsZElkPzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZSh0aGlzLl9vcHRpb25zLnNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmN1c3RvbWl6YXRpb25zID8/IFtdO1xuXHRcdGNvbnN0IHRvcExldmVsID0gY3VzdG9taXphdGlvbnMuZmluZChjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyICYmIGN1c3RvbWl6YXRpb24ubmFtZSA9PT0gc2VydmVyTmFtZSk7XG5cdFx0aWYgKHRvcExldmVsPy50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB7IHRvcExldmVsSWQ6IHRvcExldmVsLmlkIH07XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkSWQgPSBmaW5kTWNwQ2hpbGRJZChjdXN0b21pemF0aW9ucywgc2VydmVyTmFtZSk7XG5cdFx0cmV0dXJuIGNoaWxkSWQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHsgY2hpbGRJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRDaGFubmVsKHNlcnZlck5hbWU6IHN0cmluZywgc3RhdGU6IE1jcFNlcnZlclN0YXRlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc3RhdGUua2luZCAhPT0gTWNwU2VydmVyU3RhdHVzLlJlYWR5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYnVpbGRNY3BDaGFubmVsKHRoaXMuX29wdGlvbnMucHJvdmlkZXJJZCwgdGhpcy5fb3B0aW9ucy5zZXNzaW9uSWQsIHNlcnZlck5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRUb3BMZXZlbChpZDogc3RyaW5nLCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIHN0YXRlOiBNY3BTZXJ2ZXJTdGF0ZSwgZW5hYmxlZDogYm9vbGVhbik6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9idWlsZENoYW5uZWwoc2VydmVyTmFtZSwgc3RhdGUpO1xuXHRcdGNvbnN0IG93bmluZ1BsdWdpblVyaSA9IHRoaXMucGx1Z2luTWNwU2VydmVyU291cmNlcz8uZ2V0KHNlcnZlck5hbWUpO1xuXHRcdC8vIFBlciBBSFAgc3BlYywgYG1jcEFwcGAgaXMgYSBzdGF0aWMgY2FwYWJpbGl0eSBkZWNsYXJhdGlvbiBcdTIwMTRcblx0XHQvLyBcIlNIT1VMRCBiZSBwcmVzZW50IHdoZW5ldmVyIHRoZSBzZXJ2ZXIgY2FuIGhvc3QgQXBwc1wiLiBXZVxuXHRcdC8vIHByb3h5IGV2ZXJ5IE1DUCBzZXJ2ZXIgdW5pZm9ybWx5LCBzbyBhZHZlcnRpc2UgdGhlIGhvc3Qnc1xuXHRcdC8vIGNhcGFiaWxpdHkgc2V0IHJlZ2FyZGxlc3Mgb2YgcnVudGltZSBgc3RhdGVgLiBDbGllbnRzIGdhdGVcblx0XHQvLyByZW5kZXJpbmcgb24gYHN0YXRlLmtpbmQgPT09IFJlYWR5YCArIGBjaGFubmVsYCB0aGVtc2VsdmVzLlxuXHRcdGNvbnN0IG1jcEFwcCA9IHRoaXMuX29wdGlvbnMuY2FwYWJpbGl0aWVzXG5cdFx0XHQ/IHsgY2FwYWJpbGl0aWVzOiB0aGlzLl9vcHRpb25zLmNhcGFiaWxpdGllcyB9XG5cdFx0XHQ6IERFRkFVTFRfTUNQX0FQUDtcblx0XHRjb25zdCBleGlzdGluZyA9IGdldE1jcFNlcnZlckN1c3RvbWl6YXRpb25zKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUodGhpcy5fb3B0aW9ucy5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5jdXN0b21pemF0aW9ucyA/PyBbXSlcblx0XHRcdC5maW5kKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5pZCA9PT0gaWQpO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb246IE1jcFNlcnZlckN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRpZCxcblx0XHRcdHVyaTogdGhpcy5fbWludFRvcExldmVsSWQoc2VydmVyTmFtZSksXG5cdFx0XHRuYW1lOiBzZXJ2ZXJOYW1lLFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRjaGFubmVsLFxuXHRcdFx0bWNwQXBwLFxuXHRcdH07XG5cdFx0Y29uc3QgZW5hYmxlbWVudCA9IHRoaXMuX29wdGlvbnMucmVzb2x2ZUVuYWJsZW1lbnQ/LihjdXN0b21pemF0aW9uLCBvd25pbmdQbHVnaW5VcmkpID8/IGV4aXN0aW5nPy5lbmFibGVtZW50O1xuXHRcdHJldHVybiBlbmFibGVtZW50Py5sZW5ndGggPyB7IC4uLmN1c3RvbWl6YXRpb24sIGVuYWJsZW1lbnQ6IFsuLi5lbmFibGVtZW50XSB9IDogY3VzdG9taXphdGlvbjtcblx0fVxufVxuXG4vKipcbiAqIENvbnZlbmllbmNlIGhlbHBlcjogZ2l2ZW4gYSBmbGF0IGxpc3Qgb2Yge0BsaW5rIEN1c3RvbWl6YXRpb259XG4gKiBlbnRyaWVzLCByZXR1cm5zIHRoZSBpZCBvZiB0aGUgZmlyc3QgTUNQIGNoaWxkIGN1c3RvbWl6YXRpb24gd2hvc2VcbiAqIG5hbWUgbWF0Y2hlcyBgc2VydmVyTmFtZWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTWNwQ2hpbGRJZChjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdLCBzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZ2V0TWNwU2VydmVyQ3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnMpLmZpbmQoc2VydmVyID0+IHNlcnZlci5uYW1lID09PSBzZXJ2ZXJOYW1lKT8uaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNY3BTZXJ2ZXJDdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogcmVhZG9ubHkgTWNwU2VydmVyQ3VzdG9taXphdGlvbltdIHtcblx0Y29uc3QgcmVzdWx0OiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCB0b3Agb2YgY3VzdG9taXphdGlvbnMpIHtcblx0XHRpZiAodG9wLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0cmVzdWx0LnB1c2godG9wKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0b3AuY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdFx0aWYgKGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGNoaWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIEV2ZXJ5IE1DUCBzZXJ2ZXIgd2l0aCBpdHMgZWZmZWN0aXZlIGVuYWJsZWQgdmFsdWUsIGFmdGVyIGFwcGx5aW5nIHRoZVxuICogY29udGFpbmVyIGdhdGUuIFRoZSBnYXRlIGlzIGFwcGxpZWQgaGVyZSwgYXQgdGhlIHBvaW50IG9mIHVzZSBcdTIwMTQgYSBjaGlsZCdzXG4gKiBvd24gc3RvcmVkIGRlY2lzaW9ucyBhcmUgbmV2ZXIgb3ZlcndyaXR0ZW4sIHNvIHJlLWVuYWJsaW5nIGEgY29udGFpbmVyXG4gKiByZXN0b3JlcyBlYWNoIGNoaWxkIHRvIHRoZSB1c2VyJ3MgY2hvc2VuIHZhbHVlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWZmZWN0aXZlTWNwU2VydmVyQ3VzdG9taXphdGlvbnMoXG5cdGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10sXG4pOiByZWFkb25seSB7IHJlYWRvbmx5IHNlcnZlcjogTWNwU2VydmVyQ3VzdG9taXphdGlvbjsgcmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbiB9W10ge1xuXHRjb25zdCByZXN1bHQ6IHsgc2VydmVyOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uOyBlbmFibGVkOiBib29sZWFuIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgY3VzdG9taXphdGlvbnMpIHtcblx0XHRpZiAoY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgc2VydmVyOiBjdXN0b21pemF0aW9uLCBlbmFibGVkOiBpc0N1c3RvbWl6YXRpb25FbmFibGVkKGN1c3RvbWl6YXRpb24pIH0pO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRhaW5lckVuYWJsZWQgPSBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpblxuXHRcdFx0PyBpc0N1c3RvbWl6YXRpb25FbmFibGVkKGN1c3RvbWl6YXRpb24pXG5cdFx0XHQ6IGN1c3RvbWl6YXRpb24uZW5hYmxlZDtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdGlmIChjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBzZXJ2ZXI6IGNoaWxkLCBlbmFibGVkOiBjb250YWluZXJFbmFibGVkICYmIGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoY2hpbGQpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlNY3BTZXJ2ZXJFbmFibGVtZW50KGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10sIGRlc2lyZWQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdGNvbnN0IGRlc2lyZWRCeUlkID0gbmV3IE1hcChnZXRFZmZlY3RpdmVNY3BTZXJ2ZXJDdXN0b21pemF0aW9ucyhkZXNpcmVkKS5tYXAoKHsgc2VydmVyIH0pID0+IFtzZXJ2ZXIuaWQsIHNlcnZlci5lbmFibGVtZW50XSkpO1xuXHRyZXR1cm4gY3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4ge1xuXHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIGFwcGx5TWNwRW5hYmxlbWVudChjdXN0b21pemF0aW9uLCBkZXNpcmVkQnlJZCk7XG5cdFx0fVxuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBjdXN0b21pemF0aW9uLmNoaWxkcmVuPy5tYXAoY2hpbGQgPT4ge1xuXHRcdFx0Y29uc3QgbmV4dCA9IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlciA/IGFwcGx5TWNwRW5hYmxlbWVudChjaGlsZCwgZGVzaXJlZEJ5SWQpIDogY2hpbGQ7XG5cdFx0XHRjaGFuZ2VkIHx8PSBuZXh0ICE9PSBjaGlsZDtcblx0XHRcdHJldHVybiBuZXh0O1xuXHRcdH0pO1xuXHRcdHJldHVybiBjaGFuZ2VkID8geyAuLi5jdXN0b21pemF0aW9uLCBjaGlsZHJlbiB9IDogY3VzdG9taXphdGlvbjtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5TWNwRW5hYmxlbWVudChjdXN0b21pemF0aW9uOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCBkZXNpcmVkQnlJZDogUmVhZG9ubHlNYXA8c3RyaW5nLCByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdIHwgdW5kZWZpbmVkPik6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24ge1xuXHRpZiAoIWRlc2lyZWRCeUlkLmhhcyhjdXN0b21pemF0aW9uLmlkKSkge1xuXHRcdHJldHVybiBjdXN0b21pemF0aW9uO1xuXHR9XG5cdGNvbnN0IGVuYWJsZW1lbnQgPSBkZXNpcmVkQnlJZC5nZXQoY3VzdG9taXphdGlvbi5pZCk7XG5cdGlmIChlbmFibGVtZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY3VzdG9taXphdGlvbjtcblx0fVxuXHRpZiAoZW5hYmxlbWVudD8ubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHsgLi4uY3VzdG9taXphdGlvbiwgZW5hYmxlbWVudDogWy4uLmVuYWJsZW1lbnRdIH07XG5cdH1cblx0Y29uc3QgeyBlbmFibGVtZW50OiBfZW5hYmxlbWVudCwgLi4ud2l0aG91dEVuYWJsZW1lbnQgfSA9IGN1c3RvbWl6YXRpb247XG5cdHJldHVybiB3aXRob3V0RW5hYmxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRNY3BTZXJ2ZXJOYW1lKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10sIGlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZ2V0TWNwU2VydmVyQ3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnMpLmZpbmQoc2VydmVyID0+IHNlcnZlci5pZCA9PT0gaWQpPy5uYW1lO1xufVxuXG4vKipcbiAqIFBhcnNlZCBgbWNwOi8vPHByb3ZpZGVySWQ+LzxzZXNzaW9uSWQ+LzxzZXJ2ZXJOYW1lPmAgVVJJIGFzIG1pbnRlZCBieVxuICoge0BsaW5rIE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyfS4gVGhlIHBhdGggc2VnbWVudHMgYXJlXG4gKiBVUkwtZGVjb2RlZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTWNwQ2hhbm5lbFJvdXRlIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2VydmVyTmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIERlY29kZXMgYSBjaGFubmVsIFVSSSBzdHJpbmcgaW50byBhIHtAbGluayBJTWNwQ2hhbm5lbFJvdXRlfSwgb3JcbiAqIHJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgVVJJIGlzIG5vdCBhbiBgbWNwOi8vYCBjaGFubmVsIG9yIHRoZVxuICogcGF0aCBpcyBtYWxmb3JtZWQuIEludGVudGlvbmFsbHkgdXNlcyBzdHJpbmcgcGFyc2luZyByYXRoZXIgdGhhblxuICogYFVSSS5wYXJzZWAgc28gdGhlIGhlbHBlciBzdGF5cyB1c2FibGUgZnJvbSBsYXllcnMgKGUuZy4gYWdlbnRTZXJ2aWNlXG4gKiB0ZXN0IGZpeHR1cmVzKSB3aXRob3V0IGEgZnVsbCBVUkkgZGVwZW5kZW5jeS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTWNwQ2hhbm5lbFVyaSh1cmk6IHN0cmluZyk6IElNY3BDaGFubmVsUm91dGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcmVmaXggPSAnbWNwOi8vJztcblx0aWYgKCF1cmkuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZXN0ID0gdXJpLnNsaWNlKHByZWZpeC5sZW5ndGgpO1xuXHRjb25zdCBzbGFzaCA9IHJlc3QuaW5kZXhPZignLycpO1xuXHRpZiAoc2xhc2ggPD0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcHJvdmlkZXJJZCA9IHJlc3Quc2xpY2UoMCwgc2xhc2gpO1xuXHRjb25zdCB0YWlsID0gcmVzdC5zbGljZShzbGFzaCArIDEpO1xuXHRjb25zdCBzZXAgPSB0YWlsLmluZGV4T2YoJy8nKTtcblx0aWYgKHNlcCA8PSAwIHx8IHNlcCA9PT0gdGFpbC5sZW5ndGggLSAxKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdGxldCBzZXJ2ZXJOYW1lOiBzdHJpbmc7XG5cdHRyeSB7XG5cdFx0Ly8gYGRlY29kZVVSSUNvbXBvbmVudGAgdGhyb3dzIGBVUklFcnJvcmAgb24gbWFsZm9ybWVkIHBlcmNlbnRcblx0XHQvLyBlc2NhcGVzIChlLmcuIGEgbG9uZSBgJWApLiBUcmVhdCBhbnkgZGVjb2RlIGZhaWx1cmUgYXMgYVxuXHRcdC8vIG1hbGZvcm1lZCBjaGFubmVsIHJhdGhlciB0aGFuIGxldHRpbmcgaXQgZXNjYXBlIFx1MjAxNCB0aGUgY2FsbGVyXG5cdFx0Ly8gdHJhbnNsYXRlcyBgdW5kZWZpbmVkYCBpbnRvIGEgY2xlYW4gYE1ldGhvZCBub3QgZm91bmRgLlxuXHRcdHNlc3Npb25JZCA9IGRlY29kZVVSSUNvbXBvbmVudCh0YWlsLnNsaWNlKDAsIHNlcCkpO1xuXHRcdHNlcnZlck5hbWUgPSBkZWNvZGVVUklDb21wb25lbnQodGFpbC5zbGljZShzZXAgKyAxKSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKCFwcm92aWRlcklkIHx8ICFzZXNzaW9uSWQgfHwgIXNlcnZlck5hbWUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7IHByb3ZpZGVySWQsIHNlc3Npb25JZCwgc2VydmVyTmFtZSB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsaUJBQWlCLG1CQUF3RDtBQUUzRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQix1QkFBMEo7QUFDdEwsU0FBUyxpQkFBaUIsb0NBQW9DO0FBRTlELFNBQWdDLDhCQUE4QjtBQWlFdkQsU0FBUyxnQ0FBZ0MsWUFBb0IsV0FBbUIsWUFBNEI7QUFDbEgsU0FBTyxpQkFBaUIsVUFBVSxJQUFJLFNBQVMsSUFBSSxVQUFVO0FBQzlEO0FBRU8sU0FB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
