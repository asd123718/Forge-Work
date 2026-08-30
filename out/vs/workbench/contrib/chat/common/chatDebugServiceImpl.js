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
import { timeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { extUri } from "../../../../base/common/resources.js";
import { ChatDebugLogLevel } from "./chatDebugService.js";
import { isAgentHostTarget, localChatSessionType } from "./chatSessionsService.js";
import { getChatSessionType } from "./model/chatUri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { AgentHostAgentDebugLogMaxEventsSettingId } from "./promptSyntax/promptTypes.js";
class SessionEventBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this._head = 0;
    this._size = 0;
    this._buffer = new Array(capacity);
  }
  get size() {
    return this._size;
  }
  push(event) {
    const idx = (this._head + this._size) % this.capacity;
    this._buffer[idx] = event;
    if (this._size < this.capacity) {
      this._size++;
    } else {
      this._head = (this._head + 1) % this.capacity;
    }
  }
  /** Return events in insertion order. */
  toArray() {
    const result = [];
    for (let i = 0; i < this._size; i++) {
      const event = this._buffer[(this._head + i) % this.capacity];
      if (event) {
        result.push(event);
      }
    }
    return result;
  }
  /** Remove events matching the predicate and compact in-place. */
  removeWhere(predicate) {
    let write = 0;
    for (let i = 0; i < this._size; i++) {
      const idx = (this._head + i) % this.capacity;
      const event = this._buffer[idx];
      if (event && predicate(event)) {
        continue;
      }
      if (write !== i) {
        const writeIdx = (this._head + write) % this.capacity;
        this._buffer[writeIdx] = event;
      }
      write++;
    }
    for (let i = write; i < this._size; i++) {
      this._buffer[(this._head + i) % this.capacity] = void 0;
    }
    this._size = write;
  }
  clear() {
    this._buffer.fill(void 0);
    this._head = 0;
    this._size = 0;
  }
}
let ChatDebugServiceImpl = class extends Disposable {
  constructor(_configurationService) {
    super();
    this._configurationService = _configurationService;
    /** Per-session event buffers. Ordered from oldest to newest session (LRU). */
    this._sessionBuffers = new ResourceMap();
    /** Ordered list of session URIs for LRU eviction. */
    this._sessionOrder = [];
    /** Per-session tracking of seen event IDs to deduplicate events
     *  that share the same ID (e.g. subagentInvocation + userMessage
     *  emitted from the same span). Stores id → event kind so we can
     *  keep the richer event kind on collision. */
    this._seenEventIds = new ResourceMap();
    this._onDidAddEvent = this._register(new Emitter());
    this.onDidAddEvent = this._onDidAddEvent.event;
    this._onDidClearProviderEvents = this._register(new Emitter());
    this.onDidClearProviderEvents = this._onDidClearProviderEvents.event;
    this._onDidEndSession = this._register(new Emitter());
    this.onDidEndSession = this._onDidEndSession.event;
    this._onDidChangeAvailableSessionResources = this._register(new Emitter());
    this.onDidChangeAvailableSessionResources = this._onDidChangeAvailableSessionResources.event;
    this._providers = /* @__PURE__ */ new Set();
    this._invocationCts = new ResourceMap();
    /**
     * Sessions whose provider events should be cleared before the next batch of
     * provider events is applied. The clear is deferred until the first new
     * provider event actually arrives so that a provider which transiently
     * returns nothing (e.g. an Agent Host `events.jsonl` mid-rewrite) does not
     * wipe the events currently shown.
     */
    this._pendingProviderClear = new ResourceMap();
    /** Events that were returned by providers (not internally logged). */
    this._providerEvents = /* @__PURE__ */ new WeakSet();
    /** Session URIs created via import. */
    this._importedSessions = new ResourceMap();
    /** Session URIs reported by providers as available on disk (historical sessions). */
    this._availableSessionResources = [];
    this._availableSessionResourceSet = /* @__PURE__ */ new Set();
    /** Titles for historical sessions discovered from disk. */
    this._historicalSessionTitles = new ResourceMap();
    /** Human-readable titles for imported sessions. */
    this._importedSessionTitles = new ResourceMap();
    /** Lazy fetchers for available sessions from providers. Each is invoked at most once. */
    this._availableSessionsFetchers = /* @__PURE__ */ new Set();
    this._availableSessionsRequested = false;
  }
  _isDebugEligibleSession(sessionResource) {
    const sessionType = getChatSessionType(sessionResource);
    return ChatDebugServiceImpl._debugEligibleSessionTypes.has(sessionType) || sessionType.startsWith("remote-") && sessionType.endsWith("-copilotcli") || this._importedSessions.has(sessionResource);
  }
  /**
   * The in-memory event capacity for a session. Agent host (Copilot CLI)
   * sessions honor a dedicated, configurable cap so their (potentially large)
   * on-disk logs can be surfaced without changing the local-session default;
   * all other sessions use {@link ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION}.
   */
  _capacityForSession(sessionResource) {
    if (!isAgentHostTarget(getChatSessionType(sessionResource))) {
      return ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION;
    }
    const configured = this._configurationService.getValue(AgentHostAgentDebugLogMaxEventsSettingId);
    if (typeof configured === "number" && Number.isFinite(configured) && configured >= 1) {
      return Math.floor(configured);
    }
    return ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION;
  }
  log(sessionResource, name, details, level = ChatDebugLogLevel.Info, options) {
    if (!this._isDebugEligibleSession(sessionResource)) {
      return;
    }
    this.addEvent({
      kind: "generic",
      id: options?.id,
      sessionResource,
      created: /* @__PURE__ */ new Date(),
      name,
      details,
      level,
      category: options?.category,
      parentEventId: options?.parentEventId
    });
  }
  addEvent(event) {
    let buffer = this._sessionBuffers.get(event.sessionResource);
    const capacity = buffer?.capacity ?? this._capacityForSession(event.sessionResource);
    if (event.id) {
      let seen = this._seenEventIds.get(event.sessionResource);
      if (!seen) {
        seen = /* @__PURE__ */ new Map();
        this._seenEventIds.set(event.sessionResource, seen);
      }
      const existingKind = seen.get(event.id);
      if (existingKind !== void 0) {
        const priority = ChatDebugServiceImpl._eventKindPriority;
        if ((priority[event.kind] ?? 5) >= (priority[existingKind] ?? 5)) {
          return;
        }
      }
      seen.set(event.id, event.kind);
      if (seen.size > capacity) {
        const firstKey = seen.keys().next().value;
        if (firstKey !== void 0) {
          seen.delete(firstKey);
        }
      }
    }
    if (!buffer) {
      if (this._sessionOrder.length >= ChatDebugServiceImpl.MAX_SESSIONS) {
        const evicted = this._sessionOrder.shift();
        this._evictSession(evicted);
      }
      buffer = new SessionEventBuffer(capacity);
      this._sessionBuffers.set(event.sessionResource, buffer);
      this._sessionOrder.push(event.sessionResource);
    } else {
      const last = this._sessionOrder.length - 1;
      if (last < 0 || !extUri.isEqual(this._sessionOrder[last], event.sessionResource)) {
        const idx = this._sessionOrder.findIndex((u) => extUri.isEqual(u, event.sessionResource));
        if (idx !== -1 && idx !== last) {
          this._sessionOrder.splice(idx, 1);
          this._sessionOrder.push(event.sessionResource);
        }
      }
    }
    buffer.push(event);
    this._onDidAddEvent.fire(event);
  }
  addProviderEvent(event) {
    if (this._pendingProviderClear.has(event.sessionResource)) {
      this._pendingProviderClear.delete(event.sessionResource);
      this._clearProviderEvents(event.sessionResource);
    }
    this._providerEvents.add(event);
    this.addEvent(event);
  }
  getEvents(sessionResource) {
    if (sessionResource) {
      const buffer = this._sessionBuffers.get(sessionResource);
      if (!buffer) {
        return [];
      }
      let result2 = buffer.toArray();
      if (!this._isSorted(result2)) {
        result2.sort((a, b) => a.created.getTime() - b.created.getTime());
      }
      result2 = this._deduplicateEvents(result2);
      return result2;
    }
    const result = [];
    for (const buffer of this._sessionBuffers.values()) {
      result.push(...buffer.toArray());
    }
    result.sort((a, b) => a.created.getTime() - b.created.getTime());
    return result;
  }
  _isSorted(events) {
    for (let i = 1; i < events.length; i++) {
      if (events[i].created.getTime() < events[i - 1].created.getTime()) {
        return false;
      }
    }
    return true;
  }
  _deduplicateEvents(events) {
    const seen = /* @__PURE__ */ new Map();
    const priority = ChatDebugServiceImpl._eventKindPriority;
    const result = [];
    for (const event of events) {
      if (!event.id) {
        result.push(event);
        continue;
      }
      const existingIdx = seen.get(event.id);
      if (existingIdx === void 0) {
        seen.set(event.id, result.length);
        result.push(event);
      } else {
        const existing = result[existingIdx];
        if ((priority[event.kind] ?? 5) < (priority[existing.kind] ?? 5)) {
          result[existingIdx] = event;
        }
      }
    }
    return result;
  }
  getSessionResources() {
    return [...this._sessionOrder];
  }
  clear() {
    this._sessionBuffers.clear();
    this._sessionOrder.length = 0;
    this._seenEventIds.clear();
    this._importedSessions.clear();
    this._importedSessionTitles.clear();
    this._availableSessionResources.length = 0;
    this._availableSessionResourceSet.clear();
    this._historicalSessionTitles.clear();
  }
  /** Remove all ancillary state for an evicted session. */
  _evictSession(sessionResource) {
    this._sessionBuffers.delete(sessionResource);
    this._seenEventIds.delete(sessionResource);
    this._importedSessions.delete(sessionResource);
    this._importedSessionTitles.delete(sessionResource);
    const cts = this._invocationCts.get(sessionResource);
    if (cts) {
      cts.cancel();
      cts.dispose();
      this._invocationCts.delete(sessionResource);
    }
  }
  registerProvider(provider) {
    this._providers.add(provider);
    for (const [sessionResource, cts] of this._invocationCts) {
      if (!cts.token.isCancellationRequested) {
        this._invokeProvider(provider, sessionResource, cts.token).catch(onUnexpectedError);
      }
    }
    return toDisposable(() => {
      this._providers.delete(provider);
    });
  }
  hasInvokedProviders(sessionResource) {
    return this._invocationCts.has(sessionResource);
  }
  async invokeProviders(sessionResource) {
    if (!this._isDebugEligibleSession(sessionResource)) {
      return;
    }
    const existingCts = this._invocationCts.get(sessionResource);
    if (existingCts) {
      existingCts.cancel();
      existingCts.dispose();
    }
    this._pendingProviderClear.set(sessionResource, true);
    const cts = new CancellationTokenSource();
    this._invocationCts.set(sessionResource, cts);
    try {
      const promises = [...this._providers].map(
        (provider) => this._invokeProvider(provider, sessionResource, cts.token)
      );
      await Promise.allSettled(promises);
    } catch (err) {
      onUnexpectedError(err);
    }
  }
  async _invokeProvider(provider, sessionResource, token) {
    try {
      const events = await provider.provideChatDebugLog(sessionResource, token);
      if (events) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < events.length; i++) {
          if (token.isCancellationRequested) {
            break;
          }
          this.addProviderEvent({
            ...events[i],
            sessionResource: events[i].sessionResource ?? sessionResource
          });
          if (i > 0 && i % BATCH_SIZE === 0) {
            await timeout(0);
          }
        }
      }
    } catch (err) {
      onUnexpectedError(err);
    }
  }
  endSession(sessionResource) {
    const cts = this._invocationCts.get(sessionResource);
    if (cts) {
      cts.cancel();
      cts.dispose();
      this._invocationCts.delete(sessionResource);
    }
    this._onDidEndSession.fire(sessionResource);
  }
  _clearProviderEvents(sessionResource) {
    const buffer = this._sessionBuffers.get(sessionResource);
    if (buffer) {
      const coreEvents = buffer.toArray().filter((e) => !this._providerEvents.has(e));
      buffer.clear();
      for (const e of coreEvents) {
        buffer.push(e);
      }
    }
    this._seenEventIds.delete(sessionResource);
    this._onDidClearProviderEvents.fire(sessionResource);
  }
  async resolveEvent(eventId) {
    for (const provider of this._providers) {
      if (provider.resolveChatDebugLogEvent) {
        try {
          const resolved = await provider.resolveChatDebugLogEvent(eventId, CancellationToken.None);
          if (resolved !== void 0) {
            return resolved;
          }
        } catch (err) {
          onUnexpectedError(err);
        }
      }
    }
    return void 0;
  }
  isCoreEvent(event) {
    return !this._providerEvents.has(event);
  }
  setImportedSessionTitle(sessionResource, title) {
    this._importedSessionTitles.set(sessionResource, title);
  }
  getImportedSessionTitle(sessionResource) {
    return this._importedSessionTitles.get(sessionResource);
  }
  addAvailableSessionResources(resources) {
    let added = false;
    for (const { uri, title } of resources) {
      const key = uri.toString();
      if (!this._availableSessionResourceSet.has(key)) {
        this._availableSessionResourceSet.add(key);
        this._availableSessionResources.push(uri);
        added = true;
      }
      if (title) {
        this._historicalSessionTitles.set(uri, title);
      }
    }
    if (added) {
      this._onDidChangeAvailableSessionResources.fire();
    }
  }
  getAvailableSessionResources() {
    this._availableSessionsRequested = true;
    this._tryFetchAvailableSessions();
    const known = new Set(this._sessionOrder.map((u) => u.toString()));
    const result = [...this._sessionOrder];
    for (const uri of this._availableSessionResources) {
      if (!known.has(uri.toString())) {
        known.add(uri.toString());
        result.push(uri);
      }
    }
    return result;
  }
  registerAvailableSessionsFetcher(fetcher) {
    const entry = { fetcher, started: false };
    this._availableSessionsFetchers.add(entry);
    this._tryFetchAvailableSessions();
    return toDisposable(() => this._availableSessionsFetchers.delete(entry));
  }
  _tryFetchAvailableSessions() {
    if (!this._availableSessionsRequested) {
      return;
    }
    for (const entry of this._availableSessionsFetchers) {
      if (entry.started) {
        continue;
      }
      entry.started = true;
      entry.fetcher(CancellationToken.None).then((entries) => {
        if (entries.length > 0) {
          this.addAvailableSessionResources(entries);
        }
      }).catch(onUnexpectedError);
    }
  }
  getHistoricalSessionTitle(sessionResource) {
    return this._historicalSessionTitles.get(sessionResource);
  }
  async exportLog(sessionResource) {
    for (const provider of this._providers) {
      if (provider.provideChatDebugLogExport) {
        try {
          const data = await provider.provideChatDebugLogExport(sessionResource, CancellationToken.None);
          if (data !== void 0) {
            return data;
          }
        } catch (err) {
          onUnexpectedError(err);
        }
      }
    }
    return void 0;
  }
  async importLog(data) {
    for (const provider of this._providers) {
      if (provider.resolveChatDebugLogImport) {
        try {
          const sessionUri = await provider.resolveChatDebugLogImport(data, CancellationToken.None);
          if (sessionUri !== void 0) {
            this._importedSessions.set(sessionUri, true);
            return sessionUri;
          }
        } catch (err) {
          onUnexpectedError(err);
        }
      }
    }
    return void 0;
  }
  dispose() {
    for (const cts of this._invocationCts.values()) {
      cts.cancel();
      cts.dispose();
    }
    this._invocationCts.clear();
    this.clear();
    this._providers.clear();
    super.dispose();
  }
};
ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION = 1e4;
ChatDebugServiceImpl.MAX_SESSIONS = 5;
/** Priority for deduplicating events with the same ID: lower = richer. */
ChatDebugServiceImpl._eventKindPriority = {
  subagentInvocation: 0,
  modelTurn: 1,
  toolCall: 2,
  agentResponse: 3,
  userMessage: 4,
  generic: 5
};
/** Session types eligible for debug logging and provider invocation. */
ChatDebugServiceImpl._debugEligibleSessionTypes = /* @__PURE__ */ new Set([
  localChatSessionType,
  // local sessions
  "copilotcli",
  // Copilot CLI background sessions
  "agent-host-copilotcli"
  // local Agent Host Copilot CLI sessions
]);
ChatDebugServiceImpl = __decorateClass([
  __decorateParam(0, IConfigurationService)
], ChatDebugServiceImpl);
export {
  ChatDebugServiceImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcY2hhdERlYnVnU2VydmljZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0xvZ0xldmVsLCBJQ2hhdERlYnVnRXZlbnQsIElDaGF0RGVidWdMb2dQcm92aWRlciwgSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50LCBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFRhcmdldCwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWdlbnREZWJ1Z0xvZ01heEV2ZW50c1NldHRpbmdJZCB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcblxuLyoqXG4gKiBQZXItc2Vzc2lvbiBjaXJjdWxhciBidWZmZXIgZm9yIGRlYnVnIGV2ZW50cy5cbiAqIFN0b3JlcyB1cCB0byBgY2FwYWNpdHlgIGV2ZW50cyB1c2luZyBhIHJpbmcgYnVmZmVyLlxuICovXG5jbGFzcyBTZXNzaW9uRXZlbnRCdWZmZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9idWZmZXI6IChJQ2hhdERlYnVnRXZlbnQgfCB1bmRlZmluZWQpW107XG5cdHByaXZhdGUgX2hlYWQgPSAwO1xuXHRwcml2YXRlIF9zaXplID0gMDtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBjYXBhY2l0eTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fYnVmZmVyID0gbmV3IEFycmF5KGNhcGFjaXR5KTtcblx0fVxuXG5cdGdldCBzaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpemU7XG5cdH1cblxuXHRwdXNoKGV2ZW50OiBJQ2hhdERlYnVnRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpZHggPSAodGhpcy5faGVhZCArIHRoaXMuX3NpemUpICUgdGhpcy5jYXBhY2l0eTtcblx0XHR0aGlzLl9idWZmZXJbaWR4XSA9IGV2ZW50O1xuXHRcdGlmICh0aGlzLl9zaXplIDwgdGhpcy5jYXBhY2l0eSkge1xuXHRcdFx0dGhpcy5fc2l6ZSsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9oZWFkID0gKHRoaXMuX2hlYWQgKyAxKSAlIHRoaXMuY2FwYWNpdHk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJldHVybiBldmVudHMgaW4gaW5zZXJ0aW9uIG9yZGVyLiAqL1xuXHR0b0FycmF5KCk6IElDaGF0RGVidWdFdmVudFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zaXplOyBpKyspIHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gdGhpcy5fYnVmZmVyWyh0aGlzLl9oZWFkICsgaSkgJSB0aGlzLmNhcGFjaXR5XTtcblx0XHRcdGlmIChldmVudCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChldmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKiogUmVtb3ZlIGV2ZW50cyBtYXRjaGluZyB0aGUgcHJlZGljYXRlIGFuZCBjb21wYWN0IGluLXBsYWNlLiAqL1xuXHRyZW1vdmVXaGVyZShwcmVkaWNhdGU6IChldmVudDogSUNoYXREZWJ1Z0V2ZW50KSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IHdyaXRlID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NpemU7IGkrKykge1xuXHRcdFx0Y29uc3QgaWR4ID0gKHRoaXMuX2hlYWQgKyBpKSAlIHRoaXMuY2FwYWNpdHk7XG5cdFx0XHRjb25zdCBldmVudCA9IHRoaXMuX2J1ZmZlcltpZHhdO1xuXHRcdFx0aWYgKGV2ZW50ICYmIHByZWRpY2F0ZShldmVudCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAod3JpdGUgIT09IGkpIHtcblx0XHRcdFx0Y29uc3Qgd3JpdGVJZHggPSAodGhpcy5faGVhZCArIHdyaXRlKSAlIHRoaXMuY2FwYWNpdHk7XG5cdFx0XHRcdHRoaXMuX2J1ZmZlclt3cml0ZUlkeF0gPSBldmVudDtcblx0XHRcdH1cblx0XHRcdHdyaXRlKys7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSB3cml0ZTsgaSA8IHRoaXMuX3NpemU7IGkrKykge1xuXHRcdFx0dGhpcy5fYnVmZmVyWyh0aGlzLl9oZWFkICsgaSkgJSB0aGlzLmNhcGFjaXR5XSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fc2l6ZSA9IHdyaXRlO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fYnVmZmVyLmZpbGwodW5kZWZpbmVkKTtcblx0XHR0aGlzLl9oZWFkID0gMDtcblx0XHR0aGlzLl9zaXplID0gMDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnU2VydmljZUltcGwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXREZWJ1Z1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRzdGF0aWMgcmVhZG9ubHkgTUFYX0VWRU5UU19QRVJfU0VTU0lPTiA9IDEwXzAwMDtcblx0c3RhdGljIHJlYWRvbmx5IE1BWF9TRVNTSU9OUyA9IDU7XG5cblx0LyoqIFBlci1zZXNzaW9uIGV2ZW50IGJ1ZmZlcnMuIE9yZGVyZWQgZnJvbSBvbGRlc3QgdG8gbmV3ZXN0IHNlc3Npb24gKExSVSkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25CdWZmZXJzID0gbmV3IFJlc291cmNlTWFwPFNlc3Npb25FdmVudEJ1ZmZlcj4oKTtcblx0LyoqIE9yZGVyZWQgbGlzdCBvZiBzZXNzaW9uIFVSSXMgZm9yIExSVSBldmljdGlvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbk9yZGVyOiBVUklbXSA9IFtdO1xuXHQvKiogUGVyLXNlc3Npb24gdHJhY2tpbmcgb2Ygc2VlbiBldmVudCBJRHMgdG8gZGVkdXBsaWNhdGUgZXZlbnRzXG5cdCAqICB0aGF0IHNoYXJlIHRoZSBzYW1lIElEIChlLmcuIHN1YmFnZW50SW52b2NhdGlvbiArIHVzZXJNZXNzYWdlXG5cdCAqICBlbWl0dGVkIGZyb20gdGhlIHNhbWUgc3BhbikuIFN0b3JlcyBpZCBcdTIxOTIgZXZlbnQga2luZCBzbyB3ZSBjYW5cblx0ICogIGtlZXAgdGhlIHJpY2hlciBldmVudCBraW5kIG9uIGNvbGxpc2lvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2VlbkV2ZW50SWRzID0gbmV3IFJlc291cmNlTWFwPE1hcDxzdHJpbmcsIElDaGF0RGVidWdFdmVudFsna2luZCddPj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZEV2ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXREZWJ1Z0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBZGRFdmVudDogRXZlbnQ8SUNoYXREZWJ1Z0V2ZW50PiA9IHRoaXMuX29uRGlkQWRkRXZlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGVhclByb3ZpZGVyRXZlbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGVhclByb3ZpZGVyRXZlbnRzOiBFdmVudDxVUkk+ID0gdGhpcy5fb25EaWRDbGVhclByb3ZpZGVyRXZlbnRzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW5kU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW5kU2Vzc2lvbjogRXZlbnQ8VVJJPiA9IHRoaXMuX29uRGlkRW5kU2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUF2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQXZhaWxhYmxlU2Vzc2lvblJlc291cmNlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnMgPSBuZXcgU2V0PElDaGF0RGVidWdMb2dQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW52b2NhdGlvbkN0cyA9IG5ldyBSZXNvdXJjZU1hcDxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKTtcblxuXHQvKipcblx0ICogU2Vzc2lvbnMgd2hvc2UgcHJvdmlkZXIgZXZlbnRzIHNob3VsZCBiZSBjbGVhcmVkIGJlZm9yZSB0aGUgbmV4dCBiYXRjaCBvZlxuXHQgKiBwcm92aWRlciBldmVudHMgaXMgYXBwbGllZC4gVGhlIGNsZWFyIGlzIGRlZmVycmVkIHVudGlsIHRoZSBmaXJzdCBuZXdcblx0ICogcHJvdmlkZXIgZXZlbnQgYWN0dWFsbHkgYXJyaXZlcyBzbyB0aGF0IGEgcHJvdmlkZXIgd2hpY2ggdHJhbnNpZW50bHlcblx0ICogcmV0dXJucyBub3RoaW5nIChlLmcuIGFuIEFnZW50IEhvc3QgYGV2ZW50cy5qc29ubGAgbWlkLXJld3JpdGUpIGRvZXMgbm90XG5cdCAqIHdpcGUgdGhlIGV2ZW50cyBjdXJyZW50bHkgc2hvd24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUHJvdmlkZXJDbGVhciA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXG5cdC8qKiBFdmVudHMgdGhhdCB3ZXJlIHJldHVybmVkIGJ5IHByb3ZpZGVycyAobm90IGludGVybmFsbHkgbG9nZ2VkKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJFdmVudHMgPSBuZXcgV2Vha1NldDxJQ2hhdERlYnVnRXZlbnQ+KCk7XG5cblx0LyoqIFNlc3Npb24gVVJJcyBjcmVhdGVkIHZpYSBpbXBvcnQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ltcG9ydGVkU2Vzc2lvbnMgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblxuXHQvKiogU2Vzc2lvbiBVUklzIHJlcG9ydGVkIGJ5IHByb3ZpZGVycyBhcyBhdmFpbGFibGUgb24gZGlzayAoaGlzdG9yaWNhbCBzZXNzaW9ucykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F2YWlsYWJsZVNlc3Npb25SZXNvdXJjZVNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKiBUaXRsZXMgZm9yIGhpc3RvcmljYWwgc2Vzc2lvbnMgZGlzY292ZXJlZCBmcm9tIGRpc2suICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcmljYWxTZXNzaW9uVGl0bGVzID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oKTtcblxuXHQvKiogSHVtYW4tcmVhZGFibGUgdGl0bGVzIGZvciBpbXBvcnRlZCBzZXNzaW9ucy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW1wb3J0ZWRTZXNzaW9uVGl0bGVzID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oKTtcblxuXHRhY3RpdmVTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKiogUHJpb3JpdHkgZm9yIGRlZHVwbGljYXRpbmcgZXZlbnRzIHdpdGggdGhlIHNhbWUgSUQ6IGxvd2VyID0gcmljaGVyLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZXZlbnRLaW5kUHJpb3JpdHk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7XG5cdFx0c3ViYWdlbnRJbnZvY2F0aW9uOiAwLFxuXHRcdG1vZGVsVHVybjogMSxcblx0XHR0b29sQ2FsbDogMixcblx0XHRhZ2VudFJlc3BvbnNlOiAzLFxuXHRcdHVzZXJNZXNzYWdlOiA0LFxuXHRcdGdlbmVyaWM6IDUsXG5cdH07XG5cblx0LyoqIFNlc3Npb24gdHlwZXMgZWxpZ2libGUgZm9yIGRlYnVnIGxvZ2dpbmcgYW5kIHByb3ZpZGVyIGludm9jYXRpb24uICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9kZWJ1Z0VsaWdpYmxlU2Vzc2lvblR5cGVzID0gbmV3IFNldChbXG5cdFx0bG9jYWxDaGF0U2Vzc2lvblR5cGUsXHRcdFx0Ly8gbG9jYWwgc2Vzc2lvbnNcblx0XHQnY29waWxvdGNsaScsXHRcdFx0XHQvLyBDb3BpbG90IENMSSBiYWNrZ3JvdW5kIHNlc3Npb25zXG5cdFx0J2FnZW50LWhvc3QtY29waWxvdGNsaScsXHRcdC8vIGxvY2FsIEFnZW50IEhvc3QgQ29waWxvdCBDTEkgc2Vzc2lvbnNcblx0XSk7XG5cblx0cHJpdmF0ZSBfaXNEZWJ1Z0VsaWdpYmxlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0cmV0dXJuIENoYXREZWJ1Z1NlcnZpY2VJbXBsLl9kZWJ1Z0VsaWdpYmxlU2Vzc2lvblR5cGVzLmhhcyhzZXNzaW9uVHlwZSlcblx0XHRcdC8vIFJlbW90ZSBBZ2VudCBIb3N0IENvcGlsb3QgQ0xJIHNlc3Npb25zIHVzZSBhIGR5bmFtaWNcblx0XHRcdC8vIGByZW1vdGUtPGF1dGhvcml0eT4tY29waWxvdGNsaWAgc2NoZW1lOyBzZWUgY29waWxvdENsaUV2ZW50c1VyaS50cy5cblx0XHRcdHx8IChzZXNzaW9uVHlwZS5zdGFydHNXaXRoKCdyZW1vdGUtJykgJiYgc2Vzc2lvblR5cGUuZW5kc1dpdGgoJy1jb3BpbG90Y2xpJykpXG5cdFx0XHR8fCB0aGlzLl9pbXBvcnRlZFNlc3Npb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBpbi1tZW1vcnkgZXZlbnQgY2FwYWNpdHkgZm9yIGEgc2Vzc2lvbi4gQWdlbnQgaG9zdCAoQ29waWxvdCBDTEkpXG5cdCAqIHNlc3Npb25zIGhvbm9yIGEgZGVkaWNhdGVkLCBjb25maWd1cmFibGUgY2FwIHNvIHRoZWlyIChwb3RlbnRpYWxseSBsYXJnZSlcblx0ICogb24tZGlzayBsb2dzIGNhbiBiZSBzdXJmYWNlZCB3aXRob3V0IGNoYW5naW5nIHRoZSBsb2NhbC1zZXNzaW9uIGRlZmF1bHQ7XG5cdCAqIGFsbCBvdGhlciBzZXNzaW9ucyB1c2Uge0BsaW5rIENoYXREZWJ1Z1NlcnZpY2VJbXBsLk1BWF9FVkVOVFNfUEVSX1NFU1NJT059LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FwYWNpdHlGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogbnVtYmVyIHtcblx0XHRpZiAoIWlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKSkge1xuXHRcdFx0cmV0dXJuIENoYXREZWJ1Z1NlcnZpY2VJbXBsLk1BWF9FVkVOVFNfUEVSX1NFU1NJT047XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KEFnZW50SG9zdEFnZW50RGVidWdMb2dNYXhFdmVudHNTZXR0aW5nSWQpO1xuXHRcdGlmICh0eXBlb2YgY29uZmlndXJlZCA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKGNvbmZpZ3VyZWQpICYmIGNvbmZpZ3VyZWQgPj0gMSkge1xuXHRcdFx0cmV0dXJuIE1hdGguZmxvb3IoY29uZmlndXJlZCk7XG5cdFx0fVxuXHRcdHJldHVybiBDaGF0RGVidWdTZXJ2aWNlSW1wbC5NQVhfRVZFTlRTX1BFUl9TRVNTSU9OO1xuXHR9XG5cblx0bG9nKHNlc3Npb25SZXNvdXJjZTogVVJJLCBuYW1lOiBzdHJpbmcsIGRldGFpbHM/OiBzdHJpbmcsIGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbCA9IENoYXREZWJ1Z0xvZ0xldmVsLkluZm8sIG9wdGlvbnM/OiB7IGlkPzogc3RyaW5nOyBjYXRlZ29yeT86IHN0cmluZzsgcGFyZW50RXZlbnRJZD86IHN0cmluZyB9KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0RlYnVnRWxpZ2libGVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5hZGRFdmVudCh7XG5cdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRpZDogb3B0aW9ucz8uaWQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0bmFtZSxcblx0XHRcdGRldGFpbHMsXG5cdFx0XHRsZXZlbCxcblx0XHRcdGNhdGVnb3J5OiBvcHRpb25zPy5jYXRlZ29yeSxcblx0XHRcdHBhcmVudEV2ZW50SWQ6IG9wdGlvbnM/LnBhcmVudEV2ZW50SWQsXG5cdFx0fSk7XG5cdH1cblxuXHRhZGRFdmVudChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogdm9pZCB7XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgc2Vzc2lvbidzIGJ1ZmZlciAoaWYgYW55KSBvbmNlLCBhbmQgaXRzIGNhcGFjaXR5LiBOZXdcblx0XHQvLyBldmVudHMgZHVyaW5nIHN0cmVhbWluZyB0YXJnZXQgYW4gZXhpc3RpbmcgYnVmZmVyLCBzbyB3ZSByZXVzZSBpdHNcblx0XHQvLyBjYXBhY2l0eSBhbmQgYXZvaWQgcmUtcmVhZGluZyBjb25maWd1cmF0aW9uIG9uIHRoZSBob3QgcGF0aC5cblx0XHRsZXQgYnVmZmVyID0gdGhpcy5fc2Vzc2lvbkJ1ZmZlcnMuZ2V0KGV2ZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgY2FwYWNpdHkgPSBidWZmZXI/LmNhcGFjaXR5ID8/IHRoaXMuX2NhcGFjaXR5Rm9yU2Vzc2lvbihldmVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gRGVkdXBsaWNhdGUgZXZlbnRzIHRoYXQgc2hhcmUgdGhlIHNhbWUgSUQuIFRoZSBleHRlbnNpb24gbWF5IGVtaXRcblx0XHQvLyBib3RoIGEgc3ViYWdlbnRJbnZvY2F0aW9uIGFuZCBhIHVzZXJNZXNzYWdlIGZyb20gdGhlIHNhbWUgc3Bhbjtcblx0XHQvLyBrZWVwIHRoZSByaWNoZXIga2luZCBhbmQgZGlzY2FyZCB0aGUgZHVwbGljYXRlLlxuXHRcdGlmIChldmVudC5pZCkge1xuXHRcdFx0bGV0IHNlZW4gPSB0aGlzLl9zZWVuRXZlbnRJZHMuZ2V0KGV2ZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXNlZW4pIHtcblx0XHRcdFx0c2VlbiA9IG5ldyBNYXAoKTtcblx0XHRcdFx0dGhpcy5fc2VlbkV2ZW50SWRzLnNldChldmVudC5zZXNzaW9uUmVzb3VyY2UsIHNlZW4pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXhpc3RpbmdLaW5kID0gc2Vlbi5nZXQoZXZlbnQuaWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nS2luZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IHByaW9yaXR5ID0gQ2hhdERlYnVnU2VydmljZUltcGwuX2V2ZW50S2luZFByaW9yaXR5O1xuXHRcdFx0XHRpZiAoKHByaW9yaXR5W2V2ZW50LmtpbmRdID8/IDUpID49IChwcmlvcml0eVtleGlzdGluZ0tpbmRdID8/IDUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBleGlzdGluZyBpcyByaWNoZXIgb3IgZXF1YWw7IHNraXAgdGhpcyBldmVudFxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE5ldyBldmVudCBpcyByaWNoZXIgXHUyMDE0IHdlIGNhbid0IHJlbW92ZSB0aGUgb2xkIG9uZSBmcm9tXG5cdFx0XHRcdC8vIHRoZSByaW5nIGJ1ZmZlciwgYnV0IHRoZSBkdXBsaWNhdGUgd2lsbCBiZSBmaWx0ZXJlZCBvdXRcblx0XHRcdFx0Ly8gaW4gZ2V0RXZlbnRzKCkuIFVwZGF0ZSB0aGUgdHJhY2tlZCBraW5kLlxuXHRcdFx0fVxuXHRcdFx0c2Vlbi5zZXQoZXZlbnQuaWQsIGV2ZW50LmtpbmQpO1xuXHRcdFx0Ly8gQ2FwIHRoZSBkZWR1cCBtYXAgdG8gcHJldmVudCB1bmJvdW5kZWQgZ3Jvd3RoIGluIGxvbmcgc2Vzc2lvbnMuXG5cdFx0XHRpZiAoc2Vlbi5zaXplID4gY2FwYWNpdHkpIHtcblx0XHRcdFx0Ly8gRGVsZXRlIHRoZSBvbGRlc3QgZW50cnkgKGZpcnN0IGtleSBpbiBpbnNlcnRpb24gb3JkZXIpLlxuXHRcdFx0XHRjb25zdCBmaXJzdEtleSA9IHNlZW4ua2V5cygpLm5leHQoKS52YWx1ZTtcblx0XHRcdFx0aWYgKGZpcnN0S2V5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzZWVuLmRlbGV0ZShmaXJzdEtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWJ1ZmZlcikge1xuXHRcdFx0Ly8gRXZpY3QgbGVhc3QtcmVjZW50bHktdXNlZCBzZXNzaW9uIGlmIHdlIGFyZSBhdCB0aGUgc2Vzc2lvbiBjYXAuXG5cdFx0XHRpZiAodGhpcy5fc2Vzc2lvbk9yZGVyLmxlbmd0aCA+PSBDaGF0RGVidWdTZXJ2aWNlSW1wbC5NQVhfU0VTU0lPTlMpIHtcblx0XHRcdFx0Y29uc3QgZXZpY3RlZCA9IHRoaXMuX3Nlc3Npb25PcmRlci5zaGlmdCgpITtcblx0XHRcdFx0dGhpcy5fZXZpY3RTZXNzaW9uKGV2aWN0ZWQpO1xuXHRcdFx0fVxuXHRcdFx0YnVmZmVyID0gbmV3IFNlc3Npb25FdmVudEJ1ZmZlcihjYXBhY2l0eSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uQnVmZmVycy5zZXQoZXZlbnQuc2Vzc2lvblJlc291cmNlLCBidWZmZXIpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbk9yZGVyLnB1c2goZXZlbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTW92ZSB0byBlbmQgb2YgTFJVIG9yZGVyIHNvIGFjdGl2ZWx5LXVzZWQgc2Vzc2lvbnMgYXJlIG5vdCBldmljdGVkLlxuXHRcdFx0Ly8gRmFzdC1wYXRoOiBkdXJpbmcgc3RyZWFtaW5nL2JhY2tmaWxsIGFsbCBldmVudHMgdGFyZ2V0IHRoZSBzYW1lXG5cdFx0XHQvLyBzZXNzaW9uIHdoaWNoIGlzIGFscmVhZHkgYXQgdGhlIHRhaWwgXHUyMDE0IHNraXAgdGhlIGxpbmVhciBzY2FuLlxuXHRcdFx0Y29uc3QgbGFzdCA9IHRoaXMuX3Nlc3Npb25PcmRlci5sZW5ndGggLSAxO1xuXHRcdFx0aWYgKGxhc3QgPCAwIHx8ICFleHRVcmkuaXNFcXVhbCh0aGlzLl9zZXNzaW9uT3JkZXJbbGFzdF0sIGV2ZW50LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fc2Vzc2lvbk9yZGVyLmZpbmRJbmRleCh1ID0+IGV4dFVyaS5pc0VxdWFsKHUsIGV2ZW50LnNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0XHRpZiAoaWR4ICE9PSAtMSAmJiBpZHggIT09IGxhc3QpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uT3JkZXIuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbk9yZGVyLnB1c2goZXZlbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRidWZmZXIucHVzaChldmVudCk7XG5cdFx0dGhpcy5fb25EaWRBZGRFdmVudC5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGFkZFByb3ZpZGVyRXZlbnQoZXZlbnQ6IElDaGF0RGVidWdFdmVudCk6IHZvaWQge1xuXHRcdC8vIElmIGEgcmUtaW52b2NhdGlvbiBpcyBwZW5kaW5nIGZvciB0aGlzIHNlc3Npb24sIGNsZWFyIHRoZSBwcmV2aW91c2x5XG5cdFx0Ly8gbG9hZGVkIHByb3ZpZGVyIGV2ZW50cyBub3cgdGhhdCBmcmVzaCBkYXRhIGhhcyBhY3R1YWxseSBhcnJpdmVkLiBUaGlzXG5cdFx0Ly8gaXMgZGVmZXJyZWQgKHJhdGhlciB0aGFuIGRvbmUgdXAgZnJvbnQgaW4gaW52b2tlUHJvdmlkZXJzKSBzbyB0aGF0IGFcblx0XHQvLyBwcm92aWRlciB3aGljaCByZXR1cm5zIG5vdGhpbmcgdGhpcyBjeWNsZSBrZWVwcyB0aGUgY3VycmVudCBldmVudHMuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdQcm92aWRlckNsZWFyLmhhcyhldmVudC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUHJvdmlkZXJDbGVhci5kZWxldGUoZXZlbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHRoaXMuX2NsZWFyUHJvdmlkZXJFdmVudHMoZXZlbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlkZXJFdmVudHMuYWRkKGV2ZW50KTtcblx0XHR0aGlzLmFkZEV2ZW50KGV2ZW50KTtcblx0fVxuXG5cdGdldEV2ZW50cyhzZXNzaW9uUmVzb3VyY2U/OiBVUkkpOiByZWFkb25seSBJQ2hhdERlYnVnRXZlbnRbXSB7XG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fc2Vzc2lvbkJ1ZmZlcnMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWJ1ZmZlcikge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRsZXQgcmVzdWx0ID0gYnVmZmVyLnRvQXJyYXkoKTtcblx0XHRcdC8vIFNvcnQgb25seSB3aGVuIHRoZSBidWZmZXIgaXMgbm90IGluIGNocm9ub2xvZ2ljYWwgb3JkZXIsXG5cdFx0XHQvLyB3aGljaCBjYW4gaGFwcGVuIHdoZW4gZXZlbnRzIGFycml2ZSBvdXQgb2Ygb3JkZXIgKGUuZy5cblx0XHRcdC8vIHRhaWwtZmlyc3QgYmFja2ZpbGwpLiBXaGVuIGV2ZW50cyBhcnJpdmUgaW5cblx0XHRcdC8vIG9yZGVyICh0aGUgY29tbW9uIGNhc2UpIHRoZSBjaGVjayBpcyBPKG4pIHdpdGggbm8gc29ydC5cblx0XHRcdGlmICghdGhpcy5faXNTb3J0ZWQocmVzdWx0KSkge1xuXHRcdFx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4gYS5jcmVhdGVkLmdldFRpbWUoKSAtIGIuY3JlYXRlZC5nZXRUaW1lKCkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRGVkdXBsaWNhdGU6IHdoZW4gbXVsdGlwbGUgZXZlbnRzIHNoYXJlIHRoZSBzYW1lIElEIChlLmcuXG5cdFx0XHQvLyBzdWJhZ2VudEludm9jYXRpb24gKyB1c2VyTWVzc2FnZSBmcm9tIHRoZSBzYW1lIHNwYW4pLCBrZWVwXG5cdFx0XHQvLyB0aGUgb25lIHdpdGggdGhlIHJpY2hlc3Qga2luZC5cblx0XHRcdHJlc3VsdCA9IHRoaXMuX2RlZHVwbGljYXRlRXZlbnRzKHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIENyb3NzLXNlc3Npb24gcXVlcnk6IG1lcmdlIGFsbCBidWZmZXJzIGFuZCBzb3J0IHRvIGludGVybGVhdmUuXG5cdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYnVmZmVyIG9mIHRoaXMuX3Nlc3Npb25CdWZmZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5idWZmZXIudG9BcnJheSgpKTtcblx0XHR9XG5cdFx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IGEuY3JlYXRlZC5nZXRUaW1lKCkgLSBiLmNyZWF0ZWQuZ2V0VGltZSgpKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNTb3J0ZWQoZXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZXZlbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoZXZlbnRzW2ldLmNyZWF0ZWQuZ2V0VGltZSgpIDwgZXZlbnRzW2kgLSAxXS5jcmVhdGVkLmdldFRpbWUoKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVkdXBsaWNhdGVFdmVudHMoZXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSk6IElDaGF0RGVidWdFdmVudFtdIHtcblx0XHRjb25zdCBzZWVuID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTsgLy8gaWQgXHUyMTkyIGluZGV4IGluIHJlc3VsdFxuXHRcdGNvbnN0IHByaW9yaXR5ID0gQ2hhdERlYnVnU2VydmljZUltcGwuX2V2ZW50S2luZFByaW9yaXR5O1xuXHRcdGNvbnN0IHJlc3VsdDogSUNoYXREZWJ1Z0V2ZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIGV2ZW50cykge1xuXHRcdFx0aWYgKCFldmVudC5pZCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChldmVudCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXhpc3RpbmdJZHggPSBzZWVuLmdldChldmVudC5pZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmdJZHggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzZWVuLnNldChldmVudC5pZCwgcmVzdWx0Lmxlbmd0aCk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGV2ZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gcmVzdWx0W2V4aXN0aW5nSWR4XTtcblx0XHRcdFx0aWYgKChwcmlvcml0eVtldmVudC5raW5kXSA/PyA1KSA8IChwcmlvcml0eVtleGlzdGluZy5raW5kXSA/PyA1KSkge1xuXHRcdFx0XHRcdHJlc3VsdFtleGlzdGluZ0lkeF0gPSBldmVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0U2Vzc2lvblJlc291cmNlcygpOiByZWFkb25seSBVUklbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9uT3JkZXJdO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbkJ1ZmZlcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXNzaW9uT3JkZXIubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9zZWVuRXZlbnRJZHMuY2xlYXIoKTtcblx0XHR0aGlzLl9pbXBvcnRlZFNlc3Npb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5faW1wb3J0ZWRTZXNzaW9uVGl0bGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fYXZhaWxhYmxlU2Vzc2lvblJlc291cmNlcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2F2YWlsYWJsZVNlc3Npb25SZXNvdXJjZVNldC5jbGVhcigpO1xuXHRcdHRoaXMuX2hpc3RvcmljYWxTZXNzaW9uVGl0bGVzLmNsZWFyKCk7XG5cdH1cblxuXHQvKiogUmVtb3ZlIGFsbCBhbmNpbGxhcnkgc3RhdGUgZm9yIGFuIGV2aWN0ZWQgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSBfZXZpY3RTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbkJ1ZmZlcnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fc2VlbkV2ZW50SWRzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX2ltcG9ydGVkU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5faW1wb3J0ZWRTZXNzaW9uVGl0bGVzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMuX2ludm9jYXRpb25DdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGN0cykge1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2ludm9jYXRpb25DdHMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcjogSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5hZGQocHJvdmlkZXIpO1xuXG5cdFx0Ly8gSW52b2tlIHRoZSBuZXcgcHJvdmlkZXIgZm9yIGFsbCBzZXNzaW9ucyB0aGF0IGFscmVhZHkgaGF2ZSBhY3RpdmVcblx0XHQvLyBwaXBlbGluZXMuIFRoaXMgaGFuZGxlcyB0aGUgY2FzZSB3aGVyZSBpbnZva2VQcm92aWRlcnMoKSB3YXMgY2FsbGVkXG5cdFx0Ly8gYmVmb3JlIHRoaXMgcHJvdmlkZXIgd2FzIHJlZ2lzdGVyZWQgKGUuZy4gZXh0ZW5zaW9uIGFjdGl2YXRlZCBsYXRlKS5cblx0XHRmb3IgKGNvbnN0IFtzZXNzaW9uUmVzb3VyY2UsIGN0c10gb2YgdGhpcy5faW52b2NhdGlvbkN0cykge1xuXHRcdFx0aWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5faW52b2tlUHJvdmlkZXIocHJvdmlkZXIsIHNlc3Npb25SZXNvdXJjZSwgY3RzLnRva2VuKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdGhhc0ludm9rZWRQcm92aWRlcnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faW52b2NhdGlvbkN0cy5oYXMoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZVByb3ZpZGVycyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKCF0aGlzLl9pc0RlYnVnRWxpZ2libGVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQ2FuY2VsIG9ubHkgdGhlIHByZXZpb3VzIGludm9jYXRpb24gZm9yIFRISVMgc2Vzc2lvbiwgbm90IG90aGVycy5cblx0XHQvLyBFYWNoIHNlc3Npb24gaGFzIGl0cyBvd24gcGlwZWxpbmUgc28gZXZlbnRzIGZyb20gbXVsdGlwbGUgc2Vzc2lvbnNcblx0XHQvLyBjYW4gYmUgc3RyZWFtZWQgY29uY3VycmVudGx5LlxuXHRcdGNvbnN0IGV4aXN0aW5nQ3RzID0gdGhpcy5faW52b2NhdGlvbkN0cy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmdDdHMpIHtcblx0XHRcdGV4aXN0aW5nQ3RzLmNhbmNlbCgpO1xuXHRcdFx0ZXhpc3RpbmdDdHMuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgcHJvdmlkZXIgZXZlbnRzIGZvciB0aGlzIHNlc3Npb24gdG8gYmUgY2xlYXJlZCBiZWZvcmUgdGhlIG5leHRcblx0XHQvLyBiYXRjaCBpcyBhcHBsaWVkLiBUaGUgY2xlYXIgaXMgZGVmZXJyZWQgdG8gYWRkUHJvdmlkZXJFdmVudCBzbyB0aGF0IGFcblx0XHQvLyBwcm92aWRlciByZXR1cm5pbmcgbm90aGluZyB0aGlzIGN5Y2xlIHByZXNlcnZlcyB0aGUgY3VycmVudCBldmVudHM7XG5cdFx0Ly8gc2VlIF9wZW5kaW5nUHJvdmlkZXJDbGVhci5cblx0XHR0aGlzLl9wZW5kaW5nUHJvdmlkZXJDbGVhci5zZXQoc2Vzc2lvblJlc291cmNlLCB0cnVlKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX2ludm9jYXRpb25DdHMuc2V0KHNlc3Npb25SZXNvdXJjZSwgY3RzKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwcm9taXNlcyA9IFsuLi50aGlzLl9wcm92aWRlcnNdLm1hcChwcm92aWRlciA9PlxuXHRcdFx0XHR0aGlzLl9pbnZva2VQcm92aWRlcihwcm92aWRlciwgc2Vzc2lvblJlc291cmNlLCBjdHMudG9rZW4pXG5cdFx0XHQpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHByb21pc2VzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fVxuXHRcdC8vIE5vdGU6IGRvIE5PVCBkaXNwb3NlIHRoZSBDVFMgaGVyZSAtIHRoZSB0b2tlbiBpcyB1c2VkIGJ5IHRoZVxuXHRcdC8vIGV4dGVuc2lvbi1zaWRlIHByb2dyZXNzIHBpcGVsaW5lIHdoaWNoIHN0YXlzIGFsaXZlIGZvciBzdHJlYW1pbmcuXG5cdFx0Ly8gSXQgd2lsbCBiZSBjYW5jZWxsZWQrZGlzcG9zZWQgd2hlbiByZS1pbnZva2luZyB0aGUgc2FtZSBzZXNzaW9uXG5cdFx0Ly8gb3Igd2hlbiB0aGUgc2VydmljZSBpcyBkaXNwb3NlZC5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ludm9rZVByb3ZpZGVyKHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIsIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXREZWJ1Z0xvZyhzZXNzaW9uUmVzb3VyY2UsIHRva2VuKTtcblx0XHRcdGlmIChldmVudHMpIHtcblx0XHRcdFx0Ly8gWWllbGQgdG8gdGhlIGV2ZW50IGxvb3AgcGVyaW9kaWNhbGx5IHNvIHRoZSBVSSBzdGF5c1xuXHRcdFx0XHQvLyByZXNwb25zaXZlIHdoZW4gYSBwcm92aWRlciByZXR1cm5zIGEgbGFyZ2UgYmF0Y2ggb2YgZXZlbnRzXG5cdFx0XHRcdC8vIChlLmcuIGltcG9ydGluZyBhIG11bHRpLU1CIGxvZyBmaWxlKS5cblx0XHRcdFx0Y29uc3QgQkFUQ0hfU0laRSA9IDUwMDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBldmVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmFkZFByb3ZpZGVyRXZlbnQoe1xuXHRcdFx0XHRcdFx0Li4uZXZlbnRzW2ldLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBldmVudHNbaV0uc2Vzc2lvblJlc291cmNlID8/IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoaSA+IDAgJiYgaSAlIEJBVENIX1NJWkUgPT09IDApIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdGVuZFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBjdHMgPSB0aGlzLl9pbnZvY2F0aW9uQ3RzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChjdHMpIHtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9pbnZvY2F0aW9uQ3RzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZEVuZFNlc3Npb24uZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJQcm92aWRlckV2ZW50cyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3Nlc3Npb25CdWZmZXJzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChidWZmZXIpIHtcblx0XHRcdC8vIFByb3ZpZGVyIGV2ZW50cyBhcmUgdHlwaWNhbGx5IHRoZSB2YXN0IG1ham9yaXR5ICg5MCUrKS5cblx0XHRcdC8vIEluc3RlYWQgb2YgaXRlcmF0aW5nIHRvIHJlbW92ZSB0aGVtLCBleHRyYWN0IHRoZSBmZXcgY29yZVxuXHRcdFx0Ly8gZXZlbnRzLCBjbGVhciB0aGUgYnVmZmVyLCBhbmQgcmUtYWRkIHRoZW0uXG5cdFx0XHRjb25zdCBjb3JlRXZlbnRzID0gYnVmZmVyLnRvQXJyYXkoKS5maWx0ZXIoZSA9PiAhdGhpcy5fcHJvdmlkZXJFdmVudHMuaGFzKGUpKTtcblx0XHRcdGJ1ZmZlci5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCBlIG9mIGNvcmVFdmVudHMpIHtcblx0XHRcdFx0YnVmZmVyLnB1c2goZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFJlc2V0IGRlZHVwIHRyYWNraW5nIHNvIHJlLWludm9rZWQgcHJvdmlkZXIgZXZlbnRzIGFyZSBhY2NlcHRlZFxuXHRcdHRoaXMuX3NlZW5FdmVudElkcy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9vbkRpZENsZWFyUHJvdmlkZXJFdmVudHMuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUV2ZW50KGV2ZW50SWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9wcm92aWRlcnMpIHtcblx0XHRcdGlmIChwcm92aWRlci5yZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHByb3ZpZGVyLnJlc29sdmVDaGF0RGVidWdMb2dFdmVudChldmVudElkLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc29sdmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aXNDb3JlRXZlbnQoZXZlbnQ6IElDaGF0RGVidWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fcHJvdmlkZXJFdmVudHMuaGFzKGV2ZW50KTtcblx0fVxuXG5cdHNldEltcG9ydGVkU2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faW1wb3J0ZWRTZXNzaW9uVGl0bGVzLnNldChzZXNzaW9uUmVzb3VyY2UsIHRpdGxlKTtcblx0fVxuXG5cdGdldEltcG9ydGVkU2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faW1wb3J0ZWRTZXNzaW9uVGl0bGVzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0YWRkQXZhaWxhYmxlU2Vzc2lvblJlc291cmNlcyhyZXNvdXJjZXM6IHJlYWRvbmx5IHsgdXJpOiBVUkk7IHRpdGxlPzogc3RyaW5nIH1bXSk6IHZvaWQge1xuXHRcdGxldCBhZGRlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgeyB1cmksIHRpdGxlIH0gb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRjb25zdCBrZXkgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRcdGlmICghdGhpcy5fYXZhaWxhYmxlU2Vzc2lvblJlc291cmNlU2V0LmhhcyhrZXkpKSB7XG5cdFx0XHRcdHRoaXMuX2F2YWlsYWJsZVNlc3Npb25SZXNvdXJjZVNldC5hZGQoa2V5KTtcblx0XHRcdFx0dGhpcy5fYXZhaWxhYmxlU2Vzc2lvblJlc291cmNlcy5wdXNoKHVyaSk7XG5cdFx0XHRcdGFkZGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aXRsZSkge1xuXHRcdFx0XHR0aGlzLl9oaXN0b3JpY2FsU2Vzc2lvblRpdGxlcy5zZXQodXJpLCB0aXRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhZGRlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogTGF6eSBmZXRjaGVycyBmb3IgYXZhaWxhYmxlIHNlc3Npb25zIGZyb20gcHJvdmlkZXJzLiBFYWNoIGlzIGludm9rZWQgYXQgbW9zdCBvbmNlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdmFpbGFibGVTZXNzaW9uc0ZldGNoZXJzID0gbmV3IFNldDx7IHJlYWRvbmx5IGZldGNoZXI6ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8eyB1cmk6IFVSSTsgdGl0bGU/OiBzdHJpbmcgfVtdPjsgc3RhcnRlZDogYm9vbGVhbiB9PigpO1xuXHRwcml2YXRlIF9hdmFpbGFibGVTZXNzaW9uc1JlcXVlc3RlZCA9IGZhbHNlO1xuXG5cdGdldEF2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXMoKTogcmVhZG9ubHkgVVJJW10ge1xuXHRcdC8vIFRyaWdnZXIgbGF6eSBmZXRjaCB3aGVuIGJvdGggYSBmZXRjaGVyIGlzIHJlZ2lzdGVyZWQgYW5kIHRoaXMgZ2V0dGVyIGlzIGNhbGxlZC5cblx0XHR0aGlzLl9hdmFpbGFibGVTZXNzaW9uc1JlcXVlc3RlZCA9IHRydWU7XG5cdFx0dGhpcy5fdHJ5RmV0Y2hBdmFpbGFibGVTZXNzaW9ucygpO1xuXG5cdFx0Y29uc3Qga25vd24gPSBuZXcgU2V0KHRoaXMuX3Nlc3Npb25PcmRlci5tYXAodSA9PiB1LnRvU3RyaW5nKCkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBbLi4udGhpcy5fc2Vzc2lvbk9yZGVyXTtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0aGlzLl9hdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzKSB7XG5cdFx0XHRpZiAoIWtub3duLmhhcyh1cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0a25vd24uYWRkKHVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0cmVzdWx0LnB1c2godXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHJlZ2lzdGVyQXZhaWxhYmxlU2Vzc2lvbnNGZXRjaGVyKGZldGNoZXI6ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8eyB1cmk6IFVSSTsgdGl0bGU/OiBzdHJpbmcgfVtdPik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBlbnRyeSA9IHsgZmV0Y2hlciwgc3RhcnRlZDogZmFsc2UgfTtcblx0XHR0aGlzLl9hdmFpbGFibGVTZXNzaW9uc0ZldGNoZXJzLmFkZChlbnRyeSk7XG5cdFx0Ly8gSWYgdGhlIFVJIGFscmVhZHkgcmVxdWVzdGVkIHNlc3Npb25zIGJlZm9yZSB0aGUgZmV0Y2hlciB3YXMgcmVnaXN0ZXJlZCwgZmV0Y2ggbm93LlxuXHRcdHRoaXMuX3RyeUZldGNoQXZhaWxhYmxlU2Vzc2lvbnMoKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2F2YWlsYWJsZVNlc3Npb25zRmV0Y2hlcnMuZGVsZXRlKGVudHJ5KSk7XG5cdH1cblxuXHRwcml2YXRlIF90cnlGZXRjaEF2YWlsYWJsZVNlc3Npb25zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYXZhaWxhYmxlU2Vzc2lvbnNSZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9hdmFpbGFibGVTZXNzaW9uc0ZldGNoZXJzKSB7XG5cdFx0XHRpZiAoZW50cnkuc3RhcnRlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGVudHJ5LnN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0Ly8gRmlyZS1hbmQtZm9yZ2V0OiBkb24ndCBibG9jayB0aGUgY2FsbGVyLlxuXHRcdFx0ZW50cnkuZmV0Y2hlcihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKGVudHJpZXMgPT4ge1xuXHRcdFx0XHRpZiAoZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5hZGRBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzKGVudHJpZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0Z2V0SGlzdG9yaWNhbFNlc3Npb25UaXRsZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2hpc3RvcmljYWxTZXNzaW9uVGl0bGVzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgZXhwb3J0TG9nKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9wcm92aWRlcnMpIHtcblx0XHRcdGlmIChwcm92aWRlci5wcm92aWRlQ2hhdERlYnVnTG9nRXhwb3J0KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0RGVidWdMb2dFeHBvcnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZGF0YTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGltcG9ydExvZyhkYXRhOiBVaW50OEFycmF5KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX3Byb3ZpZGVycykge1xuXHRcdFx0aWYgKHByb3ZpZGVyLnJlc29sdmVDaGF0RGVidWdMb2dJbXBvcnQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgcHJvdmlkZXIucmVzb2x2ZUNoYXREZWJ1Z0xvZ0ltcG9ydChkYXRhLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvblVyaSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pbXBvcnRlZFNlc3Npb25zLnNldChzZXNzaW9uVXJpLCB0cnVlKTtcblx0XHRcdFx0XHRcdHJldHVybiBzZXNzaW9uVXJpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGN0cyBvZiB0aGlzLl9pbnZvY2F0aW9uQ3RzLnZhbHVlcygpKSB7XG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9pbnZvY2F0aW9uQ3RzLmNsZWFyKCk7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFjO0FBRXZCLFNBQVMseUJBQW9IO0FBQzdILFNBQVMsbUJBQW1CLDRCQUE0QjtBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdEQUFnRDtBQU16RCxNQUFNLG1CQUFtQjtBQUFBLEVBS3hCLFlBQXFCLFVBQWtCO0FBQWxCO0FBSHJCLFNBQVEsUUFBUTtBQUNoQixTQUFRLFFBQVE7QUFHZixTQUFLLFVBQVUsSUFBSSxNQUFNLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBRUEsSUFBSSxPQUFlO0FBQ2xCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLEtBQUssT0FBOEI7QUFDbEMsVUFBTSxPQUFPLEtBQUssUUFBUSxLQUFLLFNBQVMsS0FBSztBQUM3QyxTQUFLLFFBQVEsR0FBRyxJQUFJO0FBQ3BCLFFBQUksS0FBSyxRQUFRLEtBQUssVUFBVTtBQUMvQixXQUFLO0FBQUEsSUFDTixPQUFPO0FBQ04sV0FBSyxTQUFTLEtBQUssUUFBUSxLQUFLLEtBQUs7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR0EsVUFBNkI7QUFDNUIsVUFBTSxTQUE0QixDQUFDO0FBQ25DLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxPQUFPLEtBQUs7QUFDcEMsWUFBTSxRQUFRLEtBQUssU0FBUyxLQUFLLFFBQVEsS0FBSyxLQUFLLFFBQVE7QUFDM0QsVUFB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
