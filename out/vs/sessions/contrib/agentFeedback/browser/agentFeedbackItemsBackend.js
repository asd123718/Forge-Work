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
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionType } from "../../../../platform/agentHost/common/state/protocol/common/actions.js";
import { StateComponents } from "../../../../platform/agentHost/common/state/sessionState.js";
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta } from "../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js";
import { isAgentHostProviderId } from "../../../common/agentHostSessionsProvider.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { AgentFeedbackKind, AgentFeedbackState } from "./agentFeedbackModel.js";
function orderFeedbackItems(items) {
  const fileOrder = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = item.resourceUri.toString();
    if (!fileOrder.has(key)) {
      fileOrder.set(key, fileOrder.size);
    }
  }
  return items.slice().sort((a, b) => {
    const fa = fileOrder.get(a.resourceUri.toString());
    const fb = fileOrder.get(b.resourceUri.toString());
    if (fa !== fb) {
      return fa - fb;
    }
    return a.range.startLineNumber - b.range.startLineNumber;
  });
}
class InMemoryAgentFeedbackItemsBackend extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeItems = this._register(new Emitter());
    this.onDidChangeItems = this._onDidChangeItems.event;
    /** sessionResource → feedback items (insertion order; display order applied on read) */
    this._bySession = /* @__PURE__ */ new Map();
    this._sessionResourceByKey = /* @__PURE__ */ new Map();
  }
  getItems(sessionResource) {
    return orderFeedbackItems(this._bySession.get(sessionResource.toString()) ?? []);
  }
  hasLoaded(_sessionResource) {
    return true;
  }
  upsert(feedback) {
    const key = feedback.sessionResource.toString();
    let items = this._bySession.get(key);
    if (!items) {
      items = [];
      this._bySession.set(key, items);
      this._sessionResourceByKey.set(key, feedback.sessionResource);
    }
    const idx = items.findIndex((f) => f.id === feedback.id);
    if (idx >= 0) {
      items[idx] = feedback;
    } else {
      items.push(feedback);
    }
    this._onDidChangeItems.fire(feedback.sessionResource);
  }
  remove(sessionResource, feedbackId) {
    const key = sessionResource.toString();
    const items = this._bySession.get(key);
    if (!items) {
      return;
    }
    const idx = items.findIndex((f) => f.id === feedbackId);
    if (idx < 0) {
      return;
    }
    items.splice(idx, 1);
    if (!items.length) {
      this._bySession.delete(key);
      this._sessionResourceByKey.delete(key);
    }
    this._onDidChangeItems.fire(sessionResource);
  }
  clear(sessionResource) {
    const key = sessionResource.toString();
    if (this._bySession.delete(key)) {
      this._sessionResourceByKey.delete(key);
      this._onDidChangeItems.fire(sessionResource);
    }
  }
  getSessionsWithItems() {
    return [...this._sessionResourceByKey.values()];
  }
}
const KIND_FROM_VALUE = {
  user: AgentFeedbackKind.UserReview,
  codeReview: AgentFeedbackKind.AgentReview,
  prReview: AgentFeedbackKind.PRReview
};
const STATE_FROM_VALUE = {
  created: AgentFeedbackState.Created,
  accepted: AgentFeedbackState.Accepted,
  submitted: AgentFeedbackState.Submitted,
  resolved: AgentFeedbackState.Resolved
};
function asCodeReviewSuggestion(suggestion) {
  if (suggestion && typeof suggestion === "object" && Array.isArray(suggestion.edits)) {
    return suggestion;
  }
  return void 0;
}
function readFeedbackMeta(annotation) {
  const base = readFeedbackAnnotationMeta(annotation);
  if (!base) {
    return void 0;
  }
  return {
    kind: KIND_FROM_VALUE[base.kind],
    state: STATE_FROM_VALUE[base.state],
    sessionResource: base.sessionResource,
    suggestion: asCodeReviewSuggestion(base.suggestion),
    codeSelection: base.codeSelection,
    diffHunks: base.diffHunks,
    sourcePRReviewCommentId: base.sourcePRReviewCommentId,
    pendingAgentReveal: base.pendingAgentReveal
  };
}
function toTextRange(range) {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
  };
}
function fromTextRange(range) {
  if (!range) {
    return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
  }
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}
function entryText(text) {
  return typeof text === "string" ? text : text.markdown;
}
function feedbackToAnnotation(feedback) {
  const entries = [{ id: `${feedback.id}:0`, text: feedback.text }];
  for (let i = 0; i < (feedback.replies?.length ?? 0); i++) {
    entries.push({ id: `${feedback.id}:r${i}`, text: feedback.replies[i] });
  }
  const meta = {
    kind: feedback.kind,
    state: feedback.state,
    sessionResource: feedback.sessionResource.toString(),
    suggestion: feedback.suggestion,
    codeSelection: feedback.codeSelection,
    diffHunks: feedback.diffHunks,
    sourcePRReviewCommentId: feedback.sourcePRReviewCommentId,
    pendingAgentReveal: feedback.pendingAgentReveal
  };
  return {
    id: feedback.id,
    turnId: "",
    resource: feedback.resourceUri.toString(),
    range: toTextRange(feedback.range),
    resolved: feedback.state === AgentFeedbackState.Resolved,
    entries,
    _meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta }
  };
}
function annotationToFeedback(annotation, sessionResource) {
  const entries = annotation.entries ?? [];
  const meta = readFeedbackMeta(annotation);
  if (!meta || !entries.length) {
    return void 0;
  }
  const replies = entries.slice(1).map((e) => entryText(e.text));
  return {
    id: annotation.id,
    text: entryText(entries[0].text),
    resourceUri: URI.parse(annotation.resource),
    range: fromTextRange(annotation.range),
    sessionResource,
    suggestion: meta?.suggestion,
    codeSelection: meta?.codeSelection,
    diffHunks: meta?.diffHunks,
    kind: meta?.kind ?? AgentFeedbackKind.UserReview,
    sourcePRReviewCommentId: meta?.sourcePRReviewCommentId,
    replies: replies.length ? replies : void 0,
    state: annotation.resolved ? AgentFeedbackState.Resolved : meta?.state ?? AgentFeedbackState.Accepted,
    pendingAgentReveal: meta?.pendingAgentReveal
  };
}
let AnnotationsAgentFeedbackItemsBackend = class extends Disposable {
  constructor(_sessionsManagementService, _sessionsProvidersService) {
    super();
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._onDidChangeItems = this._register(new Emitter());
    this.onDidChangeItems = this._onDidChangeItems.event;
    this._channels = this._register(new DisposableMap());
    this._channelBySession = /* @__PURE__ */ new Map();
    this._sessionResourceByKey = /* @__PURE__ */ new Map();
    /** Local cache so reads work before the first snapshot arrives. */
    this._cacheBySession = /* @__PURE__ */ new Map();
    /**
     * Signature of the feedback set we last fired {@link onDidChangeItems} for,
     * per session. The annotations channel is shared and may carry non-feedback
     * annotations; comparing signatures means churn from those does not fire a
     * spurious feedback-items change (which would bump recency / navigation).
     */
    this._signatureBySession = /* @__PURE__ */ new Map();
    /**
     * Sessions whose annotations snapshot has been received. Used to fire
     * {@link onDidChangeItems} exactly once when loading completes (even when the
     * loaded feedback set is empty), so consumers that seed feedback can wait for
     * the authoritative set before acting.
     */
    this._loadedBySession = /* @__PURE__ */ new Set();
    this._register(this._sessionsManagementService.onDidDeleteSession((session) => this._releaseChannel(session.resource)));
  }
  getItems(sessionResource) {
    const channel = this._ensureChannel(sessionResource);
    if (channel && this._hasSnapshot(channel.subscription)) {
      return orderFeedbackItems(this._decode(channel.subscription, sessionResource));
    }
    return orderFeedbackItems(this._cacheBySession.get(sessionResource.toString()) ?? []);
  }
  hasLoaded(sessionResource) {
    const channel = this._ensureChannel(sessionResource);
    return channel ? this._hasSnapshot(channel.subscription) : false;
  }
  upsert(feedback) {
    const channel = this._ensureChannel(feedback.sessionResource);
    this._cacheUpsert(feedback);
    if (!channel) {
      this._onDidChangeItems.fire(feedback.sessionResource);
      return;
    }
    channel.connection.dispatch(channel.annotationsUri.toString(), {
      type: ActionType.AnnotationsSet,
      annotation: feedbackToAnnotation(feedback)
    });
    if (!this._hasSnapshot(channel.subscription)) {
      this._onDidChangeItems.fire(feedback.sessionResource);
    }
  }
  remove(sessionResource, feedbackId) {
    const channel = this._ensureChannel(sessionResource);
    this._cacheRemove(sessionResource, feedbackId);
    if (!channel) {
      this._onDidChangeItems.fire(sessionResource);
      return;
    }
    channel.connection.dispatch(channel.annotationsUri.toString(), {
      type: ActionType.AnnotationsRemoved,
      annotationId: feedbackId
    });
    if (!this._hasSnapshot(channel.subscription)) {
      this._onDidChangeItems.fire(sessionResource);
    }
  }
  clear(sessionResource) {
    const items = this.getItems(sessionResource);
    const channel = this._ensureChannel(sessionResource);
    this._cacheBySession.delete(sessionResource.toString());
    if (channel) {
      for (const item of items) {
        channel.connection.dispatch(channel.annotationsUri.toString(), {
          type: ActionType.AnnotationsRemoved,
          annotationId: item.id
        });
      }
    }
    this._onDidChangeItems.fire(sessionResource);
  }
  getSessionsWithItems() {
    const result = [];
    for (const resource of this._sessionResourceByKey.values()) {
      if (this.getItems(resource).length > 0) {
        result.push(resource);
      }
    }
    return result;
  }
  /**
   * Returns the annotations channel URI backing the given session's feedback,
   * or `undefined` when the session is not an agent-host session (or no channel
   * could be resolved). Each feedback item id is an annotation id on this
   * channel, so callers can reference specific comments by id.
   */
  getAnnotationsChannelResource(sessionResource) {
    return this._ensureChannel(sessionResource)?.annotationsUri;
  }
  _hasSnapshot(subscription) {
    const value = subscription.value;
    return value !== void 0 && !(value instanceof Error);
  }
  _decode(subscription, sessionResource) {
    const value = subscription.value;
    if (!value || value instanceof Error) {
      return [];
    }
    const items = [];
    for (const annotation of value.annotations) {
      const feedback = annotationToFeedback(annotation, sessionResource);
      if (feedback) {
        items.push(feedback);
      }
    }
    return items;
  }
  /**
   * Fire {@link onDidChangeItems} only when the session's feedback set actually
   * changed. The annotations channel is generic and may carry annotations from
   * other features; without this guard their churn would bump feedback recency
   * ordering and navigation even though no feedback changed.
   */
  _onAnnotationsChange(sessionResource) {
    const key = sessionResource.toString();
    const channel = this._channelBySession.get(key);
    if (!channel) {
      return;
    }
    if (this._hasSnapshot(channel.subscription) && !this._loadedBySession.has(key)) {
      this._loadedBySession.add(key);
      this._signatureBySession.set(key, this._feedbackSignature(channel.subscription));
      this._onDidChangeItems.fire(sessionResource);
      return;
    }
    const signature = this._feedbackSignature(channel.subscription);
    if (this._signatureBySession.get(key) === signature) {
      return;
    }
    this._signatureBySession.set(key, signature);
    this._onDidChangeItems.fire(sessionResource);
  }
  /**
   * A stable signature of the feedback-bearing annotations in the
   * subscription's current snapshot (sorted by id). Excludes annotations
   * without feedback metadata so unrelated annotation activity on the shared
   * channel is ignored.
   */
  _feedbackSignature(subscription) {
    const value = subscription.value;
    if (!value || value instanceof Error) {
      return "";
    }
    const feedback = value.annotations.map((annotation) => ({ annotation, meta: readFeedbackMeta(annotation) })).filter(({ annotation, meta }) => meta !== void 0 && (annotation.entries?.length ?? 0) > 0).map(({ annotation, meta }) => ({
      id: annotation.id,
      resource: annotation.resource,
      range: annotation.range,
      resolved: annotation.resolved,
      entries: annotation.entries,
      meta
    })).sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(feedback);
  }
  _cacheUpsert(feedback) {
    const key = feedback.sessionResource.toString();
    let items = this._cacheBySession.get(key);
    if (!items) {
      items = [];
      this._cacheBySession.set(key, items);
    }
    const idx = items.findIndex((f) => f.id === feedback.id);
    if (idx >= 0) {
      items[idx] = feedback;
    } else {
      items.push(feedback);
    }
  }
  _cacheRemove(sessionResource, feedbackId) {
    const key = sessionResource.toString();
    const items = this._cacheBySession.get(key);
    if (!items) {
      return;
    }
    const idx = items.findIndex((f) => f.id === feedbackId);
    if (idx >= 0) {
      items.splice(idx, 1);
    }
  }
  _releaseChannel(sessionResource) {
    const key = sessionResource.toString();
    this._channels.deleteAndDispose(key);
    this._channelBySession.delete(key);
    this._sessionResourceByKey.delete(key);
    this._cacheBySession.delete(key);
    this._signatureBySession.delete(key);
    this._loadedBySession.delete(key);
  }
  _ensureChannel(sessionResource) {
    const key = sessionResource.toString();
    const existing = this._channelBySession.get(key);
    if (existing) {
      return existing;
    }
    const session = this._sessionsManagementService.getSession(sessionResource);
    if (!session || !isAgentHostProviderId(session.providerId)) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(session.providerId);
    if (!provider?.getFeedbackAnnotationsChannel) {
      return void 0;
    }
    const resolved = provider.getFeedbackAnnotationsChannel(session.sessionId);
    if (!resolved) {
      return void 0;
    }
    const store = new DisposableStore();
    const ref = store.add(resolved.connection.getSubscription(StateComponents.Annotations, resolved.annotationsUri, AnnotationsAgentFeedbackItemsBackend.OWNER));
    const channel = {
      connection: resolved.connection,
      annotationsUri: resolved.annotationsUri,
      subscription: ref.object
    };
    this._signatureBySession.set(key, this._feedbackSignature(ref.object));
    if (this._hasSnapshot(ref.object)) {
      this._loadedBySession.add(key);
    }
    store.add(ref.object.onDidChange(() => this._onAnnotationsChange(sessionResource)));
    this._channels.set(key, store);
    this._channelBySession.set(key, channel);
    this._sessionResourceByKey.set(key, sessionResource);
    return channel;
  }
};
AnnotationsAgentFeedbackItemsBackend.OWNER = "AnnotationsAgentFeedbackItemsBackend";
AnnotationsAgentFeedbackItemsBackend = __decorateClass([
  __decorateParam(0, ISessionsManagementService),
  __decorateParam(1, ISessionsProvidersService)
], AnnotationsAgentFeedbackItemsBackend);
export {
  AnnotationsAgentFeedbackItemsBackend,
  InMemoryAgentFeedbackItemsBackend,
  orderFeedbackItems
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcYnJvd3NlclxcYWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQW5ub3RhdGlvbiwgQW5ub3RhdGlvbkVudHJ5LCBBbm5vdGF0aW9uc1N0YXRlLCBTdGF0ZUNvbXBvbmVudHMsIFN0cmluZ09yTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBUZXh0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZLCByZWFkRmVlZGJhY2tBbm5vdGF0aW9uTWV0YSwgdHlwZSBBZ2VudEZlZWRiYWNrS2luZFZhbHVlLCB0eXBlIEFnZW50RmVlZGJhY2tTdGF0ZVZhbHVlLCB0eXBlIElGZWVkYmFja0Fubm90YXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50RmVlZGJhY2tBbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZVJldmlld1N1Z2dlc3Rpb24gfSBmcm9tICcuLi8uLi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIGlzQWdlbnRIb3N0UHJvdmlkZXJJZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRGZWVkYmFja0tpbmQsIEFnZW50RmVlZGJhY2tTdGF0ZSwgSUFnZW50RmVlZGJhY2sgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tNb2RlbC5qcyc7XG5cbi8vIC0tLSBCYWNrZW5kIGludGVyZmFjZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFN0b3JhZ2Ugc3RyYXRlZ3kgZm9yIHRoZSBwZXItc2Vzc2lvbiBmZWVkYmFjayBpdGVtIGxpc3QgdXNlZCBieVxuICoge0BsaW5rIElBZ2VudEZlZWRiYWNrU2VydmljZX0uIEEgYmFja2VuZCBvd25zIE9OTFkgdGhlIGxpc3Qgb2YgZmVlZGJhY2tcbiAqIGl0ZW1zIGtleWVkIGJ5IHNlc3Npb247IGFsbCBldmVudHMsIHRlbGVtZXRyeSwgbmF2aWdhdGlvbiBhbmNob3JzLCByZWNlbmN5XG4gKiBvcmRlcmluZyBhbmQgc3VibWl0IGJlaGF2aW9yIGxpdmUgaW4gdGhlIHNlcnZpY2UuXG4gKlxuICoge0BsaW5rIG9uRGlkQ2hhbmdlSXRlbXN9IGZpcmVzIHdoZW5ldmVyIHRoZSBpdGVtcyBmb3IgYSBzZXNzaW9uIGNoYW5nZSxcbiAqIHdoZXRoZXIgZHVlIHRvIGEgbG9jYWwgbXV0YXRpb24gb3IgKGZvciB0aGUgYW5ub3RhdGlvbnMtYmFja2VkXG4gKiBpbXBsZW1lbnRhdGlvbikgYW4gZXh0ZXJuYWxseS1kcml2ZW4gdXBkYXRlIGFycml2aW5nIG92ZXIgdGhlIHByb3RvY29sLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtczogRXZlbnQ8VVJJPjtcblxuXHQvKiogUmV0dXJucyB0aGUgZmVlZGJhY2sgaXRlbXMgZm9yIGEgc2Vzc2lvbiBpbiBzdGFibGUgZGlzcGxheSBvcmRlci4gKi9cblx0Z2V0SXRlbXMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHtAbGluayBnZXRJdGVtc30gcmVmbGVjdHMgdGhlIGF1dGhvcml0YXRpdmUgaXRlbSBzZXQgZm9yIHRoZVxuXHQgKiBzZXNzaW9uLiBGb3IgdGhlIGluLW1lbW9yeSBiYWNrZW5kIHRoaXMgaXMgYWx3YXlzIGB0cnVlYDsgZm9yIHRoZVxuXHQgKiBhbm5vdGF0aW9ucy1iYWNrZWQgYmFja2VuZCBpdCBpcyBgZmFsc2VgIHVudGlsIHRoZSBzZXNzaW9uJ3MgYW5ub3RhdGlvbnNcblx0ICogc25hcHNob3QgaGFzIGJlZW4gcmVjZWl2ZWQsIHNvIGNhbGxlcnMgdGhhdCBzZWVkIGl0ZW1zIChlLmcuIG1pcnJvcmluZyBQUlxuXHQgKiByZXZpZXcgY29tbWVudHMpIGNhbiBhdm9pZCBhY3Rpbmcgb24gYSB0cmFuc2llbnRseS1lbXB0eSBsaXN0LlxuXHQgKi9cblx0aGFzTG9hZGVkKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbjtcblxuXHQvKiogQWRkcyBhIG5ldyBmZWVkYmFjayBpdGVtIG9yIHJlcGxhY2VzIGFuIGV4aXN0aW5nIG9uZSB3aXRoIHRoZSBzYW1lIGlkLiAqL1xuXHR1cHNlcnQoZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrKTogdm9pZDtcblxuXHQvKiogUmVtb3ZlcyBhIHNpbmdsZSBmZWVkYmFjayBpdGVtLiAqL1xuXHRyZW1vdmUoc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqIFJlbW92ZXMgYWxsIGZlZWRiYWNrIGl0ZW1zIGZvciBhIHNlc3Npb24uICovXG5cdGNsZWFyKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZDtcblxuXHQvKiogUmV0dXJucyB0aGUgc2Vzc2lvbiByZXNvdXJjZXMgdGhhdCBjdXJyZW50bHkgaG9sZCBhdCBsZWFzdCBvbmUgaXRlbS4gKi9cblx0Z2V0U2Vzc2lvbnNXaXRoSXRlbXMoKTogVVJJW107XG59XG5cbi8vIC0tLSBPcmRlcmluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIE9yZGVycyBmZWVkYmFjayBpdGVtcyBmb3IgZGlzcGxheTogZmlsZXMgYXJlIGdyb3VwZWQgYnkgdGhlIG9yZGVyIGluIHdoaWNoXG4gKiB0aGV5IGZpcnN0IGFwcGVhciBpbiB7QGxpbmsgaXRlbXN9LCBhbmQgd2l0aGluIGEgZmlsZSBpdGVtcyBhcmUgc29ydGVkIGJ5XG4gKiB7QGxpbmsgSUFnZW50RmVlZGJhY2sucmFuZ2V9IHN0YXJ0IGxpbmUuIFVzZXMgYSBzdGFibGUgc29ydCBzbyBpdGVtcyBzaGFyaW5nXG4gKiBhIGZpbGUgYW5kIHN0YXJ0IGxpbmUga2VlcCB0aGVpciByZWxhdGl2ZSBvcmRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9yZGVyRmVlZGJhY2tJdGVtcyhpdGVtczogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXSk6IElBZ2VudEZlZWRiYWNrW10ge1xuXHRjb25zdCBmaWxlT3JkZXIgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRjb25zdCBrZXkgPSBpdGVtLnJlc291cmNlVXJpLnRvU3RyaW5nKCk7XG5cdFx0aWYgKCFmaWxlT3JkZXIuaGFzKGtleSkpIHtcblx0XHRcdGZpbGVPcmRlci5zZXQoa2V5LCBmaWxlT3JkZXIuc2l6ZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpdGVtcy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcblx0XHRjb25zdCBmYSA9IGZpbGVPcmRlci5nZXQoYS5yZXNvdXJjZVVyaS50b1N0cmluZygpKSE7XG5cdFx0Y29uc3QgZmIgPSBmaWxlT3JkZXIuZ2V0KGIucmVzb3VyY2VVcmkudG9TdHJpbmcoKSkhO1xuXHRcdGlmIChmYSAhPT0gZmIpIHtcblx0XHRcdHJldHVybiBmYSAtIGZiO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5yYW5nZS5zdGFydExpbmVOdW1iZXIgLSBiLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0fSk7XG59XG5cbi8vIC0tLSBJbi1tZW1vcnkgYmFja2VuZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIENsaWVudC1zaWRlLCBpbi1tZW1vcnkgZmVlZGJhY2sgc3RvcmUgdXNlZCBmb3IgZXZlcnkgbm9uLWFnZW50LWhvc3RcbiAqIHByb3ZpZGVyLiBTdGF0ZSBpcyBub3QgcGVyc2lzdGVkIGFuZCBpcyBjbGVhcmVkIG9uIHNlc3Npb24gY2xvc2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBJbk1lbW9yeUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1zID0gdGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5ldmVudDtcblxuXHQvKiogc2Vzc2lvblJlc291cmNlIFx1MjE5MiBmZWVkYmFjayBpdGVtcyAoaW5zZXJ0aW9uIG9yZGVyOyBkaXNwbGF5IG9yZGVyIGFwcGxpZWQgb24gcmVhZCkgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudEZlZWRiYWNrW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25SZXNvdXJjZUJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblxuXHRnZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW10ge1xuXHRcdHJldHVybiBvcmRlckZlZWRiYWNrSXRlbXModGhpcy5fYnlTZXNzaW9uLmdldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkgPz8gW10pO1xuXHR9XG5cblx0aGFzTG9hZGVkKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdC8vIEluLW1lbW9yeSBzdGF0ZSBpcyBhbHdheXMgYXV0aG9yaXRhdGl2ZTsgdGhlcmUgaXMgbm90aGluZyB0byBhd2FpdC5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHVwc2VydChmZWVkYmFjazogSUFnZW50RmVlZGJhY2spOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBmZWVkYmFjay5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRsZXQgaXRlbXMgPSB0aGlzLl9ieVNlc3Npb24uZ2V0KGtleSk7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0aXRlbXMgPSBbXTtcblx0XHRcdHRoaXMuX2J5U2Vzc2lvbi5zZXQoa2V5LCBpdGVtcyk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2VCeUtleS5zZXQoa2V5LCBmZWVkYmFjay5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRjb25zdCBpZHggPSBpdGVtcy5maW5kSW5kZXgoZiA9PiBmLmlkID09PSBmZWVkYmFjay5pZCk7XG5cdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRpdGVtc1tpZHhdID0gZmVlZGJhY2s7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGl0ZW1zLnB1c2goZmVlZGJhY2spO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoZmVlZGJhY2suc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdHJlbW92ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9ieVNlc3Npb24uZ2V0KGtleSk7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpZHggPSBpdGVtcy5maW5kSW5kZXgoZiA9PiBmLmlkID09PSBmZWVkYmFja0lkKTtcblx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpdGVtcy5zcGxpY2UoaWR4LCAxKTtcblx0XHRpZiAoIWl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fYnlTZXNzaW9uLmRlbGV0ZShrZXkpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlQnlLZXkuZGVsZXRlKGtleSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0Y2xlYXIoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAodGhpcy5fYnlTZXNzaW9uLmRlbGV0ZShrZXkpKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2VCeUtleS5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGdldFNlc3Npb25zV2l0aEl0ZW1zKCk6IFVSSVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25SZXNvdXJjZUJ5S2V5LnZhbHVlcygpXTtcblx0fVxufVxuXG4vLyAtLS0gQW5ub3RhdGlvbnMtYmFja2VkIGJhY2tlbmQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDbGllbnQtc2lkZSB0eXBlZCB2aWV3IG9mIGEgZmVlZGJhY2sgYW5ub3RhdGlvbidzIGBfbWV0YWAsIHJlc29sdmVkIGZyb20gdGhlXG4gKiBzaGFyZWQgd2lyZSBzaGFwZToge0BsaW5rIGtpbmR9L3tAbGluayBzdGF0ZX0gYXMgdGhlIGNsaWVudCBlbnVtcyBhbmRcbiAqIHtAbGluayBzdWdnZXN0aW9ufSBhcyB0aGUgY29uY3JldGUge0BsaW5rIElDb2RlUmV2aWV3U3VnZ2VzdGlvbn0gKHRoZSBzaGFyZWRcbiAqIHJlYWRlciB2YWxpZGF0ZXMgaXQgb25seSBhcyBvcGFxdWUgZGF0YSwgc2luY2UgaXRzIHNoYXBlIGxpdmVzIGluIHRoaXMgbGF5ZXIpLlxuICovXG5pbnRlcmZhY2UgSUZlZWRiYWNrTWV0YVZpZXcge1xuXHRyZWFkb25seSBraW5kOiBBZ2VudEZlZWRiYWNrS2luZDtcblx0cmVhZG9ubHkgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZTtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1Z2dlc3Rpb24/OiBJQ29kZVJldmlld1N1Z2dlc3Rpb247XG5cdHJlYWRvbmx5IGNvZGVTZWxlY3Rpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpZmZIdW5rcz86IHN0cmluZztcblx0cmVhZG9ubHkgc291cmNlUFJSZXZpZXdDb21tZW50SWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBlbmRpbmdBZ2VudFJldmVhbD86IGJvb2xlYW47XG59XG5cbmNvbnN0IEtJTkRfRlJPTV9WQUxVRTogUmVjb3JkPEFnZW50RmVlZGJhY2tLaW5kVmFsdWUsIEFnZW50RmVlZGJhY2tLaW5kPiA9IHtcblx0dXNlcjogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldyxcblx0Y29kZVJldmlldzogQWdlbnRGZWVkYmFja0tpbmQuQWdlbnRSZXZpZXcsXG5cdHByUmV2aWV3OiBBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldyxcbn07XG5cbmNvbnN0IFNUQVRFX0ZST01fVkFMVUU6IFJlY29yZDxBZ2VudEZlZWRiYWNrU3RhdGVWYWx1ZSwgQWdlbnRGZWVkYmFja1N0YXRlPiA9IHtcblx0Y3JlYXRlZDogQWdlbnRGZWVkYmFja1N0YXRlLkNyZWF0ZWQsXG5cdGFjY2VwdGVkOiBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQsXG5cdHN1Ym1pdHRlZDogQWdlbnRGZWVkYmFja1N0YXRlLlN1Ym1pdHRlZCxcblx0cmVzb2x2ZWQ6IEFnZW50RmVlZGJhY2tTdGF0ZS5SZXNvbHZlZCxcbn07XG5cbmZ1bmN0aW9uIGFzQ29kZVJldmlld1N1Z2dlc3Rpb24oc3VnZ2VzdGlvbjogdW5rbm93bik6IElDb2RlUmV2aWV3U3VnZ2VzdGlvbiB8IHVuZGVmaW5lZCB7XG5cdC8vIGBzdWdnZXN0aW9uYCBpcyBvcGFxdWUgY2xpZW50LW9ubHkgZGF0YSB0aGlzIGJhY2tlbmQgaXRzZWxmIHNlcmlhbGl6ZWQgZnJvbVxuXHQvLyBhbiBgSUNvZGVSZXZpZXdTdWdnZXN0aW9uYDsgdmFsaWRhdGUgdGhlIHNoYXBlIHdlIGRlcGVuZCBvbiAoYW4gYGVkaXRzYFxuXHQvLyBhcnJheSkgYW5kIHRydXN0IHRoZSByb3VuZC10cmlwcGVkIGNvbnRlbnRzLlxuXHRpZiAoc3VnZ2VzdGlvbiAmJiB0eXBlb2Ygc3VnZ2VzdGlvbiA9PT0gJ29iamVjdCcgJiYgQXJyYXkuaXNBcnJheSgoc3VnZ2VzdGlvbiBhcyB7IGVkaXRzPzogdW5rbm93biB9KS5lZGl0cykpIHtcblx0XHRyZXR1cm4gc3VnZ2VzdGlvbiBhcyBJQ29kZVJldmlld1N1Z2dlc3Rpb247XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgc2hhcmVkIGZlZWRiYWNrIGBfbWV0YWAgKHZhbGlkYXRlZCBieVxuICoge0BsaW5rIHJlYWRGZWVkYmFja0Fubm90YXRpb25NZXRhfSkgaW50byB0aGUgY2xpZW50LXR5cGVkXG4gKiB7QGxpbmsgSUZlZWRiYWNrTWV0YVZpZXd9LCByZXR1cm5pbmcgYHVuZGVmaW5lZGAgZm9yIGFubm90YXRpb25zIHRoYXQgYXJlbid0XG4gKiBmZWVkYmFjayBpdGVtcy5cbiAqL1xuZnVuY3Rpb24gcmVhZEZlZWRiYWNrTWV0YShhbm5vdGF0aW9uOiBBbm5vdGF0aW9uKTogSUZlZWRiYWNrTWV0YVZpZXcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBiYXNlID0gcmVhZEZlZWRiYWNrQW5ub3RhdGlvbk1ldGEoYW5ub3RhdGlvbik7XG5cdGlmICghYmFzZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRraW5kOiBLSU5EX0ZST01fVkFMVUVbYmFzZS5raW5kXSxcblx0XHRzdGF0ZTogU1RBVEVfRlJPTV9WQUxVRVtiYXNlLnN0YXRlXSxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IGJhc2Uuc2Vzc2lvblJlc291cmNlLFxuXHRcdHN1Z2dlc3Rpb246IGFzQ29kZVJldmlld1N1Z2dlc3Rpb24oYmFzZS5zdWdnZXN0aW9uKSxcblx0XHRjb2RlU2VsZWN0aW9uOiBiYXNlLmNvZGVTZWxlY3Rpb24sXG5cdFx0ZGlmZkh1bmtzOiBiYXNlLmRpZmZIdW5rcyxcblx0XHRzb3VyY2VQUlJldmlld0NvbW1lbnRJZDogYmFzZS5zb3VyY2VQUlJldmlld0NvbW1lbnRJZCxcblx0XHRwZW5kaW5nQWdlbnRSZXZlYWw6IGJhc2UucGVuZGluZ0FnZW50UmV2ZWFsLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1RleHRSYW5nZShyYW5nZTogSVJhbmdlKTogVGV4dFJhbmdlIHtcblx0cmV0dXJuIHtcblx0XHRzdGFydDogeyBsaW5lOiByYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxLCBjaGFyYWN0ZXI6IHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSB9LFxuXHRcdGVuZDogeyBsaW5lOiByYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSwgY2hhcmFjdGVyOiByYW5nZS5lbmRDb2x1bW4gLSAxIH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIGZyb21UZXh0UmFuZ2UocmFuZ2U6IFRleHRSYW5nZSB8IHVuZGVmaW5lZCk6IElSYW5nZSB7XG5cdGlmICghcmFuZ2UpIHtcblx0XHRyZXR1cm4geyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfTtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnQubGluZSArIDEsXG5cdFx0c3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0LmNoYXJhY3RlciArIDEsXG5cdFx0ZW5kTGluZU51bWJlcjogcmFuZ2UuZW5kLmxpbmUgKyAxLFxuXHRcdGVuZENvbHVtbjogcmFuZ2UuZW5kLmNoYXJhY3RlciArIDEsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGVudHJ5VGV4dCh0ZXh0OiBTdHJpbmdPck1hcmtkb3duKTogc3RyaW5nIHtcblx0cmV0dXJuIHR5cGVvZiB0ZXh0ID09PSAnc3RyaW5nJyA/IHRleHQgOiB0ZXh0Lm1hcmtkb3duO1xufVxuXG5mdW5jdGlvbiBmZWVkYmFja1RvQW5ub3RhdGlvbihmZWVkYmFjazogSUFnZW50RmVlZGJhY2spOiBBbm5vdGF0aW9uIHtcblx0Y29uc3QgZW50cmllczogQW5ub3RhdGlvbkVudHJ5W10gPSBbeyBpZDogYCR7ZmVlZGJhY2suaWR9OjBgLCB0ZXh0OiBmZWVkYmFjay50ZXh0IH1dO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IChmZWVkYmFjay5yZXBsaWVzPy5sZW5ndGggPz8gMCk7IGkrKykge1xuXHRcdGVudHJpZXMucHVzaCh7IGlkOiBgJHtmZWVkYmFjay5pZH06ciR7aX1gLCB0ZXh0OiBmZWVkYmFjay5yZXBsaWVzIVtpXSB9KTtcblx0fVxuXHRjb25zdCBtZXRhOiBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YSA9IHtcblx0XHRraW5kOiBmZWVkYmFjay5raW5kLFxuXHRcdHN0YXRlOiBmZWVkYmFjay5zdGF0ZSxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IGZlZWRiYWNrLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdHN1Z2dlc3Rpb246IGZlZWRiYWNrLnN1Z2dlc3Rpb24sXG5cdFx0Y29kZVNlbGVjdGlvbjogZmVlZGJhY2suY29kZVNlbGVjdGlvbixcblx0XHRkaWZmSHVua3M6IGZlZWRiYWNrLmRpZmZIdW5rcyxcblx0XHRzb3VyY2VQUlJldmlld0NvbW1lbnRJZDogZmVlZGJhY2suc291cmNlUFJSZXZpZXdDb21tZW50SWQsXG5cdFx0cGVuZGluZ0FnZW50UmV2ZWFsOiBmZWVkYmFjay5wZW5kaW5nQWdlbnRSZXZlYWwsXG5cdH07XG5cdHJldHVybiB7XG5cdFx0aWQ6IGZlZWRiYWNrLmlkLFxuXHRcdHR1cm5JZDogJycsXG5cdFx0cmVzb3VyY2U6IGZlZWRiYWNrLnJlc291cmNlVXJpLnRvU3RyaW5nKCksXG5cdFx0cmFuZ2U6IHRvVGV4dFJhbmdlKGZlZWRiYWNrLnJhbmdlKSxcblx0XHRyZXNvbHZlZDogZmVlZGJhY2suc3RhdGUgPT09IEFnZW50RmVlZGJhY2tTdGF0ZS5SZXNvbHZlZCxcblx0XHRlbnRyaWVzLFxuXHRcdF9tZXRhOiB7IFtGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXTogbWV0YSB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBhbm5vdGF0aW9uVG9GZWVkYmFjayhhbm5vdGF0aW9uOiBBbm5vdGF0aW9uLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElBZ2VudEZlZWRiYWNrIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZW50cmllcyA9IGFubm90YXRpb24uZW50cmllcyA/PyBbXTtcblx0Y29uc3QgbWV0YSA9IHJlYWRGZWVkYmFja01ldGEoYW5ub3RhdGlvbik7XG5cdC8vIFRoZSBhbm5vdGF0aW9ucyBjaGFubmVsIGlzIGdlbmVyaWMgYW5kIG1heSBjYXJyeSBhbm5vdGF0aW9ucyBwcm9kdWNlZCBieVxuXHQvLyBvdGhlciBmZWF0dXJlcy4gT25seSBhbm5vdGF0aW9ucyB0aGF0IGNhcnJ5IGZlZWRiYWNrIG1ldGFkYXRhIGFyZSBmZWVkYmFja1xuXHQvLyBpdGVtczsgZXZlcnl0aGluZyBlbHNlIGlzIGlnbm9yZWQgc28gZmVlZGJhY2sgbmV2ZXIgc3VyZmFjZXMgb3IgbXV0YXRlc1xuXHQvLyB1bnJlbGF0ZWQgYW5ub3RhdGlvbnMuXG5cdGlmICghbWV0YSB8fCAhZW50cmllcy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlcGxpZXMgPSBlbnRyaWVzLnNsaWNlKDEpLm1hcChlID0+IGVudHJ5VGV4dChlLnRleHQpKTtcblx0cmV0dXJuIHtcblx0XHRpZDogYW5ub3RhdGlvbi5pZCxcblx0XHR0ZXh0OiBlbnRyeVRleHQoZW50cmllc1swXS50ZXh0KSxcblx0XHRyZXNvdXJjZVVyaTogVVJJLnBhcnNlKGFubm90YXRpb24ucmVzb3VyY2UpLFxuXHRcdHJhbmdlOiBmcm9tVGV4dFJhbmdlKGFubm90YXRpb24ucmFuZ2UpLFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRzdWdnZXN0aW9uOiBtZXRhPy5zdWdnZXN0aW9uLFxuXHRcdGNvZGVTZWxlY3Rpb246IG1ldGE/LmNvZGVTZWxlY3Rpb24sXG5cdFx0ZGlmZkh1bmtzOiBtZXRhPy5kaWZmSHVua3MsXG5cdFx0a2luZDogbWV0YT8ua2luZCA/PyBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3LFxuXHRcdHNvdXJjZVBSUmV2aWV3Q29tbWVudElkOiBtZXRhPy5zb3VyY2VQUlJldmlld0NvbW1lbnRJZCxcblx0XHRyZXBsaWVzOiByZXBsaWVzLmxlbmd0aCA/IHJlcGxpZXMgOiB1bmRlZmluZWQsXG5cdFx0c3RhdGU6IGFubm90YXRpb24ucmVzb2x2ZWQgPyBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQgOiAobWV0YT8uc3RhdGUgPz8gQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkKSxcblx0XHRwZW5kaW5nQWdlbnRSZXZlYWw6IG1ldGE/LnBlbmRpbmdBZ2VudFJldmVhbCxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElUcmFja2VkQ2hhbm5lbCB7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb247XG5cdHJlYWRvbmx5IGFubm90YXRpb25zVXJpOiBVUkk7XG5cdHJlYWRvbmx5IHN1YnNjcmlwdGlvbjogSUFnZW50U3Vic2NyaXB0aW9uPEFubm90YXRpb25zU3RhdGU+O1xufVxuXG4vKipcbiAqIEZlZWRiYWNrIHN0b3JlIGJhY2tlZCBieSB0aGUgYWdlbnQgaG9zdCdzIGFubm90YXRpb25zIGNoYW5uZWwuIEZlZWRiYWNrXG4gKiBpdGVtcyByb3VuZC10cmlwIGFzIHtAbGluayBBbm5vdGF0aW9ufXMgb24gYDxzZXNzaW9uPi9hbm5vdGF0aW9uc2AsIG11dGF0ZWRcbiAqIHZpYSB0aGUgYGFubm90YXRpb25zL3NldGAgdXBzZXJ0IChhbmQgYGFubm90YXRpb25zL3JlbW92ZWRgKSBhY3Rpb25zLCB3aXRoXG4gKiBmZWVkYmFjayBzZW1hbnRpY3MgY2FycmllZCBpbiB7QGxpbmsgQW5ub3RhdGlvbi5fbWV0YX0uXG4gKlxuICogQSBwZXItc2Vzc2lvbiBzdWJzY3JpcHRpb24gaXMgYWNxdWlyZWQgbGF6aWx5IGFuZCBoZWxkIGZvciB0aGUgYmFja2VuZCdzXG4gKiBsaWZldGltZSBzbyByZWFkcyBhcmUgc3luY2hyb25vdXMgYW5kIHNlcnZlci1kcml2ZW4gY2hhbmdlcyBzdXJmYWNlIHZpYVxuICoge0BsaW5rIG9uRGlkQ2hhbmdlSXRlbXN9LiBBIGxvY2FsIGNhY2hlIGJhY2tzIHJlYWRzIGJlZm9yZSB0aGUgZmlyc3RcbiAqIHNuYXBzaG90IGFycml2ZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBbm5vdGF0aW9uc0FnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE9XTkVSID0gJ0Fubm90YXRpb25zQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbXMgPSB0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5uZWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFubmVsQnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIElUcmFja2VkQ2hhbm5lbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJlc291cmNlQnlLZXkgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHQvKiogTG9jYWwgY2FjaGUgc28gcmVhZHMgd29yayBiZWZvcmUgdGhlIGZpcnN0IHNuYXBzaG90IGFycml2ZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlQnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudEZlZWRiYWNrW10+KCk7XG5cdC8qKlxuXHQgKiBTaWduYXR1cmUgb2YgdGhlIGZlZWRiYWNrIHNldCB3ZSBsYXN0IGZpcmVkIHtAbGluayBvbkRpZENoYW5nZUl0ZW1zfSBmb3IsXG5cdCAqIHBlciBzZXNzaW9uLiBUaGUgYW5ub3RhdGlvbnMgY2hhbm5lbCBpcyBzaGFyZWQgYW5kIG1heSBjYXJyeSBub24tZmVlZGJhY2tcblx0ICogYW5ub3RhdGlvbnM7IGNvbXBhcmluZyBzaWduYXR1cmVzIG1lYW5zIGNodXJuIGZyb20gdGhvc2UgZG9lcyBub3QgZmlyZSBhXG5cdCAqIHNwdXJpb3VzIGZlZWRiYWNrLWl0ZW1zIGNoYW5nZSAod2hpY2ggd291bGQgYnVtcCByZWNlbmN5IC8gbmF2aWdhdGlvbikuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaWduYXR1cmVCeVNlc3Npb24gPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHQvKipcblx0ICogU2Vzc2lvbnMgd2hvc2UgYW5ub3RhdGlvbnMgc25hcHNob3QgaGFzIGJlZW4gcmVjZWl2ZWQuIFVzZWQgdG8gZmlyZVxuXHQgKiB7QGxpbmsgb25EaWRDaGFuZ2VJdGVtc30gZXhhY3RseSBvbmNlIHdoZW4gbG9hZGluZyBjb21wbGV0ZXMgKGV2ZW4gd2hlbiB0aGVcblx0ICogbG9hZGVkIGZlZWRiYWNrIHNldCBpcyBlbXB0eSksIHNvIGNvbnN1bWVycyB0aGF0IHNlZWQgZmVlZGJhY2sgY2FuIHdhaXQgZm9yXG5cdCAqIHRoZSBhdXRob3JpdGF0aXZlIHNldCBiZWZvcmUgYWN0aW5nLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbG9hZGVkQnlTZXNzaW9uID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlbGVhc2UgYSBzZXNzaW9uJ3MgYW5ub3RhdGlvbnMgc3Vic2NyaXB0aW9uIHdoZW4gdGhlIHNlc3Npb24gaXNcblx0XHQvLyBwZXJtYW5lbnRseSBkZWxldGVkLiBPdGhlcndpc2UgdGhlIHBlci1zZXNzaW9uIHdpcmUgc3Vic2NyaXB0aW9uXG5cdFx0Ly8gYWNxdWlyZWQgbGF6aWx5IGluIGBfZW5zdXJlQ2hhbm5lbGAgd291bGQgYmUgaGVsZCBmb3IgdGhlIGxpZmV0aW1lIG9mXG5cdFx0Ly8gdGhpcyAoc2luZ2xldG9uLW93bmVkKSBiYWNrZW5kLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWREZWxldGVTZXNzaW9uKHNlc3Npb24gPT4gdGhpcy5fcmVsZWFzZUNoYW5uZWwoc2Vzc2lvbi5yZXNvdXJjZSkpKTtcblx0fVxuXG5cdGdldEl0ZW1zKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXSB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuX2Vuc3VyZUNoYW5uZWwoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoY2hhbm5lbCAmJiB0aGlzLl9oYXNTbmFwc2hvdChjaGFubmVsLnN1YnNjcmlwdGlvbikpIHtcblx0XHRcdHJldHVybiBvcmRlckZlZWRiYWNrSXRlbXModGhpcy5fZGVjb2RlKGNoYW5uZWwuc3Vic2NyaXB0aW9uLCBzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9yZGVyRmVlZGJhY2tJdGVtcyh0aGlzLl9jYWNoZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpID8/IFtdKTtcblx0fVxuXG5cdGhhc0xvYWRlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdC8vIE9ubHkgYXV0aG9yaXRhdGl2ZSBvbmNlIHRoZSBzZXNzaW9uJ3MgYW5ub3RhdGlvbnMgc25hcHNob3QgaGFzIGJlZW5cblx0XHQvLyByZWNlaXZlZDsgdW50aWwgdGhlbiBgZ2V0SXRlbXNgIGZhbGxzIGJhY2sgdG8gdGhlIChwb3NzaWJseSBlbXB0eSlcblx0XHQvLyBsb2NhbCBjYWNoZSBhbmQgbXVzdCBub3QgYmUgdHJlYXRlZCBhcyB0aGUgZnVsbCBpdGVtIHNldC5cblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5fZW5zdXJlQ2hhbm5lbChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHJldHVybiBjaGFubmVsID8gdGhpcy5faGFzU25hcHNob3QoY2hhbm5lbC5zdWJzY3JpcHRpb24pIDogZmFsc2U7XG5cdH1cblxuXHR1cHNlcnQoZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuX2Vuc3VyZUNoYW5uZWwoZmVlZGJhY2suc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9jYWNoZVVwc2VydChmZWVkYmFjayk7XG5cdFx0aWYgKCFjaGFubmVsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoZmVlZGJhY2suc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y2hhbm5lbC5jb25uZWN0aW9uLmRpc3BhdGNoKGNoYW5uZWwuYW5ub3RhdGlvbnNVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1NldCxcblx0XHRcdGFubm90YXRpb246IGZlZWRiYWNrVG9Bbm5vdGF0aW9uKGZlZWRiYWNrKSxcblx0XHR9KTtcblx0XHRpZiAoIXRoaXMuX2hhc1NuYXBzaG90KGNoYW5uZWwuc3Vic2NyaXB0aW9uKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5maXJlKGZlZWRiYWNrLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlKHNlc3Npb25SZXNvdXJjZTogVVJJLCBmZWVkYmFja0lkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5fZW5zdXJlQ2hhbm5lbChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX2NhY2hlUmVtb3ZlKHNlc3Npb25SZXNvdXJjZSwgZmVlZGJhY2tJZCk7XG5cdFx0aWYgKCFjaGFubmVsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y2hhbm5lbC5jb25uZWN0aW9uLmRpc3BhdGNoKGNoYW5uZWwuYW5ub3RhdGlvbnNVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Bbm5vdGF0aW9uc1JlbW92ZWQsXG5cdFx0XHRhbm5vdGF0aW9uSWQ6IGZlZWRiYWNrSWQsXG5cdFx0fSk7XG5cdFx0aWYgKCF0aGlzLl9oYXNTbmFwc2hvdChjaGFubmVsLnN1YnNjcmlwdGlvbikpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEl0ZW1zKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuX2Vuc3VyZUNoYW5uZWwoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9jYWNoZUJ5U2Vzc2lvbi5kZWxldGUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdFx0Y2hhbm5lbC5jb25uZWN0aW9uLmRpc3BhdGNoKGNoYW5uZWwuYW5ub3RhdGlvbnNVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNSZW1vdmVkLFxuXHRcdFx0XHRcdGFubm90YXRpb25JZDogaXRlbS5pZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbnNXaXRoSXRlbXMoKTogVVJJW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogVVJJW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHRoaXMuX3Nlc3Npb25SZXNvdXJjZUJ5S2V5LnZhbHVlcygpKSB7XG5cdFx0XHRpZiAodGhpcy5nZXRJdGVtcyhyZXNvdXJjZSkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgYW5ub3RhdGlvbnMgY2hhbm5lbCBVUkkgYmFja2luZyB0aGUgZ2l2ZW4gc2Vzc2lvbidzIGZlZWRiYWNrLFxuXHQgKiBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIGlzIG5vdCBhbiBhZ2VudC1ob3N0IHNlc3Npb24gKG9yIG5vIGNoYW5uZWxcblx0ICogY291bGQgYmUgcmVzb2x2ZWQpLiBFYWNoIGZlZWRiYWNrIGl0ZW0gaWQgaXMgYW4gYW5ub3RhdGlvbiBpZCBvbiB0aGlzXG5cdCAqIGNoYW5uZWwsIHNvIGNhbGxlcnMgY2FuIHJlZmVyZW5jZSBzcGVjaWZpYyBjb21tZW50cyBieSBpZC5cblx0ICovXG5cdGdldEFubm90YXRpb25zQ2hhbm5lbFJlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlQ2hhbm5lbChzZXNzaW9uUmVzb3VyY2UpPy5hbm5vdGF0aW9uc1VyaTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc1NuYXBzaG90KHN1YnNjcmlwdGlvbjogSUFnZW50U3Vic2NyaXB0aW9uPEFubm90YXRpb25zU3RhdGU+KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBzdWJzY3JpcHRpb24udmFsdWU7XG5cdFx0cmV0dXJuIHZhbHVlICE9PSB1bmRlZmluZWQgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgX2RlY29kZShzdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxBbm5vdGF0aW9uc1N0YXRlPiwgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQWdlbnRGZWVkYmFja1tdIHtcblx0XHRjb25zdCB2YWx1ZSA9IHN1YnNjcmlwdGlvbi52YWx1ZTtcblx0XHRpZiAoIXZhbHVlIHx8IHZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXM6IElBZ2VudEZlZWRiYWNrW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGFubm90YXRpb24gb2YgdmFsdWUuYW5ub3RhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGZlZWRiYWNrID0gYW5ub3RhdGlvblRvRmVlZGJhY2soYW5ub3RhdGlvbiwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChmZWVkYmFjaykge1xuXHRcdFx0XHRpdGVtcy5wdXNoKGZlZWRiYWNrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpcmUge0BsaW5rIG9uRGlkQ2hhbmdlSXRlbXN9IG9ubHkgd2hlbiB0aGUgc2Vzc2lvbidzIGZlZWRiYWNrIHNldCBhY3R1YWxseVxuXHQgKiBjaGFuZ2VkLiBUaGUgYW5ub3RhdGlvbnMgY2hhbm5lbCBpcyBnZW5lcmljIGFuZCBtYXkgY2FycnkgYW5ub3RhdGlvbnMgZnJvbVxuXHQgKiBvdGhlciBmZWF0dXJlczsgd2l0aG91dCB0aGlzIGd1YXJkIHRoZWlyIGNodXJuIHdvdWxkIGJ1bXAgZmVlZGJhY2sgcmVjZW5jeVxuXHQgKiBvcmRlcmluZyBhbmQgbmF2aWdhdGlvbiBldmVuIHRob3VnaCBubyBmZWVkYmFjayBjaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfb25Bbm5vdGF0aW9uc0NoYW5nZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9jaGFubmVsQnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBGaXJlIG9uY2Ugd2hlbiB0aGUgc25hcHNob3QgZmlyc3QgYXJyaXZlcyBzbyBjb25zdW1lcnMgbGVhcm4gdGhhdCB0aGVcblx0XHQvLyBmZWVkYmFjayBzZXQgaXMgbm93IGF1dGhvcml0YXRpdmUsIGV2ZW4gaWYgaXQgaXMgZW1wdHkgKGFuZCB0aHVzIGhhc1xuXHRcdC8vIHRoZSBzYW1lIFx1MjAxNCBlbXB0eSBcdTIwMTQgc2lnbmF0dXJlIGFzIGJlZm9yZSBsb2FkaW5nKS5cblx0XHRpZiAodGhpcy5faGFzU25hcHNob3QoY2hhbm5lbC5zdWJzY3JpcHRpb24pICYmICF0aGlzLl9sb2FkZWRCeVNlc3Npb24uaGFzKGtleSkpIHtcblx0XHRcdHRoaXMuX2xvYWRlZEJ5U2Vzc2lvbi5hZGQoa2V5KTtcblx0XHRcdHRoaXMuX3NpZ25hdHVyZUJ5U2Vzc2lvbi5zZXQoa2V5LCB0aGlzLl9mZWVkYmFja1NpZ25hdHVyZShjaGFubmVsLnN1YnNjcmlwdGlvbikpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNpZ25hdHVyZSA9IHRoaXMuX2ZlZWRiYWNrU2lnbmF0dXJlKGNoYW5uZWwuc3Vic2NyaXB0aW9uKTtcblx0XHRpZiAodGhpcy5fc2lnbmF0dXJlQnlTZXNzaW9uLmdldChrZXkpID09PSBzaWduYXR1cmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2lnbmF0dXJlQnlTZXNzaW9uLnNldChrZXksIHNpZ25hdHVyZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBzdGFibGUgc2lnbmF0dXJlIG9mIHRoZSBmZWVkYmFjay1iZWFyaW5nIGFubm90YXRpb25zIGluIHRoZVxuXHQgKiBzdWJzY3JpcHRpb24ncyBjdXJyZW50IHNuYXBzaG90IChzb3J0ZWQgYnkgaWQpLiBFeGNsdWRlcyBhbm5vdGF0aW9uc1xuXHQgKiB3aXRob3V0IGZlZWRiYWNrIG1ldGFkYXRhIHNvIHVucmVsYXRlZCBhbm5vdGF0aW9uIGFjdGl2aXR5IG9uIHRoZSBzaGFyZWRcblx0ICogY2hhbm5lbCBpcyBpZ25vcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmVlZGJhY2tTaWduYXR1cmUoc3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248QW5ub3RhdGlvbnNTdGF0ZT4pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHZhbHVlID0gc3Vic2NyaXB0aW9uLnZhbHVlO1xuXHRcdGlmICghdmFsdWUgfHwgdmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBmZWVkYmFjayA9IHZhbHVlLmFubm90YXRpb25zXG5cdFx0XHQubWFwKGFubm90YXRpb24gPT4gKHsgYW5ub3RhdGlvbiwgbWV0YTogcmVhZEZlZWRiYWNrTWV0YShhbm5vdGF0aW9uKSB9KSlcblx0XHRcdC5maWx0ZXIoKHsgYW5ub3RhdGlvbiwgbWV0YSB9KSA9PiBtZXRhICE9PSB1bmRlZmluZWQgJiYgKGFubm90YXRpb24uZW50cmllcz8ubGVuZ3RoID8/IDApID4gMClcblx0XHRcdC5tYXAoKHsgYW5ub3RhdGlvbiwgbWV0YSB9KSA9PiAoe1xuXHRcdFx0XHRpZDogYW5ub3RhdGlvbi5pZCxcblx0XHRcdFx0cmVzb3VyY2U6IGFubm90YXRpb24ucmVzb3VyY2UsXG5cdFx0XHRcdHJhbmdlOiBhbm5vdGF0aW9uLnJhbmdlLFxuXHRcdFx0XHRyZXNvbHZlZDogYW5ub3RhdGlvbi5yZXNvbHZlZCxcblx0XHRcdFx0ZW50cmllczogYW5ub3RhdGlvbi5lbnRyaWVzLFxuXHRcdFx0XHRtZXRhLFxuXHRcdFx0fSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZmVlZGJhY2spO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGVVcHNlcnQoZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gZmVlZGJhY2suc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0bGV0IGl0ZW1zID0gdGhpcy5fY2FjaGVCeVNlc3Npb24uZ2V0KGtleSk7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0aXRlbXMgPSBbXTtcblx0XHRcdHRoaXMuX2NhY2hlQnlTZXNzaW9uLnNldChrZXksIGl0ZW1zKTtcblx0XHR9XG5cdFx0Y29uc3QgaWR4ID0gaXRlbXMuZmluZEluZGV4KGYgPT4gZi5pZCA9PT0gZmVlZGJhY2suaWQpO1xuXHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0aXRlbXNbaWR4XSA9IGZlZWRiYWNrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpdGVtcy5wdXNoKGZlZWRiYWNrKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZVJlbW92ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9jYWNoZUJ5U2Vzc2lvbi5nZXQoa2V5KTtcblx0XHRpZiAoIWl0ZW1zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlkeCA9IGl0ZW1zLmZpbmRJbmRleChmID0+IGYuaWQgPT09IGZlZWRiYWNrSWQpO1xuXHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0aXRlbXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVsZWFzZUNoYW5uZWwoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9jaGFubmVscy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0dGhpcy5fY2hhbm5lbEJ5U2Vzc2lvbi5kZWxldGUoa2V5KTtcblx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2VCeUtleS5kZWxldGUoa2V5KTtcblx0XHR0aGlzLl9jYWNoZUJ5U2Vzc2lvbi5kZWxldGUoa2V5KTtcblx0XHR0aGlzLl9zaWduYXR1cmVCeVNlc3Npb24uZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fbG9hZGVkQnlTZXNzaW9uLmRlbGV0ZShrZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQ2hhbm5lbChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElUcmFja2VkQ2hhbm5lbCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jaGFubmVsQnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXNlc3Npb24gfHwgIWlzQWdlbnRIb3N0UHJvdmlkZXJJZChzZXNzaW9uLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcjxJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4oc2Vzc2lvbi5wcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyPy5nZXRGZWVkYmFja0Fubm90YXRpb25zQ2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBwcm92aWRlci5nZXRGZWVkYmFja0Fubm90YXRpb25zQ2hhbm5lbChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByZWYgPSBzdG9yZS5hZGQocmVzb2x2ZWQuY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLkFubm90YXRpb25zLCByZXNvbHZlZC5hbm5vdGF0aW9uc1VyaSwgQW5ub3RhdGlvbnNBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kLk9XTkVSKSk7XG5cdFx0Y29uc3QgY2hhbm5lbDogSVRyYWNrZWRDaGFubmVsID0ge1xuXHRcdFx0Y29ubmVjdGlvbjogcmVzb2x2ZWQuY29ubmVjdGlvbixcblx0XHRcdGFubm90YXRpb25zVXJpOiByZXNvbHZlZC5hbm5vdGF0aW9uc1VyaSxcblx0XHRcdHN1YnNjcmlwdGlvbjogcmVmLm9iamVjdCxcblx0XHR9O1xuXHRcdHRoaXMuX3NpZ25hdHVyZUJ5U2Vzc2lvbi5zZXQoa2V5LCB0aGlzLl9mZWVkYmFja1NpZ25hdHVyZShyZWYub2JqZWN0KSk7XG5cdFx0aWYgKHRoaXMuX2hhc1NuYXBzaG90KHJlZi5vYmplY3QpKSB7XG5cdFx0XHR0aGlzLl9sb2FkZWRCeVNlc3Npb24uYWRkKGtleSk7XG5cdFx0fVxuXHRcdHN0b3JlLmFkZChyZWYub2JqZWN0Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uQW5ub3RhdGlvbnNDaGFuZ2Uoc2Vzc2lvblJlc291cmNlKSkpO1xuXG5cdFx0dGhpcy5fY2hhbm5lbHMuc2V0KGtleSwgc3RvcmUpO1xuXHRcdHRoaXMuX2NoYW5uZWxCeVNlc3Npb24uc2V0KGtleSwgY2hhbm5lbCk7XG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlQnlLZXkuc2V0KGtleSwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gY2hhbm5lbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFL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
