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
import { raceTimeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/protocol/common/actions.js";
import { ToolResultContentType } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IAgentHostConnectionsService } from "../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { buildCancelEditAttributionResource, buildCommitEditAttributionResource, buildPrepareEditAttributionResource, createFileEditContentDigest, getFileEditAttributionMarker } from "../../../../../platform/agentHost/common/fileEditAttribution.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditSources } from "../../../../../editor/common/textModelEditSource.js";
const MARKER_TTL = 5 * 60 * 1e3;
const ROUTE_TTL = 10 * 60 * 60 * 1e3;
const MAX_MARKERS_PER_RESOURCE = 128;
const MAX_OBSERVATIONS_PER_RESOURCE = 128;
const MAX_ROUTES = 1e3;
const MAX_COVERAGE_GAP_ACKNOWLEDGEMENTS = 1e3;
const COORDINATION_TIMEOUT = 15e3;
class AgentHostEditAttributionUnknownOutcomeError extends Error {
  constructor(cause) {
    super("The Agent Host edit attribution outcome is unknown", { cause });
  }
}
class AgentHostEditAttributionDeferredError extends Error {
  constructor(cause) {
    super("The Agent Host edit attribution was deferred", { cause });
  }
}
let AgentHostEditMarkerService = class extends Disposable {
  constructor(_connectionsService, _uriIdentityService) {
    super();
    this._connectionsService = _connectionsService;
    this._uriIdentityService = _uriIdentityService;
    this._markers = /* @__PURE__ */ new Map();
    this._observations = /* @__PURE__ */ new Map();
    this._routes = /* @__PURE__ */ new Map();
    this._coverageGaps = /* @__PURE__ */ new Map();
    this._acknowledgedCoverageGapIds = /* @__PURE__ */ new Map();
    this._pendingCoverageGapAcknowledgements = /* @__PURE__ */ new Map();
    this._onDidSuppress = this._register(new Emitter());
    this._onDidResolve = this._register(new Emitter());
    this._onDidInvalidate = this._register(new Emitter());
    this._onDidReceiveMarker = this._register(new Emitter());
    this._connectionListeners = this._register(new DisposableStore());
    this._updateConnectionListeners();
    this._register(this._connectionsService.onDidChangeConnections(() => this._updateConnectionListeners()));
  }
  createCorrelation(resource) {
    const resourceKey = this._key(resource);
    let currentRegistration;
    let clearRegistrationScheduled = false;
    return {
      onDidSuppress: this._onDidSuppress.event,
      onDidResolve: this._onDidResolve.event,
      onDidInvalidate: this._onDidInvalidate.event,
      register: (before, after) => {
        if (currentRegistration?.before === before && currentRegistration.after === after) {
          this._retainObservation(resourceKey, currentRegistration.id);
          return currentRegistration.id;
        }
        const id = this._registerObservation(resourceKey, before, after);
        currentRegistration = { before, after, id };
        if (!clearRegistrationScheduled) {
          clearRegistrationScheduled = true;
          queueMicrotask(() => {
            currentRegistration = void 0;
            clearRegistrationScheduled = false;
          });
        }
        return id;
      },
      isSuppressed: (id) => this._getObservation(resourceKey, id)?.resolution !== void 0,
      getResolution: (id) => this._getObservation(resourceKey, id)?.resolution,
      waitForResolution: (ids, timeoutMs) => this._waitForResolution(resourceKey, ids, timeoutMs),
      release: (id) => this._releaseObservation(resourceKey, id)
    };
  }
  takeCoverageGap(resource, throughSequence = Number.MAX_SAFE_INTEGER) {
    const resourceKey = this._key(resource);
    this._prune(resourceKey);
    const state = this._coverageGaps.get(resourceKey);
    if (!state) {
      return void 0;
    }
    const included = state.entries.filter((entry) => entry.sequence <= throughSequence);
    const remaining = state.entries.filter((entry) => entry.sequence > throughSequence);
    const editCount = included.reduce((sum, entry) => sum + entry.editCount, 0);
    const insertedCount = included.reduce((sum, entry) => sum + entry.insertedCount, 0);
    if (remaining.length > 0) {
      this._coverageGaps.set(resourceKey, {
        entries: remaining,
        timestamp: state.timestamp
      });
    } else {
      this._coverageGaps.delete(resourceKey);
    }
    return editCount > 0 || insertedCount > 0 ? { editCount, insertedCount } : void 0;
  }
  async prepareFlush(resource, trigger, statsUuid, isDirty, languageId = "plaintext") {
    const resourceKey = this._key(resource);
    this._prune(resourceKey);
    const route = this._routes.get(resourceKey);
    if (!route) {
      return void 0;
    }
    const flushToken = generateUuid();
    try {
      const result = await this._resourceRead(route.connection, buildPrepareEditAttributionResource({
        resource: route.resource,
        trigger,
        statsUuid,
        isDirty,
        flushToken,
        languageId
      }));
      const prepared = JSON.parse(result.data);
      if (prepared && (prepared.flushToken !== flushToken || !Number.isSafeInteger(prepared.agentModifiedCount) || prepared.agentModifiedCount < 0 || prepared.lastSequence !== void 0 && (!Number.isSafeInteger(prepared.lastSequence) || prepared.lastSequence < 0) || prepared.coverageGapThroughSequence !== void 0 && (!Number.isSafeInteger(prepared.coverageGapThroughSequence) || prepared.coverageGapThroughSequence < 0 || prepared.lastSequence === void 0 || prepared.coverageGapThroughSequence > prepared.lastSequence) || prepared.standaloneCoverageGapAcknowledgements !== void 0 && prepared.lastSequence === void 0 || !isValidCoverageGapAcknowledgements(prepared.standaloneCoverageGapAcknowledgements, prepared.lastSequence))) {
        throw new Error("Agent Host edit attribution returned an invalid prepared flush");
      }
      if (prepared?.lastSequence !== void 0) {
        await this._waitForMarker(resourceKey, route.connection, prepared.lastSequence);
      }
      if (prepared?.standaloneCoverageGapAcknowledgements !== void 0) {
        this._acknowledgeCoverageGaps(resourceKey, prepared.standaloneCoverageGapAcknowledgements);
      }
      return prepared ? {
        ...prepared,
        commit: async (totalModifiedCount) => {
          let commitError = new Error(`Agent Host edit attribution commit failed: ${prepared.flushToken}`);
          try {
            const result2 = await this._readOutcome(route.connection, buildCommitEditAttributionResource({
              flushToken: prepared.flushToken,
              totalModifiedCount
            }));
            if (result2.outcome === "committed") {
              return;
            }
            commitError = new Error(`Agent Host edit attribution commit was not found: ${prepared.flushToken}`);
          } catch (error) {
            commitError = error;
          }
          let cancelResult;
          try {
            cancelResult = await this._readOutcome(route.connection, buildCancelEditAttributionResource({
              flushToken: prepared.flushToken
            }));
          } catch (cancelError) {
            throw new AgentHostEditAttributionUnknownOutcomeError(new AggregateError(
              [commitError, cancelError],
              "Failed to commit or cancel Agent Host edit attribution"
            ));
          }
          if (cancelResult.outcome === "committed") {
            return;
          }
          throw new AgentHostEditAttributionDeferredError(commitError);
        }
      } : void 0;
    } catch (prepareError) {
      return this._recoverFailedPrepare(route.connection, resourceKey, flushToken, prepareError);
    }
  }
  async _recoverFailedPrepare(connection, resourceKey, flushToken, prepareError) {
    let cancelResult;
    try {
      cancelResult = await this._readOutcome(connection, buildCancelEditAttributionResource({ flushToken }));
    } catch (cancelError) {
      throw new AgentHostEditAttributionUnknownOutcomeError(new AggregateError(
        [prepareError, cancelError],
        "Failed to prepare or cancel Agent Host edit attribution"
      ));
    }
    if (cancelResult.outcome === "committed") {
      let deferCoverageGap = false;
      if (cancelResult.lastSequence !== void 0) {
        try {
          await this._waitForMarker(resourceKey, connection, cancelResult.lastSequence);
        } catch (markerError) {
          throw new AgentHostEditAttributionUnknownOutcomeError(new AggregateError(
            [prepareError, markerError],
            "Committed Agent Host attribution markers did not arrive"
          ));
        }
      }
      if (cancelResult.standaloneCoverageGapAcknowledgements?.length) {
        try {
          await this._waitForMarker(resourceKey, connection, getLastAcknowledgedSequence(cancelResult.standaloneCoverageGapAcknowledgements));
          this._acknowledgeCoverageGaps(resourceKey, cancelResult.standaloneCoverageGapAcknowledgements);
        } catch {
          this._queuePendingCoverageGapAcknowledgements(resourceKey, cancelResult.standaloneCoverageGapAcknowledgements);
          deferCoverageGap = true;
        }
      }
      return {
        flushToken,
        agentModifiedCount: cancelResult.agentModifiedCount,
        lastSequence: cancelResult.lastSequence,
        coverageGapThroughSequence: cancelResult.coverageGapThroughSequence,
        deferCoverageGap,
        commit: async () => {
        }
      };
    }
    throw new AgentHostEditAttributionDeferredError(prepareError);
  }
  async _waitForMarker(resourceKey, connection, sequence) {
    const isCaughtUp = () => {
      const route = this._routes.get(resourceKey);
      return route?.connection === connection && route.lastSequence >= sequence;
    };
    if (isCaughtUp()) {
      return;
    }
    const marker = await raceTimeout(Event.toPromise(Event.filter(
      this._onDidReceiveMarker.event,
      (event) => event.resourceKey === resourceKey && event.connection === connection && event.sequence >= sequence
    )), COORDINATION_TIMEOUT);
    if (!marker && !isCaughtUp()) {
      throw new Error(`Timed out waiting for Agent Host edit attribution marker: ${sequence}`);
    }
  }
  async _resourceRead(connection, resource) {
    const result = await raceTimeout(connection.resourceRead(resource), COORDINATION_TIMEOUT);
    if (!result) {
      throw new Error(`Agent Host edit attribution request timed out: ${resource.path}`);
    }
    return result;
  }
  async _readOutcome(connection, resource) {
    const result = await this._resourceRead(connection, resource);
    const parsed = JSON.parse(result.data);
    if (parsed.outcome !== "committed" && parsed.outcome !== "cancelled" && parsed.outcome !== "missing" || typeof parsed.agentModifiedCount !== "number" || parsed.lastSequence !== void 0 && (!Number.isSafeInteger(parsed.lastSequence) || parsed.lastSequence < 0) || parsed.coverageGapThroughSequence !== void 0 && (!Number.isSafeInteger(parsed.coverageGapThroughSequence) || parsed.coverageGapThroughSequence < 0 || parsed.lastSequence === void 0 || parsed.coverageGapThroughSequence > parsed.lastSequence) || parsed.standaloneCoverageGapAcknowledgements !== void 0 && parsed.lastSequence === void 0 || !isValidCoverageGapAcknowledgements(parsed.standaloneCoverageGapAcknowledgements)) {
      throw new Error(`Invalid Agent Host edit attribution outcome: ${resource.path}`);
    }
    return {
      outcome: parsed.outcome,
      agentModifiedCount: parsed.agentModifiedCount,
      lastSequence: parsed.lastSequence,
      coverageGapThroughSequence: parsed.coverageGapThroughSequence,
      standaloneCoverageGapAcknowledgements: parsed.standaloneCoverageGapAcknowledgements
    };
  }
  _updateConnectionListeners() {
    this._connectionListeners.clear();
    const activeConnections = new Set(this._connectionsService.connections.flatMap((info) => info.connection ? [info.connection] : []));
    for (const [resourceKey, route] of this._routes) {
      if (!activeConnections.has(route.connection)) {
        this._invalidateObservations(resourceKey);
        this._routes.delete(resourceKey);
      }
    }
    for (const connectionInfo of this._connectionsService.connections) {
      const connection = connectionInfo.connection;
      if (!connection) {
        continue;
      }
      this._connectionListeners.add(connection.onDidAction((envelope) => {
        const action = envelope.action;
        if (action.type !== ActionType.ChatToolCallComplete) {
          return;
        }
        for (const content of action.result.content ?? []) {
          if (content.type !== ToolResultContentType.FileEdit) {
            continue;
          }
          const marker = getFileEditAttributionMarker(content);
          const resourceUri = content.after?.uri ?? content.before?.uri;
          if (!marker || !resourceUri) {
            continue;
          }
          const resource = toAgentHostUri(URI.parse(resourceUri), connectionInfo.authority);
          const resourceKey = this._key(resource);
          const previousRoute = this._routes.get(resourceKey);
          if (previousRoute && (previousRoute.connection !== connection || marker.sequence <= previousRoute.lastSequence)) {
            this._invalidateObservations(resourceKey);
          }
          this._routes.delete(resourceKey);
          this._routes.set(resourceKey, {
            connection,
            resource: URI.parse(resourceUri),
            timestamp: Date.now(),
            lastSequence: marker.sequence
          });
          this._onDidReceiveMarker.fire({ resourceKey, connection, sequence: marker.sequence });
          while (this._routes.size > MAX_ROUTES) {
            const oldestKey = this._routes.keys().next().value;
            if (oldestKey === void 0) {
              break;
            }
            this._invalidateObservations(oldestKey);
            this._routes.delete(oldestKey);
          }
          if (marker.status === "skipped") {
            this._recordCoverageGap(resourceKey, marker.sequence, marker.untrackedEditCount ?? 1, marker.insertedCount);
          } else {
            this._recordMarker(resourceKey, marker);
          }
          this._applyPendingCoverageGapAcknowledgements(resourceKey);
        }
      }));
    }
  }
  _recordCoverageGap(resourceKey, sequence, editCount, insertedCount) {
    const existing = this._coverageGaps.get(resourceKey) ?? { entries: [], timestamp: Date.now() };
    if (existing.entries.some((entry) => entry.sequence === sequence)) {
      return;
    }
    existing.entries.push({ sequence, editCount, insertedCount });
    existing.timestamp = Date.now();
    this._coverageGaps.delete(resourceKey);
    this._coverageGaps.set(resourceKey, existing);
    while (this._coverageGaps.size > MAX_ROUTES) {
      const oldestKey = this._coverageGaps.keys().next().value;
      if (oldestKey === void 0) {
        break;
      }
      this._coverageGaps.delete(oldestKey);
    }
  }
  _acknowledgeCoverageGaps(resourceKey, acknowledgements) {
    const remaining = [];
    for (const acknowledgement of acknowledgements) {
      const acknowledgementKey = coverageGapAcknowledgementKey(resourceKey, acknowledgement.id);
      if (this._acknowledgedCoverageGapIds.has(acknowledgementKey)) {
        continue;
      }
      const state = this._coverageGaps.get(resourceKey);
      if (!state) {
        this._recordCoverageGapAcknowledgement(acknowledgementKey);
        continue;
      }
      const acknowledgedSequences = new Set(acknowledgement.sequences);
      const matched = state.entries.filter((entry) => acknowledgedSequences.has(entry.sequence));
      const matchedEditCount = matched.reduce((sum, entry) => sum + entry.editCount, 0);
      const matchedInsertedCount = matched.reduce((sum, entry) => sum + entry.insertedCount, 0);
      if (matched.length !== acknowledgement.sequences.length || matchedEditCount !== acknowledgement.editCount || matchedInsertedCount !== acknowledgement.insertedCount) {
        remaining.push(acknowledgement);
        continue;
      }
      state.entries.splice(0, state.entries.length, ...state.entries.filter((entry) => !acknowledgedSequences.has(entry.sequence)));
      if (state.entries.length > 0) {
        this._coverageGaps.set(resourceKey, state);
      } else {
        this._coverageGaps.delete(resourceKey);
      }
      this._recordCoverageGapAcknowledgement(acknowledgementKey);
    }
    return remaining;
  }
  _recordCoverageGapAcknowledgement(acknowledgementKey) {
    this._acknowledgedCoverageGapIds.delete(acknowledgementKey);
    this._acknowledgedCoverageGapIds.set(acknowledgementKey, Date.now());
    while (this._acknowledgedCoverageGapIds.size > MAX_COVERAGE_GAP_ACKNOWLEDGEMENTS) {
      const oldestKey = this._acknowledgedCoverageGapIds.keys().next().value;
      if (oldestKey === void 0) {
        break;
      }
      this._acknowledgedCoverageGapIds.delete(oldestKey);
    }
  }
  _queuePendingCoverageGapAcknowledgements(resourceKey, acknowledgements) {
    const pending = new Map(
      (this._pendingCoverageGapAcknowledgements.get(resourceKey)?.acknowledgements ?? []).map((acknowledgement) => [acknowledgement.id, acknowledgement])
    );
    for (const acknowledgement of acknowledgements) {
      pending.set(acknowledgement.id, acknowledgement);
    }
    this._pendingCoverageGapAcknowledgements.delete(resourceKey);
    this._pendingCoverageGapAcknowledgements.set(resourceKey, {
      acknowledgements: Array.from(pending.values()),
      timestamp: Date.now()
    });
    while (this._pendingCoverageGapAcknowledgements.size > MAX_ROUTES) {
      const oldestKey = this._pendingCoverageGapAcknowledgements.keys().next().value;
      if (oldestKey === void 0) {
        break;
      }
      this._pendingCoverageGapAcknowledgements.delete(oldestKey);
    }
  }
  _applyPendingCoverageGapAcknowledgements(resourceKey) {
    const pending = this._pendingCoverageGapAcknowledgements.get(resourceKey);
    const route = this._routes.get(resourceKey);
    if (!pending || !route || route.lastSequence < getLastAcknowledgedSequence(pending.acknowledgements)) {
      return;
    }
    this._pendingCoverageGapAcknowledgements.delete(resourceKey);
    const remaining = this._acknowledgeCoverageGaps(resourceKey, pending.acknowledgements);
    if (remaining.length > 0) {
      this._queuePendingCoverageGapAcknowledgements(resourceKey, remaining);
    }
  }
  _registerObservation(resourceKey, before, after) {
    this._prune(resourceKey);
    const observation = {
      id: generateUuid(),
      beforeDigest: createFileEditContentDigest(before),
      afterDigest: createFileEditContentDigest(after),
      timestamp: Date.now(),
      referenceCount: 1
    };
    const observations = this._observations.get(resourceKey) ?? [];
    if (observations.length >= MAX_OBSERVATIONS_PER_RESOURCE) {
      return observation.id;
    }
    observations.push(observation);
    this._observations.set(resourceKey, observations);
    this._tryResolve(resourceKey, observation);
    return observation.id;
  }
  _recordMarker(resourceKey, marker) {
    this._prune(resourceKey);
    const markers = this._markers.get(resourceKey) ?? [];
    if (!markers.some((candidate) => candidate.editId === marker.editId)) {
      markers.push({ ...marker, timestamp: Date.now() });
      markers.sort((a, b) => a.sequence - b.sequence);
      removeCompletedCycle(markers, marker.editId);
      while (markers.length > MAX_MARKERS_PER_RESOURCE) {
        markers.shift();
      }
      this._markers.set(resourceKey, markers);
    }
    for (const observation of this._observations.get(resourceKey) ?? []) {
      this._tryResolve(resourceKey, observation);
    }
  }
  _tryResolve(resourceKey, observation) {
    if (observation.resolution) {
      return;
    }
    const markers = this._markers.get(resourceKey);
    if (!markers) {
      return;
    }
    for (let startIndex = 0; startIndex < markers.length; startIndex++) {
      const first = markers[startIndex];
      if (first.beforeDigest !== observation.beforeDigest) {
        continue;
      }
      const consumed = [startIndex];
      let afterDigest = first.afterDigest;
      let sequence = first.sequence;
      while (afterDigest !== observation.afterDigest) {
        const nextIndex = markers.findIndex(
          (marker, index) => index !== startIndex && !consumed.includes(index) && marker.sequence > sequence && marker.beforeDigest === afterDigest
        );
        if (nextIndex < 0) {
          break;
        }
        consumed.push(nextIndex);
        afterDigest = markers[nextIndex].afterDigest;
        sequence = markers[nextIndex].sequence;
      }
      if (afterDigest !== observation.afterDigest) {
        continue;
      }
      const sources = consumed.map((index) => markers[index].source);
      const firstSource = sources[0];
      const source = firstSource && sources.every(
        (candidate) => candidate !== void 0 && candidate.modelId === firstSource.modelId && candidate.harness === firstSource.harness
      ) ? EditSources.agentHostChatApplyEdits({
        modelId: firstSource.modelId,
        sessionId: firstSource.conversationId,
        requestId: firstSource.requestId,
        harness: firstSource.harness
      }) : void 0;
      observation.resolution = { id: observation.id, source };
      for (const index of consumed.toSorted((a, b) => b - a)) {
        markers.splice(index, 1);
      }
      if (markers.length === 0) {
        this._markers.delete(resourceKey);
      }
      this._onDidSuppress.fire(observation.id);
      this._onDidResolve.fire(observation.resolution);
      return;
    }
  }
  _retainObservation(resourceKey, id) {
    const observation = this._getObservation(resourceKey, id);
    if (observation) {
      observation.referenceCount++;
    }
  }
  _releaseObservation(resourceKey, id) {
    const observations = this._observations.get(resourceKey);
    if (!observations) {
      return;
    }
    const index = observations.findIndex((observation) => observation.id === id);
    if (index >= 0) {
      const observation = observations[index];
      observation.referenceCount--;
      if (observation.referenceCount <= 0) {
        observations.splice(index, 1);
      }
    }
    if (observations.length === 0) {
      this._observations.delete(resourceKey);
    }
  }
  _invalidateObservations(resourceKey) {
    this._markers.delete(resourceKey);
    this._coverageGaps.delete(resourceKey);
    this._pendingCoverageGapAcknowledgements.delete(resourceKey);
    const acknowledgementPrefix = coverageGapAcknowledgementKey(resourceKey, "");
    for (const acknowledgementKey of this._acknowledgedCoverageGapIds.keys()) {
      if (acknowledgementKey.startsWith(acknowledgementPrefix)) {
        this._acknowledgedCoverageGapIds.delete(acknowledgementKey);
      }
    }
    const observations = this._observations.get(resourceKey);
    if (!observations) {
      return;
    }
    for (const observation of observations) {
      if (observation.resolution) {
        this._onDidInvalidate.fire(observation.id);
      }
    }
    this._observations.delete(resourceKey);
  }
  _prune(resourceKey) {
    const now = Date.now();
    const minimumTimestamp = now - MARKER_TTL;
    const markers = this._markers.get(resourceKey)?.filter((marker) => marker.timestamp >= minimumTimestamp);
    if (markers?.length) {
      this._markers.set(resourceKey, markers);
    } else {
      this._markers.delete(resourceKey);
    }
    const observations = this._observations.get(resourceKey)?.filter((observation) => observation.resolution !== void 0 || observation.timestamp >= minimumTimestamp);
    if (observations?.length) {
      this._observations.set(resourceKey, observations);
    } else {
      this._observations.delete(resourceKey);
    }
    if ((this._routes.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
      this._invalidateObservations(resourceKey);
      this._routes.delete(resourceKey);
    }
    if ((this._coverageGaps.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
      this._coverageGaps.delete(resourceKey);
    }
    if ((this._pendingCoverageGapAcknowledgements.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
      this._pendingCoverageGapAcknowledgements.delete(resourceKey);
    }
    for (const [acknowledgementKey, timestamp] of this._acknowledgedCoverageGapIds) {
      if (timestamp < now - ROUTE_TTL) {
        this._acknowledgedCoverageGapIds.delete(acknowledgementKey);
      }
    }
  }
  _key(resource) {
    const normalizedResource = resource.scheme === Schemas.vscodeRemote ? URI.from({ scheme: Schemas.file, path: resource.path }) : resource;
    return this._uriIdentityService.extUri.getComparisonKey(this._uriIdentityService.asCanonicalUri(normalizedResource));
  }
  _getObservation(resourceKey, id) {
    return this._observations.get(resourceKey)?.find((observation) => observation.id === id);
  }
  async _waitForResolution(resourceKey, ids, timeoutMs) {
    const unresolved = new Set(ids.filter((id) => {
      const observation = this._getObservation(resourceKey, id);
      return observation !== void 0 && observation.resolution === void 0;
    }));
    if (unresolved.size === 0) {
      return;
    }
    const store = new DisposableStore();
    try {
      await raceTimeout(new Promise((resolve) => {
        const complete = (id) => {
          unresolved.delete(id);
          if (unresolved.size === 0) {
            resolve();
          }
        };
        store.add(this._onDidResolve.event((resolution) => complete(resolution.id)));
        store.add(this._onDidInvalidate.event(complete));
      }), timeoutMs);
    } finally {
      store.dispose();
    }
  }
};
AgentHostEditMarkerService = __decorateClass([
  __decorateParam(0, IAgentHostConnectionsService),
  __decorateParam(1, IUriIdentityService)
], AgentHostEditMarkerService);
function isValidCoverageGapAcknowledgements(acknowledgements, lastSequence) {
  if (acknowledgements === void 0) {
    return true;
  }
  if (!Array.isArray(acknowledgements) || acknowledgements.length === 0 || new Set(acknowledgements.map((acknowledgement) => acknowledgement.id)).size !== acknowledgements.length) {
    return false;
  }
  return acknowledgements.every(
    (acknowledgement) => typeof acknowledgement.id === "string" && acknowledgement.id.length > 0 && Array.isArray(acknowledgement.sequences) && acknowledgement.sequences.length > 0 && acknowledgement.sequences.every((sequence) => Number.isSafeInteger(sequence) && sequence >= 0 && (lastSequence === void 0 || sequence <= lastSequence)) && new Set(acknowledgement.sequences).size === acknowledgement.sequences.length && Number.isSafeInteger(acknowledgement.editCount) && acknowledgement.editCount > 0 && Number.isSafeInteger(acknowledgement.insertedCount) && acknowledgement.insertedCount >= 0
  );
}
function getLastAcknowledgedSequence(acknowledgements) {
  return Math.max(...acknowledgements.flatMap((acknowledgement) => acknowledgement.sequences));
}
function coverageGapAcknowledgementKey(resourceKey, acknowledgementId) {
  return `${resourceKey}\0${acknowledgementId}`;
}
function removeCompletedCycle(markers, latestEditId) {
  const latestIndex = markers.findIndex((marker) => marker.editId === latestEditId);
  if (latestIndex < 0) {
    return;
  }
  const completedDigest = markers[latestIndex].afterDigest;
  const consumed = [latestIndex];
  let beforeDigest = markers[latestIndex].beforeDigest;
  let sequence = markers[latestIndex].sequence;
  while (true) {
    if (beforeDigest === completedDigest && consumed.length > 1) {
      for (const index of consumed.toSorted((a, b) => b - a)) {
        markers.splice(index, 1);
      }
      return;
    }
    let previousIndex = -1;
    for (let index = markers.length - 1; index >= 0; index--) {
      const marker = markers[index];
      if (marker.sequence < sequence && marker.afterDigest === beforeDigest) {
        previousIndex = index;
        break;
      }
    }
    if (previousIndex < 0) {
      return;
    }
    consumed.push(previousIndex);
    beforeDigest = markers[previousIndex].beforeDigest;
    sequence = markers[previousIndex].sequence;
  }
}
export {
  AgentHostEditAttributionDeferredError,
  AgentHostEditAttributionUnknownOutcomeError,
  AgentHostEditMarkerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXGJyb3dzZXJcXHRlbGVtZXRyeVxcYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2FuY2VsRWRpdEF0dHJpYnV0aW9uUmVzb3VyY2UsIGJ1aWxkQ29tbWl0RWRpdEF0dHJpYnV0aW9uUmVzb3VyY2UsIGJ1aWxkUHJlcGFyZUVkaXRBdHRyaWJ1dGlvblJlc291cmNlLCBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QsIGdldEZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIsIElFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudCwgSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0LCBJUHJlcGFyZWRFZGl0QXR0cmlidXRpb25GbHVzaCwgSVRyYWNrZWRGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9maWxlRWRpdEF0dHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRUZWxlbWV0cnlUcmlnZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi9lZGl0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzLCBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcblxuY29uc3QgTUFSS0VSX1RUTCA9IDUgKiA2MCAqIDEwMDA7XG5jb25zdCBST1VURV9UVEwgPSAxMCAqIDYwICogNjAgKiAxMDAwO1xuY29uc3QgTUFYX01BUktFUlNfUEVSX1JFU09VUkNFID0gMTI4O1xuY29uc3QgTUFYX09CU0VSVkFUSU9OU19QRVJfUkVTT1VSQ0UgPSAxMjg7XG5jb25zdCBNQVhfUk9VVEVTID0gMV8wMDA7XG5jb25zdCBNQVhfQ09WRVJBR0VfR0FQX0FDS05PV0xFREdFTUVOVFMgPSAxXzAwMDtcbmNvbnN0IENPT1JESU5BVElPTl9USU1FT1VUID0gMTVfMDAwO1xuXG5pbnRlcmZhY2UgSVJlY2VudE1hcmtlciBleHRlbmRzIElUcmFja2VkRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciB7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcCB7XG5cdHJlYWRvbmx5IGVkaXRDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBpbnNlcnRlZENvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uQ292ZXJhZ2VHYXBFbnRyeSBleHRlbmRzIElBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcCB7XG5cdHJlYWRvbmx5IHNlcXVlbmNlOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uQ292ZXJhZ2VHYXBTdGF0ZSB7XG5cdHJlYWRvbmx5IGVudHJpZXM6IElBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEVudHJ5W107XG5cdHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUV4dGVybmFsT2JzZXJ2YXRpb24ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBiZWZvcmVEaWdlc3Q6IHN0cmluZztcblx0cmVhZG9ubHkgYWZ0ZXJEaWdlc3Q6IHN0cmluZztcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG5cdHJlZmVyZW5jZUNvdW50OiBudW1iZXI7XG5cdHJlc29sdXRpb24/OiBJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb25SZXNvbHV0aW9uO1xufVxuXG5pbnRlcmZhY2UgSUFnZW50SG9zdFJlc291cmNlUm91dGUge1xuXHRyZWFkb25seSBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uO1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cmVhZG9ubHkgbGFzdFNlcXVlbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByZXBhcmVkQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRmx1c2gge1xuXHRyZWFkb25seSBmbHVzaFRva2VuOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50TW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBsYXN0U2VxdWVuY2U/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlPzogbnVtYmVyO1xuXHRyZWFkb25seSBkZWZlckNvdmVyYWdlR2FwPzogYm9vbGVhbjtcblx0Y29tbWl0KHRvdGFsTW9kaWZpZWRDb3VudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvblVua25vd25PdXRjb21lRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKGNhdXNlOiB1bmtub3duKSB7XG5cdFx0c3VwZXIoJ1RoZSBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gb3V0Y29tZSBpcyB1bmtub3duJywgeyBjYXVzZSB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IoY2F1c2U6IHVua25vd24pIHtcblx0XHRzdXBlcignVGhlIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbiB3YXMgZGVmZXJyZWQnLCB7IGNhdXNlIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlIHtcblx0Y3JlYXRlQ29ycmVsYXRpb24ocmVzb3VyY2U6IFVSSSk6IElFeHRlcm5hbEVkaXRDb3JyZWxhdGlvbjtcblx0dGFrZUNvdmVyYWdlR2FwPyhyZXNvdXJjZTogVVJJLCB0aHJvdWdoU2VxdWVuY2U/OiBudW1iZXIpOiBJQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uQ292ZXJhZ2VHYXAgfCB1bmRlZmluZWQ7XG5cdHByZXBhcmVGbHVzaChyZXNvdXJjZTogVVJJLCB0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc3RhdHNVdWlkOiBzdHJpbmcsIGlzRGlydHk6IGJvb2xlYW4sIGxhbmd1YWdlSWQ/OiBzdHJpbmcpOiBQcm9taXNlPElQcmVwYXJlZEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkZsdXNoIHwgdW5kZWZpbmVkPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb24ge1xuXHRyZWFkb25seSBvbkRpZFN1cHByZXNzOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmU/OiBFdmVudDxJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb25SZXNvbHV0aW9uPjtcblx0cmVhZG9ubHkgb25EaWRJbnZhbGlkYXRlOiBFdmVudDxzdHJpbmc+O1xuXHRyZWdpc3RlcihiZWZvcmU6IHN0cmluZywgYWZ0ZXI6IHN0cmluZyk6IHN0cmluZztcblx0aXNTdXBwcmVzc2VkKGlkOiBzdHJpbmcpOiBib29sZWFuO1xuXHRnZXRSZXNvbHV0aW9uPyhpZDogc3RyaW5nKTogSUV4dGVybmFsRWRpdENvcnJlbGF0aW9uUmVzb2x1dGlvbiB8IHVuZGVmaW5lZDtcblx0d2FpdEZvclJlc29sdXRpb24/KGlkczogcmVhZG9ubHkgc3RyaW5nW10sIHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0cmVsZWFzZShpZDogc3RyaW5nKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb25SZXNvbHV0aW9uIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc291cmNlPzogVGV4dE1vZGVsRWRpdFNvdXJjZTtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtlcnMgPSBuZXcgTWFwPHN0cmluZywgSVJlY2VudE1hcmtlcltdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vYnNlcnZhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUV4dGVybmFsT2JzZXJ2YXRpb25bXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcm91dGVzID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudEhvc3RSZXNvdXJjZVJvdXRlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb3ZlcmFnZUdhcHMgPSBuZXcgTWFwPHN0cmluZywgSUFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwU3RhdGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Fja25vd2xlZGdlZENvdmVyYWdlR2FwSWRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IGFja25vd2xlZGdlbWVudHM6IHJlYWRvbmx5IElFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudFtdOyByZWFkb25seSB0aW1lc3RhbXA6IG51bWJlciB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN1cHByZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXNvbHZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4dGVybmFsRWRpdENvcnJlbGF0aW9uUmVzb2x1dGlvbj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW52YWxpZGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVjZWl2ZU1hcmtlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgcmVzb3VyY2VLZXk6IHN0cmluZzsgcmVhZG9ubHkgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbjsgcmVhZG9ubHkgc2VxdWVuY2U6IG51bWJlciB9PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbnNTZXJ2aWNlOiBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl91cGRhdGVDb25uZWN0aW9uTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29ubmVjdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMoKCkgPT4gdGhpcy5fdXBkYXRlQ29ubmVjdGlvbkxpc3RlbmVycygpKSk7XG5cdH1cblxuXHRjcmVhdGVDb3JyZWxhdGlvbihyZXNvdXJjZTogVVJJKTogSUV4dGVybmFsRWRpdENvcnJlbGF0aW9uIHtcblx0XHRjb25zdCByZXNvdXJjZUtleSA9IHRoaXMuX2tleShyZXNvdXJjZSk7XG5cdFx0bGV0IGN1cnJlbnRSZWdpc3RyYXRpb246IHsgcmVhZG9ubHkgYmVmb3JlOiBzdHJpbmc7IHJlYWRvbmx5IGFmdGVyOiBzdHJpbmc7IHJlYWRvbmx5IGlkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2xlYXJSZWdpc3RyYXRpb25TY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRTdXBwcmVzczogdGhpcy5fb25EaWRTdXBwcmVzcy5ldmVudCxcblx0XHRcdG9uRGlkUmVzb2x2ZTogdGhpcy5fb25EaWRSZXNvbHZlLmV2ZW50LFxuXHRcdFx0b25EaWRJbnZhbGlkYXRlOiB0aGlzLl9vbkRpZEludmFsaWRhdGUuZXZlbnQsXG5cdFx0XHRyZWdpc3RlcjogKGJlZm9yZSwgYWZ0ZXIpID0+IHtcblx0XHRcdFx0aWYgKGN1cnJlbnRSZWdpc3RyYXRpb24/LmJlZm9yZSA9PT0gYmVmb3JlICYmIGN1cnJlbnRSZWdpc3RyYXRpb24uYWZ0ZXIgPT09IGFmdGVyKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmV0YWluT2JzZXJ2YXRpb24ocmVzb3VyY2VLZXksIGN1cnJlbnRSZWdpc3RyYXRpb24uaWQpO1xuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50UmVnaXN0cmF0aW9uLmlkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGlkID0gdGhpcy5fcmVnaXN0ZXJPYnNlcnZhdGlvbihyZXNvdXJjZUtleSwgYmVmb3JlLCBhZnRlcik7XG5cdFx0XHRcdGN1cnJlbnRSZWdpc3RyYXRpb24gPSB7IGJlZm9yZSwgYWZ0ZXIsIGlkIH07XG5cdFx0XHRcdGlmICghY2xlYXJSZWdpc3RyYXRpb25TY2hlZHVsZWQpIHtcblx0XHRcdFx0XHRjbGVhclJlZ2lzdHJhdGlvblNjaGVkdWxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y3VycmVudFJlZ2lzdHJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGNsZWFyUmVnaXN0cmF0aW9uU2NoZWR1bGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGlkO1xuXHRcdFx0fSxcblx0XHRcdGlzU3VwcHJlc3NlZDogaWQgPT4gdGhpcy5fZ2V0T2JzZXJ2YXRpb24ocmVzb3VyY2VLZXksIGlkKT8ucmVzb2x1dGlvbiAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0Z2V0UmVzb2x1dGlvbjogaWQgPT4gdGhpcy5fZ2V0T2JzZXJ2YXRpb24ocmVzb3VyY2VLZXksIGlkKT8ucmVzb2x1dGlvbixcblx0XHRcdHdhaXRGb3JSZXNvbHV0aW9uOiAoaWRzLCB0aW1lb3V0TXMpID0+IHRoaXMuX3dhaXRGb3JSZXNvbHV0aW9uKHJlc291cmNlS2V5LCBpZHMsIHRpbWVvdXRNcyksXG5cdFx0XHRyZWxlYXNlOiBpZCA9PiB0aGlzLl9yZWxlYXNlT2JzZXJ2YXRpb24ocmVzb3VyY2VLZXksIGlkKSxcblx0XHR9O1xuXHR9XG5cblx0dGFrZUNvdmVyYWdlR2FwKHJlc291cmNlOiBVUkksIHRocm91Z2hTZXF1ZW5jZSA9IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKTogSUFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXNvdXJjZUtleSA9IHRoaXMuX2tleShyZXNvdXJjZSk7XG5cdFx0dGhpcy5fcHJ1bmUocmVzb3VyY2VLZXkpO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fY292ZXJhZ2VHYXBzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaW5jbHVkZWQgPSBzdGF0ZS5lbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5zZXF1ZW5jZSA8PSB0aHJvdWdoU2VxdWVuY2UpO1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHN0YXRlLmVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnNlcXVlbmNlID4gdGhyb3VnaFNlcXVlbmNlKTtcblx0XHRjb25zdCBlZGl0Q291bnQgPSBpbmNsdWRlZC5yZWR1Y2UoKHN1bSwgZW50cnkpID0+IHN1bSArIGVudHJ5LmVkaXRDb3VudCwgMCk7XG5cdFx0Y29uc3QgaW5zZXJ0ZWRDb3VudCA9IGluY2x1ZGVkLnJlZHVjZSgoc3VtLCBlbnRyeSkgPT4gc3VtICsgZW50cnkuaW5zZXJ0ZWRDb3VudCwgMCk7XG5cdFx0aWYgKHJlbWFpbmluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9jb3ZlcmFnZUdhcHMuc2V0KHJlc291cmNlS2V5LCB7XG5cdFx0XHRcdGVudHJpZXM6IHJlbWFpbmluZyxcblx0XHRcdFx0dGltZXN0YW1wOiBzdGF0ZS50aW1lc3RhbXAsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY292ZXJhZ2VHYXBzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0Q291bnQgPiAwIHx8IGluc2VydGVkQ291bnQgPiAwID8geyBlZGl0Q291bnQsIGluc2VydGVkQ291bnQgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVGbHVzaChyZXNvdXJjZTogVVJJLCB0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc3RhdHNVdWlkOiBzdHJpbmcsIGlzRGlydHk6IGJvb2xlYW4sIGxhbmd1YWdlSWQgPSAncGxhaW50ZXh0Jyk6IFByb21pc2U8SVByZXBhcmVkQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZUtleSA9IHRoaXMuX2tleShyZXNvdXJjZSk7XG5cdFx0dGhpcy5fcHJ1bmUocmVzb3VyY2VLZXkpO1xuXHRcdGNvbnN0IHJvdXRlID0gdGhpcy5fcm91dGVzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZmx1c2hUb2tlbiA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVJlYWQocm91dGUuY29ubmVjdGlvbiwgYnVpbGRQcmVwYXJlRWRpdEF0dHJpYnV0aW9uUmVzb3VyY2Uoe1xuXHRcdFx0XHRyZXNvdXJjZTogcm91dGUucmVzb3VyY2UsXG5cdFx0XHRcdHRyaWdnZXIsXG5cdFx0XHRcdHN0YXRzVXVpZCxcblx0XHRcdFx0aXNEaXJ0eSxcblx0XHRcdFx0Zmx1c2hUb2tlbixcblx0XHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHByZXBhcmVkID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YSkgYXMgSVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2ggfCBudWxsO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRwcmVwYXJlZCAmJlxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0cHJlcGFyZWQuZmx1c2hUb2tlbiAhPT0gZmx1c2hUb2tlbiB8fFxuXHRcdFx0XHRcdCFOdW1iZXIuaXNTYWZlSW50ZWdlcihwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQpIHx8XG5cdFx0XHRcdFx0cHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50IDwgMCB8fFxuXHRcdFx0XHRcdChwcmVwYXJlZC5sYXN0U2VxdWVuY2UgIT09IHVuZGVmaW5lZCAmJiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKHByZXBhcmVkLmxhc3RTZXF1ZW5jZSkgfHwgcHJlcGFyZWQubGFzdFNlcXVlbmNlIDwgMCkpIHx8XG5cdFx0XHRcdFx0KHByZXBhcmVkLmNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlICE9PSB1bmRlZmluZWQgJiYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihwcmVwYXJlZC5jb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZSkgfHwgcHJlcGFyZWQuY292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2UgPCAwIHx8IHByZXBhcmVkLmxhc3RTZXF1ZW5jZSA9PT0gdW5kZWZpbmVkIHx8IHByZXBhcmVkLmNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlID4gcHJlcGFyZWQubGFzdFNlcXVlbmNlKSkgfHxcblx0XHRcdFx0XHQocHJlcGFyZWQuc3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyAhPT0gdW5kZWZpbmVkICYmIHByZXBhcmVkLmxhc3RTZXF1ZW5jZSA9PT0gdW5kZWZpbmVkKSB8fFxuXHRcdFx0XHRcdCFpc1ZhbGlkQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKHByZXBhcmVkLnN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMsIHByZXBhcmVkLmxhc3RTZXF1ZW5jZSlcblx0XHRcdFx0KVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIHJldHVybmVkIGFuIGludmFsaWQgcHJlcGFyZWQgZmx1c2gnKTtcblx0XHRcdH1cblx0XHRcdGlmIChwcmVwYXJlZD8ubGFzdFNlcXVlbmNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fd2FpdEZvck1hcmtlcihyZXNvdXJjZUtleSwgcm91dGUuY29ubmVjdGlvbiwgcHJlcGFyZWQubGFzdFNlcXVlbmNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChwcmVwYXJlZD8uc3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2Fja25vd2xlZGdlQ292ZXJhZ2VHYXBzKHJlc291cmNlS2V5LCBwcmVwYXJlZC5zdGFuZGFsb25lQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwcmVwYXJlZCA/IHtcblx0XHRcdFx0Li4ucHJlcGFyZWQsXG5cdFx0XHRcdGNvbW1pdDogYXN5bmMgdG90YWxNb2RpZmllZENvdW50ID0+IHtcblx0XHRcdFx0XHRsZXQgY29tbWl0RXJyb3I6IHVua25vd24gPSBuZXcgRXJyb3IoYEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbiBjb21taXQgZmFpbGVkOiAke3ByZXBhcmVkLmZsdXNoVG9rZW59YCk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3JlYWRPdXRjb21lKHJvdXRlLmNvbm5lY3Rpb24sIGJ1aWxkQ29tbWl0RWRpdEF0dHJpYnV0aW9uUmVzb3VyY2Uoe1xuXHRcdFx0XHRcdFx0XHRmbHVzaFRva2VuOiBwcmVwYXJlZC5mbHVzaFRva2VuLFxuXHRcdFx0XHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0Lm91dGNvbWUgPT09ICdjb21taXR0ZWQnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbW1pdEVycm9yID0gbmV3IEVycm9yKGBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gY29tbWl0IHdhcyBub3QgZm91bmQ6ICR7cHJlcGFyZWQuZmx1c2hUb2tlbn1gKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0Y29tbWl0RXJyb3IgPSBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGV0IGNhbmNlbFJlc3VsdDogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0O1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjYW5jZWxSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZWFkT3V0Y29tZShyb3V0ZS5jb25uZWN0aW9uLCBidWlsZENhbmNlbEVkaXRBdHRyaWJ1dGlvblJlc291cmNlKHtcblx0XHRcdFx0XHRcdFx0Zmx1c2hUb2tlbjogcHJlcGFyZWQuZmx1c2hUb2tlbixcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9IGNhdGNoIChjYW5jZWxFcnJvcikge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvblVua25vd25PdXRjb21lRXJyb3IobmV3IEFnZ3JlZ2F0ZUVycm9yKFxuXHRcdFx0XHRcdFx0XHRbY29tbWl0RXJyb3IsIGNhbmNlbEVycm9yXSxcblx0XHRcdFx0XHRcdFx0J0ZhaWxlZCB0byBjb21taXQgb3IgY2FuY2VsIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbidcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY2FuY2VsUmVzdWx0Lm91dGNvbWUgPT09ICdjb21taXR0ZWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yKGNvbW1pdEVycm9yKTtcblx0XHRcdFx0fSxcblx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCAocHJlcGFyZUVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVjb3ZlckZhaWxlZFByZXBhcmUocm91dGUuY29ubmVjdGlvbiwgcmVzb3VyY2VLZXksIGZsdXNoVG9rZW4sIHByZXBhcmVFcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb3ZlckZhaWxlZFByZXBhcmUoY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgcmVzb3VyY2VLZXk6IHN0cmluZywgZmx1c2hUb2tlbjogc3RyaW5nLCBwcmVwYXJlRXJyb3I6IHVua25vd24pOiBQcm9taXNlPElQcmVwYXJlZEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkZsdXNoPiB7XG5cdFx0bGV0IGNhbmNlbFJlc3VsdDogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0O1xuXHRcdHRyeSB7XG5cdFx0XHRjYW5jZWxSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZWFkT3V0Y29tZShjb25uZWN0aW9uLCBidWlsZENhbmNlbEVkaXRBdHRyaWJ1dGlvblJlc291cmNlKHsgZmx1c2hUb2tlbiB9KSk7XG5cdFx0fSBjYXRjaCAoY2FuY2VsRXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yKG5ldyBBZ2dyZWdhdGVFcnJvcihcblx0XHRcdFx0W3ByZXBhcmVFcnJvciwgY2FuY2VsRXJyb3JdLFxuXHRcdFx0XHQnRmFpbGVkIHRvIHByZXBhcmUgb3IgY2FuY2VsIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbidcblx0XHRcdCkpO1xuXHRcdH1cblx0XHRpZiAoY2FuY2VsUmVzdWx0Lm91dGNvbWUgPT09ICdjb21taXR0ZWQnKSB7XG5cdFx0XHRsZXQgZGVmZXJDb3ZlcmFnZUdhcCA9IGZhbHNlO1xuXHRcdFx0aWYgKGNhbmNlbFJlc3VsdC5sYXN0U2VxdWVuY2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JNYXJrZXIocmVzb3VyY2VLZXksIGNvbm5lY3Rpb24sIGNhbmNlbFJlc3VsdC5sYXN0U2VxdWVuY2UpO1xuXHRcdFx0XHR9IGNhdGNoIChtYXJrZXJFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yKG5ldyBBZ2dyZWdhdGVFcnJvcihcblx0XHRcdFx0XHRcdFtwcmVwYXJlRXJyb3IsIG1hcmtlckVycm9yXSxcblx0XHRcdFx0XHRcdCdDb21taXR0ZWQgQWdlbnQgSG9zdCBhdHRyaWJ1dGlvbiBtYXJrZXJzIGRpZCBub3QgYXJyaXZlJ1xuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2FuY2VsUmVzdWx0LnN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM/Lmxlbmd0aCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JNYXJrZXIocmVzb3VyY2VLZXksIGNvbm5lY3Rpb24sIGdldExhc3RBY2tub3dsZWRnZWRTZXF1ZW5jZShjYW5jZWxSZXN1bHQuc3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cykpO1xuXHRcdFx0XHRcdHRoaXMuX2Fja25vd2xlZGdlQ292ZXJhZ2VHYXBzKHJlc291cmNlS2V5LCBjYW5jZWxSZXN1bHQuc3RhbmRhbG9uZUNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdHRoaXMuX3F1ZXVlUGVuZGluZ0NvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyhyZXNvdXJjZUtleSwgY2FuY2VsUmVzdWx0LnN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMpO1xuXHRcdFx0XHRcdGRlZmVyQ292ZXJhZ2VHYXAgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmbHVzaFRva2VuLFxuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IGNhbmNlbFJlc3VsdC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogY2FuY2VsUmVzdWx0Lmxhc3RTZXF1ZW5jZSxcblx0XHRcdFx0Y292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2U6IGNhbmNlbFJlc3VsdC5jb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZSxcblx0XHRcdFx0ZGVmZXJDb3ZlcmFnZUdhcCxcblx0XHRcdFx0Y29tbWl0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvcihwcmVwYXJlRXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvck1hcmtlcihyZXNvdXJjZUtleTogc3RyaW5nLCBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCBzZXF1ZW5jZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaXNDYXVnaHRVcCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHJvdXRlID0gdGhpcy5fcm91dGVzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0XHRyZXR1cm4gcm91dGU/LmNvbm5lY3Rpb24gPT09IGNvbm5lY3Rpb24gJiYgcm91dGUubGFzdFNlcXVlbmNlID49IHNlcXVlbmNlO1xuXHRcdH07XG5cdFx0aWYgKGlzQ2F1Z2h0VXAoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZXIgPSBhd2FpdCByYWNlVGltZW91dChFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKFxuXHRcdFx0dGhpcy5fb25EaWRSZWNlaXZlTWFya2VyLmV2ZW50LFxuXHRcdFx0ZXZlbnQgPT4gZXZlbnQucmVzb3VyY2VLZXkgPT09IHJlc291cmNlS2V5ICYmIGV2ZW50LmNvbm5lY3Rpb24gPT09IGNvbm5lY3Rpb24gJiYgZXZlbnQuc2VxdWVuY2UgPj0gc2VxdWVuY2Vcblx0XHQpKSwgQ09PUkRJTkFUSU9OX1RJTUVPVVQpO1xuXHRcdGlmICghbWFya2VyICYmICFpc0NhdWdodFVwKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGltZWQgb3V0IHdhaXRpbmcgZm9yIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbiBtYXJrZXI6ICR7c2VxdWVuY2V9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb3VyY2VSZWFkKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHJlc291cmNlOiBVUkkpIHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChjb25uZWN0aW9uLnJlc291cmNlUmVhZChyZXNvdXJjZSksIENPT1JESU5BVElPTl9USU1FT1VUKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gcmVxdWVzdCB0aW1lZCBvdXQ6ICR7cmVzb3VyY2UucGF0aH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRPdXRjb21lKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElFZGl0QXR0cmlidXRpb25GbHVzaFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Jlc291cmNlUmVhZChjb25uZWN0aW9uLCByZXNvdXJjZSk7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YSkgYXMgUGFydGlhbDxJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQ+O1xuXHRcdGlmIChcblx0XHRcdChwYXJzZWQub3V0Y29tZSAhPT0gJ2NvbW1pdHRlZCcgJiYgcGFyc2VkLm91dGNvbWUgIT09ICdjYW5jZWxsZWQnICYmIHBhcnNlZC5vdXRjb21lICE9PSAnbWlzc2luZycpIHx8XG5cdFx0XHR0eXBlb2YgcGFyc2VkLmFnZW50TW9kaWZpZWRDb3VudCAhPT0gJ251bWJlcicgfHxcblx0XHRcdChwYXJzZWQubGFzdFNlcXVlbmNlICE9PSB1bmRlZmluZWQgJiYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWQubGFzdFNlcXVlbmNlKSB8fCBwYXJzZWQubGFzdFNlcXVlbmNlIDwgMCkpIHx8XG5cdFx0XHQocGFyc2VkLmNvdmVyYWdlR2FwVGhyb3VnaFNlcXVlbmNlICE9PSB1bmRlZmluZWQgJiYgKCFOdW1iZXIuaXNTYWZlSW50ZWdlcihwYXJzZWQuY292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2UpIHx8IHBhcnNlZC5jb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZSA8IDAgfHwgcGFyc2VkLmxhc3RTZXF1ZW5jZSA9PT0gdW5kZWZpbmVkIHx8IHBhcnNlZC5jb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZSA+IHBhcnNlZC5sYXN0U2VxdWVuY2UpKSB8fFxuXHRcdFx0KHBhcnNlZC5zdGFuZGFsb25lQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzICE9PSB1bmRlZmluZWQgJiYgcGFyc2VkLmxhc3RTZXF1ZW5jZSA9PT0gdW5kZWZpbmVkKSB8fFxuXHRcdFx0IWlzVmFsaWRDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMocGFyc2VkLnN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMpXG5cdFx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIG91dGNvbWU6ICR7cmVzb3VyY2UucGF0aH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdG91dGNvbWU6IHBhcnNlZC5vdXRjb21lLFxuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwYXJzZWQuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0bGFzdFNlcXVlbmNlOiBwYXJzZWQubGFzdFNlcXVlbmNlLFxuXHRcdFx0Y292ZXJhZ2VHYXBUaHJvdWdoU2VxdWVuY2U6IHBhcnNlZC5jb3ZlcmFnZUdhcFRocm91Z2hTZXF1ZW5jZSxcblx0XHRcdHN0YW5kYWxvbmVDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHM6IHBhcnNlZC5zdGFuZGFsb25lQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb25uZWN0aW9uTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25MaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRjb25zdCBhY3RpdmVDb25uZWN0aW9ucyA9IG5ldyBTZXQodGhpcy5fY29ubmVjdGlvbnNTZXJ2aWNlLmNvbm5lY3Rpb25zLmZsYXRNYXAoaW5mbyA9PiBpbmZvLmNvbm5lY3Rpb24gPyBbaW5mby5jb25uZWN0aW9uXSA6IFtdKSk7XG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2VLZXksIHJvdXRlXSBvZiB0aGlzLl9yb3V0ZXMpIHtcblx0XHRcdGlmICghYWN0aXZlQ29ubmVjdGlvbnMuaGFzKHJvdXRlLmNvbm5lY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVPYnNlcnZhdGlvbnMocmVzb3VyY2VLZXkpO1xuXHRcdFx0XHR0aGlzLl9yb3V0ZXMuZGVsZXRlKHJlc291cmNlS2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uSW5mbyBvZiB0aGlzLl9jb25uZWN0aW9uc1NlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBjb25uZWN0aW9uSW5mby5jb25uZWN0aW9uO1xuXHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29ubmVjdGlvbkxpc3RlbmVycy5hZGQoY29ubmVjdGlvbi5vbkRpZEFjdGlvbihlbnZlbG9wZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRcdFx0aWYgKGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgY29udGVudCBvZiBhY3Rpb24ucmVzdWx0LmNvbnRlbnQgPz8gW10pIHtcblx0XHRcdFx0XHRpZiAoY29udGVudC50eXBlICE9PSBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBtYXJrZXIgPSBnZXRGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyKGNvbnRlbnQpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlVXJpID0gY29udGVudC5hZnRlcj8udXJpID8/IGNvbnRlbnQuYmVmb3JlPy51cmk7XG5cdFx0XHRcdFx0aWYgKCFtYXJrZXIgfHwgIXJlc291cmNlVXJpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0b0FnZW50SG9zdFVyaShVUkkucGFyc2UocmVzb3VyY2VVcmkpLCBjb25uZWN0aW9uSW5mby5hdXRob3JpdHkpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlS2V5ID0gdGhpcy5fa2V5KHJlc291cmNlKTtcblx0XHRcdFx0XHRjb25zdCBwcmV2aW91c1JvdXRlID0gdGhpcy5fcm91dGVzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0XHRcdFx0aWYgKHByZXZpb3VzUm91dGUgJiYgKHByZXZpb3VzUm91dGUuY29ubmVjdGlvbiAhPT0gY29ubmVjdGlvbiB8fCBtYXJrZXIuc2VxdWVuY2UgPD0gcHJldmlvdXNSb3V0ZS5sYXN0U2VxdWVuY2UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlT2JzZXJ2YXRpb25zKHJlc291cmNlS2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcm91dGVzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0XHRcdFx0dGhpcy5fcm91dGVzLnNldChyZXNvdXJjZUtleSwge1xuXHRcdFx0XHRcdFx0Y29ubmVjdGlvbixcblx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UocmVzb3VyY2VVcmkpLFxuXHRcdFx0XHRcdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdFx0bGFzdFNlcXVlbmNlOiBtYXJrZXIuc2VxdWVuY2UsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZWNlaXZlTWFya2VyLmZpcmUoeyByZXNvdXJjZUtleSwgY29ubmVjdGlvbiwgc2VxdWVuY2U6IG1hcmtlci5zZXF1ZW5jZSB9KTtcblx0XHRcdFx0XHR3aGlsZSAodGhpcy5fcm91dGVzLnNpemUgPiBNQVhfUk9VVEVTKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvbGRlc3RLZXkgPSB0aGlzLl9yb3V0ZXMua2V5cygpLm5leHQoKS52YWx1ZTtcblx0XHRcdFx0XHRcdGlmIChvbGRlc3RLZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVPYnNlcnZhdGlvbnMob2xkZXN0S2V5KTtcblx0XHRcdFx0XHRcdHRoaXMuX3JvdXRlcy5kZWxldGUob2xkZXN0S2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1hcmtlci5zdGF0dXMgPT09ICdza2lwcGVkJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVjb3JkQ292ZXJhZ2VHYXAocmVzb3VyY2VLZXksIG1hcmtlci5zZXF1ZW5jZSwgbWFya2VyLnVudHJhY2tlZEVkaXRDb3VudCA/PyAxLCBtYXJrZXIuaW5zZXJ0ZWRDb3VudCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlY29yZE1hcmtlcihyZXNvdXJjZUtleSwgbWFya2VyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fYXBwbHlQZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKHJlc291cmNlS2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZENvdmVyYWdlR2FwKHJlc291cmNlS2V5OiBzdHJpbmcsIHNlcXVlbmNlOiBudW1iZXIsIGVkaXRDb3VudDogbnVtYmVyLCBpbnNlcnRlZENvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NvdmVyYWdlR2Fwcy5nZXQocmVzb3VyY2VLZXkpID8/IHsgZW50cmllczogW10sIHRpbWVzdGFtcDogRGF0ZS5ub3coKSB9O1xuXHRcdGlmIChleGlzdGluZy5lbnRyaWVzLnNvbWUoZW50cnkgPT4gZW50cnkuc2VxdWVuY2UgPT09IHNlcXVlbmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRleGlzdGluZy5lbnRyaWVzLnB1c2goeyBzZXF1ZW5jZSwgZWRpdENvdW50LCBpbnNlcnRlZENvdW50IH0pO1xuXHRcdGV4aXN0aW5nLnRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fY292ZXJhZ2VHYXBzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0dGhpcy5fY292ZXJhZ2VHYXBzLnNldChyZXNvdXJjZUtleSwgZXhpc3RpbmcpO1xuXHRcdHdoaWxlICh0aGlzLl9jb3ZlcmFnZUdhcHMuc2l6ZSA+IE1BWF9ST1VURVMpIHtcblx0XHRcdGNvbnN0IG9sZGVzdEtleSA9IHRoaXMuX2NvdmVyYWdlR2Fwcy5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0aWYgKG9sZGVzdEtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY292ZXJhZ2VHYXBzLmRlbGV0ZShvbGRlc3RLZXkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Fja25vd2xlZGdlQ292ZXJhZ2VHYXBzKHJlc291cmNlS2V5OiBzdHJpbmcsIGFja25vd2xlZGdlbWVudHM6IHJlYWRvbmx5IElFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudFtdKTogcmVhZG9ubHkgSUVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50W10ge1xuXHRcdGNvbnN0IHJlbWFpbmluZzogSUVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGFja25vd2xlZGdlbWVudCBvZiBhY2tub3dsZWRnZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBhY2tub3dsZWRnZW1lbnRLZXkgPSBjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudEtleShyZXNvdXJjZUtleSwgYWNrbm93bGVkZ2VtZW50LmlkKTtcblx0XHRcdGlmICh0aGlzLl9hY2tub3dsZWRnZWRDb3ZlcmFnZUdhcElkcy5oYXMoYWNrbm93bGVkZ2VtZW50S2V5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fY292ZXJhZ2VHYXBzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX3JlY29yZENvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50KGFja25vd2xlZGdlbWVudEtleSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWNrbm93bGVkZ2VkU2VxdWVuY2VzID0gbmV3IFNldChhY2tub3dsZWRnZW1lbnQuc2VxdWVuY2VzKTtcblx0XHRcdGNvbnN0IG1hdGNoZWQgPSBzdGF0ZS5lbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBhY2tub3dsZWRnZWRTZXF1ZW5jZXMuaGFzKGVudHJ5LnNlcXVlbmNlKSk7XG5cdFx0XHRjb25zdCBtYXRjaGVkRWRpdENvdW50ID0gbWF0Y2hlZC5yZWR1Y2UoKHN1bSwgZW50cnkpID0+IHN1bSArIGVudHJ5LmVkaXRDb3VudCwgMCk7XG5cdFx0XHRjb25zdCBtYXRjaGVkSW5zZXJ0ZWRDb3VudCA9IG1hdGNoZWQucmVkdWNlKChzdW0sIGVudHJ5KSA9PiBzdW0gKyBlbnRyeS5pbnNlcnRlZENvdW50LCAwKTtcblx0XHRcdGlmIChcblx0XHRcdFx0bWF0Y2hlZC5sZW5ndGggIT09IGFja25vd2xlZGdlbWVudC5zZXF1ZW5jZXMubGVuZ3RoIHx8XG5cdFx0XHRcdG1hdGNoZWRFZGl0Q291bnQgIT09IGFja25vd2xlZGdlbWVudC5lZGl0Q291bnQgfHxcblx0XHRcdFx0bWF0Y2hlZEluc2VydGVkQ291bnQgIT09IGFja25vd2xlZGdlbWVudC5pbnNlcnRlZENvdW50XG5cdFx0XHQpIHtcblx0XHRcdFx0cmVtYWluaW5nLnB1c2goYWNrbm93bGVkZ2VtZW50KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzdGF0ZS5lbnRyaWVzLnNwbGljZSgwLCBzdGF0ZS5lbnRyaWVzLmxlbmd0aCwgLi4uc3RhdGUuZW50cmllcy5maWx0ZXIoZW50cnkgPT4gIWFja25vd2xlZGdlZFNlcXVlbmNlcy5oYXMoZW50cnkuc2VxdWVuY2UpKSk7XG5cdFx0XHRpZiAoc3RhdGUuZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2NvdmVyYWdlR2Fwcy5zZXQocmVzb3VyY2VLZXksIHN0YXRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvdmVyYWdlR2Fwcy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVjb3JkQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnQoYWNrbm93bGVkZ2VtZW50S2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlbWFpbmluZztcblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZENvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50KGFja25vd2xlZGdlbWVudEtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNrbm93bGVkZ2VkQ292ZXJhZ2VHYXBJZHMuZGVsZXRlKGFja25vd2xlZGdlbWVudEtleSk7XG5cdFx0dGhpcy5fYWNrbm93bGVkZ2VkQ292ZXJhZ2VHYXBJZHMuc2V0KGFja25vd2xlZGdlbWVudEtleSwgRGF0ZS5ub3coKSk7XG5cdFx0d2hpbGUgKHRoaXMuX2Fja25vd2xlZGdlZENvdmVyYWdlR2FwSWRzLnNpemUgPiBNQVhfQ09WRVJBR0VfR0FQX0FDS05PV0xFREdFTUVOVFMpIHtcblx0XHRcdGNvbnN0IG9sZGVzdEtleSA9IHRoaXMuX2Fja25vd2xlZGdlZENvdmVyYWdlR2FwSWRzLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRpZiAob2xkZXN0S2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY2tub3dsZWRnZWRDb3ZlcmFnZUdhcElkcy5kZWxldGUob2xkZXN0S2V5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9xdWV1ZVBlbmRpbmdDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMocmVzb3VyY2VLZXk6IHN0cmluZywgYWNrbm93bGVkZ2VtZW50czogcmVhZG9ubHkgSUVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50W10pOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nID0gbmV3IE1hcChcblx0XHRcdCh0aGlzLl9wZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLmdldChyZXNvdXJjZUtleSk/LmFja25vd2xlZGdlbWVudHMgPz8gW10pLm1hcChhY2tub3dsZWRnZW1lbnQgPT4gW2Fja25vd2xlZGdlbWVudC5pZCwgYWNrbm93bGVkZ2VtZW50XSlcblx0XHQpO1xuXHRcdGZvciAoY29uc3QgYWNrbm93bGVkZ2VtZW50IG9mIGFja25vd2xlZGdlbWVudHMpIHtcblx0XHRcdHBlbmRpbmcuc2V0KGFja25vd2xlZGdlbWVudC5pZCwgYWNrbm93bGVkZ2VtZW50KTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMuc2V0KHJlc291cmNlS2V5LCB7XG5cdFx0XHRhY2tub3dsZWRnZW1lbnRzOiBBcnJheS5mcm9tKHBlbmRpbmcudmFsdWVzKCkpLFxuXHRcdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdHdoaWxlICh0aGlzLl9wZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLnNpemUgPiBNQVhfUk9VVEVTKSB7XG5cdFx0XHRjb25zdCBvbGRlc3RLZXkgPSB0aGlzLl9wZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLmtleXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRpZiAob2xkZXN0S2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLmRlbGV0ZShvbGRlc3RLZXkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5UGVuZGluZ0NvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cyhyZXNvdXJjZUtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMuZ2V0KHJlc291cmNlS2V5KTtcblx0XHRjb25zdCByb3V0ZSA9IHRoaXMuX3JvdXRlcy5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdGlmICghcGVuZGluZyB8fCAhcm91dGUgfHwgcm91dGUubGFzdFNlcXVlbmNlIDwgZ2V0TGFzdEFja25vd2xlZGdlZFNlcXVlbmNlKHBlbmRpbmcuYWNrbm93bGVkZ2VtZW50cykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50cy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHRoaXMuX2Fja25vd2xlZGdlQ292ZXJhZ2VHYXBzKHJlc291cmNlS2V5LCBwZW5kaW5nLmFja25vd2xlZGdlbWVudHMpO1xuXHRcdGlmIChyZW1haW5pbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcXVldWVQZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKHJlc291cmNlS2V5LCByZW1haW5pbmcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyT2JzZXJ2YXRpb24ocmVzb3VyY2VLZXk6IHN0cmluZywgYmVmb3JlOiBzdHJpbmcsIGFmdGVyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHRoaXMuX3BydW5lKHJlc291cmNlS2V5KTtcblx0XHRjb25zdCBvYnNlcnZhdGlvbjogSUV4dGVybmFsT2JzZXJ2YXRpb24gPSB7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRiZWZvcmVEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChiZWZvcmUpLFxuXHRcdFx0YWZ0ZXJEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChhZnRlciksXG5cdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0XHRyZWZlcmVuY2VDb3VudDogMSxcblx0XHR9O1xuXHRcdGNvbnN0IG9ic2VydmF0aW9ucyA9IHRoaXMuX29ic2VydmF0aW9ucy5nZXQocmVzb3VyY2VLZXkpID8/IFtdO1xuXHRcdGlmIChvYnNlcnZhdGlvbnMubGVuZ3RoID49IE1BWF9PQlNFUlZBVElPTlNfUEVSX1JFU09VUkNFKSB7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YXRpb24uaWQ7XG5cdFx0fVxuXHRcdG9ic2VydmF0aW9ucy5wdXNoKG9ic2VydmF0aW9uKTtcblx0XHR0aGlzLl9vYnNlcnZhdGlvbnMuc2V0KHJlc291cmNlS2V5LCBvYnNlcnZhdGlvbnMpO1xuXHRcdHRoaXMuX3RyeVJlc29sdmUocmVzb3VyY2VLZXksIG9ic2VydmF0aW9uKTtcblx0XHRyZXR1cm4gb2JzZXJ2YXRpb24uaWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmRNYXJrZXIocmVzb3VyY2VLZXk6IHN0cmluZywgbWFya2VyOiBJVHJhY2tlZEZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9wcnVuZShyZXNvdXJjZUtleSk7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMuX21hcmtlcnMuZ2V0KHJlc291cmNlS2V5KSA/PyBbXTtcblx0XHRpZiAoIW1hcmtlcnMuc29tZShjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmVkaXRJZCA9PT0gbWFya2VyLmVkaXRJZCkpIHtcblx0XHRcdG1hcmtlcnMucHVzaCh7IC4uLm1hcmtlciwgdGltZXN0YW1wOiBEYXRlLm5vdygpIH0pO1xuXHRcdFx0bWFya2Vycy5zb3J0KChhLCBiKSA9PiBhLnNlcXVlbmNlIC0gYi5zZXF1ZW5jZSk7XG5cdFx0XHRyZW1vdmVDb21wbGV0ZWRDeWNsZShtYXJrZXJzLCBtYXJrZXIuZWRpdElkKTtcblx0XHRcdHdoaWxlIChtYXJrZXJzLmxlbmd0aCA+IE1BWF9NQVJLRVJTX1BFUl9SRVNPVVJDRSkge1xuXHRcdFx0XHRtYXJrZXJzLnNoaWZ0KCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tYXJrZXJzLnNldChyZXNvdXJjZUtleSwgbWFya2Vycyk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgb2JzZXJ2YXRpb24gb2YgdGhpcy5fb2JzZXJ2YXRpb25zLmdldChyZXNvdXJjZUtleSkgPz8gW10pIHtcblx0XHRcdHRoaXMuX3RyeVJlc29sdmUocmVzb3VyY2VLZXksIG9ic2VydmF0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cnlSZXNvbHZlKHJlc291cmNlS2V5OiBzdHJpbmcsIG9ic2VydmF0aW9uOiBJRXh0ZXJuYWxPYnNlcnZhdGlvbik6IHZvaWQge1xuXHRcdGlmIChvYnNlcnZhdGlvbi5yZXNvbHV0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtlcnMgPSB0aGlzLl9tYXJrZXJzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0aWYgKCFtYXJrZXJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAobGV0IHN0YXJ0SW5kZXggPSAwOyBzdGFydEluZGV4IDwgbWFya2Vycy5sZW5ndGg7IHN0YXJ0SW5kZXgrKykge1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBtYXJrZXJzW3N0YXJ0SW5kZXhdO1xuXHRcdFx0aWYgKGZpcnN0LmJlZm9yZURpZ2VzdCAhPT0gb2JzZXJ2YXRpb24uYmVmb3JlRGlnZXN0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29uc3VtZWQgPSBbc3RhcnRJbmRleF07XG5cdFx0XHRsZXQgYWZ0ZXJEaWdlc3QgPSBmaXJzdC5hZnRlckRpZ2VzdDtcblx0XHRcdGxldCBzZXF1ZW5jZSA9IGZpcnN0LnNlcXVlbmNlO1xuXHRcdFx0d2hpbGUgKGFmdGVyRGlnZXN0ICE9PSBvYnNlcnZhdGlvbi5hZnRlckRpZ2VzdCkge1xuXHRcdFx0XHRjb25zdCBuZXh0SW5kZXggPSBtYXJrZXJzLmZpbmRJbmRleCgobWFya2VyLCBpbmRleCkgPT5cblx0XHRcdFx0XHRpbmRleCAhPT0gc3RhcnRJbmRleCAmJlxuXHRcdFx0XHRcdCFjb25zdW1lZC5pbmNsdWRlcyhpbmRleCkgJiZcblx0XHRcdFx0XHRtYXJrZXIuc2VxdWVuY2UgPiBzZXF1ZW5jZSAmJlxuXHRcdFx0XHRcdG1hcmtlci5iZWZvcmVEaWdlc3QgPT09IGFmdGVyRGlnZXN0XG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmIChuZXh0SW5kZXggPCAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3VtZWQucHVzaChuZXh0SW5kZXgpO1xuXHRcdFx0XHRhZnRlckRpZ2VzdCA9IG1hcmtlcnNbbmV4dEluZGV4XS5hZnRlckRpZ2VzdDtcblx0XHRcdFx0c2VxdWVuY2UgPSBtYXJrZXJzW25leHRJbmRleF0uc2VxdWVuY2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWZ0ZXJEaWdlc3QgIT09IG9ic2VydmF0aW9uLmFmdGVyRGlnZXN0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlcyA9IGNvbnN1bWVkLm1hcChpbmRleCA9PiBtYXJrZXJzW2luZGV4XS5zb3VyY2UpO1xuXHRcdFx0Y29uc3QgZmlyc3RTb3VyY2UgPSBzb3VyY2VzWzBdO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gZmlyc3RTb3VyY2UgJiYgc291cmNlcy5ldmVyeShjYW5kaWRhdGUgPT5cblx0XHRcdFx0Y2FuZGlkYXRlICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0Y2FuZGlkYXRlLm1vZGVsSWQgPT09IGZpcnN0U291cmNlLm1vZGVsSWQgJiZcblx0XHRcdFx0Y2FuZGlkYXRlLmhhcm5lc3MgPT09IGZpcnN0U291cmNlLmhhcm5lc3Ncblx0XHRcdCkgPyBFZGl0U291cmNlcy5hZ2VudEhvc3RDaGF0QXBwbHlFZGl0cyh7XG5cdFx0XHRcdG1vZGVsSWQ6IGZpcnN0U291cmNlLm1vZGVsSWQsXG5cdFx0XHRcdHNlc3Npb25JZDogZmlyc3RTb3VyY2UuY29udmVyc2F0aW9uSWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogZmlyc3RTb3VyY2UucmVxdWVzdElkLFxuXHRcdFx0XHRoYXJuZXNzOiBmaXJzdFNvdXJjZS5oYXJuZXNzLFxuXHRcdFx0fSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRvYnNlcnZhdGlvbi5yZXNvbHV0aW9uID0geyBpZDogb2JzZXJ2YXRpb24uaWQsIHNvdXJjZSB9O1xuXHRcdFx0Zm9yIChjb25zdCBpbmRleCBvZiBjb25zdW1lZC50b1NvcnRlZCgoYSwgYikgPT4gYiAtIGEpKSB7XG5cdFx0XHRcdG1hcmtlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXJrZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9tYXJrZXJzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZFN1cHByZXNzLmZpcmUob2JzZXJ2YXRpb24uaWQpO1xuXHRcdFx0dGhpcy5fb25EaWRSZXNvbHZlLmZpcmUob2JzZXJ2YXRpb24ucmVzb2x1dGlvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmV0YWluT2JzZXJ2YXRpb24ocmVzb3VyY2VLZXk6IHN0cmluZywgaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG9ic2VydmF0aW9uID0gdGhpcy5fZ2V0T2JzZXJ2YXRpb24ocmVzb3VyY2VLZXksIGlkKTtcblx0XHRpZiAob2JzZXJ2YXRpb24pIHtcblx0XHRcdG9ic2VydmF0aW9uLnJlZmVyZW5jZUNvdW50Kys7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVsZWFzZU9ic2VydmF0aW9uKHJlc291cmNlS2V5OiBzdHJpbmcsIGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBvYnNlcnZhdGlvbnMgPSB0aGlzLl9vYnNlcnZhdGlvbnMuZ2V0KHJlc291cmNlS2V5KTtcblx0XHRpZiAoIW9ic2VydmF0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IG9ic2VydmF0aW9ucy5maW5kSW5kZXgob2JzZXJ2YXRpb24gPT4gb2JzZXJ2YXRpb24uaWQgPT09IGlkKTtcblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YXRpb24gPSBvYnNlcnZhdGlvbnNbaW5kZXhdO1xuXHRcdFx0b2JzZXJ2YXRpb24ucmVmZXJlbmNlQ291bnQtLTtcblx0XHRcdGlmIChvYnNlcnZhdGlvbi5yZWZlcmVuY2VDb3VudCA8PSAwKSB7XG5cdFx0XHRcdG9ic2VydmF0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob2JzZXJ2YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb2JzZXJ2YXRpb25zLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZU9ic2VydmF0aW9ucyhyZXNvdXJjZUtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFya2Vycy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdHRoaXMuX2NvdmVyYWdlR2Fwcy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudHMuZGVsZXRlKHJlc291cmNlS2V5KTtcblx0XHRjb25zdCBhY2tub3dsZWRnZW1lbnRQcmVmaXggPSBjb3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudEtleShyZXNvdXJjZUtleSwgJycpO1xuXHRcdGZvciAoY29uc3QgYWNrbm93bGVkZ2VtZW50S2V5IG9mIHRoaXMuX2Fja25vd2xlZGdlZENvdmVyYWdlR2FwSWRzLmtleXMoKSkge1xuXHRcdFx0aWYgKGFja25vd2xlZGdlbWVudEtleS5zdGFydHNXaXRoKGFja25vd2xlZGdlbWVudFByZWZpeCkpIHtcblx0XHRcdFx0dGhpcy5fYWNrbm93bGVkZ2VkQ292ZXJhZ2VHYXBJZHMuZGVsZXRlKGFja25vd2xlZGdlbWVudEtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG9ic2VydmF0aW9ucyA9IHRoaXMuX29ic2VydmF0aW9ucy5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdGlmICghb2JzZXJ2YXRpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgb2JzZXJ2YXRpb24gb2Ygb2JzZXJ2YXRpb25zKSB7XG5cdFx0XHRpZiAob2JzZXJ2YXRpb24ucmVzb2x1dGlvbikge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEludmFsaWRhdGUuZmlyZShvYnNlcnZhdGlvbi5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29ic2VydmF0aW9ucy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJ1bmUocmVzb3VyY2VLZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgbWluaW11bVRpbWVzdGFtcCA9IG5vdyAtIE1BUktFUl9UVEw7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMuX21hcmtlcnMuZ2V0KHJlc291cmNlS2V5KT8uZmlsdGVyKG1hcmtlciA9PiBtYXJrZXIudGltZXN0YW1wID49IG1pbmltdW1UaW1lc3RhbXApO1xuXHRcdGlmIChtYXJrZXJzPy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX21hcmtlcnMuc2V0KHJlc291cmNlS2V5LCBtYXJrZXJzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWFya2Vycy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdH1cblx0XHRjb25zdCBvYnNlcnZhdGlvbnMgPSB0aGlzLl9vYnNlcnZhdGlvbnMuZ2V0KHJlc291cmNlS2V5KT8uZmlsdGVyKG9ic2VydmF0aW9uID0+IG9ic2VydmF0aW9uLnJlc29sdXRpb24gIT09IHVuZGVmaW5lZCB8fCBvYnNlcnZhdGlvbi50aW1lc3RhbXAgPj0gbWluaW11bVRpbWVzdGFtcCk7XG5cdFx0aWYgKG9ic2VydmF0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9vYnNlcnZhdGlvbnMuc2V0KHJlc291cmNlS2V5LCBvYnNlcnZhdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vYnNlcnZhdGlvbnMuZGVsZXRlKHJlc291cmNlS2V5KTtcblx0XHR9XG5cdFx0aWYgKCh0aGlzLl9yb3V0ZXMuZ2V0KHJlc291cmNlS2V5KT8udGltZXN0YW1wID8/IG5vdykgPCBub3cgLSBST1VURV9UVEwpIHtcblx0XHRcdHRoaXMuX2ludmFsaWRhdGVPYnNlcnZhdGlvbnMocmVzb3VyY2VLZXkpO1xuXHRcdFx0dGhpcy5fcm91dGVzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0fVxuXHRcdGlmICgodGhpcy5fY292ZXJhZ2VHYXBzLmdldChyZXNvdXJjZUtleSk/LnRpbWVzdGFtcCA/PyBub3cpIDwgbm93IC0gUk9VVEVfVFRMKSB7XG5cdFx0XHR0aGlzLl9jb3ZlcmFnZUdhcHMuZGVsZXRlKHJlc291cmNlS2V5KTtcblx0XHR9XG5cdFx0aWYgKCh0aGlzLl9wZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLmdldChyZXNvdXJjZUtleSk/LnRpbWVzdGFtcCA/PyBub3cpIDwgbm93IC0gUk9VVEVfVFRMKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2Fja25vd2xlZGdlbWVudEtleSwgdGltZXN0YW1wXSBvZiB0aGlzLl9hY2tub3dsZWRnZWRDb3ZlcmFnZUdhcElkcykge1xuXHRcdFx0aWYgKHRpbWVzdGFtcCA8IG5vdyAtIFJPVVRFX1RUTCkge1xuXHRcdFx0XHR0aGlzLl9hY2tub3dsZWRnZWRDb3ZlcmFnZUdhcElkcy5kZWxldGUoYWNrbm93bGVkZ2VtZW50S2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9rZXkocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZFJlc291cmNlID0gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZVxuXHRcdFx0PyBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiByZXNvdXJjZS5wYXRoIH0pXG5cdFx0XHQ6IHJlc291cmNlO1xuXHRcdHJldHVybiB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkodGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKG5vcm1hbGl6ZWRSZXNvdXJjZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T2JzZXJ2YXRpb24ocmVzb3VyY2VLZXk6IHN0cmluZywgaWQ6IHN0cmluZyk6IElFeHRlcm5hbE9ic2VydmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb2JzZXJ2YXRpb25zLmdldChyZXNvdXJjZUtleSk/LmZpbmQob2JzZXJ2YXRpb24gPT4gb2JzZXJ2YXRpb24uaWQgPT09IGlkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JSZXNvbHV0aW9uKHJlc291cmNlS2V5OiBzdHJpbmcsIGlkczogcmVhZG9ubHkgc3RyaW5nW10sIHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdW5yZXNvbHZlZCA9IG5ldyBTZXQoaWRzLmZpbHRlcihpZCA9PiB7XG5cdFx0XHRjb25zdCBvYnNlcnZhdGlvbiA9IHRoaXMuX2dldE9ic2VydmF0aW9uKHJlc291cmNlS2V5LCBpZCk7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YXRpb24gIT09IHVuZGVmaW5lZCAmJiBvYnNlcnZhdGlvbi5yZXNvbHV0aW9uID09PSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXHRcdGlmICh1bnJlc29sdmVkLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJhY2VUaW1lb3V0KG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZSA9IChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0dW5yZXNvbHZlZC5kZWxldGUoaWQpO1xuXHRcdFx0XHRcdGlmICh1bnJlc29sdmVkLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9vbkRpZFJlc29sdmUuZXZlbnQocmVzb2x1dGlvbiA9PiBjb21wbGV0ZShyZXNvbHV0aW9uLmlkKSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5fb25EaWRJbnZhbGlkYXRlLmV2ZW50KGNvbXBsZXRlKSk7XG5cdFx0XHR9KSwgdGltZW91dE1zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBpc1ZhbGlkQ292ZXJhZ2VHYXBBY2tub3dsZWRnZW1lbnRzKGFja25vd2xlZGdlbWVudHM6IHJlYWRvbmx5IElFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcEFja25vd2xlZGdlbWVudFtdIHwgdW5kZWZpbmVkLCBsYXN0U2VxdWVuY2U/OiBudW1iZXIpOiBib29sZWFuIHtcblx0aWYgKGFja25vd2xlZGdlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICghQXJyYXkuaXNBcnJheShhY2tub3dsZWRnZW1lbnRzKSB8fCBhY2tub3dsZWRnZW1lbnRzLmxlbmd0aCA9PT0gMCB8fCBuZXcgU2V0KGFja25vd2xlZGdlbWVudHMubWFwKGFja25vd2xlZGdlbWVudCA9PiBhY2tub3dsZWRnZW1lbnQuaWQpKS5zaXplICE9PSBhY2tub3dsZWRnZW1lbnRzLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gYWNrbm93bGVkZ2VtZW50cy5ldmVyeShhY2tub3dsZWRnZW1lbnQgPT5cblx0XHR0eXBlb2YgYWNrbm93bGVkZ2VtZW50LmlkID09PSAnc3RyaW5nJyAmJlxuXHRcdGFja25vd2xlZGdlbWVudC5pZC5sZW5ndGggPiAwICYmXG5cdFx0QXJyYXkuaXNBcnJheShhY2tub3dsZWRnZW1lbnQuc2VxdWVuY2VzKSAmJlxuXHRcdGFja25vd2xlZGdlbWVudC5zZXF1ZW5jZXMubGVuZ3RoID4gMCAmJlxuXHRcdGFja25vd2xlZGdlbWVudC5zZXF1ZW5jZXMuZXZlcnkoKHNlcXVlbmNlOiBudW1iZXIpID0+IE51bWJlci5pc1NhZmVJbnRlZ2VyKHNlcXVlbmNlKSAmJiBzZXF1ZW5jZSA+PSAwICYmIChsYXN0U2VxdWVuY2UgPT09IHVuZGVmaW5lZCB8fCBzZXF1ZW5jZSA8PSBsYXN0U2VxdWVuY2UpKSAmJlxuXHRcdG5ldyBTZXQoYWNrbm93bGVkZ2VtZW50LnNlcXVlbmNlcykuc2l6ZSA9PT0gYWNrbm93bGVkZ2VtZW50LnNlcXVlbmNlcy5sZW5ndGggJiZcblx0XHROdW1iZXIuaXNTYWZlSW50ZWdlcihhY2tub3dsZWRnZW1lbnQuZWRpdENvdW50KSAmJlxuXHRcdGFja25vd2xlZGdlbWVudC5lZGl0Q291bnQgPiAwICYmXG5cdFx0TnVtYmVyLmlzU2FmZUludGVnZXIoYWNrbm93bGVkZ2VtZW50Lmluc2VydGVkQ291bnQpICYmXG5cdFx0YWNrbm93bGVkZ2VtZW50Lmluc2VydGVkQ291bnQgPj0gMFxuXHQpO1xufVxuXG5mdW5jdGlvbiBnZXRMYXN0QWNrbm93bGVkZ2VkU2VxdWVuY2UoYWNrbm93bGVkZ2VtZW50czogcmVhZG9ubHkgSUVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50W10pOiBudW1iZXIge1xuXHRyZXR1cm4gTWF0aC5tYXgoLi4uYWNrbm93bGVkZ2VtZW50cy5mbGF0TWFwKGFja25vd2xlZGdlbWVudCA9PiBhY2tub3dsZWRnZW1lbnQuc2VxdWVuY2VzKSk7XG59XG5cbmZ1bmN0aW9uIGNvdmVyYWdlR2FwQWNrbm93bGVkZ2VtZW50S2V5KHJlc291cmNlS2V5OiBzdHJpbmcsIGFja25vd2xlZGdlbWVudElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7cmVzb3VyY2VLZXl9XFwwJHthY2tub3dsZWRnZW1lbnRJZH1gO1xufVxuXG5mdW5jdGlvbiByZW1vdmVDb21wbGV0ZWRDeWNsZShtYXJrZXJzOiBJUmVjZW50TWFya2VyW10sIGxhdGVzdEVkaXRJZDogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGxhdGVzdEluZGV4ID0gbWFya2Vycy5maW5kSW5kZXgobWFya2VyID0+IG1hcmtlci5lZGl0SWQgPT09IGxhdGVzdEVkaXRJZCk7XG5cdGlmIChsYXRlc3RJbmRleCA8IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgY29tcGxldGVkRGlnZXN0ID0gbWFya2Vyc1tsYXRlc3RJbmRleF0uYWZ0ZXJEaWdlc3Q7XG5cdGNvbnN0IGNvbnN1bWVkID0gW2xhdGVzdEluZGV4XTtcblx0bGV0IGJlZm9yZURpZ2VzdCA9IG1hcmtlcnNbbGF0ZXN0SW5kZXhdLmJlZm9yZURpZ2VzdDtcblx0bGV0IHNlcXVlbmNlID0gbWFya2Vyc1tsYXRlc3RJbmRleF0uc2VxdWVuY2U7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0aWYgKGJlZm9yZURpZ2VzdCA9PT0gY29tcGxldGVkRGlnZXN0ICYmIGNvbnN1bWVkLmxlbmd0aCA+IDEpIHtcblx0XHRcdGZvciAoY29uc3QgaW5kZXggb2YgY29uc3VtZWQudG9Tb3J0ZWQoKGEsIGIpID0+IGIgLSBhKSkge1xuXHRcdFx0XHRtYXJrZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBwcmV2aW91c0luZGV4ID0gLTE7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSBtYXJrZXJzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IG1hcmtlcnNbaW5kZXhdO1xuXHRcdFx0aWYgKG1hcmtlci5zZXF1ZW5jZSA8IHNlcXVlbmNlICYmIG1hcmtlci5hZnRlckRpZ2VzdCA9PT0gYmVmb3JlRGlnZXN0KSB7XG5cdFx0XHRcdHByZXZpb3VzSW5kZXggPSBpbmRleDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChwcmV2aW91c0luZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdW1lZC5wdXNoKHByZXZpb3VzSW5kZXgpO1xuXHRcdGJlZm9yZURpZ2VzdCA9IG1hcmtlcnNbcHJldmlvdXNJbmRleF0uYmVmb3JlRGlnZXN0O1xuXHRcdHNlcXVlbmNlID0gbWFya2Vyc1twcmV2aW91c0luZGV4XS5zZXF1ZW5jZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0Msb0NBQW9DLHFDQUFxQyw2QkFBNkIsb0NBQStLO0FBQ2xVLFNBQVMsMkJBQTJCO0FBR3BDLFNBQVMsbUJBQXdDO0FBRWpELE1BQU0sYUFBYSxJQUFJLEtBQUs7QUFDNUIsTUFBTSxZQUFZLEtBQUssS0FBSyxLQUFLO0FBQ2pDLE1BQU0sMkJBQTJCO0FBQ2pDLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sYUFBYTtBQUNuQixNQUFNLG9DQUFvQztBQUMxQyxNQUFNLHVCQUF1QjtBQTZDdEIsTUFBTSxvREFBb0QsTUFBTTtBQUFBLEVBQ3RFLFlBQVksT0FBZ0I7QUFDM0IsVUFBTSxzREFBc0QsRUFBRSxNQUFNLENBQUM7QUFBQSxFQUN0RTtBQUNEO0FBRU8sTUFBTSw4Q0FBOEMsTUFBTTtBQUFBLEVBQ2hFLFlBQVksT0FBZ0I7QUFDM0IsVUFBTSxnREFBZ0QsRUFBRSxNQUFNLENBQUM7QUFBQSxFQUNoRTtBQUNEO0FBd0JPLElBQU0sNkJBQU4sY0FBeUMsV0FBa0Q7QUFBQSxFQWFqRyxZQUNnRCxxQkFDVCxxQkFDckM7QUFDRCxVQUFNO0FBSHlDO0FBQ1Q7QUFkdkMsU0FBaUIsV0FBVyxvQkFBSSxJQUE2QjtBQUM3RCxTQUFpQixnQkFBZ0Isb0JBQUksSUFBb0M7QUFDekUsU0FBaUIsVUFBVSxvQkFBSSxJQUFxQztBQUNwRSxTQUFpQixnQkFBZ0Isb0JBQUksSUFBdUQ7QUFD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
