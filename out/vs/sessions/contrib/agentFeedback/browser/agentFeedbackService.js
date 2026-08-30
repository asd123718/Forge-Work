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
import { Emitter, Event } from "../../../../base/common/event.js";
import { DeferredPromise, raceTimeout } from "../../../../base/common/async.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { derived, runOnChange } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isEqual, isEqualOrParent } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { IChatEditingService } from "../../../../workbench/contrib/chat/common/editing/chatEditingService.js";
import { isIChatSessionFileChange2 } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { editingEntriesContainResource } from "../../../../workbench/contrib/chat/browser/sessionResourceMatching.js";
import { changeMatchesResource, getActiveResourceCandidates } from "./agentFeedbackEditorUtils.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { IChatWidgetService } from "../../../../workbench/contrib/chat/browser/chat.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { isAgentHostProviderId } from "../../../common/agentHostSessionsProvider.js";
import { AnnotationsAgentFeedbackItemsBackend, InMemoryAgentFeedbackItemsBackend } from "./agentFeedbackItemsBackend.js";
import { ATTACHMENT_ID_PREFIX, createAgentFeedbackVariableEntry } from "./agentFeedbackAttachmentEntry.js";
import { AgentFeedbackKind, AgentFeedbackState } from "./agentFeedbackModel.js";
import { SessionEditorCommentSource, toSessionEditorCommentId } from "./sessionEditorComments.js";
const AGENT_FEEDBACK_NEW_SESSION_RESOURCE = URI.from({ scheme: "agent-feedback", path: "/new-session" });
const WIDGET_LOAD_TIMEOUT_MS = 1e4;
async function whenWidgetForSession(chatWidgetService, sessionResource, timeoutMs = WIDGET_LOAD_TIMEOUT_MS) {
  const existing = chatWidgetService.getWidgetBySessionResource(sessionResource);
  if (existing) {
    return existing;
  }
  const store = new DisposableStore();
  try {
    const loaded = new Promise((resolve) => {
      const check = () => {
        const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (widget) {
          resolve(widget);
        }
      };
      const observe = (candidate) => store.add(candidate.onDidChangeViewModel(check));
      chatWidgetService.getAllWidgets().forEach(observe);
      store.add(chatWidgetService.onDidAddWidget((added) => {
        observe(added);
        check();
      }));
      check();
    });
    return await raceTimeout(loaded, timeoutMs);
  } finally {
    store.dispose();
  }
}
const IAgentFeedbackService = createDecorator("agentFeedbackService");
function workspaceFoldersKey(workspace) {
  return workspace?.folders.map((folder) => folder.root.toString()).join(",");
}
let AgentFeedbackService = class extends Disposable {
  constructor(_chatEditingService, _sessionsManagementService, _sessionsService, _editorService, _chatWidgetService, _logService, _instantiationService) {
    super();
    this._chatEditingService = _chatEditingService;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._editorService = _editorService;
    this._chatWidgetService = _chatWidgetService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._onDidChangeFeedback = this._store.add(new Emitter());
    this.onDidChangeFeedback = this._onDidChangeFeedback.event;
    this._onDidChangeNavigation = this._store.add(new Emitter());
    this.onDidChangeNavigation = this._onDidChangeNavigation.event;
    this._onDidRevealSessionComment = this._store.add(new Emitter());
    this.onDidRevealSessionComment = this._onDidRevealSessionComment.event;
    this._onDidChangeFeedbackScope = this._store.add(new Emitter());
    this.onDidChangeFeedbackScope = this._onDidChangeFeedbackScope.event;
    this._onDidAddFeedback = this._store.add(new Emitter());
    this.onDidAddFeedback = this._onDidAddFeedback.event;
    this._onDidConvertFeedback = this._store.add(new Emitter());
    this.onDidConvertFeedback = this._onDidConvertFeedback.event;
    this._onDidAddReply = this._store.add(new Emitter());
    this.onDidAddReply = this._onDidAddReply.event;
    this._onDidSubmitFeedback = this._store.add(new Emitter());
    this.onDidSubmitFeedback = this._onDidSubmitFeedback.event;
    /** sessionResource → recency sequence (set on every feedback change) */
    this._sessionUpdatedOrder = /* @__PURE__ */ new Map();
    this._sessionUpdatedSequence = 0;
    this._navigationAnchorBySession = /* @__PURE__ */ new Map();
    /** fileResource → sessionResource active when the editor for that file was first seen */
    this._fileToSession = new ResourceMap();
    this._explicitResourceScopes = new ResourceMap();
    /** In-memory store used for every non-agent-host provider. */
    this._inMemoryBackend = this._register(new InMemoryAgentFeedbackItemsBackend());
    this._register(this._inMemoryBackend.onDidChangeItems((resource) => this._handleBackendChange(resource)));
    this._register(this._editorService.onDidVisibleEditorsChange(() => this._trackVisibleEditorResources()));
    this._trackVisibleEditorResources();
    this.activeFeedbackSessionResource = derived(this, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return !activeSession || !activeSession.isCreated.read(reader) ? AGENT_FEEDBACK_NEW_SESSION_RESOURCE : activeSession.resource;
    });
    const feedbackScopeKey = derived(this, (reader) => {
      const scope = this.activeFeedbackSessionResource.read(reader).toString();
      const workspace = this._sessionsService.activeSession.read(reader)?.workspace.read(reader);
      return `${scope}|${workspaceFoldersKey(workspace) ?? ""}`;
    });
    this._register(runOnChange(feedbackScopeKey, () => this._onDidChangeFeedbackScope.fire()));
    this._newSessionWorkspaceKey = derived(this, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      if (!activeSession || activeSession.isCreated.read(reader)) {
        return void 0;
      }
      return workspaceFoldersKey(activeSession.workspace.read(reader));
    });
    this._register(runOnChange(this._newSessionWorkspaceKey, (key) => {
      if (key === void 0) {
        return;
      }
      if (this._boundNewSessionWorkspaceKey !== void 0 && this._boundNewSessionWorkspaceKey !== key) {
        this.clearFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE);
      }
      this._rebindNewSessionWorkspace();
    }));
  }
  /**
   * The shared new-session comments belong to the workspace of the draft they
   * were written for. An empty set releases the binding so the next draft can
   * adopt its own workspace instead of being measured against a stale one.
   */
  _rebindNewSessionWorkspace() {
    if (!this.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length) {
      this._boundNewSessionWorkspaceKey = void 0;
      return;
    }
    const key = this._newSessionWorkspaceKey.get();
    if (key !== void 0) {
      this._boundNewSessionWorkspaceKey = key;
    }
  }
  /** Resolves the storage backend that owns feedback for the given session. */
  _backendForSession(sessionResource) {
    if (this._isAgentHostSession(sessionResource)) {
      return this._getAnnotationsBackend();
    }
    return this._inMemoryBackend;
  }
  _getAnnotationsBackend() {
    if (!this._annotationsBackend) {
      this._annotationsBackend = this._register(this._instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
      this._register(this._annotationsBackend.onDidChangeItems((resource) => this._handleBackendChange(resource)));
    }
    return this._annotationsBackend;
  }
  _backends() {
    return this._annotationsBackend ? [this._inMemoryBackend, this._annotationsBackend] : [this._inMemoryBackend];
  }
  /**
   * Centralized handler for backend item changes (local mutations and
   * server-driven updates). Maintains recency ordering and re-broadcasts the
   * generic feedback / navigation change events.
   */
  _handleBackendChange(sessionResource) {
    const key = sessionResource.toString();
    const feedbackItems = this._backendForSession(sessionResource).getItems(sessionResource);
    if (feedbackItems.length) {
      this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
    } else {
      this._sessionUpdatedOrder.delete(key);
    }
    this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
    this._onDidChangeNavigation.fire(sessionResource);
    if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
      this._rebindNewSessionWorkspace();
    }
  }
  _trackVisibleEditorResources() {
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession) {
      return;
    }
    for (const pane of this._editorService.visibleEditorPanes) {
      for (const candidate of getActiveResourceCandidates(pane.input)) {
        this._fileToSession.set(candidate, activeSession.resource);
      }
    }
  }
  getSessionForFile(resourceUri) {
    const sessionResource = this._fileToSession.get(resourceUri) ?? this._sessionsService.activeSession.get()?.resource;
    if (!sessionResource) {
      return void 0;
    }
    const session = this._sessionsManagementService.getSession(sessionResource);
    if (!session || session.status.get() === SessionStatus.Untitled) {
      return void 0;
    }
    if (!this._isFileInSessionScope(session, resourceUri)) {
      return void 0;
    }
    return session;
  }
  getFeedbackSessionResource(resourceUri) {
    const explicitScope = this._explicitResourceScopes.get(resourceUri);
    if (explicitScope) {
      return explicitScope;
    }
    if (resourceUri.scheme === Schemas.outputChannel) {
      return void 0;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession || !activeSession.isCreated.get()) {
      if (activeSession && !this._isFileInSessionScope(activeSession, resourceUri)) {
        return void 0;
      }
      return AGENT_FEEDBACK_NEW_SESSION_RESOURCE;
    }
    return this.getSessionForFile(resourceUri)?.resource;
  }
  registerFeedbackResourceScope(resourceUri, sessionResource) {
    this._explicitResourceScopes.set(resourceUri, sessionResource);
    this._onDidChangeFeedbackScope.fire();
    return {
      dispose: () => {
        if (isEqual(this._explicitResourceScopes.get(resourceUri), sessionResource)) {
          this._explicitResourceScopes.delete(resourceUri);
          this._onDidChangeFeedbackScope.fire();
        }
      }
    };
  }
  /**
   * Whether the given file belongs to the session and is therefore eligible
   * for agent feedback. This keeps the feedback affordances scoped to the
   * session's own files and excludes editors that merely happen to be open
   * while the session is active (e.g. user settings opened from the user
   * data directory, or the Output view which is not backed by a real file).
   */
  _isFileInSessionScope(session, resourceUri) {
    if (resourceUri.scheme === Schemas.outputChannel) {
      return false;
    }
    if (session.changes.get().some((change) => changeMatchesResource(change, resourceUri))) {
      return true;
    }
    const workspace = session.workspace.get();
    if (!workspace) {
      return true;
    }
    return workspace.folders.some((folder) => isEqualOrParent(resourceUri, folder.root) || isEqualOrParent(resourceUri, folder.workingDirectory));
  }
  addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind = AgentFeedbackKind.UserReview, state = AgentFeedbackState.Accepted) {
    const backend = this._backendForSession(sessionResource);
    const effectiveKind = sourcePRReviewCommentId ? AgentFeedbackKind.PRReview : kind;
    const feedback = {
      id: generateUuid(),
      text,
      resourceUri,
      range,
      sessionResource,
      suggestion,
      codeSelection: context?.codeSelection,
      diffHunks: context?.diffHunks,
      kind: effectiveKind,
      sourcePRReviewCommentId,
      state
    };
    const resourceStr = resourceUri.toString();
    const hasExistingForFile = backend.getItems(sessionResource).some((f) => f.resourceUri.toString() === resourceStr);
    backend.upsert(feedback);
    if (state === AgentFeedbackState.Accepted) {
      if (effectiveKind === AgentFeedbackKind.UserReview) {
        this._onDidAddFeedback.fire({ sessionResource, feedback, hasExistingFeedbackForFile: hasExistingForFile });
      } else {
        this._onDidConvertFeedback.fire({ sessionResource, feedback, kind: effectiveKind, hasExistingFeedbackForFile: hasExistingForFile });
      }
    }
    return feedback;
  }
  acceptFeedback(sessionResource, feedbackId, options) {
    const backend = this._backendForSession(sessionResource);
    const feedbackItems = backend.getItems(sessionResource);
    const existing = feedbackItems.find((f) => f.id === feedbackId);
    if (!existing || existing.state !== AgentFeedbackState.Created) {
      return;
    }
    const accepted = {
      ...existing,
      state: AgentFeedbackState.Accepted,
      ...options?.revealToAgent ? { pendingAgentReveal: true } : {}
    };
    backend.upsert(accepted);
    if (accepted.kind !== AgentFeedbackKind.UserReview) {
      const resourceStr = accepted.resourceUri.toString();
      const hasExistingFeedbackForFile = feedbackItems.some((f) => f.id !== accepted.id && f.resourceUri.toString() === resourceStr);
      this._onDidConvertFeedback.fire({ sessionResource, feedback: accepted, kind: accepted.kind, hasExistingFeedbackForFile });
    }
  }
  removeFeedback(sessionResource, feedbackId) {
    const key = sessionResource.toString();
    if (this._navigationAnchorBySession.get(key) === feedbackId) {
      this._navigationAnchorBySession.delete(key);
    }
    this._backendForSession(sessionResource).remove(sessionResource, feedbackId);
  }
  updateFeedback(sessionResource, feedbackId, newText) {
    const backend = this._backendForSession(sessionResource);
    const existing = backend.getItems(sessionResource).find((f) => f.id === feedbackId);
    if (!existing) {
      return;
    }
    backend.upsert({ ...existing, text: newText });
  }
  setFeedbackResolved(sessionResource, feedbackId, resolved) {
    const backend = this._backendForSession(sessionResource);
    const nextState = resolved ? AgentFeedbackState.Resolved : AgentFeedbackState.Submitted;
    const existing = backend.getItems(sessionResource).find((f) => f.id === feedbackId);
    if (existing && existing.state !== nextState) {
      backend.upsert({ ...existing, state: nextState });
    }
  }
  addReply(sessionResource, feedbackId, replyText) {
    const backend = this._backendForSession(sessionResource);
    const existing = backend.getItems(sessionResource).find((f) => f.id === feedbackId);
    if (!existing) {
      return;
    }
    const newReplies = [...existing.replies ?? [], replyText];
    const updated = { ...existing, replies: newReplies };
    backend.upsert(updated);
    this._onDidAddReply.fire({ sessionResource, feedback: updated, replyCount: newReplies.length });
  }
  getFeedback(sessionResource) {
    return this._backendForSession(sessionResource).getItems(sessionResource);
  }
  hasLoadedFeedback(sessionResource) {
    return this._backendForSession(sessionResource).hasLoaded(sessionResource);
  }
  getMostRecentSessionForResource(resourceUri) {
    let bestSession;
    let bestSequence = -1;
    for (const backend of this._backends()) {
      for (const candidate of backend.getSessionsWithItems()) {
        const feedbackItems = backend.getItems(candidate);
        if (!feedbackItems.length) {
          continue;
        }
        if (!this._sessionContainsResource(candidate, resourceUri, feedbackItems)) {
          continue;
        }
        const sequence = this._sessionUpdatedOrder.get(candidate.toString()) ?? 0;
        if (sequence > bestSequence) {
          bestSession = candidate;
          bestSequence = sequence;
        }
      }
    }
    return bestSession;
  }
  _sessionContainsResource(sessionResource, resourceUri, feedbackItems) {
    if (feedbackItems.some((item) => isEqual(item.resourceUri, resourceUri))) {
      return true;
    }
    for (const editingSession of this._chatEditingService.editingSessionsObs.get()) {
      if (!isEqual(editingSession.chatSessionResource, sessionResource)) {
        continue;
      }
      if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
        return true;
      }
    }
    const session = this._sessionsManagementService.getSession(sessionResource);
    if (!session) {
      return false;
    }
    const changes = session.changes.get();
    if (changes.some((change) => changeMatchesResource(change, resourceUri))) {
      return true;
    }
    return false;
  }
  async revealFeedback(sessionResource, feedbackId) {
    const feedback = this.getFeedback(sessionResource).find((f) => f.id === feedbackId);
    if (!feedback) {
      return;
    }
    await this.revealSessionComment(sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedbackId), feedback.resourceUri, feedback.range);
  }
  async revealSessionComment(sessionResource, commentId, resourceUri, range) {
    const selection = { startLineNumber: range.startLineNumber, startColumn: range.startColumn };
    const sessionData = this._sessionsManagementService.getSession(sessionResource);
    const sessionChange = this._getSessionChange(resourceUri, sessionData?.changes.get());
    if (sessionChange?.isDeletion && sessionChange.originalUri) {
      await this._editorService.openEditor({
        resource: sessionChange.originalUri,
        options: {
          modal: {},
          preserveFocus: false,
          revealIfVisible: true,
          selection
        }
      });
    } else if (sessionChange?.originalUri) {
      await this._editorService.openEditor({
        original: { resource: sessionChange.originalUri },
        modified: { resource: sessionChange.modifiedUri },
        options: {
          modal: {},
          preserveFocus: false,
          revealIfVisible: true,
          selection
        }
      });
    } else {
      await this._editorService.openEditor({
        resource: sessionChange?.modifiedUri ?? resourceUri,
        options: {
          modal: {},
          preserveFocus: false,
          revealIfVisible: true,
          selection
        }
      });
    }
    this.setNavigationAnchor(sessionResource, commentId);
    this._onDidRevealSessionComment.fire({ sessionResource, commentId, resourceUri });
  }
  _getSessionChange(resourceUri, changes) {
    if (!(changes instanceof Array)) {
      return void 0;
    }
    const matchingChange = changes.find((change) => changeMatchesResource(change, resourceUri));
    if (!matchingChange) {
      return void 0;
    }
    if (isIChatSessionFileChange2(matchingChange)) {
      return {
        originalUri: matchingChange.originalUri,
        modifiedUri: matchingChange.modifiedUri ?? matchingChange.uri,
        isDeletion: matchingChange.modifiedUri === void 0
      };
    }
    return {
      originalUri: matchingChange.originalUri,
      modifiedUri: matchingChange.modifiedUri,
      isDeletion: false
    };
  }
  getNextFeedback(sessionResource, next) {
    return this.getNextNavigableItem(sessionResource, this.getFeedback(sessionResource), next);
  }
  getNextNavigableItem(sessionResource, items, next) {
    const key = sessionResource.toString();
    if (!items.length) {
      this._navigationAnchorBySession.delete(key);
      return void 0;
    }
    const anchorId = this._navigationAnchorBySession.get(key);
    let anchorIndex = anchorId ? items.findIndex((item2) => item2.id === anchorId) : -1;
    if (anchorIndex < 0 && !next) {
      anchorIndex = 0;
    }
    const nextIndex = next ? (anchorIndex + 1) % items.length : (anchorIndex - 1 + items.length) % items.length;
    const item = items[nextIndex];
    this.setNavigationAnchor(sessionResource, item.id);
    return item;
  }
  setNavigationAnchor(sessionResource, itemId) {
    const key = sessionResource.toString();
    if (itemId) {
      this._navigationAnchorBySession.set(key, itemId);
    } else {
      this._navigationAnchorBySession.delete(key);
    }
    this._onDidChangeNavigation.fire(sessionResource);
  }
  getNavigationBearing(sessionResource, items = this.getFeedback(sessionResource)) {
    const key = sessionResource.toString();
    const anchorId = this._navigationAnchorBySession.get(key);
    const activeIdx = anchorId ? items.findIndex((item) => item.id === anchorId) : -1;
    return { activeIdx, totalCount: items.length };
  }
  clearFeedback(sessionResource) {
    const key = sessionResource.toString();
    this._sessionUpdatedOrder.delete(key);
    this._navigationAnchorBySession.delete(key);
    this._backendForSession(sessionResource).clear(sessionResource);
  }
  async addFeedbackAndSubmit(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind) {
    this.addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind);
    if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
      await this.submitFeedback(sessionResource);
      return;
    }
    if (!this._isAgentHostSession(sessionResource)) {
      const widget = await whenWidgetForSession(this._chatWidgetService, sessionResource);
      if (widget) {
        const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
        const hasAttachment = () => widget.attachmentModel.attachments.some((a) => a.id === attachmentId);
        if (!hasAttachment()) {
          await Event.toPromise(
            Event.filter(widget.attachmentModel.onDidChange, () => hasAttachment())
          );
        }
      } else {
        this._logService.error("[AgentFeedback] addFeedbackAndSubmit: no chat widget found for session, feedback may not be submitted correctly", sessionResource.toString());
      }
    }
    await this.submitFeedback(sessionResource);
  }
  _isAgentHostSession(sessionResource) {
    const session = this._sessionsManagementService.getSession(sessionResource);
    return session ? isAgentHostProviderId(session.providerId) : false;
  }
  async submitFeedback(sessionResource) {
    if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
      if (!this.getFeedback(sessionResource).some((item) => item.state === AgentFeedbackState.Accepted)) {
        return false;
      }
      return this._sessionsService.submitNewSessionInput();
    }
    const widget = await whenWidgetForSession(this._chatWidgetService, sessionResource);
    if (!widget) {
      this._logService.error("[AgentFeedback] submitFeedback: no chat widget found for session", sessionResource.toString());
      return false;
    }
    if (this._isAgentHostSession(sessionResource)) {
      const acceptedItems = this.getFeedback(sessionResource).filter((item) => item.state === AgentFeedbackState.Accepted);
      const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
      if (acceptedItems.length) {
        const annotationsResource = this._getAnnotationsBackend().getAnnotationsChannelResource(sessionResource);
        widget.attachmentModel.delete(attachmentId);
        widget.attachmentModel.addContext(createAgentFeedbackVariableEntry(sessionResource, acceptedItems, annotationsResource));
      }
      return this._sendActOnFeedbackRequest(widget, sessionResource, () => widget.attachmentModel.delete(attachmentId));
    }
    return this._sendActOnFeedbackRequest(widget, sessionResource);
  }
  /**
   * Sends the `/act-on-feedback` request and marks the accepted feedback as
   * submitted as soon as the request has been accepted by the chat widget.
   * The request is queued when the agent is still working on another request,
   * in which case awaiting {@link IChatWidget.acceptInput} would only resolve
   * once that queued request eventually runs — the feedback items must move to
   * the submitted state right away.
   */
  _sendActOnFeedbackRequest(widget, sessionResource, cleanup) {
    const submitted = new DeferredPromise();
    const cleanupOnce = cleanup && createSingleCallFunction(cleanup);
    widget.acceptInput("/act-on-feedback", {
      onRequestAccepted: () => {
        cleanupOnce?.();
        this.markFeedbackSubmitted(sessionResource);
        submitted.complete(true);
      }
    }).then(() => {
      cleanupOnce?.();
      submitted.complete(false);
    }, (err) => {
      this._logService.error("[AgentFeedback] Failed to submit feedback", err);
      cleanupOnce?.();
      submitted.complete(false);
    });
    return submitted.p;
  }
  markFeedbackSubmitted(sessionResource) {
    const backend = this._backendForSession(sessionResource);
    const feedbackItems = backend.getItems(sessionResource);
    const submittedState = this._isAgentHostSession(sessionResource) ? AgentFeedbackState.Submitted : AgentFeedbackState.Resolved;
    let userCount = 0;
    let codeReviewCount = 0;
    let prReviewCount = 0;
    let replyCount = 0;
    const submitted = [];
    for (const item of feedbackItems) {
      if (item.state !== AgentFeedbackState.Accepted) {
        continue;
      }
      switch (item.kind) {
        case AgentFeedbackKind.UserReview:
          userCount++;
          break;
        case AgentFeedbackKind.AgentReview:
          codeReviewCount++;
          break;
        case AgentFeedbackKind.PRReview:
          prReviewCount++;
          break;
      }
      replyCount += item.replies?.length ?? 0;
      submitted.push({ ...item, state: submittedState });
    }
    if (!submitted.length) {
      return;
    }
    for (const item of submitted) {
      backend.upsert(item);
    }
    this._onDidSubmitFeedback.fire({
      sessionResource,
      totalCount: userCount + codeReviewCount + prReviewCount,
      userCount,
      codeReviewCount,
      prReviewCount,
      replyCount
    });
  }
};
AgentFeedbackService = __decorateClass([
  __decorateParam(0, IChatEditingService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IInstantiationService)
], AgentFeedbackService);
export {
  AGENT_FEEDBACK_NEW_SESSION_RESOURCE,
  AgentFeedbackKind,
  AgentFeedbackService,
  AgentFeedbackState,
  IAgentFeedbackService,
  whenWidgetForSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcYnJvd3NlclxcYWdlbnRGZWVkYmFja1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgSU9ic2VydmFibGUsIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlZGl0aW5nRW50cmllc0NvbnRhaW5SZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9zZXNzaW9uUmVzb3VyY2VNYXRjaGluZy5qcyc7XG5pbXBvcnQgeyBjaGFuZ2VNYXRjaGVzUmVzb3VyY2UsIGdldEFjdGl2ZVJlc291cmNlQ2FuZGlkYXRlcywgSUFnZW50RmVlZGJhY2tDb250ZXh0IH0gZnJvbSAnLi9hZ2VudEZlZWRiYWNrRWRpdG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb2RlUmV2aWV3U3VnZ2VzdGlvbiB9IGZyb20gJy4uLy4uL2NvZGVSZXZpZXcvYnJvd3Nlci9jb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgSVNlc3Npb25GaWxlQ2hhbmdlLCBJU2Vzc2lvbldvcmtzcGFjZSwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0UHJvdmlkZXJJZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFubm90YXRpb25zQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCwgSUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQsIEluTWVtb3J5QWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCB9IGZyb20gJy4vYWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZC5qcyc7XG5pbXBvcnQgeyBBVFRBQ0hNRU5UX0lEX1BSRUZJWCwgY3JlYXRlQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnkgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tBdHRhY2htZW50RW50cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRGZWVkYmFja0tpbmQsIEFnZW50RmVlZGJhY2tTdGF0ZSwgdHlwZSBJQWdlbnRGZWVkYmFjayB9IGZyb20gJy4vYWdlbnRGZWVkYmFja01vZGVsLmpzJztcbmltcG9ydCB7IFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLCB0b1Nlc3Npb25FZGl0b3JDb21tZW50SWQgfSBmcm9tICcuL3Nlc3Npb25FZGl0b3JDb21tZW50cy5qcyc7XG5cbi8vIC0tLSBUeXBlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vLyBUaGUgY29yZSBmZWVkYmFjayBtb2RlbCAoYElBZ2VudEZlZWRiYWNrYCBhbmQgdGhlIGBBZ2VudEZlZWRiYWNrS2luZGAgL1xuLy8gYEFnZW50RmVlZGJhY2tTdGF0ZWAgZW51bXMpIGxpdmVzIGluIGBhZ2VudEZlZWRiYWNrTW9kZWwudHNgIHNvIHRoZSBzdG9yYWdlXG4vLyBiYWNrZW5kcyBjYW4gZGVwZW5kIG9uIGl0IHdpdGhvdXQgYSBkZXBlbmRlbmN5IGN5Y2xlIGJhY2sgdGhyb3VnaCB0aGlzXG4vLyBzZXJ2aWNlLiBSZS1leHBvcnRlZCBoZXJlIGZvciBjb25zdW1lcnMgdGhhdCBpbXBvcnQgdGhlc2UgdHlwZXMgZnJvbSB0aGVcbi8vIHNlcnZpY2UuXG5leHBvcnQgeyBBZ2VudEZlZWRiYWNrS2luZCwgQWdlbnRGZWVkYmFja1N0YXRlLCB0eXBlIElBZ2VudEZlZWRiYWNrIH07XG5cbi8qKiBTaGFyZWQgZmVlZGJhY2sgc2NvcGUgZm9yIGV2ZXJ5IHVuZGVmaW5lZCBvciB1bmNyZWF0ZWQgYWN0aXZlIHNlc3Npb24uICovXG5leHBvcnQgY29uc3QgQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWZlZWRiYWNrJywgcGF0aDogJy9uZXctc2Vzc2lvbicgfSk7XG5cbi8qKlxuICogSG93IGxvbmcgc3VibWl0dGluZyBmZWVkYmFjayB3YWl0cyBmb3IgdGhlIHNlc3Npb24ncyBjaGF0IG1vZGVsIHRvIGJlIGxvYWRlZCBpbnRvIGEgY2hhdCB3aWRnZXRcbiAqIGJlZm9yZSBnaXZpbmcgdXAuXG4gKi9cbmNvbnN0IFdJREdFVF9MT0FEX1RJTUVPVVRfTVMgPSAxMF8wMDA7XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIGNoYXQgd2lkZ2V0IHRoYXQgaGFzIHRoZSBzZXNzaW9uIGxvYWRlZCwgd2FpdGluZyBmb3IgaXQgdG8gYXBwZWFyIHdoZW4gdGhlIHNlc3Npb24nc1xuICogbW9kZWwgaGFzIG5vdCBiZWVuIGxvYWRlZCBpbnRvIGEgd2lkZ2V0IHlldC5cbiAqXG4gKiBGZWVkYmFjayBjYW4gYmUgc3VibWl0dGVkIChlLmcuIGZyb20gdGhlIENoYW5nZXMgZWRpdG9yIG9yIHRoZSBjb21tZW50cyBpbnB1dCBiYW5uZXIpIHdoaWxlIHRoZVxuICogc2Vzc2lvbiBpcyBzdGlsbCBiZWluZyByZXN0b3JlZCBpbnRvIGl0cyBjaGF0IHdpZGdldC4gYGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlYCBtYXRjaGVzIG9uIHRoZVxuICogd2lkZ2V0J3MgKmxvYWRlZCogdmlldyBtb2RlbCwgc28gaXQgcmV0dXJucyBgdW5kZWZpbmVkYCB1bnRpbCB0aGUgbW9kZWwgYXJyaXZlcyBcdTIwMTQgc3VibWl0dGluZyB0aGVuXG4gKiB3b3VsZCBzaWxlbnRseSBkcm9wIHRoZSBmZWVkYmFjay4gUmVzb2x2ZXMgYHVuZGVmaW5lZGAgaWYgbm8gd2lkZ2V0IGxvYWRzIHRoZSBzZXNzaW9uIGluIHRpbWUuXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2hlbldpZGdldEZvclNlc3Npb24oY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIHRpbWVvdXRNczogbnVtYmVyID0gV0lER0VUX0xPQURfVElNRU9VVF9NUyk6IFByb21pc2U8SUNoYXRXaWRnZXQgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgZXhpc3RpbmcgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRpZiAoZXhpc3RpbmcpIHtcblx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdH1cblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0dHJ5IHtcblx0XHRjb25zdCBsb2FkZWQgPSBuZXcgUHJvbWlzZTxJQ2hhdFdpZGdldD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBjaGVjayA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0XHRcdHJlc29sdmUod2lkZ2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgb2JzZXJ2ZSA9IChjYW5kaWRhdGU6IElDaGF0V2lkZ2V0KSA9PiBzdG9yZS5hZGQoY2FuZGlkYXRlLm9uRGlkQ2hhbmdlVmlld01vZGVsKGNoZWNrKSk7XG5cblx0XHRcdGNoYXRXaWRnZXRTZXJ2aWNlLmdldEFsbFdpZGdldHMoKS5mb3JFYWNoKG9ic2VydmUpO1xuXHRcdFx0c3RvcmUuYWRkKGNoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQWRkV2lkZ2V0KGFkZGVkID0+IHtcblx0XHRcdFx0b2JzZXJ2ZShhZGRlZCk7XG5cdFx0XHRcdGNoZWNrKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEEgd2lkZ2V0IG1heSBoYXZlIGxvYWRlZCB0aGUgc2Vzc2lvbiB3aGlsZSB0aGUgbGlzdGVuZXJzIHdlcmUgYmVpbmcgd2lyZWQgdXAuXG5cdFx0XHRjaGVjaygpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGF3YWl0IHJhY2VUaW1lb3V0KGxvYWRlZCwgdGltZW91dE1zKTtcblx0fSBmaW5hbGx5IHtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTmF2aWdhYmxlU2Vzc2lvbkNvbW1lbnQge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG4vKiogT3B0aW9ucyBmb3Ige0BsaW5rIElBZ2VudEZlZWRiYWNrU2VydmljZS5hY2NlcHRGZWVkYmFja30uICovXG5leHBvcnQgaW50ZXJmYWNlIElBY2NlcHRGZWVkYmFja09wdGlvbnMge1xuXHQvKipcblx0ICogRmxhZyB0aGUgYWNjZXB0ZWQgaXRlbSBhcyBwZW5kaW5nIHJldmVhbCB0byB0aGUgYWdlbnQgc28gdGhlXG5cdCAqIGB2aWV3VW5yZXZpZXdlZENvbW1lbnRzYCBzZXJ2ZXIgdG9vbCByZXR1cm5zIGl0IChhbmQgb25seSB0aGUgaXRlbXNcblx0ICogcmV2ZWFsZWQgaW4gdGhlIHNhbWUgaW52b2NhdGlvbikuXG5cdCAqL1xuXHRyZWFkb25seSByZXZlYWxUb0FnZW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRGZWVkYmFja0NoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGZlZWRiYWNrSXRlbXM6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tOYXZpZ2F0aW9uQmVhcmluZyB7XG5cdHJlYWRvbmx5IGFjdGl2ZUlkeDogbnVtYmVyO1xuXHRyZWFkb25seSB0b3RhbENvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tDb21tZW50UmV2ZWFsRXZlbnQge1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgY29tbWVudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc291cmNlVXJpOiBVUkk7XG59XG5cbi8qKiBGaXJlZCB3aGVuIGEgYnJhbmQtbmV3IGFnZW50IGZlZWRiYWNrIGl0ZW0gaXMgYWRkZWQgYnkgdGhlIHVzZXIuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEZlZWRiYWNrQWRkZWRFdmVudCB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBmZWVkYmFjazogSUFnZW50RmVlZGJhY2s7XG5cdHJlYWRvbmx5IGhhc0V4aXN0aW5nRmVlZGJhY2tGb3JGaWxlOiBib29sZWFuO1xufVxuXG4vKiogRmlyZWQgd2hlbiBhbiBleGlzdGluZyBQUi9jb2RlLXJldmlldyBjb21tZW50IGlzIGNvbnZlcnRlZCBpbnRvIGFnZW50IGZlZWRiYWNrLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRGZWVkYmFja0NvbnZlcnRlZEV2ZW50IHtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGZlZWRiYWNrOiBJQWdlbnRGZWVkYmFjaztcblx0cmVhZG9ubHkga2luZDogQWdlbnRGZWVkYmFja0tpbmQuQWdlbnRSZXZpZXcgfCBBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldztcblx0cmVhZG9ubHkgaGFzRXhpc3RpbmdGZWVkYmFja0ZvckZpbGU6IGJvb2xlYW47XG59XG5cbi8qKiBGaXJlZCB3aGVuIGEgcmVwbHkgaXMgYXBwZW5kZWQgdG8gYW4gZXhpc3RpbmcgZmVlZGJhY2sgdGhyZWFkLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRGZWVkYmFja1JlcGx5QWRkZWRFdmVudCB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBmZWVkYmFjazogSUFnZW50RmVlZGJhY2s7XG5cdHJlYWRvbmx5IHJlcGx5Q291bnQ6IG51bWJlcjtcbn1cblxuLyoqIEZpcmVkIHdoZW4gZmVlZGJhY2sgaXRlbXMgYXJlIHN1Ym1pdHRlZCB0byB0aGUgYWdlbnQgZm9yIGFjdGlvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tTdWJtaXR0ZWRFdmVudCB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB0b3RhbENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHVzZXJDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBjb2RlUmV2aWV3Q291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcHJSZXZpZXdDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSByZXBseUNvdW50OiBudW1iZXI7XG59XG5cbi8vIC0tLSBTZXJ2aWNlIEludGVyZmFjZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgSUFnZW50RmVlZGJhY2tTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudEZlZWRiYWNrU2VydmljZT4oJ2FnZW50RmVlZGJhY2tTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2s6IEV2ZW50PElBZ2VudEZlZWRiYWNrQ2hhbmdlRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5hdmlnYXRpb246IEV2ZW50PFVSST47XG5cdHJlYWRvbmx5IG9uRGlkUmV2ZWFsU2Vzc2lvbkNvbW1lbnQ6IEV2ZW50PElBZ2VudEZlZWRiYWNrQ29tbWVudFJldmVhbEV2ZW50Pjtcblx0LyoqIEZpcmVkIHdoZW4ge0BsaW5rIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlfSBtYXkgcmVzb2x2ZSBkaWZmZXJlbnRseS4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogVGhlIGZlZWRiYWNrIHNjb3BlIG9mIHRoZSBhY3RpdmUgc2Vzc2lvbiB2aWV3OiB0aGUgYWN0aXZlIHNlc3Npb24gaXRzZWxmLFxuXHQgKiBvciB7QGxpbmsgQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0V9IHdoaWxlIGl0IGlzIHVuZGVmaW5lZCBvclxuXHQgKiB1bmNyZWF0ZWQuIFVubGlrZSB7QGxpbmsgZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2V9IHRoaXMgaXMgbm90XG5cdCAqIGZpbGUtc2NvcGVkLCBzbyBpdCBhbHdheXMgcmVzb2x2ZXMgdG8gYSBzY29wZS5cblx0ICovXG5cdHJlYWRvbmx5IGFjdGl2ZUZlZWRiYWNrU2Vzc2lvblJlc291cmNlOiBJT2JzZXJ2YWJsZTxVUkk+O1xuXG5cdC8qKiBGaXJlZCB3aGVuIGEgbmV3IHVzZXItYXV0aG9yZWQgZmVlZGJhY2sgaXRlbSBpcyBhZGRlZC4gKi9cblx0cmVhZG9ubHkgb25EaWRBZGRGZWVkYmFjazogRXZlbnQ8SUFnZW50RmVlZGJhY2tBZGRlZEV2ZW50Pjtcblx0LyoqIEZpcmVkIHdoZW4gYW4gZXh0ZXJuYWwgcmV2aWV3IGNvbW1lbnQgaXMgY29udmVydGVkIGludG8gYWdlbnQgZmVlZGJhY2suICovXG5cdHJlYWRvbmx5IG9uRGlkQ29udmVydEZlZWRiYWNrOiBFdmVudDxJQWdlbnRGZWVkYmFja0NvbnZlcnRlZEV2ZW50Pjtcblx0LyoqIEZpcmVkIHdoZW4gYSByZXBseSBpcyBhcHBlbmRlZCB0byBhbiBleGlzdGluZyBmZWVkYmFjayB0aHJlYWQuICovXG5cdHJlYWRvbmx5IG9uRGlkQWRkUmVwbHk6IEV2ZW50PElBZ2VudEZlZWRiYWNrUmVwbHlBZGRlZEV2ZW50Pjtcblx0LyoqIEZpcmVkIHdoZW4gZmVlZGJhY2sgaXRlbXMgYXJlIHN1Ym1pdHRlZCB0byB0aGUgYWdlbnQuICovXG5cdHJlYWRvbmx5IG9uRGlkU3VibWl0RmVlZGJhY2s6IEV2ZW50PElBZ2VudEZlZWRiYWNrU3VibWl0dGVkRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBBZGQgYSBmZWVkYmFjayBpdGVtIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbi4ge0BsaW5rIGtpbmR9IChkZWZhdWx0cyB0b1xuXHQgKiB7QGxpbmsgQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlld30pIGNsYXNzaWZpZXMgdGhlIG9yaWdpbiBvZiB0aGVcblx0ICogZmVlZGJhY2suIHtAbGluayBzdGF0ZX0gKGRlZmF1bHRzXG5cdCAqIHRvIHtAbGluayBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWR9KSBzZXRzIHRoZSBpbml0aWFsIGxpZmVjeWNsZSBzdGF0ZVxuXHQgKiBhbmQgc2VsZWN0cyB3aGljaCBsaWZlY3ljbGUgZXZlbnQgaXMgZmlyZWQuXG5cdCAqL1xuXHRhZGRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVzb3VyY2VVcmk6IFVSSSwgcmFuZ2U6IElSYW5nZSwgdGV4dDogc3RyaW5nLCBzdWdnZXN0aW9uPzogSUNvZGVSZXZpZXdTdWdnZXN0aW9uLCBjb250ZXh0PzogSUFnZW50RmVlZGJhY2tDb250ZXh0LCBzb3VyY2VQUlJldmlld0NvbW1lbnRJZD86IHN0cmluZywga2luZD86IEFnZW50RmVlZGJhY2tLaW5kLCBzdGF0ZT86IEFnZW50RmVlZGJhY2tTdGF0ZSk6IElBZ2VudEZlZWRiYWNrO1xuXG5cdC8qKlxuXHQgKiBBY2NlcHQgYSBmZWVkYmFjayBpdGVtIHRoYXQgaXMgY3VycmVudGx5IGluIHRoZVxuXHQgKiB7QGxpbmsgQWdlbnRGZWVkYmFja1N0YXRlLkNyZWF0ZWR9IHN0YXRlLCB0cmFuc2l0aW9uaW5nIGl0IHRvXG5cdCAqIHtAbGluayBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWR9IHNvIGl0IGJlY29tZXMgc3VibWl0dGFibGUgYW5kIGlzXG5cdCAqIGF0dGFjaGVkIHRvIHRoZSBjaGF0IGlucHV0LlxuXHQgKlxuXHQgKiBXaGVuIHtAbGluayBJQWNjZXB0RmVlZGJhY2tPcHRpb25zLnJldmVhbFRvQWdlbnR9IGlzIHNldCwgdGhlIGl0ZW0gaXNcblx0ICogYWRkaXRpb25hbGx5IGZsYWdnZWQgYXMgcGVuZGluZyByZXZlYWwgdG8gdGhlIGFnZW50IHNvIHRoZVxuXHQgKiBgdmlld1VucmV2aWV3ZWRDb21tZW50c2Agc2VydmVyIHRvb2wgcmV0dXJucyBleGFjdGx5IHRoZSBjb21tZW50cyB0aGUgdXNlclxuXHQgKiBjaG9zZSB0byByZXZlYWwgZm9yIHRoYXQgaW52b2NhdGlvbi5cblx0ICovXG5cdGFjY2VwdEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJLCBmZWVkYmFja0lkOiBzdHJpbmcsIG9wdGlvbnM/OiBJQWNjZXB0RmVlZGJhY2tPcHRpb25zKTogdm9pZDtcblxuXHQvKipcblx0ICogUmVtb3ZlIGEgc2luZ2xlIGZlZWRiYWNrIGl0ZW0uXG5cdCAqL1xuXHRyZW1vdmVGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSB0ZXh0IG9mIGFuIGV4aXN0aW5nIGZlZWRiYWNrIGl0ZW0uXG5cdCAqL1xuXHR1cGRhdGVGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nLCBuZXdUZXh0OiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBNYXJrIGFuIGV4aXN0aW5nIGZlZWRiYWNrIGl0ZW0gYXMgcmVzb2x2ZWQuIFJlc29sdmluZyBtb3ZlcyB0aGUgaXRlbSB0b1xuXHQgKiB7QGxpbmsgQWdlbnRGZWVkYmFja1N0YXRlLlJlc29sdmVkfTsgdW4tcmVzb2x2aW5nIHJldHVybnMgaXQgdG9cblx0ICoge0BsaW5rIEFnZW50RmVlZGJhY2tTdGF0ZS5TdWJtaXR0ZWR9LlxuXHQgKi9cblx0c2V0RmVlZGJhY2tSZXNvbHZlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nLCByZXNvbHZlZDogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEFwcGVuZCBhIHJlcGx5IHRvIGFuIGV4aXN0aW5nIGZlZWRiYWNrIGl0ZW0sIG1ha2luZyBpdCBwYXJ0IG9mIHRoZSBzYW1lXG5cdCAqIGNvbW1lbnQgdGhyZWFkLlxuXHQgKi9cblx0YWRkUmVwbHkoc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZywgcmVwbHlUZXh0OiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBHZXQgYWxsIGZlZWRiYWNrIGl0ZW1zIGZvciBhIHNlc3Npb24uXG5cdCAqL1xuXHRnZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW107XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIge0BsaW5rIGdldEZlZWRiYWNrfSByZWZsZWN0cyB0aGUgYXV0aG9yaXRhdGl2ZSBpdGVtIHNldCBmb3IgdGhlXG5cdCAqIHNlc3Npb24uIEZvciBhZ2VudC1ob3N0IHNlc3Npb25zIHRoaXMgaXMgYGZhbHNlYCB1bnRpbCB0aGUgc2Vzc2lvbidzXG5cdCAqIGFubm90YXRpb25zIHNuYXBzaG90IGhhcyBiZWVuIHJlY2VpdmVkOyBmb3Igb3RoZXIgc2Vzc2lvbnMgaXQgaXMgYWx3YXlzXG5cdCAqIGB0cnVlYC4gQ2FsbGVycyB0aGF0IHNlZWQgZmVlZGJhY2sgZnJvbSBhbm90aGVyIHNvdXJjZSBtdXN0IHdhaXQgZm9yIHRoaXNcblx0ICogdG8gYXZvaWQgYWN0aW5nIG9uIGEgdHJhbnNpZW50bHktZW1wdHkgbGlzdC5cblx0ICovXG5cdGhhc0xvYWRlZEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgc2Vzc2lvbiB0aGF0IG93bnMgdGhlIGdpdmVuIGZpbGUgcmVzb3VyY2UuIFJldHVybnMgdGhlXG5cdCAqIHNlc3Npb24gdGhhdCB3YXMgYWN0aXZlIHdoZW4gdGhlIGZpbGUncyBlZGl0b3Igd2FzIGZpcnN0IG9wZW5lZDsgaWYgdGhlXG5cdCAqIGZpbGUgaGFzIG5ldmVyIGJlZW4gdHJhY2tlZCwgZmFsbHMgYmFjayB0byB0aGUgY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uLlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIGZpbGUgaXMgbm90IGluIHNjb3BlIGZvciB0aGUgc2Vzc2lvbiAoZS5nLlxuXHQgKiB0aGUgT3V0cHV0IHZpZXcgb3IgZmlsZXMgb3V0c2lkZSB0aGUgc2Vzc2lvbidzIHdvcmtzcGFjZSBmb2xkZXJzKS5cblx0ICovXG5cdGdldFNlc3Npb25Gb3JGaWxlKHJlc291cmNlVXJpOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgZmVlZGJhY2sgc2NvcGUgc2hvd24gZm9yIGEgZmlsZSBpbiB0aGUgY3VycmVudCBzZXNzaW9uIHZpZXcsIG9yXG5cdCAqIGB1bmRlZmluZWRgIHdoZW4gdGhlIGZpbGUgaXMgb3V0IG9mIHNjb3BlLlxuXHQgKi9cblx0Z2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UocmVzb3VyY2VVcmk6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cmVnaXN0ZXJGZWVkYmFja1Jlc291cmNlU2NvcGUocmVzb3VyY2VVcmk6IFVSSSwgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJRGlzcG9zYWJsZTtcblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgbW9zdCByZWNlbnRseSB1cGRhdGVkIHNlc3Npb24gdGhhdCBoYXMgZmVlZGJhY2sgZm9yIGEgZ2l2ZW4gcmVzb3VyY2UuXG5cdCAqL1xuXHRnZXRNb3N0UmVjZW50U2Vzc2lvbkZvclJlc291cmNlKHJlc291cmNlVXJpOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgbmF2aWdhdGlvbiBhbmNob3IgdG8gYSBzcGVjaWZpYyBmZWVkYmFjayBpdGVtLCBvcGVuIGl0cyBlZGl0b3IsIGFuZCBmaXJlIGEgbmF2aWdhdGlvbiBldmVudC5cblx0ICovXG5cdHJldmVhbEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJLCBmZWVkYmFja0lkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBPcGVuIGFuIGVkaXRvciBmb3IgdGhlIGdpdmVuIHNlc3Npb24gY29tbWVudCAoZmVlZGJhY2sgb3IgY29kZS1yZXZpZXcpIGF0IGl0cyByYW5nZVxuXHQgKiBhbmQgc2V0IGl0IGFzIHRoZSBuYXZpZ2F0aW9uIGFuY2hvci5cblx0ICovXG5cdHJldmVhbFNlc3Npb25Db21tZW50KHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb21tZW50SWQ6IHN0cmluZywgcmVzb3VyY2VVcmk6IFVSSSwgcmFuZ2U6IElSYW5nZSk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlIHRvIG5leHQvcHJldmlvdXMgZmVlZGJhY2sgaXRlbSBpbiBhIHNlc3Npb24uXG5cdCAqL1xuXHRnZXROZXh0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIG5leHQ6IGJvb2xlYW4pOiBJQWdlbnRGZWVkYmFjayB8IHVuZGVmaW5lZDtcblx0Z2V0TmV4dE5hdmlnYWJsZUl0ZW08VCBleHRlbmRzIElOYXZpZ2FibGVTZXNzaW9uQ29tbWVudD4oc2Vzc2lvblJlc291cmNlOiBVUkksIGl0ZW1zOiByZWFkb25seSBUW10sIG5leHQ6IGJvb2xlYW4pOiBUIHwgdW5kZWZpbmVkO1xuXHRzZXROYXZpZ2F0aW9uQW5jaG9yKHNlc3Npb25SZXNvdXJjZTogVVJJLCBpdGVtSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgY3VycmVudCBuYXZpZ2F0aW9uIGJlYXJpbmdzIGZvciBhIHNlc3Npb24uXG5cdCAqL1xuXHRnZXROYXZpZ2F0aW9uQmVhcmluZyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaXRlbXM/OiByZWFkb25seSBJTmF2aWdhYmxlU2Vzc2lvbkNvbW1lbnRbXSk6IElBZ2VudEZlZWRiYWNrTmF2aWdhdGlvbkJlYXJpbmc7XG5cblx0LyoqXG5cdCAqIENsZWFyIGFsbCBmZWVkYmFjayBpdGVtcyBmb3IgYSBzZXNzaW9uIChlLmcuLCBhZnRlciBzZW5kaW5nKS5cblx0ICovXG5cdGNsZWFyRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBNYXJrIGFsbCBhY2NlcHRlZCBmZWVkYmFjayBpdGVtcyBmb3IgdGhlIHNlc3Npb24gYXMgc3VibWl0dGVkLCBmaXJpbmdcblx0ICoge0BsaW5rIG9uRGlkU3VibWl0RmVlZGJhY2t9IHdpdGggdGhlIHBlci1raW5kIGNvdW50cyBvZiB0aGUgaXRlbXMgdGhhdFxuXHQgKiB3ZXJlIHN1Ym1pdHRlZC4gQWdlbnQtaG9zdCBzZXNzaW9ucyBtb3ZlIHRoZSBpdGVtcyB0b1xuXHQgKiB7QGxpbmsgQWdlbnRGZWVkYmFja1N0YXRlLlN1Ym1pdHRlZH0gc28gdGhleSBzdGF5IHZpc2libGUgdW50aWwgdGhlIGFnZW50XG5cdCAqIHJlc29sdmVzIHRoZW07IG90aGVyIHByb3ZpZGVycyBoYXZlIG5vIHN1Y2ggYWdlbnQgbG9vcCwgc28gdGhlIGl0ZW1zIG1vdmVcblx0ICogc3RyYWlnaHQgdG8ge0BsaW5rIEFnZW50RmVlZGJhY2tTdGF0ZS5SZXNvbHZlZH0uIE5vLW9wIHdoZW4gdGhlcmUgYXJlIG5vXG5cdCAqIGFjY2VwdGVkIGl0ZW1zLlxuXHQgKi9cblx0bWFya0ZlZWRiYWNrU3VibWl0dGVkKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZDtcblxuXHQvKipcblx0ICogU3VibWl0IHRoZSBjdXJyZW50bHkgYWNjdW11bGF0ZWQgYWNjZXB0ZWQgZmVlZGJhY2sgZm9yIHRoZSBzZXNzaW9uIHRvIHRoZVxuXHQgKiBhZ2VudCBhbmQgbWFyayB0aG9zZSBpdGVtcyBhcyBzdWJtaXR0ZWQuIFdhaXRzIGZvciB0aGUgc2Vzc2lvbidzIGNoYXQgbW9kZWwgdG8gYmUgbG9hZGVkXG5cdCAqIGludG8gYSBjaGF0IHdpZGdldCwgdGhlbiByZXNvbHZlcyBvbmNlIHRoZSByZXF1ZXN0IGhhcyBiZWVuIGFjY2VwdGVkIGJ5IHRoYXQgd2lkZ2V0IFx1MjAxNCB3aGljaCxcblx0ICogd2hpbGUgYW5vdGhlciByZXF1ZXN0IGlzIGluIHByb2dyZXNzLCBtZWFucyBpdCB3YXMgcXVldWVkIHJhdGhlciB0aGFuIHNlbnQuIFJldHVybnMgd2hldGhlclxuXHQgKiB0aGUgZmVlZGJhY2sgd2FzIHN1Ym1pdHRlZC5cblx0ICovXG5cdHN1Ym1pdEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPjtcblxuXHQvKipcblx0ICogQWRkIGEgZmVlZGJhY2sgaXRlbSBhbmQgdGhlbiBzdWJtaXQgdGhlIGZlZWRiYWNrLiBXYWl0cyBmb3IgdGhlXG5cdCAqIGF0dGFjaG1lbnQgdG8gYmUgdXBkYXRlZCBpbiB0aGUgY2hhdCB3aWRnZXQgYmVmb3JlIHN1Ym1pdHRpbmcuXG5cdCAqL1xuXHRhZGRGZWVkYmFja0FuZFN1Ym1pdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVzb3VyY2VVcmk6IFVSSSwgcmFuZ2U6IElSYW5nZSwgdGV4dDogc3RyaW5nLCBzdWdnZXN0aW9uPzogSUNvZGVSZXZpZXdTdWdnZXN0aW9uLCBjb250ZXh0PzogSUFnZW50RmVlZGJhY2tDb250ZXh0LCBzb3VyY2VQUlJldmlld0NvbW1lbnRJZD86IHN0cmluZywga2luZD86IEFnZW50RmVlZGJhY2tLaW5kKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuLy8gLS0tIEltcGxlbWVudGF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKiBTdGFibGUgaWRlbnRpdHkgb2YgYSBzZXNzaW9uJ3Mgd29ya3NwYWNlLCBvciBgdW5kZWZpbmVkYCB3aGVuIGl0IGhhcyBub25lICh5ZXQpLiAqL1xuZnVuY3Rpb24gd29ya3NwYWNlRm9sZGVyc0tleSh3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHdvcmtzcGFjZT8uZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci5yb290LnRvU3RyaW5nKCkpLmpvaW4oJywnKTtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50RmVlZGJhY2tTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEZlZWRiYWNrU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGZWVkYmFjayA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxJQWdlbnRGZWVkYmFja0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFjayA9IHRoaXMuX29uRGlkQ2hhbmdlRmVlZGJhY2suZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTmF2aWdhdGlvbiA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU5hdmlnYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZU5hdmlnYXRpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmV2ZWFsU2Vzc2lvbkNvbW1lbnQgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUFnZW50RmVlZGJhY2tDb21tZW50UmV2ZWFsRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJldmVhbFNlc3Npb25Db21tZW50ID0gdGhpcy5fb25EaWRSZXZlYWxTZXNzaW9uQ29tbWVudC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrU2NvcGUgPSB0aGlzLl9vbkRpZENoYW5nZUZlZWRiYWNrU2NvcGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkRmVlZGJhY2sgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUFnZW50RmVlZGJhY2tBZGRlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBZGRGZWVkYmFjayA9IHRoaXMuX29uRGlkQWRkRmVlZGJhY2suZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29udmVydEZlZWRiYWNrID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBZ2VudEZlZWRiYWNrQ29udmVydGVkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENvbnZlcnRGZWVkYmFjayA9IHRoaXMuX29uRGlkQ29udmVydEZlZWRiYWNrLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZFJlcGx5ID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBZ2VudEZlZWRiYWNrUmVwbHlBZGRlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBZGRSZXBseSA9IHRoaXMuX29uRGlkQWRkUmVwbHkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3VibWl0RmVlZGJhY2sgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUFnZW50RmVlZGJhY2tTdWJtaXR0ZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3VibWl0RmVlZGJhY2sgPSB0aGlzLl9vbkRpZFN1Ym1pdEZlZWRiYWNrLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGFjdGl2ZUZlZWRiYWNrU2Vzc2lvblJlc291cmNlOiBJT2JzZXJ2YWJsZTxVUkk+O1xuXG5cdC8qKiBzZXNzaW9uUmVzb3VyY2UgXHUyMTkyIHJlY2VuY3kgc2VxdWVuY2UgKHNldCBvbiBldmVyeSBmZWVkYmFjayBjaGFuZ2UpICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25VcGRhdGVkT3JkZXIgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIF9zZXNzaW9uVXBkYXRlZFNlcXVlbmNlID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfbmF2aWdhdGlvbkFuY2hvckJ5U2Vzc2lvbiA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0LyoqIGZpbGVSZXNvdXJjZSBcdTIxOTIgc2Vzc2lvblJlc291cmNlIGFjdGl2ZSB3aGVuIHRoZSBlZGl0b3IgZm9yIHRoYXQgZmlsZSB3YXMgZmlyc3Qgc2VlbiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlVG9TZXNzaW9uID0gbmV3IFJlc291cmNlTWFwPFVSST4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXhwbGljaXRSZXNvdXJjZVNjb3BlcyA9IG5ldyBSZXNvdXJjZU1hcDxVUkk+KCk7XG5cblx0LyoqIFdvcmtzcGFjZSB0aGUgc2hhcmVkIG5ldy1zZXNzaW9uIGNvbW1lbnRzIGFyZSBib3VuZCB0bzsgYHVuZGVmaW5lZGAgd2hlbiB0aGVyZSBhcmUgbm9uZS4gKi9cblx0cHJpdmF0ZSBfYm91bmROZXdTZXNzaW9uV29ya3NwYWNlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFdvcmtzcGFjZSBvZiB0aGUgZHJhZnQgdGhlIG5ldy1zZXNzaW9uIHNjb3BlIGN1cnJlbnRseSB0YXJnZXRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uZXdTZXNzaW9uV29ya3NwYWNlS2V5OiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBJbi1tZW1vcnkgc3RvcmUgdXNlZCBmb3IgZXZlcnkgbm9uLWFnZW50LWhvc3QgcHJvdmlkZXIuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luTWVtb3J5QmFja2VuZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbk1lbW9yeUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQoKSk7XG5cdC8qKiBBbm5vdGF0aW9ucy1jaGFubmVsLWJhY2tlZCBzdG9yZSBmb3IgYWdlbnQtaG9zdCBzZXNzaW9uczsgY3JlYXRlZCBsYXppbHkuICovXG5cdHByaXZhdGUgX2Fubm90YXRpb25zQmFja2VuZDogQW5ub3RhdGlvbnNBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdEVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luTWVtb3J5QmFja2VuZC5vbkRpZENoYW5nZUl0ZW1zKHJlc291cmNlID0+IHRoaXMuX2hhbmRsZUJhY2tlbmRDaGFuZ2UocmVzb3VyY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKCgpID0+IHRoaXMuX3RyYWNrVmlzaWJsZUVkaXRvclJlc291cmNlcygpKSk7XG5cdFx0dGhpcy5fdHJhY2tWaXNpYmxlRWRpdG9yUmVzb3VyY2VzKCk7XG5cblx0XHR0aGlzLmFjdGl2ZUZlZWRiYWNrU2Vzc2lvblJlc291cmNlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiAhYWN0aXZlU2Vzc2lvbiB8fCAhYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQucmVhZChyZWFkZXIpXG5cdFx0XHRcdD8gQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0Vcblx0XHRcdFx0OiBhY3RpdmVTZXNzaW9uLnJlc291cmNlO1xuXHRcdH0pO1xuXG5cdFx0Ly8gRGVsaWJlcmF0ZWx5IGtleWVkIG9uIHRoZSBzY29wZSBhbmQgaXRzIHdvcmtzcGFjZSBmb2xkZXJzIG9ubHk6IHRoZVxuXHRcdC8vIHNlc3Npb24ncyBjaGFuZ2VzIGFsc28gZmVlZCBgZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2VgLCBidXQgdGhleSBjaHVyblxuXHRcdC8vIGNvbnN0YW50bHkgd2hpbGUgYW4gYWdlbnQgZWRpdHMgYW5kIHJlLWJyb2FkY2FzdGluZyB0aGF0IHdvdWxkIHJlYnVpbGRcblx0XHQvLyBldmVyeSBjb21tZW50IHdpZGdldCBvbiBlYWNoIHRpY2suXG5cdFx0Y29uc3QgZmVlZGJhY2tTY29wZUtleSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNjb3BlID0gdGhpcy5hY3RpdmVGZWVkYmFja1Nlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKT8ud29ya3NwYWNlLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBgJHtzY29wZX18JHt3b3Jrc3BhY2VGb2xkZXJzS2V5KHdvcmtzcGFjZSkgPz8gJyd9YDtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZShmZWVkYmFja1Njb3BlS2V5LCAoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUZlZWRiYWNrU2NvcGUuZmlyZSgpKSk7XG5cblx0XHQvLyBgdW5kZWZpbmVkYCBtZWFucyB0aGUgbmV3LXNlc3Npb24gc2NvcGUgaXMgZG9ybWFudCAoYSBjcmVhdGVkIHNlc3Npb24gaXNcblx0XHQvLyBhY3RpdmUpIG9yIHRoZSBkcmFmdCdzIHdvcmtzcGFjZSBoYXMgbm90IHJlc29sdmVkIHlldC4gTmVpdGhlciBpcyBhXG5cdFx0Ly8gd29ya3NwYWNlIGNoYW5nZSwgc28gdGhlIGNvbW1lbnRzIHN0YXkgYm91bmQgdG8gdGhlIGxhc3Qga25vd24gb25lIGFuZCBhXG5cdFx0Ly8gZHJhZnQgc3dhcCAod2hpY2ggYnJpZWZseSBkcm9wcyB0aGUgd29ya3NwYWNlKSBkb2VzIG5vdCBkaXNjYXJkIHRoZW0uXG5cdFx0dGhpcy5fbmV3U2Vzc2lvbldvcmtzcGFjZUtleSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWFjdGl2ZVNlc3Npb24gfHwgYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlRm9sZGVyc0tleShhY3RpdmVTZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcikpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuX25ld1Nlc3Npb25Xb3Jrc3BhY2VLZXksIGtleSA9PiB7XG5cdFx0XHRpZiAoa2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2JvdW5kTmV3U2Vzc2lvbldvcmtzcGFjZUtleSAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2JvdW5kTmV3U2Vzc2lvbldvcmtzcGFjZUtleSAhPT0ga2V5KSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJGZWVkYmFjayhBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDb21tZW50cyB3cml0dGVuIGJlZm9yZSBhbnkgd29ya3NwYWNlIHdhcyBwaWNrZWQgYWRvcHQgdGhpcyBzZWxlY3Rpb24uXG5cdFx0XHR0aGlzLl9yZWJpbmROZXdTZXNzaW9uV29ya3NwYWNlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzaGFyZWQgbmV3LXNlc3Npb24gY29tbWVudHMgYmVsb25nIHRvIHRoZSB3b3Jrc3BhY2Ugb2YgdGhlIGRyYWZ0IHRoZXlcblx0ICogd2VyZSB3cml0dGVuIGZvci4gQW4gZW1wdHkgc2V0IHJlbGVhc2VzIHRoZSBiaW5kaW5nIHNvIHRoZSBuZXh0IGRyYWZ0IGNhblxuXHQgKiBhZG9wdCBpdHMgb3duIHdvcmtzcGFjZSBpbnN0ZWFkIG9mIGJlaW5nIG1lYXN1cmVkIGFnYWluc3QgYSBzdGFsZSBvbmUuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWJpbmROZXdTZXNzaW9uV29ya3NwYWNlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5nZXRGZWVkYmFjayhBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSkubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9ib3VuZE5ld1Nlc3Npb25Xb3Jrc3BhY2VLZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHRoaXMuX25ld1Nlc3Npb25Xb3Jrc3BhY2VLZXkuZ2V0KCk7XG5cdFx0aWYgKGtleSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9ib3VuZE5ld1Nlc3Npb25Xb3Jrc3BhY2VLZXkgPSBrZXk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJlc29sdmVzIHRoZSBzdG9yYWdlIGJhY2tlbmQgdGhhdCBvd25zIGZlZWRiYWNrIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSBfYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCB7XG5cdFx0aWYgKHRoaXMuX2lzQWdlbnRIb3N0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0QW5ub3RhdGlvbnNCYWNrZW5kKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pbk1lbW9yeUJhY2tlbmQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBbm5vdGF0aW9uc0JhY2tlbmQoKTogQW5ub3RhdGlvbnNBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kIHtcblx0XHRpZiAoIXRoaXMuX2Fubm90YXRpb25zQmFja2VuZCkge1xuXHRcdFx0dGhpcy5fYW5ub3RhdGlvbnNCYWNrZW5kID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQW5ub3RhdGlvbnNBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hbm5vdGF0aW9uc0JhY2tlbmQub25EaWRDaGFuZ2VJdGVtcyhyZXNvdXJjZSA9PiB0aGlzLl9oYW5kbGVCYWNrZW5kQ2hhbmdlKHJlc291cmNlKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYW5ub3RhdGlvbnNCYWNrZW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmFja2VuZHMoKTogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2Fubm90YXRpb25zQmFja2VuZCA/IFt0aGlzLl9pbk1lbW9yeUJhY2tlbmQsIHRoaXMuX2Fubm90YXRpb25zQmFja2VuZF0gOiBbdGhpcy5faW5NZW1vcnlCYWNrZW5kXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDZW50cmFsaXplZCBoYW5kbGVyIGZvciBiYWNrZW5kIGl0ZW0gY2hhbmdlcyAobG9jYWwgbXV0YXRpb25zIGFuZFxuXHQgKiBzZXJ2ZXItZHJpdmVuIHVwZGF0ZXMpLiBNYWludGFpbnMgcmVjZW5jeSBvcmRlcmluZyBhbmQgcmUtYnJvYWRjYXN0cyB0aGVcblx0ICogZ2VuZXJpYyBmZWVkYmFjayAvIG5hdmlnYXRpb24gY2hhbmdlIGV2ZW50cy5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUJhY2tlbmRDaGFuZ2Uoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmZWVkYmFja0l0ZW1zID0gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKS5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChmZWVkYmFja0l0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblVwZGF0ZWRPcmRlci5zZXQoa2V5LCArK3RoaXMuX3Nlc3Npb25VcGRhdGVkU2VxdWVuY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVXBkYXRlZE9yZGVyLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUZlZWRiYWNrLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2UsIGZlZWRiYWNrSXRlbXMgfSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VOYXZpZ2F0aW9uLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoaXNFcXVhbChzZXNzaW9uUmVzb3VyY2UsIEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFKSkge1xuXHRcdFx0dGhpcy5fcmViaW5kTmV3U2Vzc2lvbldvcmtzcGFjZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrVmlzaWJsZUVkaXRvclJlc291cmNlcygpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwYW5lIG9mIHRoaXMuX2VkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvclBhbmVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBnZXRBY3RpdmVSZXNvdXJjZUNhbmRpZGF0ZXMocGFuZS5pbnB1dCkpIHtcblx0XHRcdFx0dGhpcy5fZmlsZVRvU2Vzc2lvbi5zZXQoY2FuZGlkYXRlLCBhY3RpdmVTZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRTZXNzaW9uRm9yRmlsZShyZXNvdXJjZVVyaTogVVJJKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX2ZpbGVUb1Nlc3Npb24uZ2V0KHJlc291cmNlVXJpKSA/PyB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXNlc3Npb24gfHwgc2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNGaWxlSW5TZXNzaW9uU2NvcGUoc2Vzc2lvbiwgcmVzb3VyY2VVcmkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKHJlc291cmNlVXJpOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4cGxpY2l0U2NvcGUgPSB0aGlzLl9leHBsaWNpdFJlc291cmNlU2NvcGVzLmdldChyZXNvdXJjZVVyaSk7XG5cdFx0aWYgKGV4cGxpY2l0U2NvcGUpIHtcblx0XHRcdHJldHVybiBleHBsaWNpdFNjb3BlO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2VVcmkuc2NoZW1lID09PSBTY2hlbWFzLm91dHB1dENoYW5uZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghYWN0aXZlU2Vzc2lvbiB8fCAhYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdC8vIEEgZHJhZnQgdGhhdCBhbHJlYWR5IGhhcyBhIHdvcmtzcGFjZSBzY29wZXMgaXRzIGNvbW1lbnRzIHRoZSBzYW1lXG5cdFx0XHQvLyB3YXkgYSBjcmVhdGVkIHNlc3Npb24gZG9lczsgYSBkcmFmdCB3aXRob3V0IG9uZSAobm90aGluZyBwaWNrZWRcblx0XHRcdC8vIHlldCkgaGFzIG5vdGhpbmcgdG8gc2NvcGUgYWdhaW5zdCwgc28gYWxsb3cgYW55IGZpbGUuXG5cdFx0XHRpZiAoYWN0aXZlU2Vzc2lvbiAmJiAhdGhpcy5faXNGaWxlSW5TZXNzaW9uU2NvcGUoYWN0aXZlU2Vzc2lvbiwgcmVzb3VyY2VVcmkpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0U2Vzc2lvbkZvckZpbGUocmVzb3VyY2VVcmkpPy5yZXNvdXJjZTtcblx0fVxuXG5cdHJlZ2lzdGVyRmVlZGJhY2tSZXNvdXJjZVNjb3BlKHJlc291cmNlVXJpOiBVUkksIHNlc3Npb25SZXNvdXJjZTogVVJJKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2V4cGxpY2l0UmVzb3VyY2VTY29wZXMuc2V0KHJlc291cmNlVXJpLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZS5maXJlKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKGlzRXF1YWwodGhpcy5fZXhwbGljaXRSZXNvdXJjZVNjb3Blcy5nZXQocmVzb3VyY2VVcmkpLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZXhwbGljaXRSZXNvdXJjZVNjb3Blcy5kZWxldGUocmVzb3VyY2VVcmkpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBnaXZlbiBmaWxlIGJlbG9uZ3MgdG8gdGhlIHNlc3Npb24gYW5kIGlzIHRoZXJlZm9yZSBlbGlnaWJsZVxuXHQgKiBmb3IgYWdlbnQgZmVlZGJhY2suIFRoaXMga2VlcHMgdGhlIGZlZWRiYWNrIGFmZm9yZGFuY2VzIHNjb3BlZCB0byB0aGVcblx0ICogc2Vzc2lvbidzIG93biBmaWxlcyBhbmQgZXhjbHVkZXMgZWRpdG9ycyB0aGF0IG1lcmVseSBoYXBwZW4gdG8gYmUgb3BlblxuXHQgKiB3aGlsZSB0aGUgc2Vzc2lvbiBpcyBhY3RpdmUgKGUuZy4gdXNlciBzZXR0aW5ncyBvcGVuZWQgZnJvbSB0aGUgdXNlclxuXHQgKiBkYXRhIGRpcmVjdG9yeSwgb3IgdGhlIE91dHB1dCB2aWV3IHdoaWNoIGlzIG5vdCBiYWNrZWQgYnkgYSByZWFsIGZpbGUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNGaWxlSW5TZXNzaW9uU2NvcGUoc2Vzc2lvbjogSVNlc3Npb24sIHJlc291cmNlVXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBUaGUgT3V0cHV0IHZpZXcgcmVuZGVycyBpbnRvIGEgY29kZSBlZGl0b3IgYnV0IGlzIG5vdCBhIHJlYWwgZmlsZSB0aGVcblx0XHQvLyB1c2VyIGNhbiBnaXZlIGZlZWRiYWNrIG9uLCBzbyBhbHdheXMgZXhjbHVkZSBpdC5cblx0XHRpZiAocmVzb3VyY2VVcmkuc2NoZW1lID09PSBTY2hlbWFzLm91dHB1dENoYW5uZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBGaWxlcyB0aGF0IGFyZSBwYXJ0IG9mIHRoZSBzZXNzaW9uJ3MgY2hhbmdlcyBhcmUgYWx3YXlzIGluIHNjb3BlLFxuXHRcdC8vIHJlZ2FyZGxlc3Mgb2Ygd2hlcmUgdGhleSBsaXZlIG9uIGRpc2suXG5cdFx0aWYgKHNlc3Npb24uY2hhbmdlcy5nZXQoKS5zb21lKGNoYW5nZSA9PiBjaGFuZ2VNYXRjaGVzUmVzb3VyY2UoY2hhbmdlLCByZXNvdXJjZVVyaSkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgdGhlIGZpbGUgbXVzdCBsaXZlIHdpdGhpbiBvbmUgb2YgdGhlIHNlc3Npb24ncyB3b3Jrc3BhY2Vcblx0XHQvLyBmb2xkZXJzLiBXaGVuIHRoZSBzZXNzaW9uIGhhcyBubyB3b3Jrc3BhY2UgaW5mb3JtYXRpb24gd2UgY2Fubm90IG1ha2Vcblx0XHQvLyB0aGF0IGRldGVybWluYXRpb24sIHNvIGZhbGwgYmFjayB0byBhbGxvd2luZyB0aGUgZmlsZS5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB3b3Jrc3BhY2UuZm9sZGVycy5zb21lKGZvbGRlciA9PlxuXHRcdFx0aXNFcXVhbE9yUGFyZW50KHJlc291cmNlVXJpLCBmb2xkZXIucm9vdCkgfHwgaXNFcXVhbE9yUGFyZW50KHJlc291cmNlVXJpLCBmb2xkZXIud29ya2luZ0RpcmVjdG9yeSkpO1xuXHR9XG5cblx0YWRkRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIHJlc291cmNlVXJpOiBVUkksIHJhbmdlOiBJUmFuZ2UsIHRleHQ6IHN0cmluZywgc3VnZ2VzdGlvbj86IElDb2RlUmV2aWV3U3VnZ2VzdGlvbiwgY29udGV4dD86IElBZ2VudEZlZWRiYWNrQ29udGV4dCwgc291cmNlUFJSZXZpZXdDb21tZW50SWQ/OiBzdHJpbmcsIGtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kID0gQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldywgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZSA9IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCk6IElBZ2VudEZlZWRiYWNrIHtcblx0XHRjb25zdCBiYWNrZW5kID0gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIEEgc291cmNlUFJSZXZpZXdDb21tZW50SWQgaW1wbGllcyB0aGUgZmVlZGJhY2sgb3JpZ2luYXRlZCBmcm9tIGEgUFIgcmV2aWV3LlxuXHRcdGNvbnN0IGVmZmVjdGl2ZUtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kID0gc291cmNlUFJSZXZpZXdDb21tZW50SWQgPyBBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldyA6IGtpbmQ7XG5cblx0XHRjb25zdCBmZWVkYmFjazogSUFnZW50RmVlZGJhY2sgPSB7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0cmVzb3VyY2VVcmksXG5cdFx0XHRyYW5nZSxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHN1Z2dlc3Rpb24sXG5cdFx0XHRjb2RlU2VsZWN0aW9uOiBjb250ZXh0Py5jb2RlU2VsZWN0aW9uLFxuXHRcdFx0ZGlmZkh1bmtzOiBjb250ZXh0Py5kaWZmSHVua3MsXG5cdFx0XHRraW5kOiBlZmZlY3RpdmVLaW5kLFxuXHRcdFx0c291cmNlUFJSZXZpZXdDb21tZW50SWQsXG5cdFx0XHRzdGF0ZSxcblx0XHR9O1xuXG5cdFx0Ly8gQ29tcHV0ZSBmaWxlLWV4aXN0ZW5jZSAoZm9yIHRlbGVtZXRyeSkgYmVmb3JlIHRoZSBpdGVtIGlzIHN0b3JlZC5cblx0XHRjb25zdCByZXNvdXJjZVN0ciA9IHJlc291cmNlVXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgaGFzRXhpc3RpbmdGb3JGaWxlID0gYmFja2VuZC5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpLnNvbWUoZiA9PiBmLnJlc291cmNlVXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlU3RyKTtcblxuXHRcdGJhY2tlbmQudXBzZXJ0KGZlZWRiYWNrKTtcblxuXHRcdC8vIENyZWF0ZWQgaXRlbXMgYXJlIGFkZGVkIGJ5IGEgc3lzdGVtIGFuZCBhcmUgbm90IHlldCB1c2VyLWFjY2VwdGVkLCBzb1xuXHRcdC8vIHRoZXkgZG8gbm90IGNvbnRyaWJ1dGUgYWRkL2NvbnZlcnQgdGVsZW1ldHJ5IHVudGlsIGFjY2VwdGFuY2UuXG5cdFx0aWYgKHN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQpIHtcblx0XHRcdGlmIChlZmZlY3RpdmVLaW5kID09PSBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQWRkRmVlZGJhY2suZmlyZSh7IHNlc3Npb25SZXNvdXJjZSwgZmVlZGJhY2ssIGhhc0V4aXN0aW5nRmVlZGJhY2tGb3JGaWxlOiBoYXNFeGlzdGluZ0ZvckZpbGUgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENvbnZlcnRGZWVkYmFjay5maXJlKHsgc2Vzc2lvblJlc291cmNlLCBmZWVkYmFjaywga2luZDogZWZmZWN0aXZlS2luZCwgaGFzRXhpc3RpbmdGZWVkYmFja0ZvckZpbGU6IGhhc0V4aXN0aW5nRm9yRmlsZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmVlZGJhY2s7XG5cdH1cblxuXHRhY2NlcHRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nLCBvcHRpb25zPzogSUFjY2VwdEZlZWRiYWNrT3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IGJhY2tlbmQgPSB0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGZlZWRiYWNrSXRlbXMgPSBiYWNrZW5kLmdldEl0ZW1zKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBmZWVkYmFja0l0ZW1zLmZpbmQoZiA9PiBmLmlkID09PSBmZWVkYmFja0lkKTtcblx0XHRpZiAoIWV4aXN0aW5nIHx8IGV4aXN0aW5nLnN0YXRlICE9PSBBZ2VudEZlZWRiYWNrU3RhdGUuQ3JlYXRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjY2VwdGVkOiBJQWdlbnRGZWVkYmFjayA9IHtcblx0XHRcdC4uLmV4aXN0aW5nLFxuXHRcdFx0c3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCxcblx0XHRcdC4uLihvcHRpb25zPy5yZXZlYWxUb0FnZW50ID8geyBwZW5kaW5nQWdlbnRSZXZlYWw6IHRydWUgfSA6IHt9KSxcblx0XHR9O1xuXHRcdGJhY2tlbmQudXBzZXJ0KGFjY2VwdGVkKTtcblxuXHRcdGlmIChhY2NlcHRlZC5raW5kICE9PSBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3KSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVN0ciA9IGFjY2VwdGVkLnJlc291cmNlVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBoYXNFeGlzdGluZ0ZlZWRiYWNrRm9yRmlsZSA9IGZlZWRiYWNrSXRlbXMuc29tZShmID0+IGYuaWQgIT09IGFjY2VwdGVkLmlkICYmIGYucmVzb3VyY2VVcmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2VTdHIpO1xuXHRcdFx0dGhpcy5fb25EaWRDb252ZXJ0RmVlZGJhY2suZmlyZSh7IHNlc3Npb25SZXNvdXJjZSwgZmVlZGJhY2s6IGFjY2VwdGVkLCBraW5kOiBhY2NlcHRlZC5raW5kLCBoYXNFeGlzdGluZ0ZlZWRiYWNrRm9yRmlsZSB9KTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKHRoaXMuX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24uZ2V0KGtleSkgPT09IGZlZWRiYWNrSWQpIHtcblx0XHRcdHRoaXMuX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24uZGVsZXRlKGtleSk7XG5cdFx0fVxuXHRcdHRoaXMuX2JhY2tlbmRGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkucmVtb3ZlKHNlc3Npb25SZXNvdXJjZSwgZmVlZGJhY2tJZCk7XG5cdH1cblxuXHR1cGRhdGVGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nLCBuZXdUZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZW5kID0gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBleGlzdGluZyA9IGJhY2tlbmQuZ2V0SXRlbXMoc2Vzc2lvblJlc291cmNlKS5maW5kKGYgPT4gZi5pZCA9PT0gZmVlZGJhY2tJZCk7XG5cdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRiYWNrZW5kLnVwc2VydCh7IC4uLmV4aXN0aW5nLCB0ZXh0OiBuZXdUZXh0IH0pO1xuXHR9XG5cblx0c2V0RmVlZGJhY2tSZXNvbHZlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nLCByZXNvbHZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGJhY2tlbmQgPSB0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdC8vIFVuLXJlc29sdmluZyByZXR1cm5zIHRoZSBpdGVtIHRvIHRoZSBzdWJtaXR0ZWQgc3RhdGUuXG5cdFx0Y29uc3QgbmV4dFN0YXRlID0gcmVzb2x2ZWQgPyBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQgOiBBZ2VudEZlZWRiYWNrU3RhdGUuU3VibWl0dGVkO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYmFja2VuZC5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpLmZpbmQoZiA9PiBmLmlkID09PSBmZWVkYmFja0lkKTtcblx0XHRpZiAoZXhpc3RpbmcgJiYgZXhpc3Rpbmcuc3RhdGUgIT09IG5leHRTdGF0ZSkge1xuXHRcdFx0YmFja2VuZC51cHNlcnQoeyAuLi5leGlzdGluZywgc3RhdGU6IG5leHRTdGF0ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRhZGRSZXBseShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nLCByZXBseVRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGJhY2tlbmQgPSB0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYmFja2VuZC5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpLmZpbmQoZiA9PiBmLmlkID09PSBmZWVkYmFja0lkKTtcblx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3UmVwbGllcyA9IFsuLi4oZXhpc3RpbmcucmVwbGllcyA/PyBbXSksIHJlcGx5VGV4dF07XG5cdFx0Y29uc3QgdXBkYXRlZDogSUFnZW50RmVlZGJhY2sgPSB7IC4uLmV4aXN0aW5nLCByZXBsaWVzOiBuZXdSZXBsaWVzIH07XG5cdFx0YmFja2VuZC51cHNlcnQodXBkYXRlZCk7XG5cdFx0dGhpcy5fb25EaWRBZGRSZXBseS5maXJlKHsgc2Vzc2lvblJlc291cmNlLCBmZWVkYmFjazogdXBkYXRlZCwgcmVwbHlDb3VudDogbmV3UmVwbGllcy5sZW5ndGggfSk7XG5cdH1cblxuXHRnZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW10ge1xuXHRcdHJldHVybiB0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpLmdldEl0ZW1zKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRoYXNMb2FkZWRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpLmhhc0xvYWRlZChzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0Z2V0TW9zdFJlY2VudFNlc3Npb25Gb3JSZXNvdXJjZShyZXNvdXJjZVVyaTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYmVzdFNlc3Npb246IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYmVzdFNlcXVlbmNlID0gLTE7XG5cblx0XHRmb3IgKGNvbnN0IGJhY2tlbmQgb2YgdGhpcy5fYmFja2VuZHMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgYmFja2VuZC5nZXRTZXNzaW9uc1dpdGhJdGVtcygpKSB7XG5cdFx0XHRcdGNvbnN0IGZlZWRiYWNrSXRlbXMgPSBiYWNrZW5kLmdldEl0ZW1zKGNhbmRpZGF0ZSk7XG5cdFx0XHRcdGlmICghZmVlZGJhY2tJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdGhpcy5fc2Vzc2lvbkNvbnRhaW5zUmVzb3VyY2UoY2FuZGlkYXRlLCByZXNvdXJjZVVyaSwgZmVlZGJhY2tJdGVtcykpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlcXVlbmNlID0gdGhpcy5fc2Vzc2lvblVwZGF0ZWRPcmRlci5nZXQoY2FuZGlkYXRlLnRvU3RyaW5nKCkpID8/IDA7XG5cdFx0XHRcdGlmIChzZXF1ZW5jZSA+IGJlc3RTZXF1ZW5jZSkge1xuXHRcdFx0XHRcdGJlc3RTZXNzaW9uID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdGJlc3RTZXF1ZW5jZSA9IHNlcXVlbmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJlc3RTZXNzaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Vzc2lvbkNvbnRhaW5zUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlc291cmNlVXJpOiBVUkksIGZlZWRiYWNrSXRlbXM6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW10pOiBib29sZWFuIHtcblx0XHRpZiAoZmVlZGJhY2tJdGVtcy5zb21lKGl0ZW0gPT4gaXNFcXVhbChpdGVtLnJlc291cmNlVXJpLCByZXNvdXJjZVVyaSkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRpbmdTZXNzaW9uIG9mIHRoaXMuX2NoYXRFZGl0aW5nU2VydmljZS5lZGl0aW5nU2Vzc2lvbnNPYnMuZ2V0KCkpIHtcblx0XHRcdGlmICghaXNFcXVhbChlZGl0aW5nU2Vzc2lvbi5jaGF0U2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdGluZ0VudHJpZXNDb250YWluUmVzb3VyY2UoZWRpdGluZ1Nlc3Npb24uZW50cmllcy5nZXQoKSwgcmVzb3VyY2VVcmkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VzID0gc2Vzc2lvbi5jaGFuZ2VzLmdldCgpO1xuXHRcdGlmIChjaGFuZ2VzLnNvbWUoY2hhbmdlID0+IGNoYW5nZU1hdGNoZXNSZXNvdXJjZShjaGFuZ2UsIHJlc291cmNlVXJpKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJLCBmZWVkYmFja0lkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmZWVkYmFjayA9IHRoaXMuZ2V0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlKS5maW5kKGYgPT4gZi5pZCA9PT0gZmVlZGJhY2tJZCk7XG5cdFx0aWYgKCFmZWVkYmFjaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBbmNob3IgdXNpbmcgdGhlIHNlc3Npb24tZWRpdG9yLWNvbW1lbnQgaWQgKG5vdCB0aGUgcmF3IGZlZWRiYWNrIGlkKSBzbyB0aGUgZWRpdG9yIHdpZGdldCBjb250cmlidXRpb24gbWF0Y2hlcyB0aGUgYWN0aXZlIGl0ZW0gYW5kIGV4cGFuZHMgaXRzIHdpZGdldC5cblx0XHRhd2FpdCB0aGlzLnJldmVhbFNlc3Npb25Db21tZW50KHNlc3Npb25SZXNvdXJjZSwgdG9TZXNzaW9uRWRpdG9yQ29tbWVudElkKFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLkFnZW50RmVlZGJhY2ssIGZlZWRiYWNrSWQpLCBmZWVkYmFjay5yZXNvdXJjZVVyaSwgZmVlZGJhY2sucmFuZ2UpO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsU2Vzc2lvbkNvbW1lbnQoc2Vzc2lvblJlc291cmNlOiBVUkksIGNvbW1lbnRJZDogc3RyaW5nLCByZXNvdXJjZVVyaTogVVJJLCByYW5nZTogSVJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0geyBzdGFydExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSB0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBzZXNzaW9uQ2hhbmdlID0gdGhpcy5fZ2V0U2Vzc2lvbkNoYW5nZShyZXNvdXJjZVVyaSwgc2Vzc2lvbkRhdGE/LmNoYW5nZXMuZ2V0KCkpO1xuXG5cdFx0aWYgKHNlc3Npb25DaGFuZ2U/LmlzRGVsZXRpb24gJiYgc2Vzc2lvbkNoYW5nZS5vcmlnaW5hbFVyaSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25DaGFuZ2Uub3JpZ2luYWxVcmksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRtb2RhbDoge30sXG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogZmFsc2UsXG5cdFx0XHRcdFx0cmV2ZWFsSWZWaXNpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChzZXNzaW9uQ2hhbmdlPy5vcmlnaW5hbFVyaSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHNlc3Npb25DaGFuZ2Uub3JpZ2luYWxVcmkgfSxcblx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IHNlc3Npb25DaGFuZ2UubW9kaWZpZWRVcmkgfSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdG1vZGFsOiB7fSxcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBmYWxzZSxcblx0XHRcdFx0XHRyZXZlYWxJZlZpc2libGU6IHRydWUsXG5cdFx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25DaGFuZ2U/Lm1vZGlmaWVkVXJpID8/IHJlc291cmNlVXJpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0bW9kYWw6IHt9LFxuXHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGZhbHNlLFxuXHRcdFx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRzZWxlY3Rpb24sXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0TmF2aWdhdGlvbkFuY2hvcihzZXNzaW9uUmVzb3VyY2UsIGNvbW1lbnRJZCk7XG5cdFx0dGhpcy5fb25EaWRSZXZlYWxTZXNzaW9uQ29tbWVudC5maXJlKHsgc2Vzc2lvblJlc291cmNlLCBjb21tZW50SWQsIHJlc291cmNlVXJpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvbkNoYW5nZShyZXNvdXJjZVVyaTogVVJJLCBjaGFuZ2VzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXSB8IHVuZGVmaW5lZCk6IHsgb3JpZ2luYWxVcmk/OiBVUkk7IG1vZGlmaWVkVXJpOiBVUkk7IGlzRGVsZXRpb246IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCEoY2hhbmdlcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaGluZ0NoYW5nZSA9IGNoYW5nZXMuZmluZChjaGFuZ2UgPT4gY2hhbmdlTWF0Y2hlc1Jlc291cmNlKGNoYW5nZSwgcmVzb3VyY2VVcmkpKTtcblx0XHRpZiAoIW1hdGNoaW5nQ2hhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKG1hdGNoaW5nQ2hhbmdlKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b3JpZ2luYWxVcmk6IG1hdGNoaW5nQ2hhbmdlLm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRtb2RpZmllZFVyaTogbWF0Y2hpbmdDaGFuZ2UubW9kaWZpZWRVcmkgPz8gbWF0Y2hpbmdDaGFuZ2UudXJpLFxuXHRcdFx0XHRpc0RlbGV0aW9uOiBtYXRjaGluZ0NoYW5nZS5tb2RpZmllZFVyaSA9PT0gdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3JpZ2luYWxVcmk6IG1hdGNoaW5nQ2hhbmdlLm9yaWdpbmFsVXJpLFxuXHRcdFx0bW9kaWZpZWRVcmk6IG1hdGNoaW5nQ2hhbmdlLm1vZGlmaWVkVXJpLFxuXHRcdFx0aXNEZWxldGlvbjogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdGdldE5leHRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbmV4dDogYm9vbGVhbik6IElBZ2VudEZlZWRiYWNrIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXROZXh0TmF2aWdhYmxlSXRlbShzZXNzaW9uUmVzb3VyY2UsIHRoaXMuZ2V0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlKSwgbmV4dCk7XG5cdH1cblxuXHRnZXROZXh0TmF2aWdhYmxlSXRlbTxUIGV4dGVuZHMgSU5hdmlnYWJsZVNlc3Npb25Db21tZW50PihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaXRlbXM6IHJlYWRvbmx5IFRbXSwgbmV4dDogYm9vbGVhbik6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmICghaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9uYXZpZ2F0aW9uQW5jaG9yQnlTZXNzaW9uLmRlbGV0ZShrZXkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhbmNob3JJZCA9IHRoaXMuX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24uZ2V0KGtleSk7XG5cdFx0bGV0IGFuY2hvckluZGV4ID0gYW5jaG9ySWQgPyBpdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLmlkID09PSBhbmNob3JJZCkgOiAtMTtcblxuXHRcdGlmIChhbmNob3JJbmRleCA8IDAgJiYgIW5leHQpIHtcblx0XHRcdGFuY2hvckluZGV4ID0gMDtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0SW5kZXggPSBuZXh0XG5cdFx0XHQ/IChhbmNob3JJbmRleCArIDEpICUgaXRlbXMubGVuZ3RoXG5cdFx0XHQ6IChhbmNob3JJbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xuXG5cdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW25leHRJbmRleF07XG5cdFx0dGhpcy5zZXROYXZpZ2F0aW9uQW5jaG9yKHNlc3Npb25SZXNvdXJjZSwgaXRlbS5pZCk7XG5cdFx0cmV0dXJuIGl0ZW07XG5cdH1cblxuXHRzZXROYXZpZ2F0aW9uQW5jaG9yKHNlc3Npb25SZXNvdXJjZTogVVJJLCBpdGVtSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmIChpdGVtSWQpIHtcblx0XHRcdHRoaXMuX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24uc2V0KGtleSwgaXRlbUlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbmF2aWdhdGlvbkFuY2hvckJ5U2Vzc2lvbi5kZWxldGUoa2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VOYXZpZ2F0aW9uLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGdldE5hdmlnYXRpb25CZWFyaW5nKHNlc3Npb25SZXNvdXJjZTogVVJJLCBpdGVtczogcmVhZG9ubHkgSU5hdmlnYWJsZVNlc3Npb25Db21tZW50W10gPSB0aGlzLmdldEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSkpOiBJQWdlbnRGZWVkYmFja05hdmlnYXRpb25CZWFyaW5nIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhbmNob3JJZCA9IHRoaXMuX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24uZ2V0KGtleSk7XG5cdFx0Y29uc3QgYWN0aXZlSWR4ID0gYW5jaG9ySWQgPyBpdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLmlkID09PSBhbmNob3JJZCkgOiAtMTtcblx0XHRyZXR1cm4geyBhY3RpdmVJZHgsIHRvdGFsQ291bnQ6IGl0ZW1zLmxlbmd0aCB9O1xuXHR9XG5cblx0Y2xlYXJGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3Nlc3Npb25VcGRhdGVkT3JkZXIuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fbmF2aWdhdGlvbkFuY2hvckJ5U2Vzc2lvbi5kZWxldGUoa2V5KTtcblx0XHR0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpLmNsZWFyKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyBhZGRGZWVkYmFja0FuZFN1Ym1pdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVzb3VyY2VVcmk6IFVSSSwgcmFuZ2U6IElSYW5nZSwgdGV4dDogc3RyaW5nLCBzdWdnZXN0aW9uPzogSUNvZGVSZXZpZXdTdWdnZXN0aW9uLCBjb250ZXh0PzogSUFnZW50RmVlZGJhY2tDb250ZXh0LCBzb3VyY2VQUlJldmlld0NvbW1lbnRJZD86IHN0cmluZywga2luZD86IEFnZW50RmVlZGJhY2tLaW5kKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hZGRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UsIHJlc291cmNlVXJpLCByYW5nZSwgdGV4dCwgc3VnZ2VzdGlvbiwgY29udGV4dCwgc291cmNlUFJSZXZpZXdDb21tZW50SWQsIGtpbmQpO1xuXHRcdGlmIChpc0VxdWFsKHNlc3Npb25SZXNvdXJjZSwgQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN1Ym1pdEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9pc0FnZW50SG9zdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGF0dGFjaG1lbnQgY29udHJpYnV0aW9uIHRvIHVwZGF0ZSB0aGUgY2hhdCB3aWRnZXQncyBhdHRhY2htZW50IG1vZGVsXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCB3aGVuV2lkZ2V0Rm9yU2Vzc2lvbih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdFx0Y29uc3QgYXR0YWNobWVudElkID0gQVRUQUNITUVOVF9JRF9QUkVGSVggKyBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgaGFzQXR0YWNobWVudCA9ICgpID0+IHdpZGdldC5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuc29tZShhID0+IGEuaWQgPT09IGF0dGFjaG1lbnRJZCk7XG5cblx0XHRcdFx0aWYgKCFoYXNBdHRhY2htZW50KCkpIHtcblx0XHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoXG5cdFx0XHRcdFx0XHRFdmVudC5maWx0ZXIod2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5vbkRpZENoYW5nZSwgKCkgPT4gaGFzQXR0YWNobWVudCgpKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudEZlZWRiYWNrXSBhZGRGZWVkYmFja0FuZFN1Ym1pdDogbm8gY2hhdCB3aWRnZXQgZm91bmQgZm9yIHNlc3Npb24sIGZlZWRiYWNrIG1heSBub3QgYmUgc3VibWl0dGVkIGNvcnJlY3RseScsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnN1Ym1pdEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0FnZW50SG9zdFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHNlc3Npb24gPyBpc0FnZW50SG9zdFByb3ZpZGVySWQoc2Vzc2lvbi5wcm92aWRlcklkKSA6IGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgc3VibWl0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoaXNFcXVhbChzZXNzaW9uUmVzb3VyY2UsIEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFKSkge1xuXHRcdFx0aWYgKCF0aGlzLmdldEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSkuc29tZShpdGVtID0+IGl0ZW0uc3RhdGUgPT09IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zU2VydmljZS5zdWJtaXROZXdTZXNzaW9uSW5wdXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCB3aGVuV2lkZ2V0Rm9yU2Vzc2lvbih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50RmVlZGJhY2tdIHN1Ym1pdEZlZWRiYWNrOiBubyBjaGF0IHdpZGdldCBmb3VuZCBmb3Igc2Vzc2lvbicsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBBZ2VudC1ob3N0IHNlc3Npb25zIGRvbid0IGtlZXAgYSByZWFjdGl2ZSBmZWVkYmFjayBhdHRhY2htZW50IGluIHRoZVxuXHRcdC8vIGNoYXQgaW5wdXQgKHRoZWlyIGZlZWRiYWNrIGxpdmVzIGluIHRoZSBhbm5vdGF0aW9ucyBiYWNrZW5kIGFuZCBpc1xuXHRcdC8vIHN1Ym1pdHRlZCB2aWEgdGhlIFwiU3VibWl0IEZlZWRiYWNrXCIgYnV0dG9uKS4gQXR0YWNoIHRoZSBhY2NlcHRlZFxuXHRcdC8vIGl0ZW1zIFx1MjAxNCB3aGljaCBhcmUgYWJvdXQgdG8gYmVjb21lIHN1Ym1pdHRlZCBcdTIwMTQgdG8gdGhpcyBzaW5nbGUgcmVxdWVzdFxuXHRcdC8vIHNvIHRoZSBhZ2VudCByZWNlaXZlcyB0aGUgY29tbWVudHMsIHRoZW4gcmVtb3ZlIHRoZSB0cmFuc2llbnRcblx0XHQvLyBhdHRhY2htZW50IGFnYWluIG9uY2UgdGhlIHJlcXVlc3QgaGFzIGJlZW4gYWNjZXB0ZWQuXG5cdFx0aWYgKHRoaXMuX2lzQWdlbnRIb3N0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBhY2NlcHRlZEl0ZW1zID0gdGhpcy5nZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpLmZpbHRlcihpdGVtID0+IGl0ZW0uc3RhdGUgPT09IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCk7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50SWQgPSBBVFRBQ0hNRU5UX0lEX1BSRUZJWCArIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0aWYgKGFjY2VwdGVkSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGFubm90YXRpb25zUmVzb3VyY2UgPSB0aGlzLl9nZXRBbm5vdGF0aW9uc0JhY2tlbmQoKS5nZXRBbm5vdGF0aW9uc0NoYW5uZWxSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmRlbGV0ZShhdHRhY2htZW50SWQpO1xuXHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoY3JlYXRlQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnkoc2Vzc2lvblJlc291cmNlLCBhY2NlcHRlZEl0ZW1zLCBhbm5vdGF0aW9uc1Jlc291cmNlKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl9zZW5kQWN0T25GZWVkYmFja1JlcXVlc3Qod2lkZ2V0LCBzZXNzaW9uUmVzb3VyY2UsICgpID0+IHdpZGdldC5hdHRhY2htZW50TW9kZWwuZGVsZXRlKGF0dGFjaG1lbnRJZCkpO1xuXHRcdH1cblxuXHRcdC8vIEZvciBub24tYWdlbnQtaG9zdCBzZXNzaW9ucyB0aGUgcmVhY3RpdmUgYXR0YWNobWVudCBjb250cmlidXRpb24gYWxzb1xuXHRcdC8vIG1hcmtzIHN1Ym1pc3Npb24gb24gc2VuZDsgbWFya2luZyBmcm9tIHRoZSBoZWxwZXIgaXMgaWRlbXBvdGVudCBhbmRcblx0XHQvLyBjb3ZlcnMgc2Vzc2lvbnMgd2l0aG91dCB0aGF0IGNvbnRyaWJ1dGlvbi5cblx0XHRyZXR1cm4gdGhpcy5fc2VuZEFjdE9uRmVlZGJhY2tSZXF1ZXN0KHdpZGdldCwgc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kcyB0aGUgYC9hY3Qtb24tZmVlZGJhY2tgIHJlcXVlc3QgYW5kIG1hcmtzIHRoZSBhY2NlcHRlZCBmZWVkYmFjayBhc1xuXHQgKiBzdWJtaXR0ZWQgYXMgc29vbiBhcyB0aGUgcmVxdWVzdCBoYXMgYmVlbiBhY2NlcHRlZCBieSB0aGUgY2hhdCB3aWRnZXQuXG5cdCAqIFRoZSByZXF1ZXN0IGlzIHF1ZXVlZCB3aGVuIHRoZSBhZ2VudCBpcyBzdGlsbCB3b3JraW5nIG9uIGFub3RoZXIgcmVxdWVzdCxcblx0ICogaW4gd2hpY2ggY2FzZSBhd2FpdGluZyB7QGxpbmsgSUNoYXRXaWRnZXQuYWNjZXB0SW5wdXR9IHdvdWxkIG9ubHkgcmVzb2x2ZVxuXHQgKiBvbmNlIHRoYXQgcXVldWVkIHJlcXVlc3QgZXZlbnR1YWxseSBydW5zIFx1MjAxNCB0aGUgZmVlZGJhY2sgaXRlbXMgbXVzdCBtb3ZlIHRvXG5cdCAqIHRoZSBzdWJtaXR0ZWQgc3RhdGUgcmlnaHQgYXdheS5cblx0ICovXG5cdHByaXZhdGUgX3NlbmRBY3RPbkZlZWRiYWNrUmVxdWVzdCh3aWRnZXQ6IElDaGF0V2lkZ2V0LCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY2xlYW51cD86ICgpID0+IHZvaWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBzdWJtaXR0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+KCk7XG5cdFx0Y29uc3QgY2xlYW51cE9uY2UgPSBjbGVhbnVwICYmIGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbihjbGVhbnVwKTtcblxuXHRcdHdpZGdldC5hY2NlcHRJbnB1dCgnL2FjdC1vbi1mZWVkYmFjaycsIHtcblx0XHRcdG9uUmVxdWVzdEFjY2VwdGVkOiAoKSA9PiB7XG5cdFx0XHRcdGNsZWFudXBPbmNlPy4oKTtcblx0XHRcdFx0dGhpcy5tYXJrRmVlZGJhY2tTdWJtaXR0ZWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0c3VibWl0dGVkLmNvbXBsZXRlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y2xlYW51cE9uY2U/LigpO1xuXHRcdFx0c3VibWl0dGVkLmNvbXBsZXRlKGZhbHNlKTtcblx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50RmVlZGJhY2tdIEZhaWxlZCB0byBzdWJtaXQgZmVlZGJhY2snLCBlcnIpO1xuXHRcdFx0Y2xlYW51cE9uY2U/LigpO1xuXHRcdFx0c3VibWl0dGVkLmNvbXBsZXRlKGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBzdWJtaXR0ZWQucDtcblx0fVxuXG5cdG1hcmtGZWVkYmFja1N1Ym1pdHRlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGJhY2tlbmQgPSB0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGZlZWRiYWNrSXRlbXMgPSBiYWNrZW5kLmdldEl0ZW1zKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHQvLyBBZ2VudC1ob3N0IHNlc3Npb25zIGhhbmQgdGhlIGZlZWRiYWNrIHRvIGFuIGFnZW50IHRoYXQgcmVzb2x2ZXMgZWFjaFxuXHRcdC8vIGNvbW1lbnQgKHZpYSB0aGUgcmVzb2x2ZUNvbW1lbnRzIHRvb2wpIG9uY2UgaXQgaGFzIGFjdGVkIG9uIGl0LCBzbyB0aGVcblx0XHQvLyBpdGVtcyBzdGF5IHZpc2libGUgaW4gdGhlIHN1Ym1pdHRlZCBzdGF0ZSB1bnRpbCB0aGVuLiBPdGhlciBwcm92aWRlcnNcblx0XHQvLyBoYXZlIG5vIHN1Y2ggYWdlbnQgbG9vcCwgc28gc3VibWl0dGluZyByZXNvbHZlcyB0aGUgY29tbWVudHMgZGlyZWN0bHlcblx0XHQvLyB0byBoaWRlIHRoZW0gZnJvbSB0aGUgVUkuXG5cdFx0Y29uc3Qgc3VibWl0dGVkU3RhdGUgPSB0aGlzLl9pc0FnZW50SG9zdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0PyBBZ2VudEZlZWRiYWNrU3RhdGUuU3VibWl0dGVkXG5cdFx0XHQ6IEFnZW50RmVlZGJhY2tTdGF0ZS5SZXNvbHZlZDtcblxuXHRcdGxldCB1c2VyQ291bnQgPSAwO1xuXHRcdGxldCBjb2RlUmV2aWV3Q291bnQgPSAwO1xuXHRcdGxldCBwclJldmlld0NvdW50ID0gMDtcblx0XHRsZXQgcmVwbHlDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc3VibWl0dGVkOiBJQWdlbnRGZWVkYmFja1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGZlZWRiYWNrSXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLnN0YXRlICE9PSBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKGl0ZW0ua2luZCkge1xuXHRcdFx0XHRjYXNlIEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXc6IHVzZXJDb3VudCsrOyBicmVhaztcblx0XHRcdFx0Y2FzZSBBZ2VudEZlZWRiYWNrS2luZC5BZ2VudFJldmlldzogY29kZVJldmlld0NvdW50Kys7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIEFnZW50RmVlZGJhY2tLaW5kLlBSUmV2aWV3OiBwclJldmlld0NvdW50Kys7IGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0cmVwbHlDb3VudCArPSBpdGVtLnJlcGxpZXM/Lmxlbmd0aCA/PyAwO1xuXHRcdFx0c3VibWl0dGVkLnB1c2goeyAuLi5pdGVtLCBzdGF0ZTogc3VibWl0dGVkU3RhdGUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzdWJtaXR0ZWQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHN1Ym1pdHRlZCkge1xuXHRcdFx0YmFja2VuZC51cHNlcnQoaXRlbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRTdWJtaXRGZWVkYmFjay5maXJlKHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHRvdGFsQ291bnQ6IHVzZXJDb3VudCArIGNvZGVSZXZpZXdDb3VudCArIHByUmV2aWV3Q291bnQsXG5cdFx0XHR1c2VyQ291bnQsXG5cdFx0XHRjb2RlUmV2aWV3Q291bnQsXG5cdFx0XHRwclJldmlld0NvdW50LFxuXHRcdFx0cmVwbHlDb3VudCxcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQixtQkFBbUI7QUFDN0MsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFNBQXNCLG1CQUFtQjtBQUNsRCxTQUFTLFdBQVc7QUFFcEIsU0FBUyxpQkFBaUIsNkJBQTZCO0FBQ3ZELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsdUJBQXVCLG1DQUEwRDtBQUMxRixTQUFTLHNCQUFzQjtBQUMvQixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxtQkFBbUI7QUFFNUIsU0FBMEQscUJBQXFCO0FBQy9FLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0NBQWtFLHlDQUF5QztBQUNwSCxTQUFTLHNCQUFzQix3Q0FBd0M7QUFDdkUsU0FBUyxtQkFBbUIsMEJBQStDO0FBQzNFLFNBQVMsNEJBQTRCLGdDQUFnQztBQVk5RCxNQUFNLHNDQUFzQyxJQUFJLEtBQUssRUFBRSxRQUFRLGtCQUFrQixNQUFNLGVBQWUsQ0FBQztBQU05RyxNQUFNLHlCQUF5QjtBQWEvQixlQUFzQixxQkFBcUIsbUJBQXVDLGlC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
