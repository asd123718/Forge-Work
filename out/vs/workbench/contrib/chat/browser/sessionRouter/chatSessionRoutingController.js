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
import * as dom from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { renderMarkdown } from "../../../../../base/browser/markdownRenderer.js";
import { alert as ariaAlert } from "../../../../../base/browser/ui/aria/aria.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { basename, isEqual, isEqualOrParent } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { localize } from "../../../../../nls.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IChatRequestVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ChatRequestQueueKind, IChatService } from "../../common/chatService/chatService.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { heuristicScore, isHighConfidenceSessionRoute, ISessionRouter, ROUTER_FIELD_CLIP_LENGTH } from "../../common/sessionRouter.js";
import { AgentSessionProviders } from "../agentSessions/agentSessions.js";
import { IAgentHostNewSessionFolderService } from "../agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { AgentSessionStatus } from "../agentSessions/agentSessionsModel.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { IChatWidgetService } from "../chat.js";
import { ChatSessionRoutingFolderPicker } from "./chatSessionRoutingFolderPicker.js";
import { parseExplicitNewSessionRequest, resolveMentionedWorkspaceFolder, resolveNewSessionWorkspaceFolder, resolveSessionWorkspaceFolder, ROUTE_ENRICH_MAX_CANDIDATES, selectBestSessionRoute, selectRouterShortlist } from "./chatSessionRoutingHelpers.js";
import "./media/chatSessionRouting.css";
const ROUTE_MAX_CHOICES = 6;
const ROUTE_AUTOSEND_DELAY_MS = 5e3;
function responsePreview(response) {
  const firstLine = response?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) {
    return void 0;
  }
  return firstLine;
}
function lowercaseFirstLetter(value) {
  return value.replace(/\p{L}/u, (letter) => letter.toLocaleLowerCase());
}
function renderCompletedResponse(labelElement, sessionLabel, preview) {
  const prefix = dom.$("span.chat-routing-badge-response-prefix");
  prefix.textContent = localize(
    "chatSessionRouting.completedWithResponse",
    "Completed {0}:",
    lowercaseFirstLetter(sessionLabel)
  );
  const rendered = renderMarkdown(new MarkdownString(preview));
  rendered.element.classList.add("chat-routing-badge-response-preview");
  labelElement.classList.add("chat-routing-badge-completed");
  labelElement.replaceChildren(prefix, rendered.element);
  return rendered;
}
function statusToString(status) {
  switch (status) {
    case AgentSessionStatus.Failed:
      return "failed";
    case AgentSessionStatus.Completed:
      return "idle";
    case AgentSessionStatus.InProgress:
      return "working";
    default:
      return "unknown";
  }
}
function isCopilotRoutingProvider(provider) {
  return provider === AgentSessionProviders.Background || provider === AgentSessionProviders.Cloud || provider === AgentSessionProviders.AgentHostCopilot;
}
function markdownToText(value) {
  if (!value) {
    return void 0;
  }
  const text = (typeof value === "string" ? value : value.value).trim();
  return text || void 0;
}
function historyResponseToText(item) {
  let text = "";
  for (const part of item.parts) {
    if (part.kind === "markdownContent") {
      text += part.content.value;
      if (text.length >= ROUTER_FIELD_CLIP_LENGTH * 2) {
        break;
      }
    }
  }
  text = text.trim();
  return text || void 0;
}
let ChatSessionRoutingController = class extends Disposable {
  constructor(host, debugOwner, chatService, agentSessionsService, chatSessionsService, sessionRouter, chatWidgetService, logService, workspaceContextService, newSessionFolderService, actionWidgetService, instantiationService) {
    super();
    this.host = host;
    this.debugOwner = debugOwner;
    this.chatService = chatService;
    this.agentSessionsService = agentSessionsService;
    this.chatSessionsService = chatSessionsService;
    this.sessionRouter = sessionRouter;
    this.chatWidgetService = chatWidgetService;
    this.logService = logService;
    this.workspaceContextService = workspaceContextService;
    this.newSessionFolderService = newSessionFolderService;
    this.actionWidgetService = actionWidgetService;
    this.instantiationService = instantiationService;
    /** Transient routing/review badge + auto-send timers; replaced/cleared per submission. */
    this._pendingSend = this._register(new MutableDisposable());
    /** Independently dismissible delivery rows that remain live across later submissions. */
    this._deliveryConfirmations = this._register(new DisposableMap());
    this._deliveryConfirmationId = 0;
    /** Cancellation for the in-flight submission; canceled when the host tears down. */
    this._submitCts = this._register(new MutableDisposable());
    this._submitDraftListeners = this._register(new MutableDisposable());
  }
  /**
   * Intercept a submission before local execution: score it against existing
   * sessions, resolve a pending target, and show the advisory badge. Always
   * returns `true` (handled) so the input-only widget never runs the request on
   * its own scratch session.
   */
  async handleSubmit(query, _mode, attachedContext, isVoiceModeInput) {
    const submittedUtterance = query.trim();
    if (!submittedUtterance) {
      return false;
    }
    const explicitNewSessionTask = parseExplicitNewSessionRequest(submittedUtterance);
    const utterance = explicitNewSessionTask ?? submittedUtterance;
    this._clearCompletedDeliveryConfirmations();
    this._submitCts.value?.cancel();
    this._submitDraftListeners.clear();
    this._pendingSend.clear();
    this._routingProvider = this.host.getRoutingProvider?.();
    this._workspaceCatalog = void 0;
    this._setSubmissionPhase("routing");
    ariaAlert(localize("chatSessionRouting.preparingRequest", "Preparing your request."));
    const cts = new CancellationTokenSource();
    this._submitCts.value = cts;
    const token = cts.token;
    const submittedAttachmentIds = this._attachmentIds();
    const draftListeners = new DisposableStore();
    const cancelForDraftChange = () => {
      cts.cancel();
      this.host.onDidRejectRoute?.(void 0, isVoiceModeInput);
      if (this._submitCts.value === cts) {
        this._pendingSend.clear();
        this._submitDraftListeners.clear();
        this._setSubmissionPhase("idle");
      }
    };
    draftListeners.add(this.host.widget.inputEditor.onDidChangeModelContent(cancelForDraftChange));
    draftListeners.add(this.host.widget.attachmentModel.onDidChange(cancelForDraftChange));
    this._submitDraftListeners.value = draftListeners;
    const requestOptions = {
      ...this.host.widget.getSelectedModelRequestOptions(),
      ...this.host.widget.getModeRequestOptions(),
      isVoiceModeInput,
      attachedContext: attachedContext?.length ? [...attachedContext] : void 0
    };
    if (explicitNewSessionTask) {
      this.host.onWillRoute?.();
      await this._refreshWorkspaceCatalog(token);
      if (token.isCancellationRequested) {
        return true;
      }
      const target = this._resolveNewSessionTarget(utterance, attachedContext, [], []);
      this._dispatchOrReviewNewSession(target, query, submittedAttachmentIds, utterance, requestOptions, cts);
      return true;
    }
    const followupResource = isVoiceModeInput ? this.host.getPendingReplySessionResource?.() : void 0;
    if (followupResource && followupResource.toString() !== this.host.getOwnSessionResource()?.toString()) {
      const followupTarget = {
        kind: "session",
        sessionId: followupResource.toString(),
        label: this.chatService.getSession(followupResource)?.title || localize("chatSessionRouting.currentSession", "Current session"),
        confidence: 1
      };
      this._dispatchImmediately(followupTarget, query, submittedAttachmentIds, utterance, requestOptions, cts);
      return true;
    }
    await this._routeToChat(query, submittedAttachmentIds, utterance, attachedContext, requestOptions, cts);
    return true;
  }
  async _routeToChat(query, submittedAttachmentIds, utterance, attachedContext, requestOptions, cts) {
    const token = cts.token;
    this._setSubmissionPhase("routing");
    ariaAlert(localize("chatSessionRouting.findingDestination", "Finding the best chat for your request."));
    this.host.onWillRoute?.();
    await this._refreshWorkspaceCatalog(token);
    if (token.isCancellationRequested) {
      return;
    }
    const folders = this._getRoutingFolders();
    const mentionedFolder = resolveMentionedWorkspaceFolder(utterance, folders);
    const collectedCandidates = await this._collectCandidateSessions(token);
    const candidates = mentionedFolder ? collectedCandidates.filter((candidate) => isEqual(resolveSessionWorkspaceFolder(candidate, folders)?.uri, mentionedFolder.uri)) : collectedCandidates;
    this.logService.info(
      `[chatSessionRouting] owner=${this.debugOwner} voice=${requestOptions.isVoiceModeInput === true} workspaceFolders=[${folders.map((folder) => folder.name).join(", ")}] mentionedFolder=${mentionedFolder?.name ?? "<none>"} candidates=${collectedCandidates.length} filteredCandidates=${candidates.length}`
    );
    if (token.isCancellationRequested) {
      return;
    }
    const preliminaryResults = candidates.length > ROUTE_ENRICH_MAX_CANDIDATES ? await this._route(candidates, utterance, token) : [];
    if (token.isCancellationRequested) {
      return;
    }
    const shortlist = selectRouterShortlist(candidates, preliminaryResults);
    const enriched = shortlist.length ? await this._enrichCandidates(shortlist, token) : [];
    if (token.isCancellationRequested) {
      return;
    }
    const results = enriched.length ? await this._route(enriched, utterance, token) : [];
    if (token.isCancellationRequested) {
      return;
    }
    this._setSubmissionPhase("awaitingChoice");
    const newSessionTarget = this._resolveNewSessionTarget(utterance, attachedContext, results, enriched);
    const target = this._resolveTarget(results, enriched, newSessionTarget);
    this.logService.info(
      `[chatSessionRouting] owner=${this.debugOwner} target=${target.kind} targetId=${target.kind === "session" ? target.sessionId : target.folder?.toString() ?? "<none>"} topConfidence=${results[0]?.confidence ?? "<none>"}`
    );
    const candidateIds = new Set(enriched.map((candidate) => candidate.sessionId));
    const hasSessionChoice = results.some((result) => candidateIds.has(result.sessionId) && isHighConfidenceSessionRoute(result));
    if (target.kind === "new" && !hasSessionChoice) {
      this._dispatchOrReviewNewSession(target, query, submittedAttachmentIds, utterance, requestOptions, cts);
      return;
    }
    this._beginPendingSend(target, newSessionTarget, results, enriched, query, submittedAttachmentIds, utterance, requestOptions, cts);
  }
  _dispatchOrReviewNewSession(target, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts) {
    if (!this._hasWorkspacePickerOptions()) {
      this._dispatchImmediately(target, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts);
      return;
    }
    this._setSubmissionPhase("awaitingChoice");
    this._beginPendingSend(target, target, [], [], submittedInput, submittedAttachmentIds, utterance, requestOptions, cts);
  }
  _dispatchImmediately(target, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts) {
    this._submitDraftListeners.clear();
    this._setSubmissionPhase("dispatching");
    void this._dispatchTo(target, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts.token).then((result) => {
      if (this._submitCts.value !== cts) {
        return;
      }
      this._setSubmissionPhase("idle");
      if ((result.status === "sent" || result.status === "queued") && result.resource) {
        this._showDeliveryConfirmation(target.label, result);
      } else {
        this._showDispatchFailure(target.label, result.reason);
      }
    });
  }
  /** Cancel any in-flight submission and remove the pending badge. */
  cancelPending() {
    this._cancelPending(true);
  }
  _cancelPending(resetSubmissionPhase) {
    this._submitCts.value?.cancel();
    this._submitCts.clear();
    this._submitDraftListeners.clear();
    this._pendingSend.clear();
    if (resetSubmissionPhase) {
      this._setSubmissionPhase("idle");
    }
  }
  _setSubmissionPhase(phase) {
    this.host.widget.input.setSubmitPending(phase !== "idle", phase === "routing" || phase === "dispatching");
  }
  /** Run the router, degrading to an empty ranking on failure/cancellation. */
  async _route(candidates, utterance, token) {
    try {
      const results = await this.sessionRouter.route({ utterance, sessions: candidates }, token);
      const lexicalTieBreak = new Map(heuristicScore({ utterance, sessions: candidates }).map((result) => [result.sessionId, result.confidence]));
      return [...results].sort((a, b) => b.confidence - a.confidence || (lexicalTieBreak.get(b.sessionId) ?? 0) - (lexicalTieBreak.get(a.sessionId) ?? 0));
    } catch (err) {
      if (!token.isCancellationRequested) {
        this.logService.warn("[chatSessionRouting] session routing failed:", err);
      }
      return [];
    }
  }
  /**
   * Pick the single pending target the badge pre-selects: the top match if it
   * clears the confidence threshold, otherwise a brand-new session.
   */
  _resolveTarget(results, candidates, newSessionTarget) {
    const labelById = new Map(candidates.map((c) => [c.sessionId, c.label]));
    const chosen = selectBestSessionRoute(results);
    if (!chosen) {
      return newSessionTarget;
    }
    return {
      kind: "session",
      sessionId: chosen.sessionId,
      label: labelById.get(chosen.sessionId) ?? chosen.sessionId,
      confidence: chosen.confidence
    };
  }
  /**
   * Snapshot the current routing candidates. Provider-backed hosts own their
   * catalog and filtering. Other hosts retain the renderer-local agent session
   * catalog and exclude the host's scratch session and local chats.
   */
  async _collectCandidateSessions(token) {
    this._routingProvider = this.host.getRoutingProvider?.();
    if (this._routingProvider) {
      try {
        const candidates = await this._routingProvider.getCandidateSessions(token);
        if (token.isCancellationRequested) {
          return [];
        }
        const accepted = /* @__PURE__ */ new Map();
        for (const candidate of [...candidates].sort((a, b) => a.sessionId.localeCompare(b.sessionId))) {
          if (!accepted.has(candidate.sessionId)) {
            accepted.set(candidate.sessionId, candidate);
          }
        }
        return [...accepted.values()];
      } catch (error) {
        if (!token.isCancellationRequested) {
          this.logService.warn("[chatSessionRouting] collecting provider sessions failed:", error);
        }
        return [];
      }
    }
    try {
      await this.agentSessionsService.model.resolve(void 0);
    } catch (err) {
      this.logService.warn("[chatSessionRouting] resolving agent sessions failed:", err);
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const ownResource = this.host.getOwnSessionResource()?.toString();
    return this.agentSessionsService.model.sessions.filter((session) => session.resource.toString() !== ownResource && isCopilotRoutingProvider(session.providerType) && !session.isArchived() && this.chatSessionsService.getChatSessionContribution(getChatSessionType(session.resource))?.isReadOnly !== true).map((session) => this._toRoutableSession(session));
  }
  _toRoutableSession(session) {
    return {
      sessionId: session.resource.toString(),
      label: session.label,
      status: statusToString(session.status),
      lastActivity: session.timing?.lastRequestEnded ?? session.timing?.lastRequestStarted ?? session.timing?.created,
      description: markdownToText(session.description),
      repo: session.metadata?.repositoryPath,
      cwd: session.metadata?.workingDirectoryPath
    };
  }
  _resolveNewSessionTarget(utterance, attachedContext, results, candidates) {
    const folders = this._getRoutingFolders();
    const mentionedFolder = resolveMentionedWorkspaceFolder(utterance, folders);
    const attachmentFolder = this._folderFromAttachments(attachedContext, folders);
    const defaultWorkspace = this._workspaceCatalog?.defaultWorkspace;
    const inferredFolderUri = resolveNewSessionWorkspaceFolder(
      utterance,
      folders,
      results,
      candidates,
      defaultWorkspace?.uri ?? this.newSessionFolderService.getDefaultFolder()
    );
    const selectedFolder = mentionedFolder ?? attachmentFolder ?? this._findRoutingFolder(inferredFolderUri, defaultWorkspace?.providerId);
    const folder = selectedFolder?.uri ?? inferredFolderUri;
    this.logService.info(
      `[chatSessionRouting] owner=${this.debugOwner} newSessionFolder=${folder?.toString() ?? "<none>"} providerId=${selectedFolder?.providerId ?? "<none>"} source=${mentionedFolder ? "mention" : attachmentFolder ? "attachment" : "inferred"}`
    );
    return {
      kind: "new",
      label: folder ? localize("chatSessionRouting.newSessionInFolder", "New session in {0}", selectedFolder?.name ?? this.workspaceContextService.getWorkspaceFolder(folder)?.name ?? basename(folder)) : localize("chatSessionRouting.newSession", "New session"),
      folder,
      providerId: selectedFolder?.providerId
    };
  }
  _folderFromAttachments(attachedContext, folders) {
    for (const attachment of attachedContext ?? []) {
      const resource = IChatRequestVariableEntry.toUri(attachment);
      const folder = resource && folders.filter((candidate) => isEqualOrParent(resource, candidate.uri)).sort((a, b) => b.uri.path.length - a.uri.path.length)[0];
      if (folder) {
        return folder;
      }
    }
    return void 0;
  }
  async _refreshWorkspaceCatalog(token) {
    const provider = this._routingProvider ?? this.host.getRoutingProvider?.();
    this._routingProvider = provider;
    if (!provider?.getNewSessionWorkspaceCatalog) {
      this._workspaceCatalog = void 0;
      return void 0;
    }
    try {
      const catalog = await provider.getNewSessionWorkspaceCatalog();
      if (!token.isCancellationRequested) {
        this._workspaceCatalog = catalog;
      }
      return token.isCancellationRequested ? void 0 : catalog;
    } catch (error) {
      if (!token.isCancellationRequested) {
        this.logService.warn("[chatSessionRouting] Failed to load new-session workspaces", error);
        this._workspaceCatalog = void 0;
      }
      return void 0;
    }
  }
  _getRoutingFolders() {
    const folders = [];
    const add = (folder) => {
      if (!folders.some((candidate) => isEqual(candidate.uri, folder.uri) && candidate.providerId === folder.providerId)) {
        folders.push(folder);
      }
    };
    for (const workspace of this._workspaceCatalog?.workspaces ?? []) {
      add({
        uri: workspace.uri,
        name: workspace.label,
        aliases: workspace.description ? [workspace.description] : void 0,
        providerId: workspace.providerId,
        workspace
      });
    }
    const defaultWorkspace = this._workspaceCatalog?.defaultWorkspace;
    if (defaultWorkspace) {
      add({
        uri: defaultWorkspace.uri,
        name: defaultWorkspace.label,
        aliases: defaultWorkspace.description ? [defaultWorkspace.description] : void 0,
        providerId: defaultWorkspace.providerId,
        workspace: defaultWorkspace
      });
    }
    for (const folder of this.workspaceContextService.getWorkspace().folders) {
      add(folder);
    }
    return folders;
  }
  _findRoutingFolder(folderUri, preferredProviderId) {
    if (!folderUri) {
      return void 0;
    }
    const folders = this._getRoutingFolders().filter((folder) => isEqual(folder.uri, folderUri));
    return folders.find((folder) => folder.providerId === preferredProviderId) ?? folders[0];
  }
  _hasWorkspacePickerOptions() {
    if (this._workspaceCatalog) {
      return this._workspaceCatalog.workspaces.length > 0 || this._workspaceCatalog.browseActions.length > 0;
    }
    return this.workspaceContextService.getWorkspace().folders.length > 1;
  }
  /**
   * Enrich the shortlisted candidates with conversation content (first
   * request, most recent request, and a truncated most recent response) so the
   * final score can match on what a session is actually about rather than just
   * its title. Each fetch degrades independently: a session whose content can't
   * be resolved is kept as-is on its metadata.
   */
  async _enrichCandidates(candidates, token) {
    return Promise.all(candidates.map((candidate) => this._enrichCandidate(candidate, token)));
  }
  async _enrichCandidate(candidate, token) {
    if (this._routingProvider) {
      return candidate;
    }
    let resource;
    try {
      resource = URI.parse(candidate.sessionId);
    } catch {
      return candidate;
    }
    try {
      const history = await this.chatSessionsService.getChatSessionHistory?.(resource, token);
      if (token.isCancellationRequested) {
        return candidate;
      }
      return history ? this._applyHistory(candidate, history) : candidate;
    } catch (err) {
      if (!token.isCancellationRequested) {
        this.logService.trace("[chatSessionRouting] enriching candidate failed, using metadata only:", candidate.sessionId, err);
      }
      return candidate;
    }
  }
  /** Fold the first/most-recent request and most-recent response into a candidate. */
  _applyHistory(candidate, history) {
    let firstRequest;
    let lastRequest;
    let lastResponse;
    for (const item of history) {
      if (item.type === "request") {
        const prompt = item.prompt.trim();
        if (prompt) {
          firstRequest ??= prompt;
          lastRequest = prompt;
        }
      } else {
        const text = historyResponseToText(item);
        if (text) {
          lastResponse = text;
        }
      }
    }
    if (!firstRequest && !lastRequest && !lastResponse) {
      return candidate;
    }
    return { ...candidate, firstRequest, lastRequest, lastResponse };
  }
  /**
   * Show the advisory destination picker. The selected destination counts down
   * and auto-sends unless the user begins changing the selection.
   */
  _beginPendingSend(target, newSessionTarget, results, candidates, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts) {
    const badge = dom.$(".chat-routing-badge");
    this.host.placeBadge(badge);
    if (!badge.parentElement) {
      this.logService.warn("[chatSessionRouting] no surface available for destination review; preserving draft");
      cts.cancel();
      this.host.onDidRejectRoute?.(void 0, requestOptions.isVoiceModeInput);
      this._submitDraftListeners.clear();
      this._setSubmissionPhase("idle");
      return;
    }
    const store = new DisposableStore();
    store.add(toDisposable(() => badge.remove()));
    store.add(toDisposable(() => {
      if (this._submitCts.value === cts) {
        this._submitDraftListeners.clear();
      }
    }));
    this._pendingSend.value = store;
    this._renderCountdownBadge(badge, store, target, newSessionTarget, results, candidates, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts);
  }
  /**
   * Confident-match badge: names the routed session and counts down, then
   * auto-sends. The user can select another destination, choose several,
   * abort, or keep typing to cancel before it fires.
   */
  _renderCountdownBadge(badge, store, target, newSessionTarget, results, candidates, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts) {
    const targetWindow = dom.getWindow(badge);
    const routeAutosendDelay = ROUTE_AUTOSEND_DELAY_MS;
    badge.classList.add("chat-routing-badge-ranked");
    const labelById = new Map(candidates.map((candidate) => [candidate.sessionId, candidate.label]));
    const ranked = results.filter((result) => labelById.has(result.sessionId) && isHighConfidenceSessionRoute(result)).sort((a, b) => b.confidence - a.confidence).slice(0, ROUTE_MAX_CHOICES).map((result) => ({
      kind: "session",
      sessionId: result.sessionId,
      label: labelById.get(result.sessionId) ?? result.sessionId,
      confidence: result.confidence
    }));
    const options = [
      ...ranked,
      newSessionTarget
    ];
    const preselected = Math.max(0, options.findIndex((option) => target.kind === "session" ? option.kind === "session" && option.sessionId === target.sessionId : option.kind === "new"));
    const selection = /* @__PURE__ */ new Set([preselected]);
    const head = dom.append(badge, dom.$(".chat-routing-badge-head"));
    const headLabel = dom.append(head, dom.$("span.chat-routing-badge-title"));
    const countdownEl = dom.append(head, dom.$("span.chat-routing-badge-countdown"));
    const list = dom.append(badge, dom.$(".chat-routing-badge-list", { role: "listbox", "aria-label": localize("chatSessionRouting.sendTo", "Send to"), "aria-multiselectable": "true" }));
    let folderPicker;
    let disposed = false;
    let focusedIndex = preselected;
    const rows = options.map((option, index) => {
      const row = dom.append(list, dom.$(".chat-routing-badge-row", { role: "option", tabindex: "0" }));
      const mark = dom.append(row, dom.$("span.chat-routing-badge-mark"));
      mark.appendChild(renderIcon(Codicon.pass));
      const label = dom.append(row, dom.$("span.chat-routing-badge-name"));
      label.textContent = option.label;
      const score = dom.append(row, dom.$("span.chat-routing-badge-score"));
      score.textContent = option.kind === "session" ? index === 0 ? localize("chatSessionRouting.bestMatchSessionModel", "Best Match \xB7 Session model") : localize("chatSessionRouting.highConfidenceSessionModel", "High Confidence \xB7 Session model") : requestOptions.userSelectedModelId ? this.host.getSelectedModelLabel?.() ?? requestOptions.userSelectedModelId : "";
      if (option.kind === "new" && this._hasWorkspacePickerOptions()) {
        const selectedFolderName = option.folder ? this._findRoutingFolder(option.folder, option.providerId)?.name ?? this.workspaceContextService.getWorkspaceFolder(option.folder)?.name ?? basename(option.folder) : void 0;
        folderPicker = store.add(new ChatSessionRoutingFolderPicker(
          row,
          this.host,
          { uri: option.folder, providerId: option.providerId, label: selectedFolderName },
          this.actionWidgetService,
          this.workspaceContextService,
          this.logService,
          this.instantiationService
        ));
        store.add(dom.addDisposableListener(folderPicker.element, dom.EventType.CLICK, async (event) => {
          event.preventDefault();
          event.stopPropagation();
          selection.clear();
          selection.add(index);
          renderSelection();
          countdownTimer.clear();
          countdownEl.textContent = localize("chatSessionRouting.waiting", "waiting for you");
          const selected = await folderPicker.pick({
            provider: this._routingProvider,
            getCatalog: (token) => this._refreshWorkspaceCatalog(token),
            token: cts.token
          });
          if (selected && !disposed && !cts.token.isCancellationRequested && !didDispatch && options[index].kind === "new") {
            const name = selected.label ?? basename(selected.uri);
            const updatedTarget = {
              kind: "new",
              label: localize("chatSessionRouting.newSessionInFolder", "New session in {0}", name),
              folder: selected.uri,
              providerId: selected.providerId
            };
            options[index] = updatedTarget;
            label.textContent = updatedTarget.label;
            folderPicker.setTarget(selected);
            ariaAlert(localize("chatSessionRouting.targetFolderChanged", "New session will use folder {0}.", name));
          }
          if (!disposed && !cts.token.isCancellationRequested && !didDispatch) {
            startCountdown();
          }
        }));
      }
      store.add(dom.addDisposableListener(row, dom.EventType.CLICK, (event) => {
        focusedIndex = index;
        if (event.ctrlKey || event.metaKey) {
          if (selection.has(index) && selection.size > 1) {
            selection.delete(index);
          } else {
            selection.add(index);
          }
          countdownTimer.clear();
          countdownEl.textContent = localize("chatSessionRouting.waiting", "waiting for you");
          renderSelection();
          return;
        }
        selection.clear();
        selection.add(index);
        renderSelection();
        send();
      }));
      return row;
    });
    const foot = dom.append(badge, dom.$(".chat-routing-badge-foot"));
    const changeHint = dom.append(foot, dom.$("span"));
    changeHint.textContent = localize("chatSessionRouting.changeHint", "Tab to choose \xB7 Arrow keys move \xB7 Space selects several \xB7 Escape cancels");
    const sendHint = dom.append(foot, dom.$("span.chat-routing-badge-foot-end"));
    const renderSelection = () => {
      rows.forEach((row, index) => {
        const selected = selection.has(index);
        row.classList.toggle("selected", selected);
        row.setAttribute("aria-selected", String(selected));
        row.tabIndex = focusedIndex === index ? 0 : -1;
      });
      list.classList.toggle("multiple", selection.size > 1);
      headLabel.textContent = selection.size > 1 ? localize("chatSessionRouting.sendToMany", "Send to {0} sessions", selection.size) : localize("chatSessionRouting.sendTo", "Send to");
      sendHint.textContent = selection.size > 1 ? localize("chatSessionRouting.sendAllHint", "Enter to send to all") : localize("chatSessionRouting.sendNowHint", "Enter to send now");
    };
    renderSelection();
    const initialTarget = options[preselected];
    ariaAlert(initialTarget.kind === "session" ? localize("chatSessionRouting.sendingToIn", "Sending to {0} in {1} seconds. Press Escape to cancel.", initialTarget.label, Math.ceil(routeAutosendDelay / 1e3)) : localize("chatSessionRouting.confirmNewSession", "No confident match. Choose a destination before sending."));
    let remainingSeconds = Math.ceil(routeAutosendDelay / 1e3);
    const renderCountdown = () => {
      countdownEl.textContent = localize("chatSessionRouting.sendingIn", "sending in {0}s", remainingSeconds);
    };
    let didDispatch = false;
    const send = () => {
      if (didDispatch) {
        return;
      }
      didDispatch = true;
      countdownTimer.clear();
      this._submitDraftListeners.clear();
      this._setSubmissionPhase("dispatching");
      badge.classList.remove("chat-routing-badge-ranked");
      badge.replaceChildren();
      const progress = dom.append(badge, dom.$("span.chat-routing-badge-sent-mark"));
      progress.appendChild(renderIcon(Codicon.loading));
      const progressLabel = dom.append(badge, dom.$("span.chat-routing-badge-label"));
      progressLabel.textContent = localize("chatSessionRouting.dispatching", "Sending request\u2026");
      const sent = [...selection].sort((a, b) => a - b).map((index) => options[index]);
      if (!sent.length) {
        this.host.onDidRejectRoute?.(void 0, requestOptions.isVoiceModeInput);
        this._setSubmissionPhase("idle");
        return;
      }
      if (sent.length > 1) {
        this.host.onDidResolveRoute?.(void 0, void 0, requestOptions.isVoiceModeInput);
      }
      const dispatches = sent.map(
        (selected) => this._dispatchTo(selected, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts.token, sent.length === 1)
      );
      if (sent.length > 1) {
        void Promise.all(dispatches).then((results2) => {
          if (this._submitCts.value === cts) {
            this._setSubmissionPhase("idle");
            this._showFanoutOutcomes(sent, results2);
          }
        });
        return;
      }
      void dispatches[0].then((result) => {
        if (this._submitCts.value !== cts) {
          return;
        }
        this._setSubmissionPhase("idle");
        const selected = sent[0];
        if ((result.status === "sent" || result.status === "queued") && result.resource) {
          this._showDeliveryConfirmation(selected.label, result);
        } else {
          this._showDispatchFailure(selected.label, result.reason);
        }
      });
    };
    const countdownTimer = store.add(new MutableDisposable());
    const startCountdown = () => {
      renderCountdown();
      const handle = targetWindow.setInterval(() => {
        remainingSeconds--;
        if (remainingSeconds <= 0) {
          send();
          return;
        }
        renderCountdown();
      }, 1e3);
      countdownTimer.value = toDisposable(() => targetWindow.clearInterval(handle));
    };
    const cancel = () => {
      cts.cancel();
      this.host.onDidRejectRoute?.(void 0, requestOptions.isVoiceModeInput);
      this._pendingSend.clear();
      this._setSubmissionPhase("idle");
    };
    store.add(dom.addDisposableListener(targetWindow, dom.EventType.KEY_DOWN, (event) => {
      if (folderPicker?.isActive || dom.isHTMLElement(event.target) && event.target.classList.contains("chat-routing-badge-folder-action")) {
        return;
      }
      const keyboardEvent = new StandardKeyboardEvent(event);
      if (keyboardEvent.equals(KeyCode.Escape)) {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        cancel();
        return;
      }
      const isRoutingInteraction = dom.isHTMLElement(event.target) && badge.contains(event.target);
      const isListInteraction = isRoutingInteraction && !!event.target.closest(".chat-routing-badge-row");
      if (isListInteraction && (keyboardEvent.equals(KeyCode.UpArrow) || keyboardEvent.equals(KeyCode.DownArrow) || keyboardEvent.equals(KeyCode.Home) || keyboardEvent.equals(KeyCode.End))) {
        keyboardEvent.preventDefault();
        if (keyboardEvent.equals(KeyCode.Home)) {
          focusedIndex = 0;
        } else if (keyboardEvent.equals(KeyCode.End)) {
          focusedIndex = rows.length - 1;
        } else {
          const delta = keyboardEvent.equals(KeyCode.UpArrow) ? -1 : 1;
          focusedIndex = (focusedIndex + delta + rows.length) % rows.length;
        }
        renderSelection();
        rows[focusedIndex].focus();
        countdownTimer.clear();
        countdownEl.textContent = localize("chatSessionRouting.waiting", "waiting for you");
      } else if (isListInteraction && keyboardEvent.equals(KeyCode.Space)) {
        keyboardEvent.preventDefault();
        if (selection.has(focusedIndex) && selection.size > 1) {
          selection.delete(focusedIndex);
        } else {
          selection.add(focusedIndex);
        }
        renderSelection();
        countdownTimer.clear();
        countdownEl.textContent = localize("chatSessionRouting.waiting", "waiting for you");
      } else if (isListInteraction && keyboardEvent.equals(KeyCode.Enter)) {
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        send();
      }
    }, true));
    store.add(toDisposable(() => {
      disposed = true;
    }));
    startCountdown();
  }
  _showDeliveryConfirmation(label, result) {
    const resource = result.resource;
    if (!resource) {
      this._showDispatchFailure(label);
      return;
    }
    this._pendingSend.clear();
    const badge = dom.$(".chat-routing-badge");
    const mark = dom.append(badge, dom.$("span.chat-routing-badge-sent-mark"));
    mark.appendChild(renderIcon(result.status === "queued" ? Codicon.clock : Codicon.pass));
    const labelEl = dom.append(badge, dom.$("span.chat-routing-badge-label"));
    labelEl.textContent = result.status === "queued" ? localize("chatSessionRouting.queuedFor", "Queued for {0}", label) : localize("chatSessionRouting.sentTo", "Sent to {0}", label);
    this.host.placeBadge(badge);
    if (!badge.parentElement) {
      return;
    }
    const deliveryId = ++this._deliveryConfirmationId;
    const store = new DisposableStore();
    store.add(toDisposable(() => badge.remove()));
    const delivery = {
      completed: false,
      dispose: () => store.dispose()
    };
    const reveal = result.reveal ?? (() => this.chatWidgetService.openSession(resource));
    this._addActionLink(store, badge, localize("chatSessionRouting.open", "Open"), () => void reveal());
    this._addActionLink(store, badge, localize("chatSessionRouting.dismiss", "Dismiss"), () => {
      this.host.onDidDismissRoute?.(resource, result.requestId);
      this._deliveryConfirmations.deleteAndDispose(deliveryId);
    });
    this._deliveryConfirmations.set(deliveryId, delivery);
    const announcement = result.status === "queued" ? localize("chatSessionRouting.queuedFor", "Queued for {0}", label) : localize("chatSessionRouting.sentTo", "Sent to {0}", label);
    ariaAlert(announcement);
    let trackingActivity = false;
    const trackActivity = () => {
      if (!trackingActivity) {
        trackingActivity = true;
        this._trackDeliveryActivity(store, resource, label, mark, labelEl, result.status === "queued", result.activityBaseline, (completed) => delivery.completed = completed);
      }
    };
    const routingProvider = this._routingProvider ?? this.host.getRoutingProvider?.();
    if (!result.reveal || routingProvider?.getSessionSnapshot) {
      trackActivity();
    }
    if (result.completion) {
      void result.completion.then((completion) => {
        if (this._deliveryConfirmations.get(deliveryId) !== delivery) {
          return;
        }
        if (completion.status === "sent") {
          mark.replaceChildren(renderIcon(Codicon.pass));
          labelEl.textContent = localize("chatSessionRouting.sentTo", "Sent to {0}", label);
          ariaAlert(labelEl.textContent);
          trackActivity();
        } else {
          mark.replaceChildren(renderIcon(completion.reasonCode === "providerRemoved" ? Codicon.circleSlash : Codicon.error));
          labelEl.textContent = completion.reasonCode === "providerRemoved" ? localize("chatSessionRouting.noLongerQueued", "Request is no longer queued for {0}", label) : completion.reasonCode === "cancelled" ? localize("chatSessionRouting.queueCancelled", "Queued request to {0} was cancelled", label) : localize("chatSessionRouting.queuedNotSent", "Queued request to {0} was not sent", label);
          ariaAlert(labelEl.textContent);
        }
      });
    }
  }
  _clearCompletedDeliveryConfirmations() {
    for (const deliveryId of [...this._deliveryConfirmations.keys()]) {
      if (this._deliveryConfirmations.get(deliveryId)?.completed) {
        this._deliveryConfirmations.deleteAndDispose(deliveryId);
      }
    }
  }
  _trackDeliveryActivity(store, resource, label, mark, labelElement, waitForActivity, activityBaseline, setCompleted) {
    const routingProvider = this._routingProvider ?? this.host.getRoutingProvider?.();
    if (routingProvider?.getSessionSnapshot) {
      this._trackProviderDeliveryActivity(store, routingProvider, resource, label, mark, labelElement, activityBaseline, setCompleted);
      return;
    }
    const model = this.chatService.getSession(resource);
    const renderedPreview = store.add(new MutableDisposable());
    let lastAnnouncement = labelElement.textContent;
    let observedActivity = !waitForActivity;
    const update = (requestInProgress = model?.requestInProgress.get() ?? false, needsInput = !!model?.requestNeedsInput.get()) => {
      const session = this.agentSessionsService.model.getSession(resource);
      const sessionLabel = session?.label || label;
      const sessionStatus = session?.status;
      let icon = waitForActivity && !observedActivity ? Codicon.clock : Codicon.pass;
      let statusLabel = localize("chatSessionRouting.sentTo", "Sent to {0}", sessionLabel);
      let isCompleted = false;
      if (needsInput || sessionStatus === AgentSessionStatus.NeedsInput) {
        observedActivity = true;
        icon = Codicon.question;
        statusLabel = localize("chatSessionRouting.needsInputIn", "{0} needs your input", sessionLabel);
      } else if (requestInProgress || sessionStatus === AgentSessionStatus.InProgress) {
        observedActivity = true;
        icon = Codicon.loading;
        statusLabel = localize("chatSessionRouting.inProgress", "In progress: {0}", sessionLabel);
      } else if (sessionStatus === AgentSessionStatus.Failed) {
        observedActivity = true;
        icon = Codicon.error;
        statusLabel = localize("chatSessionRouting.failedIn", "Failed in {0}", sessionLabel);
      } else if (observedActivity && (sessionStatus === AgentSessionStatus.Completed || model?.hasRequests)) {
        statusLabel = localize("chatSessionRouting.completed", "Completed {0}", lowercaseFirstLetter(sessionLabel));
        isCompleted = true;
      }
      setCompleted(isCompleted);
      const response = model?.lastRequest?.response;
      const preview = isCompleted && response?.isComplete ? responsePreview(response.response.getMarkdown()) : void 0;
      if (preview) {
        renderedPreview.value = renderCompletedResponse(labelElement, sessionLabel, preview);
      } else {
        renderedPreview.clear();
        labelElement.classList.remove("chat-routing-badge-completed");
        labelElement.textContent = statusLabel;
      }
      mark.replaceChildren(renderIcon(icon));
      if (statusLabel !== lastAnnouncement) {
        lastAnnouncement = statusLabel;
        ariaAlert(lastAnnouncement);
      }
    };
    if (model) {
      store.add(autorun((reader) => update(model.requestInProgress.read(reader), !!model.requestNeedsInput.read(reader))));
      if (model.lastRequest?.response) {
        store.add(model.lastRequest.response.onDidChange(() => update()));
      }
    } else {
      update();
    }
    store.add(this.agentSessionsService.model.onDidChangeSessions(() => update()));
  }
  _trackProviderDeliveryActivity(store, provider, resource, label, mark, labelElement, activityBaseline, setCompleted) {
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    const renderedPreview = store.add(new MutableDisposable());
    let updateSequence = 0;
    let previous;
    let observedActivity = false;
    let lastAnnouncement = labelElement.textContent;
    const update = async () => {
      const sequence = ++updateSequence;
      let session;
      try {
        session = await provider.getSessionSnapshot(resource, cts.token);
      } catch (error) {
        if (!cts.token.isCancellationRequested) {
          this.logService.warn("[chatSessionRouting] tracking provider delivery failed:", error);
        }
        return;
      }
      if (cts.token.isCancellationRequested || sequence !== updateSequence || !session) {
        return;
      }
      const changedSincePrevious = previous !== void 0 && (session.label !== previous.label || session.status !== previous.status || session.lastActivity !== previous.lastActivity || session.lastResponse !== previous.lastResponse);
      observedActivity = observedActivity || changedSincePrevious || session.label !== label || activityBaseline !== void 0 && session.lastActivity !== activityBaseline || session.status === "working" || session.status === "needsInput" || session.status === "failed";
      previous = session;
      let icon = Codicon.pass;
      let statusLabel = localize("chatSessionRouting.sentTo", "Sent to {0}", session.label);
      let isCompleted = false;
      if (session.status === "needsInput") {
        icon = Codicon.question;
        statusLabel = localize("chatSessionRouting.needsInputIn", "{0} needs your input", session.label);
      } else if (session.status === "working") {
        icon = Codicon.loading;
        statusLabel = localize("chatSessionRouting.inProgress", "In progress: {0}", session.label);
      } else if (session.status === "failed") {
        icon = Codicon.error;
        statusLabel = localize("chatSessionRouting.failedIn", "Failed in {0}", session.label);
      } else if (observedActivity && session.status === "idle") {
        statusLabel = localize("chatSessionRouting.completed", "Completed {0}", lowercaseFirstLetter(session.label));
        isCompleted = true;
      }
      setCompleted(isCompleted);
      const preview = isCompleted ? responsePreview(session.lastResponse) : void 0;
      if (preview) {
        renderedPreview.value = renderCompletedResponse(labelElement, session.label, preview);
      } else {
        renderedPreview.clear();
        labelElement.classList.remove("chat-routing-badge-completed");
        labelElement.textContent = statusLabel;
      }
      mark.replaceChildren(renderIcon(icon));
      if (statusLabel !== lastAnnouncement) {
        lastAnnouncement = statusLabel;
        ariaAlert(lastAnnouncement);
      }
    };
    void update();
    if (provider.watchSession) {
      store.add(provider.watchSession(resource, () => void update()));
    } else if (provider.onDidChangeSessions) {
      store.add(provider.onDidChangeSessions(() => void update()));
    }
  }
  _showFanoutOutcomes(targets, results) {
    const badge = dom.$(".chat-routing-badge");
    badge.classList.add("chat-routing-badge-outcomes");
    const store = new DisposableStore();
    store.add(toDisposable(() => badge.remove()));
    const heading = dom.append(badge, dom.$("span.chat-routing-badge-label"));
    heading.textContent = localize("chatSessionRouting.deliveryResults", "Delivery results");
    const list = dom.append(badge, dom.$(".chat-routing-outcome-list"));
    results.forEach((result, index) => {
      const target = targets[index];
      const row = dom.append(list, dom.$(".chat-routing-outcome-row"));
      const icon = dom.append(row, dom.$("span.chat-routing-badge-sent-mark"));
      icon.appendChild(renderIcon(result.status === "rejected" ? Codicon.error : result.status === "queued" ? Codicon.clock : Codicon.pass));
      const text = dom.append(row, dom.$("span.chat-routing-badge-label"));
      text.textContent = result.status === "rejected" ? localize("chatSessionRouting.targetFailed", "{0}: failed", target.label) : result.status === "queued" ? localize("chatSessionRouting.targetQueued", "{0}: queued", target.label) : localize("chatSessionRouting.targetSent", "{0}: sent", target.label);
      const resource = result.resource;
      if (resource) {
        const reveal = result.reveal ?? (() => this.chatWidgetService.openSession(resource));
        this._addActionLink(store, row, localize("chatSessionRouting.open", "Open"), () => void reveal());
      }
      if (result.completion) {
        void result.completion.then((completion) => {
          icon.replaceChildren(renderIcon(completion.status === "sent" ? Codicon.pass : completion.reasonCode === "providerRemoved" ? Codicon.circleSlash : Codicon.error));
          text.textContent = completion.status === "sent" ? localize("chatSessionRouting.targetSent", "{0}: sent", target.label) : completion.reasonCode === "providerRemoved" ? localize("chatSessionRouting.targetNoLongerQueued", "{0}: no longer queued", target.label) : completion.reasonCode === "cancelled" ? localize("chatSessionRouting.targetCancelled", "{0}: cancelled", target.label) : localize("chatSessionRouting.targetFailed", "{0}: failed", target.label);
        });
      }
    });
    this.host.placeBadge(badge);
    if (!badge.parentElement) {
      return;
    }
    this._addActionLink(store, badge, localize("chatSessionRouting.dismiss", "Dismiss"), () => this._pendingSend.clear());
    this._pendingSend.value = store;
    const sent = results.filter((result) => result.status === "sent").length;
    const queued = results.filter((result) => result.status === "queued").length;
    const failed = results.length - sent - queued;
    ariaAlert(localize("chatSessionRouting.fanoutResult", "{0} sent, {1} queued, {2} failed.", sent, queued, failed));
  }
  _showDispatchFailure(label, reason) {
    const badge = dom.$(".chat-routing-badge");
    const mark = dom.append(badge, dom.$("span.chat-routing-badge-sent-mark"));
    mark.appendChild(renderIcon(Codicon.error));
    const message = dom.append(badge, dom.$("span.chat-routing-badge-label"));
    message.textContent = label && reason ? localize("chatSessionRouting.sendFailedToWithReason", "Could not send to {0}: {1} Your draft was preserved.", label, reason) : label ? localize("chatSessionRouting.sendFailedTo", "Could not send to {0}. Your draft was preserved.", label) : localize("chatSessionRouting.sendFailed", "Could not send the request. Your draft was preserved.");
    this.host.placeBadge(badge);
    if (!badge.parentElement) {
      return;
    }
    const store = new DisposableStore();
    store.add(toDisposable(() => badge.remove()));
    this._addActionLink(store, badge, localize("chatSessionRouting.dismiss", "Dismiss"), () => this._pendingSend.clear());
    this._pendingSend.value = store;
    ariaAlert(message.textContent);
  }
  /** Append an accessible link-style action to the badge. */
  _addActionLink(store, badge, text, run) {
    const el = dom.append(badge, dom.$("a.chat-routing-badge-action", { role: "button", tabindex: "0" }));
    el.textContent = text;
    store.add(dom.addDisposableListener(el, dom.EventType.CLICK, run));
    store.add(dom.addStandardDisposableListener(el, dom.EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
        e.preventDefault();
        run();
      }
    }));
    return el;
  }
  /** Dispatch a resolved pending target. */
  async _dispatchTo(target, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute = true) {
    if (target.kind === "new") {
      return this._dispatchToNewSession(submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute, target);
    }
    return this._dispatchToSession(target.sessionId, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute);
  }
  async _dispatchToSession(sessionId, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute) {
    const routingProvider = this._routingProvider ?? this.host.getRoutingProvider?.();
    if (routingProvider) {
      return this._dispatchToProviderSession(routingProvider, sessionId, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute);
    }
    let target;
    try {
      target = URI.parse(sessionId);
    } catch (err) {
      if (notifyRoute) {
        this.host.onDidRejectRoute?.(void 0, requestOptions.isVoiceModeInput);
      }
      this.logService.warn("[chatSessionRouting] invalid session id for routing:", sessionId, err);
      return { status: "rejected" };
    }
    try {
      const ref = await this.chatService.acquireOrLoadSession(target, ChatAgentLocation.Chat, token, `${this.debugOwner}-route`);
      if (token.isCancellationRequested) {
        ref?.dispose();
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(target, requestOptions.isVoiceModeInput);
        }
        return { status: "rejected" };
      }
      if (!ref) {
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(target, requestOptions.isVoiceModeInput);
        }
        this.logService.warn("[chatSessionRouting] could not load routed session:", sessionId);
        return { status: "rejected" };
      }
      let result;
      let requestId;
      let disposeReference = true;
      try {
        if (notifyRoute) {
          this.host.onWillDispatchRoute?.(target);
        }
        result = await this._sendRequest(target, utterance, {
          ...requestOptions,
          // Existing Agent Host queues retain their session model. Their
          // remote queue protocol has no per-request model override.
          userSelectedModelId: void 0,
          agentIdSilent: getChatSessionType(target),
          queue: ChatRequestQueueKind.Queued
        });
        if (result.status === "queued" && result.completion) {
          disposeReference = false;
          result = {
            ...result,
            completion: result.completion.finally(() => ref.dispose())
          };
        }
        requestId = result.requestId ?? (result.status === "sent" ? ref.object.lastRequest?.id : void 0);
      } finally {
        if (disposeReference) {
          ref.dispose();
        }
      }
      if (result.status === "rejected") {
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(target, requestOptions.isVoiceModeInput);
        }
        this.logService.warn("[chatSessionRouting] routed session rejected the request:", sessionId);
        return result;
      }
      if (notifyRoute && result.resource) {
        this.host.onDidResolveRoute?.(result.resource, "existing_session", requestOptions.isVoiceModeInput, requestId);
      }
      this._clearInputIfUnchanged(submittedInput, submittedAttachmentIds);
      return result;
    } catch (err) {
      if (notifyRoute) {
        this.host.onDidRejectRoute?.(target, requestOptions.isVoiceModeInput);
      }
      if (token.isCancellationRequested) {
        return { status: "rejected" };
      }
      this.logService.warn("[chatSessionRouting] error dispatching to routed session:", err);
      return { status: "rejected" };
    }
  }
  async _dispatchToProviderSession(routingProvider, sessionId, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute) {
    const target = routingProvider.resolveSessionResource(sessionId);
    try {
      if (notifyRoute && target) {
        this.host.onWillDispatchRoute?.(target);
      }
      const result = await routingProvider.dispatchToSession(sessionId, utterance, requestOptions, token);
      const resource = result.resource ?? target;
      if (result.status === "rejected" || !resource) {
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(resource, requestOptions.isVoiceModeInput);
        }
        return result.status === "rejected" ? result : { status: "rejected", reasonCode: "providerRemoved" };
      }
      const requestId = result.requestId ?? this.chatService.getSession(resource)?.lastRequest?.id;
      if (notifyRoute) {
        this.host.onDidResolveRoute?.(resource, "existing_session", requestOptions.isVoiceModeInput, requestId);
      }
      this._clearInputIfUnchanged(submittedInput, submittedAttachmentIds);
      return {
        ...result,
        resource,
        requestId,
        reveal: () => routingProvider.revealSession(resource)
      };
    } catch (error) {
      if (notifyRoute) {
        this.host.onDidRejectRoute?.(target, requestOptions.isVoiceModeInput);
      }
      if (!token.isCancellationRequested) {
        this.logService.warn("[chatSessionRouting] error dispatching to provider session:", error);
      }
      return { status: "rejected", resource: target, reasonCode: token.isCancellationRequested ? "cancelled" : void 0 };
    }
  }
  async _dispatchToNewSession(submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute, target) {
    const routingProvider = this._routingProvider ?? this.host.getRoutingProvider?.();
    if (routingProvider) {
      return this._dispatchToProviderNewSession(routingProvider, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute, target);
    }
    let routeResource;
    try {
      let folder = target?.folder;
      const sessionTarget = this.host.getNewSessionTarget?.() ?? AgentSessionProviders.Local;
      const ref = sessionTarget === AgentSessionProviders.Local ? this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: `${this.debugOwner}-new` }) : await this.chatService.acquireOrLoadSession(
        URI.from({ scheme: sessionTarget, path: `/untitled-${generateUuid()}` }),
        ChatAgentLocation.Chat,
        token,
        `${this.debugOwner}-new`
      );
      if (!ref) {
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(void 0, requestOptions.isVoiceModeInput);
        }
        this.logService.warn(`[chatSessionRouting] unable to create a new ${sessionTarget} session`);
        return { status: "rejected" };
      }
      routeResource = ref.object.sessionResource;
      if (token.isCancellationRequested) {
        ref.dispose();
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(routeResource, requestOptions.isVoiceModeInput);
        }
        return { status: "rejected" };
      }
      folder ??= this._resolveNewSessionTarget(utterance, requestOptions.attachedContext, [], []).folder;
      if (folder) {
        this.newSessionFolderService.setFolder(ref.object.sessionResource, folder);
      }
      let result;
      let requestId;
      try {
        if (notifyRoute) {
          this.host.onWillDispatchRoute?.(ref.object.sessionResource);
        }
        result = await this._sendRequest(ref.object.sessionResource, utterance, {
          ...requestOptions,
          agentIdSilent: sessionTarget === AgentSessionProviders.Local ? void 0 : sessionTarget
        });
        requestId = result.requestId ?? (result.status === "sent" ? ref.object.lastRequest?.id : void 0);
      } finally {
        ref.dispose();
      }
      if (result.status === "rejected") {
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(ref.object.sessionResource, requestOptions.isVoiceModeInput);
        }
        this.logService.warn("[chatSessionRouting] new session rejected the request");
        return result;
      }
      if (notifyRoute && result.resource) {
        this.host.onDidResolveRoute?.(result.resource, "new_session", requestOptions.isVoiceModeInput, requestId);
      }
      this._clearInputIfUnchanged(submittedInput, submittedAttachmentIds);
      return result;
    } catch (err) {
      if (notifyRoute) {
        this.host.onDidRejectRoute?.(routeResource, requestOptions.isVoiceModeInput);
      }
      if (token.isCancellationRequested) {
        return { status: "rejected" };
      }
      this.logService.warn("[chatSessionRouting] error starting a new session:", err);
      return { status: "rejected" };
    }
  }
  async _dispatchToProviderNewSession(routingProvider, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute, target) {
    try {
      const resolvedTarget = target ?? this._resolveNewSessionTarget(utterance, requestOptions.attachedContext, [], []);
      const result = await routingProvider.dispatchToNewSession({
        folder: resolvedTarget.folder,
        providerId: resolvedTarget.providerId
      }, utterance, requestOptions, token);
      const resource = result.resource;
      if (result.status === "rejected" || !resource) {
        if (notifyRoute) {
          this.host.onDidRejectRoute?.(resource, requestOptions.isVoiceModeInput);
        }
        return result.status === "rejected" ? result : { status: "rejected", reasonCode: "providerRemoved" };
      }
      const requestId = result.requestId ?? this.chatService.getSession(resource)?.lastRequest?.id;
      if (notifyRoute) {
        this.host.onDidResolveRoute?.(resource, "new_session", requestOptions.isVoiceModeInput, requestId);
      }
      this._clearInputIfUnchanged(submittedInput, submittedAttachmentIds);
      return {
        ...result,
        resource,
        requestId,
        reveal: () => routingProvider.revealSession(resource)
      };
    } catch (error) {
      if (notifyRoute) {
        this.host.onDidRejectRoute?.(void 0, requestOptions.isVoiceModeInput);
      }
      if (!token.isCancellationRequested) {
        this.logService.warn("[chatSessionRouting] error dispatching to provider new session:", error);
      }
      return { status: "rejected", reasonCode: token.isCancellationRequested ? "cancelled" : void 0 };
    }
  }
  async _sendRequest(resource, utterance, options) {
    const result = await this.chatService.sendRequest(resource, utterance, options);
    if (result.kind === "rejected") {
      return { status: "rejected", reason: result.reason, reasonCode: result.reasonCode };
    }
    if (result.kind === "queued") {
      return {
        status: "queued",
        resource,
        requestId: result.requestId,
        completion: this._resolveQueuedCompletion(resource, result.deferred)
      };
    }
    const response = await result.data.responseCreatedPromise;
    return { status: "sent", resource: result.newSessionResource ?? resource, requestId: response.requestId };
  }
  async _resolveQueuedCompletion(resource, deferred) {
    try {
      let result = await deferred;
      while (result.kind === "queued") {
        result = await result.deferred;
      }
      return result.kind === "sent" ? { status: "sent", resource: result.newSessionResource ?? resource } : { status: "rejected", resource: result.newSessionResource ?? resource, reason: result.reason, reasonCode: result.reasonCode };
    } catch (error) {
      this.logService.warn("[chatSessionRouting] queued request failed:", error);
      return { status: "rejected", resource, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  /**
   * Clear the input (and its explicit attachments) only if the editor still
   * holds exactly what was submitted, so a newer draft typed while the request
   * was in flight is preserved.
   */
  _attachmentIds() {
    return this.host.widget.attachmentModel.attachments.map((attachment) => attachment.id);
  }
  _clearInputIfUnchanged(submittedInput, submittedAttachmentIds) {
    const editor = this.host.widget.inputEditor;
    const currentAttachmentIds = this._attachmentIds();
    const attachmentsUnchanged = currentAttachmentIds.length === submittedAttachmentIds.length && currentAttachmentIds.every((id, index) => id === submittedAttachmentIds[index]);
    if (editor.getValue() === submittedInput && attachmentsUnchanged) {
      this._submitDraftListeners.clear();
      editor.setValue("");
      this.host.widget.attachmentModel.clear();
    }
  }
  dispose() {
    this._cancelPending(false);
    super.dispose();
  }
};
ChatSessionRoutingController = __decorateClass([
  __decorateParam(2, IChatService),
  __decorateParam(3, IAgentSessionsService),
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, ISessionRouter),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IAgentHostNewSessionFolderService),
  __decorateParam(10, IActionWidgetService),
  __decorateParam(11, IInstantiationService)
], ChatSessionRoutingController);
export {
  ChatSessionRoutingController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHNlc3Npb25Sb3V0ZXJcXGNoYXRTZXNzaW9uUm91dGluZ0NvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGFsZXJ0IGFzIGFyaWFBbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCwgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQsIENoYXRTZW5kUmVzdWx0LCBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtLCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IGhldXJpc3RpY1Njb3JlLCBJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQsIElDaGF0U2Vzc2lvblJvdXRpbmdOZXdTZXNzaW9uVGFyZ2V0LCBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXIsIElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2UsIElDaGF0U2Vzc2lvblJvdXRpbmdXb3Jrc3BhY2VDYXRhbG9nLCBJUm91dGFibGVTZXNzaW9uLCBpc0hpZ2hDb25maWRlbmNlU2Vzc2lvblJvdXRlLCBJU2Vzc2lvblJvdXRlUmVzdWx0LCBJU2Vzc2lvblJvdXRlciwgUk9VVEVSX0ZJRUxEX0NMSVBfTEVOR1RIIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Sb3V0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBBZ2VudFNlc3Npb25UYXJnZXQgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbiwgQWdlbnRTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRXaWRnZXQgfSBmcm9tICcuLi93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXIsIElDaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXJIb3N0IH0gZnJvbSAnLi9jaGF0U2Vzc2lvblJvdXRpbmdGb2xkZXJQaWNrZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlciwgcGFyc2VFeHBsaWNpdE5ld1Nlc3Npb25SZXF1ZXN0LCByZXNvbHZlTWVudGlvbmVkV29ya3NwYWNlRm9sZGVyLCByZXNvbHZlTmV3U2Vzc2lvbldvcmtzcGFjZUZvbGRlciwgcmVzb2x2ZVNlc3Npb25Xb3Jrc3BhY2VGb2xkZXIsIFJPVVRFX0VOUklDSF9NQVhfQ0FORElEQVRFUywgc2VsZWN0QmVzdFNlc3Npb25Sb3V0ZSwgc2VsZWN0Um91dGVyU2hvcnRsaXN0IH0gZnJvbSAnLi9jaGF0U2Vzc2lvblJvdXRpbmdIZWxwZXJzLmpzJztcblxuaW1wb3J0ICcuL21lZGlhL2NoYXRTZXNzaW9uUm91dGluZy5jc3MnO1xuXG4vKiogTWF4aW11bSBudW1iZXIgb2YgaGlnaC1jb25maWRlbmNlIHNlc3Npb24gb3B0aW9ucyBzaG93biBpbiB0aGUgZGVzdGluYXRpb24gcGlja2VyLiAqL1xuY29uc3QgUk9VVEVfTUFYX0NIT0lDRVMgPSA2O1xuXG4vKipcbiAqIEhvdyBsb25nIHRoZSBwZW5kaW5nLXNlbmQgYmFkZ2UgY291bnRzIGRvd24gYmVmb3JlIGF1dG8tZGlzcGF0Y2hpbmcgdG8gdGhlXG4gKiByb3V0ZWQgdGFyZ2V0LiBMb25nIGVub3VnaCB0byByZWFkIHRoZSB0YXJnZXQgYW5kIGludGVydmVuZSwgc2hvcnQgZW5vdWdoIHRvXG4gKiBrZWVwIGEgaGFuZHMtZnJlZS92b2ljZSBmbG93IG1vdmluZy5cbiAqL1xuY29uc3QgUk9VVEVfQVVUT1NFTkRfREVMQVlfTVMgPSA1MDAwO1xuXG4vKiogUmVzb2x2ZWQgZGVzdGluYXRpb24gZm9yIGEgc3VibWl0dGVkIHJlcXVlc3Q6IGFuIGV4aXN0aW5nIHNlc3Npb24gb3IgYSBuZXcgb25lLiAqL1xudHlwZSBQZW5kaW5nVGFyZ2V0ID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdzZXNzaW9uJzsgcmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7IHJlYWRvbmx5IGNvbmZpZGVuY2U6IG51bWJlciB9XG5cdHwgTmV3U2Vzc2lvblRhcmdldDtcblxudHlwZSBOZXdTZXNzaW9uVGFyZ2V0ID0ge1xuXHRyZWFkb25seSBraW5kOiAnbmV3Jztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZm9sZGVyPzogVVJJO1xuXHRyZWFkb25seSBwcm92aWRlcklkPzogc3RyaW5nO1xufTtcblxudHlwZSBSb3V0aW5nRm9sZGVyID0gSUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlciAmIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZztcblx0cmVhZG9ubHkgd29ya3NwYWNlPzogSUNoYXRTZXNzaW9uUm91dGluZ1dvcmtzcGFjZTtcbn07XG5cbnR5cGUgU3VibWlzc2lvblBoYXNlID0gJ2lkbGUnIHwgJ3JvdXRpbmcnIHwgJ2F3YWl0aW5nQ2hvaWNlJyB8ICdkaXNwYXRjaGluZyc7XG5cbmludGVyZmFjZSBJRGVsaXZlcnlDb25maXJtYXRpb24gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGNvbXBsZXRlZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gcmVzcG9uc2VQcmV2aWV3KHJlc3BvbnNlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmaXJzdExpbmUgPSByZXNwb25zZT8uc3BsaXQoL1xccj9cXG4vKS5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSkuZmluZChCb29sZWFuKTtcblx0aWYgKCFmaXJzdExpbmUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBmaXJzdExpbmU7XG59XG5cbmZ1bmN0aW9uIGxvd2VyY2FzZUZpcnN0TGV0dGVyKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxwe0x9L3UsIGxldHRlciA9PiBsZXR0ZXIudG9Mb2NhbGVMb3dlckNhc2UoKSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckNvbXBsZXRlZFJlc3BvbnNlKGxhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQsIHNlc3Npb25MYWJlbDogc3RyaW5nLCBwcmV2aWV3OiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IHByZWZpeCA9IGRvbS4kKCdzcGFuLmNoYXQtcm91dGluZy1iYWRnZS1yZXNwb25zZS1wcmVmaXgnKTtcblx0cHJlZml4LnRleHRDb250ZW50ID0gbG9jYWxpemUoXG5cdFx0J2NoYXRTZXNzaW9uUm91dGluZy5jb21wbGV0ZWRXaXRoUmVzcG9uc2UnLFxuXHRcdFwiQ29tcGxldGVkIHswfTpcIixcblx0XHRsb3dlcmNhc2VGaXJzdExldHRlcihzZXNzaW9uTGFiZWwpXG5cdCk7XG5cdGNvbnN0IHJlbmRlcmVkID0gcmVuZGVyTWFya2Rvd24obmV3IE1hcmtkb3duU3RyaW5nKHByZXZpZXcpKTtcblx0cmVuZGVyZWQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXJvdXRpbmctYmFkZ2UtcmVzcG9uc2UtcHJldmlldycpO1xuXHRsYWJlbEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1yb3V0aW5nLWJhZGdlLWNvbXBsZXRlZCcpO1xuXHRsYWJlbEVsZW1lbnQucmVwbGFjZUNoaWxkcmVuKHByZWZpeCwgcmVuZGVyZWQuZWxlbWVudCk7XG5cdHJldHVybiByZW5kZXJlZDtcbn1cblxuZnVuY3Rpb24gc3RhdHVzVG9TdHJpbmcoc3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLkZhaWxlZDogcmV0dXJuICdmYWlsZWQnO1xuXHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZDogcmV0dXJuICdpZGxlJztcblx0XHRjYXNlIEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzOiByZXR1cm4gJ3dvcmtpbmcnO1xuXHRcdGRlZmF1bHQ6IHJldHVybiAndW5rbm93bic7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNDb3BpbG90Um91dGluZ1Byb3ZpZGVyKHByb3ZpZGVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHByb3ZpZGVyID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZFxuXHRcdHx8IHByb3ZpZGVyID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWRcblx0XHR8fCBwcm92aWRlciA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvcGlsb3Q7XG59XG5cbi8qKiBGbGF0dGVuIGEgYHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZGAgZmllbGQgdG8gcGxhaW4gdGV4dC4gKi9cbmZ1bmN0aW9uIG1hcmtkb3duVG9UZXh0KHZhbHVlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXZhbHVlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0ZXh0ID0gKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHZhbHVlLnZhbHVlKS50cmltKCk7XG5cdHJldHVybiB0ZXh0IHx8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBFeHRyYWN0IHBsYWluIHRleHQgZnJvbSBhIHJlc3BvbnNlIGhpc3RvcnkgaXRlbSBieSBjb25jYXRlbmF0aW5nIGl0cyBtYXJrZG93blxuICogcGFydHMuIEtlcHQgY29hcnNlIGFuZCBjbGlwcGVkOiB0aGUgcm91dGVyIG9ubHkgbmVlZHMgYSBnaXN0IG9mIHRoZSBsYXRlc3RcbiAqIHJlc3BvbnNlLCBub3QgYSBmYWl0aGZ1bCByZW5kZXIsIHNvIG5vbi10ZXh0IHBhcnRzICh0b29scywgdHJlZXMsIGV0Yy4pIGFyZVxuICogaWdub3JlZC4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSByZXNwb25zZSBoYXMgbm8gdGV4dHVhbCBjb250ZW50LlxuICovXG5mdW5jdGlvbiBoaXN0b3J5UmVzcG9uc2VUb1RleHQoaXRlbTogRXh0cmFjdDxJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbSwgeyB0eXBlOiAncmVzcG9uc2UnIH0+KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0bGV0IHRleHQgPSAnJztcblx0Zm9yIChjb25zdCBwYXJ0IG9mIGl0ZW0ucGFydHMpIHtcblx0XHRpZiAocGFydC5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0dGV4dCArPSBwYXJ0LmNvbnRlbnQudmFsdWU7XG5cdFx0XHQvLyBFbm91Z2ggdG8gY2hhcmFjdGVyaXplIHRoZSByZXNwb25zZTsgYXZvaWQgd2Fsa2luZyBhIGh1Z2UgdHJhbnNjcmlwdC5cblx0XHRcdGlmICh0ZXh0Lmxlbmd0aCA+PSBST1VURVJfRklFTERfQ0xJUF9MRU5HVEggKiAyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHR0ZXh0ID0gdGV4dC50cmltKCk7XG5cdHJldHVybiB0ZXh0IHx8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUaGUgc3VyZmFjZSAoZmxvYXRpbmcgaW5wdXQgd2luZG93LCBxdWljayBjaGF0LCBcdTIwMjYpIHRoYXQgaG9zdHMgYSByb3V0ZWQgY2hhdFxuICogaW5wdXQuIFN1cHBsaWVzIHRoZSB3aWRnZXQgYmVpbmcgcm91dGVkLCBpdHMgb3duIHNjcmF0Y2ggc2Vzc2lvbiB0byBleGNsdWRlXG4gKiBmcm9tIGNhbmRpZGF0ZXMsIGFuZCB3aGVyZSB0aGUgYWR2aXNvcnkgYmFkZ2Ugc2hvdWxkIGJlIGluc2VydGVkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0IGV4dGVuZHMgSUNoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlckhvc3Qge1xuXHQvKiogVGhlIGNoYXQgd2lkZ2V0IHdob3NlIHN1Ym1pc3Npb24gaXMgYmVpbmcgcm91dGVkLiAqL1xuXHRyZWFkb25seSB3aWRnZXQ6IENoYXRXaWRnZXQ7XG5cdC8qKiBSZXNvdXJjZSBvZiB0aGUgaG9zdCdzIG93biBzY3JhdGNoIHNlc3Npb24sIGV4Y2x1ZGVkIGZyb20gcm91dGluZyBjYW5kaWRhdGVzLiAqL1xuXHRnZXRPd25TZXNzaW9uUmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkO1xuXHQvKiogUHJvdmlkZXItbmV1dHJhbCBzZXNzaW9uIGNhdGFsb2cgYW5kIG9wZXJhdGlvbnMgb3duZWQgYnkgdGhlIGhvc3QuICovXG5cdGdldFJvdXRpbmdQcm92aWRlcj8oKTogSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHQvKiogU2Vzc2lvbiB3aG9zZSBjdXJyZW50bHkgZGlzcGxheWVkIHF1ZXN0aW9uIG9yIGFwcHJvdmFsIHRoZSB2b2ljZSBpbnB1dCBhbnN3ZXJzIGRpcmVjdGx5LiAqL1xuXHRnZXRQZW5kaW5nUmVwbHlTZXNzaW9uUmVzb3VyY2U/KCk6IFVSSSB8IHVuZGVmaW5lZDtcblx0LyoqIFNlc3Npb24gcHJvdmlkZXIgc2VsZWN0ZWQgZm9yIGEgbmV3bHkgY3JlYXRlZCBkZXN0aW5hdGlvbi4gKi9cblx0Z2V0TmV3U2Vzc2lvblRhcmdldD8oKTogQWdlbnRTZXNzaW9uVGFyZ2V0IHwgdW5kZWZpbmVkO1xuXHQvKiogRGlzcGxheSBuYW1lIG9mIHRoZSBtb2RlbCBzZWxlY3RlZCBmb3IgYSBuZXdseSBjcmVhdGVkIGRlc3RpbmF0aW9uLiAqL1xuXHRnZXRTZWxlY3RlZE1vZGVsTGFiZWw/KCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIEluc2VydCB0aGUgYWR2aXNvcnkgYmFkZ2UgaW50byB0aGUgaG9zdCBET00gbmVhciB0aGUgaW5wdXQuXG5cdCAqIElmIHRoZSBob3N0IGhhcyBubyBzdXJmYWNlIHRvIHBsYWNlIGl0LCBsZWF2ZSB0aGUgYmFkZ2UgZGlzY29ubmVjdGVkIGFuZFxuXHQgKiB0aGUgY29udHJvbGxlciB3aWxsIGZhbGwgYmFjayB0byBhbiBpbW1lZGlhdGUgZGlzcGF0Y2guXG5cdCAqL1xuXHRwbGFjZUJhZGdlKGJhZGdlOiBIVE1MRWxlbWVudCk6IHZvaWQ7XG5cdC8qKiBOb3RpZnkgdGhlIGhvc3QgdGhhdCBhIG5ldyByZXF1ZXN0IHdpbGwgYmUgaW5kZXBlbmRlbnRseSByb3V0ZWQuICovXG5cdG9uV2lsbFJvdXRlPygpOiB2b2lkO1xuXHQvKiogTm90aWZ5IHRoZSBob3N0IGltbWVkaWF0ZWx5IGJlZm9yZSBzZW5kaW5nIHNvIHN0YWxlIGRlc3RpbmF0aW9uIHN0YXRlIGNhbiBiZSBpbnZhbGlkYXRlZC4gKi9cblx0b25XaWxsRGlzcGF0Y2hSb3V0ZT8ocmVzb3VyY2U6IFVSSSk6IHZvaWQ7XG5cdC8qKiBSb2xsIGJhY2sgcHJlLWRpc3BhdGNoIHN0YXRlIHdoZW4gdGhlIHNlbmQgaXMgcmVqZWN0ZWQsIGNhbmNlbGxlZCwgb3IgZmFpbHMuICovXG5cdG9uRGlkUmVqZWN0Um91dGU/KHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGlzVm9pY2VNb2RlSW5wdXQ/OiBib29sZWFuKTogdm9pZDtcblx0LyoqIE5vdGlmeSB0aGUgaG9zdCB3aGVuIGEgc2luZ2xlLXRhcmdldCByb3V0ZSByZXNvbHZlcywgb3IgY2xlYXIgaXQgZm9yIGZhbi1vdXQuICovXG5cdG9uRGlkUmVzb2x2ZVJvdXRlPyhyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBraW5kPzogJ2V4aXN0aW5nX3Nlc3Npb24nIHwgJ25ld19zZXNzaW9uJywgaXNWb2ljZU1vZGVJbnB1dD86IGJvb2xlYW4sIHJlcXVlc3RJZD86IHN0cmluZyk6IHZvaWQ7XG5cdC8qKiBOb3RpZnkgdGhlIGhvc3Qgd2hlbiB0aGUgdXNlciBkaXNtaXNzZXMgYSByb3V0ZWQgcmVxdWVzdCdzIGRlbGl2ZXJ5IGFuZCBwZW5kaW5nLWlucHV0IFVJLiAqL1xuXHRvbkRpZERpc21pc3NSb3V0ZT8ocmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkPzogc3RyaW5nKTogdm9pZDtcbn1cblxuLyoqXG4gKiBTaGFyZWQgcm91dGluZyArIGFkdmlzb3J5LWJhZGdlIGJlaGF2aW91ciBmb3IgY2hhdCBpbnB1dCBzdXJmYWNlcy4gU2NvcmVzIGFcbiAqIHN1Ym1pdHRlZCB1dHRlcmFuY2UgYWdhaW5zdCBleGlzdGluZyBhZ2VudCBzZXNzaW9ucywgcmVzb2x2ZXMgYSBwZW5kaW5nIHRhcmdldFxuICogKGJlc3QgbWF0Y2ggYWJvdmUgdGhyZXNob2xkLCBlbHNlIGEgbmV3IHNlc3Npb24pLCB0aGVuIHNob3dzIGEgcmFua2VkIHBhbmVsXG4gKiB0aGF0IGNvdW50cyBkb3duIGFuZCBhdXRvLXNlbmRzLiBUaGUgdXNlciBjYW4gY2hhbmdlIG9yIGZhbiBvdXQgdGhlIHNlbGVjdGlvbixcbiAqIGFib3J0LCBvciBrZWVwIHR5cGluZyB0byBjYW5jZWwgYmVmb3JlIGl0IGZpcmVzLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8qKiBUcmFuc2llbnQgcm91dGluZy9yZXZpZXcgYmFkZ2UgKyBhdXRvLXNlbmQgdGltZXJzOyByZXBsYWNlZC9jbGVhcmVkIHBlciBzdWJtaXNzaW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU2VuZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdC8qKiBJbmRlcGVuZGVudGx5IGRpc21pc3NpYmxlIGRlbGl2ZXJ5IHJvd3MgdGhhdCByZW1haW4gbGl2ZSBhY3Jvc3MgbGF0ZXIgc3VibWlzc2lvbnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGl2ZXJ5Q29uZmlybWF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgSURlbGl2ZXJ5Q29uZmlybWF0aW9uPigpKTtcblx0cHJpdmF0ZSBfZGVsaXZlcnlDb25maXJtYXRpb25JZCA9IDA7XG5cdC8qKiBDYW5jZWxsYXRpb24gZm9yIHRoZSBpbi1mbGlnaHQgc3VibWlzc2lvbjsgY2FuY2VsZWQgd2hlbiB0aGUgaG9zdCB0ZWFycyBkb3duLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJtaXRDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJtaXREcmFmdExpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgX3JvdXRpbmdQcm92aWRlcjogSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93b3Jrc3BhY2VDYXRhbG9nOiBJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlQ2F0YWxvZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvc3Q6IElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVidWdPd25lcjogc3RyaW5nLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvblJvdXRlciBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25Sb3V0ZXI6IElTZXNzaW9uUm91dGVyLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuZXdTZXNzaW9uRm9sZGVyU2VydmljZTogSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEludGVyY2VwdCBhIHN1Ym1pc3Npb24gYmVmb3JlIGxvY2FsIGV4ZWN1dGlvbjogc2NvcmUgaXQgYWdhaW5zdCBleGlzdGluZ1xuXHQgKiBzZXNzaW9ucywgcmVzb2x2ZSBhIHBlbmRpbmcgdGFyZ2V0LCBhbmQgc2hvdyB0aGUgYWR2aXNvcnkgYmFkZ2UuIEFsd2F5c1xuXHQgKiByZXR1cm5zIGB0cnVlYCAoaGFuZGxlZCkgc28gdGhlIGlucHV0LW9ubHkgd2lkZ2V0IG5ldmVyIHJ1bnMgdGhlIHJlcXVlc3Qgb25cblx0ICogaXRzIG93biBzY3JhdGNoIHNlc3Npb24uXG5cdCAqL1xuXHRhc3luYyBoYW5kbGVTdWJtaXQocXVlcnk6IHN0cmluZywgX21vZGU6IENoYXRNb2RlS2luZCwgYXR0YWNoZWRDb250ZXh0PzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdLCBpc1ZvaWNlTW9kZUlucHV0PzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHN1Ym1pdHRlZFV0dGVyYW5jZSA9IHF1ZXJ5LnRyaW0oKTtcblx0XHRpZiAoIXN1Ym1pdHRlZFV0dGVyYW5jZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBleHBsaWNpdE5ld1Nlc3Npb25UYXNrID0gcGFyc2VFeHBsaWNpdE5ld1Nlc3Npb25SZXF1ZXN0KHN1Ym1pdHRlZFV0dGVyYW5jZSk7XG5cdFx0Y29uc3QgdXR0ZXJhbmNlID0gZXhwbGljaXROZXdTZXNzaW9uVGFzayA/PyBzdWJtaXR0ZWRVdHRlcmFuY2U7XG5cblx0XHQvLyBBIG5ldyBzdWJtaXNzaW9uIHN1cGVyc2VkZXMgYW55IHBlbmRpbmcgYmFkZ2UgZnJvbSBhIHByZXZpb3VzIG9uZS5cblx0XHR0aGlzLl9jbGVhckNvbXBsZXRlZERlbGl2ZXJ5Q29uZmlybWF0aW9ucygpO1xuXHRcdHRoaXMuX3N1Ym1pdEN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fc3VibWl0RHJhZnRMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9wZW5kaW5nU2VuZC5jbGVhcigpO1xuXHRcdHRoaXMuX3JvdXRpbmdQcm92aWRlciA9IHRoaXMuaG9zdC5nZXRSb3V0aW5nUHJvdmlkZXI/LigpO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUNhdGFsb2cgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBJbW1lZGlhdGVseSByZWZsZWN0IHRoYXQgdGhlIHJlcXVlc3Qgd2FzIGFjY2VwdGVkIHNvIHRoZSBzZW5kIGJ1dHRvblxuXHRcdC8vIGdyZXlzIG91dCB3aGlsZSByb3V0aW5nIHJ1bnMgKGl0IGlzIGludGVyY2VwdGVkIG9mZi1tb2RlbCwgc28gdGhlXG5cdFx0Ly8gd2lkZ2V0J3Mgb3duIHN1Ym1pdCBzdGF0ZSBuZXZlciBjaGFuZ2VzKS4gQ2xlYXJlZCB3aGVuIHRoZSBzdWJtaXNzaW9uXG5cdFx0Ly8gcmVzb2x2ZXMsIGlzIGNhbmNlbGxlZCwgb3IgdGhlIHVzZXIgZWRpdHMgdGhlIGRyYWZ0LlxuXHRcdHRoaXMuX3NldFN1Ym1pc3Npb25QaGFzZSgncm91dGluZycpO1xuXHRcdGFyaWFBbGVydChsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnByZXBhcmluZ1JlcXVlc3QnLCBcIlByZXBhcmluZyB5b3VyIHJlcXVlc3QuXCIpKTtcblxuXHRcdC8vIFRoZSBob3N0IGNhbmNlbHMgdGhlIGluLWZsaWdodCBzdWJtaXNzaW9uIG9uIHRlYXJkb3duIHNvIHdlIG5ldmVyXG5cdFx0Ly8gZGlzcGF0Y2ggYWZ0ZXIgY2xvc2UuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fc3VibWl0Q3RzLnZhbHVlID0gY3RzO1xuXHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXHRcdGNvbnN0IHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMgPSB0aGlzLl9hdHRhY2htZW50SWRzKCk7XG5cdFx0Y29uc3QgZHJhZnRMaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2FuY2VsRm9yRHJhZnRDaGFuZ2UgPSAoKSA9PiB7XG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLmhvc3Qub25EaWRSZWplY3RSb3V0ZT8uKHVuZGVmaW5lZCwgaXNWb2ljZU1vZGVJbnB1dCk7XG5cdFx0XHRpZiAodGhpcy5fc3VibWl0Q3RzLnZhbHVlID09PSBjdHMpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1NlbmQuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fc3VibWl0RHJhZnRMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fc2V0U3VibWlzc2lvblBoYXNlKCdpZGxlJyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkcmFmdExpc3RlbmVycy5hZGQodGhpcy5ob3N0LndpZGdldC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChjYW5jZWxGb3JEcmFmdENoYW5nZSkpO1xuXHRcdGRyYWZ0TGlzdGVuZXJzLmFkZCh0aGlzLmhvc3Qud2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5vbkRpZENoYW5nZShjYW5jZWxGb3JEcmFmdENoYW5nZSkpO1xuXHRcdHRoaXMuX3N1Ym1pdERyYWZ0TGlzdGVuZXJzLnZhbHVlID0gZHJhZnRMaXN0ZW5lcnM7XG5cdFx0Y29uc3QgcmVxdWVzdE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0Li4udGhpcy5ob3N0LndpZGdldC5nZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMoKSxcblx0XHRcdC4uLnRoaXMuaG9zdC53aWRnZXQuZ2V0TW9kZVJlcXVlc3RPcHRpb25zKCksXG5cdFx0XHRpc1ZvaWNlTW9kZUlucHV0LFxuXHRcdFx0YXR0YWNoZWRDb250ZXh0OiBhdHRhY2hlZENvbnRleHQ/Lmxlbmd0aCA/IFsuLi5hdHRhY2hlZENvbnRleHRdIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0aWYgKGV4cGxpY2l0TmV3U2Vzc2lvblRhc2spIHtcblx0XHRcdHRoaXMuaG9zdC5vbldpbGxSb3V0ZT8uKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoV29ya3NwYWNlQ2F0YWxvZyh0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlTmV3U2Vzc2lvblRhcmdldCh1dHRlcmFuY2UsIGF0dGFjaGVkQ29udGV4dCwgW10sIFtdKTtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoT3JSZXZpZXdOZXdTZXNzaW9uKHRhcmdldCwgcXVlcnksIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMsIHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMsIGN0cyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgZm9sbG93dXBSZXNvdXJjZSA9IGlzVm9pY2VNb2RlSW5wdXQgPyB0aGlzLmhvc3QuZ2V0UGVuZGluZ1JlcGx5U2Vzc2lvblJlc291cmNlPy4oKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoZm9sbG93dXBSZXNvdXJjZSAmJiBmb2xsb3d1cFJlc291cmNlLnRvU3RyaW5nKCkgIT09IHRoaXMuaG9zdC5nZXRPd25TZXNzaW9uUmVzb3VyY2UoKT8udG9TdHJpbmcoKSkge1xuXHRcdFx0Y29uc3QgZm9sbG93dXBUYXJnZXQ6IFBlbmRpbmdUYXJnZXQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0c2Vzc2lvbklkOiBmb2xsb3d1cFJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oZm9sbG93dXBSZXNvdXJjZSk/LnRpdGxlIHx8IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuY3VycmVudFNlc3Npb24nLCBcIkN1cnJlbnQgc2Vzc2lvblwiKSxcblx0XHRcdFx0Y29uZmlkZW5jZTogMSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9kaXNwYXRjaEltbWVkaWF0ZWx5KGZvbGxvd3VwVGFyZ2V0LCBxdWVyeSwgc3VibWl0dGVkQXR0YWNobWVudElkcywgdXR0ZXJhbmNlLCByZXF1ZXN0T3B0aW9ucywgY3RzKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9yb3V0ZVRvQ2hhdChxdWVyeSwgc3VibWl0dGVkQXR0YWNobWVudElkcywgdXR0ZXJhbmNlLCBhdHRhY2hlZENvbnRleHQsIHJlcXVlc3RPcHRpb25zLCBjdHMpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcm91dGVUb0NoYXQoXG5cdFx0cXVlcnk6IHN0cmluZyxcblx0XHRzdWJtaXR0ZWRBdHRhY2htZW50SWRzOiByZWFkb25seSBzdHJpbmdbXSxcblx0XHR1dHRlcmFuY2U6IHN0cmluZyxcblx0XHRhdHRhY2hlZENvbnRleHQ6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB8IHVuZGVmaW5lZCxcblx0XHRyZXF1ZXN0T3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsXG5cdFx0Y3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9rZW4gPSBjdHMudG9rZW47XG5cdFx0dGhpcy5fc2V0U3VibWlzc2lvblBoYXNlKCdyb3V0aW5nJyk7XG5cdFx0YXJpYUFsZXJ0KGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuZmluZGluZ0Rlc3RpbmF0aW9uJywgXCJGaW5kaW5nIHRoZSBiZXN0IGNoYXQgZm9yIHlvdXIgcmVxdWVzdC5cIikpO1xuXHRcdHRoaXMuaG9zdC5vbldpbGxSb3V0ZT8uKCk7XG5cblx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoV29ya3NwYWNlQ2F0YWxvZyh0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLl9nZXRSb3V0aW5nRm9sZGVycygpO1xuXHRcdGNvbnN0IG1lbnRpb25lZEZvbGRlciA9IHJlc29sdmVNZW50aW9uZWRXb3Jrc3BhY2VGb2xkZXIodXR0ZXJhbmNlLCBmb2xkZXJzKTtcblx0XHRjb25zdCBjb2xsZWN0ZWRDYW5kaWRhdGVzID0gYXdhaXQgdGhpcy5fY29sbGVjdENhbmRpZGF0ZVNlc3Npb25zKHRva2VuKTtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gbWVudGlvbmVkRm9sZGVyXG5cdFx0XHQ/IGNvbGxlY3RlZENhbmRpZGF0ZXMuZmlsdGVyKGNhbmRpZGF0ZSA9PiBpc0VxdWFsKHJlc29sdmVTZXNzaW9uV29ya3NwYWNlRm9sZGVyKGNhbmRpZGF0ZSwgZm9sZGVycyk/LnVyaSwgbWVudGlvbmVkRm9sZGVyLnVyaSkpXG5cdFx0XHQ6IGNvbGxlY3RlZENhbmRpZGF0ZXM7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRgW2NoYXRTZXNzaW9uUm91dGluZ10gb3duZXI9JHt0aGlzLmRlYnVnT3duZXJ9IHZvaWNlPSR7cmVxdWVzdE9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCA9PT0gdHJ1ZX0gd29ya3NwYWNlRm9sZGVycz1bJHtmb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLm5hbWUpLmpvaW4oJywgJyl9XSBtZW50aW9uZWRGb2xkZXI9JHttZW50aW9uZWRGb2xkZXI/Lm5hbWUgPz8gJzxub25lPid9IGNhbmRpZGF0ZXM9JHtjb2xsZWN0ZWRDYW5kaWRhdGVzLmxlbmd0aH0gZmlsdGVyZWRDYW5kaWRhdGVzPSR7Y2FuZGlkYXRlcy5sZW5ndGh9YFxuXHRcdCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRXZlcnkgY2FuZGlkYXRlIHJlY2VpdmVzIGEgbGlnaHR3ZWlnaHQgc2VtYW50aWMgcGFzcyBiZWZvcmUgd2UgYm91bmQgdGhlXG5cdFx0Ly8gbW9yZSBleHBlbnNpdmUgdHJhbnNjcmlwdCBlbnJpY2htZW50LiBUaGlzIHByZXZlbnRzIGFuIG9sZGVyLCBnZW5lcmljYWxseVxuXHRcdC8vIG5hbWVkIGJ1dCByZWxldmFudCBzZXNzaW9uIGZyb20gYmVpbmcgZXhjbHVkZWQgYnkgbG9jYWwgbWV0YWRhdGEgYWxvbmUuXG5cdFx0Y29uc3QgcHJlbGltaW5hcnlSZXN1bHRzID0gY2FuZGlkYXRlcy5sZW5ndGggPiBST1VURV9FTlJJQ0hfTUFYX0NBTkRJREFURVNcblx0XHRcdD8gYXdhaXQgdGhpcy5fcm91dGUoY2FuZGlkYXRlcywgdXR0ZXJhbmNlLCB0b2tlbilcblx0XHRcdDogW107XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNob3J0bGlzdCA9IHNlbGVjdFJvdXRlclNob3J0bGlzdChjYW5kaWRhdGVzLCBwcmVsaW1pbmFyeVJlc3VsdHMpO1xuXHRcdGNvbnN0IGVucmljaGVkID0gc2hvcnRsaXN0Lmxlbmd0aCA/IGF3YWl0IHRoaXMuX2VucmljaENhbmRpZGF0ZXMoc2hvcnRsaXN0LCB0b2tlbikgOiBbXTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRzID0gZW5yaWNoZWQubGVuZ3RoID8gYXdhaXQgdGhpcy5fcm91dGUoZW5yaWNoZWQsIHV0dGVyYW5jZSwgdG9rZW4pIDogW107XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NldFN1Ym1pc3Npb25QaGFzZSgnYXdhaXRpbmdDaG9pY2UnKTtcblxuXHRcdGNvbnN0IG5ld1Nlc3Npb25UYXJnZXQgPSB0aGlzLl9yZXNvbHZlTmV3U2Vzc2lvblRhcmdldCh1dHRlcmFuY2UsIGF0dGFjaGVkQ29udGV4dCwgcmVzdWx0cywgZW5yaWNoZWQpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQocmVzdWx0cywgZW5yaWNoZWQsIG5ld1Nlc3Npb25UYXJnZXQpO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKFxuXHRcdFx0YFtjaGF0U2Vzc2lvblJvdXRpbmddIG93bmVyPSR7dGhpcy5kZWJ1Z093bmVyfSB0YXJnZXQ9JHt0YXJnZXQua2luZH0gdGFyZ2V0SWQ9JHt0YXJnZXQua2luZCA9PT0gJ3Nlc3Npb24nID8gdGFyZ2V0LnNlc3Npb25JZCA6IHRhcmdldC5mb2xkZXI/LnRvU3RyaW5nKCkgPz8gJzxub25lPid9IHRvcENvbmZpZGVuY2U9JHtyZXN1bHRzWzBdPy5jb25maWRlbmNlID8/ICc8bm9uZT4nfWBcblx0XHQpO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZUlkcyA9IG5ldyBTZXQoZW5yaWNoZWQubWFwKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuc2Vzc2lvbklkKSk7XG5cdFx0Y29uc3QgaGFzU2Vzc2lvbkNob2ljZSA9IHJlc3VsdHMuc29tZShyZXN1bHQgPT4gY2FuZGlkYXRlSWRzLmhhcyhyZXN1bHQuc2Vzc2lvbklkKSAmJiBpc0hpZ2hDb25maWRlbmNlU2Vzc2lvblJvdXRlKHJlc3VsdCkpO1xuXHRcdGlmICh0YXJnZXQua2luZCA9PT0gJ25ldycgJiYgIWhhc1Nlc3Npb25DaG9pY2UpIHtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoT3JSZXZpZXdOZXdTZXNzaW9uKHRhcmdldCwgcXVlcnksIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMsIHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMsIGN0cyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2JlZ2luUGVuZGluZ1NlbmQodGFyZ2V0LCBuZXdTZXNzaW9uVGFyZ2V0LCByZXN1bHRzLCBlbnJpY2hlZCwgcXVlcnksIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMsIHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMsIGN0cyk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwYXRjaE9yUmV2aWV3TmV3U2Vzc2lvbih0YXJnZXQ6IE5ld1Nlc3Npb25UYXJnZXQsIHN1Ym1pdHRlZElucHV0OiBzdHJpbmcsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLCB1dHRlcmFuY2U6IHN0cmluZywgcmVxdWVzdE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNXb3Jrc3BhY2VQaWNrZXJPcHRpb25zKCkpIHtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoSW1tZWRpYXRlbHkodGFyZ2V0LCBzdWJtaXR0ZWRJbnB1dCwgc3VibWl0dGVkQXR0YWNobWVudElkcywgdXR0ZXJhbmNlLCByZXF1ZXN0T3B0aW9ucywgY3RzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRTdWJtaXNzaW9uUGhhc2UoJ2F3YWl0aW5nQ2hvaWNlJyk7XG5cdFx0dGhpcy5fYmVnaW5QZW5kaW5nU2VuZCh0YXJnZXQsIHRhcmdldCwgW10sIFtdLCBzdWJtaXR0ZWRJbnB1dCwgc3VibWl0dGVkQXR0YWNobWVudElkcywgdXR0ZXJhbmNlLCByZXF1ZXN0T3B0aW9ucywgY3RzKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3BhdGNoSW1tZWRpYXRlbHkodGFyZ2V0OiBQZW5kaW5nVGFyZ2V0LCBzdWJtaXR0ZWRJbnB1dDogc3RyaW5nLCBzdWJtaXR0ZWRBdHRhY2htZW50SWRzOiByZWFkb25seSBzdHJpbmdbXSwgdXR0ZXJhbmNlOiBzdHJpbmcsIHJlcXVlc3RPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSk6IHZvaWQge1xuXHRcdHRoaXMuX3N1Ym1pdERyYWZ0TGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2V0U3VibWlzc2lvblBoYXNlKCdkaXNwYXRjaGluZycpO1xuXHRcdHZvaWQgdGhpcy5fZGlzcGF0Y2hUbyh0YXJnZXQsIHN1Ym1pdHRlZElucHV0LCBzdWJtaXR0ZWRBdHRhY2htZW50SWRzLCB1dHRlcmFuY2UsIHJlcXVlc3RPcHRpb25zLCBjdHMudG9rZW4pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdWJtaXRDdHMudmFsdWUgIT09IGN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXRTdWJtaXNzaW9uUGhhc2UoJ2lkbGUnKTtcblx0XHRcdGlmICgocmVzdWx0LnN0YXR1cyA9PT0gJ3NlbnQnIHx8IHJlc3VsdC5zdGF0dXMgPT09ICdxdWV1ZWQnKSAmJiByZXN1bHQucmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5fc2hvd0RlbGl2ZXJ5Q29uZmlybWF0aW9uKHRhcmdldC5sYWJlbCwgcmVzdWx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dEaXNwYXRjaEZhaWx1cmUodGFyZ2V0LmxhYmVsLCByZXN1bHQucmVhc29uKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKiBDYW5jZWwgYW55IGluLWZsaWdodCBzdWJtaXNzaW9uIGFuZCByZW1vdmUgdGhlIHBlbmRpbmcgYmFkZ2UuICovXG5cdGNhbmNlbFBlbmRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZyh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFBlbmRpbmcocmVzZXRTdWJtaXNzaW9uUGhhc2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zdWJtaXRDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3N1Ym1pdEN0cy5jbGVhcigpO1xuXHRcdHRoaXMuX3N1Ym1pdERyYWZ0TGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1NlbmQuY2xlYXIoKTtcblx0XHRpZiAocmVzZXRTdWJtaXNzaW9uUGhhc2UpIHtcblx0XHRcdHRoaXMuX3NldFN1Ym1pc3Npb25QaGFzZSgnaWRsZScpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldFN1Ym1pc3Npb25QaGFzZShwaGFzZTogU3VibWlzc2lvblBoYXNlKTogdm9pZCB7XG5cdFx0dGhpcy5ob3N0LndpZGdldC5pbnB1dC5zZXRTdWJtaXRQZW5kaW5nKHBoYXNlICE9PSAnaWRsZScsIHBoYXNlID09PSAncm91dGluZycgfHwgcGhhc2UgPT09ICdkaXNwYXRjaGluZycpO1xuXHR9XG5cblx0LyoqIFJ1biB0aGUgcm91dGVyLCBkZWdyYWRpbmcgdG8gYW4gZW1wdHkgcmFua2luZyBvbiBmYWlsdXJlL2NhbmNlbGxhdGlvbi4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcm91dGUoY2FuZGlkYXRlczogSVJvdXRhYmxlU2Vzc2lvbltdLCB1dHRlcmFuY2U6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2Vzc2lvblJvdXRlUmVzdWx0W10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuc2Vzc2lvblJvdXRlci5yb3V0ZSh7IHV0dGVyYW5jZSwgc2Vzc2lvbnM6IGNhbmRpZGF0ZXMgfSwgdG9rZW4pO1xuXHRcdFx0Y29uc3QgbGV4aWNhbFRpZUJyZWFrID0gbmV3IE1hcChoZXVyaXN0aWNTY29yZSh7IHV0dGVyYW5jZSwgc2Vzc2lvbnM6IGNhbmRpZGF0ZXMgfSkubWFwKHJlc3VsdCA9PiBbcmVzdWx0LnNlc3Npb25JZCwgcmVzdWx0LmNvbmZpZGVuY2VdKSk7XG5cdFx0XHRyZXR1cm4gWy4uLnJlc3VsdHNdLnNvcnQoKGEsIGIpID0+XG5cdFx0XHRcdGIuY29uZmlkZW5jZSAtIGEuY29uZmlkZW5jZVxuXHRcdFx0XHR8fCAobGV4aWNhbFRpZUJyZWFrLmdldChiLnNlc3Npb25JZCkgPz8gMCkgLSAobGV4aWNhbFRpZUJyZWFrLmdldChhLnNlc3Npb25JZCkgPz8gMCkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW2NoYXRTZXNzaW9uUm91dGluZ10gc2Vzc2lvbiByb3V0aW5nIGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQaWNrIHRoZSBzaW5nbGUgcGVuZGluZyB0YXJnZXQgdGhlIGJhZGdlIHByZS1zZWxlY3RzOiB0aGUgdG9wIG1hdGNoIGlmIGl0XG5cdCAqIGNsZWFycyB0aGUgY29uZmlkZW5jZSB0aHJlc2hvbGQsIG90aGVyd2lzZSBhIGJyYW5kLW5ldyBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVRhcmdldChyZXN1bHRzOiBJU2Vzc2lvblJvdXRlUmVzdWx0W10sIGNhbmRpZGF0ZXM6IElSb3V0YWJsZVNlc3Npb25bXSwgbmV3U2Vzc2lvblRhcmdldDogTmV3U2Vzc2lvblRhcmdldCk6IFBlbmRpbmdUYXJnZXQge1xuXHRcdGNvbnN0IGxhYmVsQnlJZCA9IG5ldyBNYXAoY2FuZGlkYXRlcy5tYXAoYyA9PiBbYy5zZXNzaW9uSWQsIGMubGFiZWxdKSk7XG5cdFx0Y29uc3QgY2hvc2VuID0gc2VsZWN0QmVzdFNlc3Npb25Sb3V0ZShyZXN1bHRzKTtcblx0XHRpZiAoIWNob3Nlbikge1xuXHRcdFx0cmV0dXJuIG5ld1Nlc3Npb25UYXJnZXQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnc2Vzc2lvbicsXG5cdFx0XHRzZXNzaW9uSWQ6IGNob3Nlbi5zZXNzaW9uSWQsXG5cdFx0XHRsYWJlbDogbGFiZWxCeUlkLmdldChjaG9zZW4uc2Vzc2lvbklkKSA/PyBjaG9zZW4uc2Vzc2lvbklkLFxuXHRcdFx0Y29uZmlkZW5jZTogY2hvc2VuLmNvbmZpZGVuY2UsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTbmFwc2hvdCB0aGUgY3VycmVudCByb3V0aW5nIGNhbmRpZGF0ZXMuIFByb3ZpZGVyLWJhY2tlZCBob3N0cyBvd24gdGhlaXJcblx0ICogY2F0YWxvZyBhbmQgZmlsdGVyaW5nLiBPdGhlciBob3N0cyByZXRhaW4gdGhlIHJlbmRlcmVyLWxvY2FsIGFnZW50IHNlc3Npb25cblx0ICogY2F0YWxvZyBhbmQgZXhjbHVkZSB0aGUgaG9zdCdzIHNjcmF0Y2ggc2Vzc2lvbiBhbmQgbG9jYWwgY2hhdHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jb2xsZWN0Q2FuZGlkYXRlU2Vzc2lvbnModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUm91dGFibGVTZXNzaW9uW10+IHtcblx0XHR0aGlzLl9yb3V0aW5nUHJvdmlkZXIgPSB0aGlzLmhvc3QuZ2V0Um91dGluZ1Byb3ZpZGVyPy4oKTtcblx0XHRpZiAodGhpcy5fcm91dGluZ1Byb3ZpZGVyKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjYW5kaWRhdGVzID0gYXdhaXQgdGhpcy5fcm91dGluZ1Byb3ZpZGVyLmdldENhbmRpZGF0ZVNlc3Npb25zKHRva2VuKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjY2VwdGVkID0gbmV3IE1hcDxzdHJpbmcsIElSb3V0YWJsZVNlc3Npb24+KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIFsuLi5jYW5kaWRhdGVzXS5zb3J0KChhLCBiKSA9PiBhLnNlc3Npb25JZC5sb2NhbGVDb21wYXJlKGIuc2Vzc2lvbklkKSkpIHtcblx0XHRcdFx0XHRpZiAoIWFjY2VwdGVkLmhhcyhjYW5kaWRhdGUuc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRcdFx0YWNjZXB0ZWQuc2V0KGNhbmRpZGF0ZS5zZXNzaW9uSWQsIGNhbmRpZGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbLi4uYWNjZXB0ZWQudmFsdWVzKCldO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbY2hhdFNlc3Npb25Sb3V0aW5nXSBjb2xsZWN0aW5nIHByb3ZpZGVyIHNlc3Npb25zIGZhaWxlZDonLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbY2hhdFNlc3Npb25Sb3V0aW5nXSByZXNvbHZpbmcgYWdlbnQgc2Vzc2lvbnMgZmFpbGVkOicsIGVycik7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBvd25SZXNvdXJjZSA9IHRoaXMuaG9zdC5nZXRPd25TZXNzaW9uUmVzb3VyY2UoKT8udG9TdHJpbmcoKTtcblx0XHRyZXR1cm4gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9uc1xuXHRcdFx0LmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gb3duUmVzb3VyY2Vcblx0XHRcdFx0JiYgaXNDb3BpbG90Um91dGluZ1Byb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJUeXBlKVxuXHRcdFx0XHQmJiAhc2Vzc2lvbi5pc0FyY2hpdmVkKClcblx0XHRcdFx0JiYgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uLnJlc291cmNlKSk/LmlzUmVhZE9ubHkgIT09IHRydWUpXG5cdFx0XHQubWFwKHNlc3Npb24gPT4gdGhpcy5fdG9Sb3V0YWJsZVNlc3Npb24oc2Vzc2lvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Sb3V0YWJsZVNlc3Npb24oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IElSb3V0YWJsZVNlc3Npb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsOiBzZXNzaW9uLmxhYmVsLFxuXHRcdFx0c3RhdHVzOiBzdGF0dXNUb1N0cmluZyhzZXNzaW9uLnN0YXR1cyksXG5cdFx0XHRsYXN0QWN0aXZpdHk6IHNlc3Npb24udGltaW5nPy5sYXN0UmVxdWVzdEVuZGVkID8/IHNlc3Npb24udGltaW5nPy5sYXN0UmVxdWVzdFN0YXJ0ZWQgPz8gc2Vzc2lvbi50aW1pbmc/LmNyZWF0ZWQsXG5cdFx0XHRkZXNjcmlwdGlvbjogbWFya2Rvd25Ub1RleHQoc2Vzc2lvbi5kZXNjcmlwdGlvbiksXG5cdFx0XHRyZXBvOiBzZXNzaW9uLm1ldGFkYXRhPy5yZXBvc2l0b3J5UGF0aCxcblx0XHRcdGN3ZDogc2Vzc2lvbi5tZXRhZGF0YT8ud29ya2luZ0RpcmVjdG9yeVBhdGgsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVOZXdTZXNzaW9uVGFyZ2V0KFxuXHRcdHV0dGVyYW5jZTogc3RyaW5nLFxuXHRcdGF0dGFjaGVkQ29udGV4dDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkLFxuXHRcdHJlc3VsdHM6IHJlYWRvbmx5IElTZXNzaW9uUm91dGVSZXN1bHRbXSxcblx0XHRjYW5kaWRhdGVzOiByZWFkb25seSBJUm91dGFibGVTZXNzaW9uW10sXG5cdCk6IE5ld1Nlc3Npb25UYXJnZXQge1xuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLl9nZXRSb3V0aW5nRm9sZGVycygpO1xuXHRcdGNvbnN0IG1lbnRpb25lZEZvbGRlciA9IHJlc29sdmVNZW50aW9uZWRXb3Jrc3BhY2VGb2xkZXIodXR0ZXJhbmNlLCBmb2xkZXJzKTtcblx0XHRjb25zdCBhdHRhY2htZW50Rm9sZGVyID0gdGhpcy5fZm9sZGVyRnJvbUF0dGFjaG1lbnRzKGF0dGFjaGVkQ29udGV4dCwgZm9sZGVycyk7XG5cdFx0Y29uc3QgZGVmYXVsdFdvcmtzcGFjZSA9IHRoaXMuX3dvcmtzcGFjZUNhdGFsb2c/LmRlZmF1bHRXb3Jrc3BhY2U7XG5cdFx0Y29uc3QgaW5mZXJyZWRGb2xkZXJVcmkgPSByZXNvbHZlTmV3U2Vzc2lvbldvcmtzcGFjZUZvbGRlcihcblx0XHRcdHV0dGVyYW5jZSxcblx0XHRcdGZvbGRlcnMsXG5cdFx0XHRyZXN1bHRzLFxuXHRcdFx0Y2FuZGlkYXRlcyxcblx0XHRcdGRlZmF1bHRXb3Jrc3BhY2U/LnVyaSA/PyB0aGlzLm5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLmdldERlZmF1bHRGb2xkZXIoKSxcblx0XHQpO1xuXHRcdGNvbnN0IHNlbGVjdGVkRm9sZGVyID0gbWVudGlvbmVkRm9sZGVyXG5cdFx0XHQ/PyBhdHRhY2htZW50Rm9sZGVyXG5cdFx0XHQ/PyB0aGlzLl9maW5kUm91dGluZ0ZvbGRlcihpbmZlcnJlZEZvbGRlclVyaSwgZGVmYXVsdFdvcmtzcGFjZT8ucHJvdmlkZXJJZCk7XG5cdFx0Y29uc3QgZm9sZGVyID0gc2VsZWN0ZWRGb2xkZXI/LnVyaSA/PyBpbmZlcnJlZEZvbGRlclVyaTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdGBbY2hhdFNlc3Npb25Sb3V0aW5nXSBvd25lcj0ke3RoaXMuZGVidWdPd25lcn0gbmV3U2Vzc2lvbkZvbGRlcj0ke2ZvbGRlcj8udG9TdHJpbmcoKSA/PyAnPG5vbmU+J30gcHJvdmlkZXJJZD0ke3NlbGVjdGVkRm9sZGVyPy5wcm92aWRlcklkID8/ICc8bm9uZT4nfSBzb3VyY2U9JHttZW50aW9uZWRGb2xkZXIgPyAnbWVudGlvbicgOiBhdHRhY2htZW50Rm9sZGVyID8gJ2F0dGFjaG1lbnQnIDogJ2luZmVycmVkJ31gXG5cdFx0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ25ldycsXG5cdFx0XHRsYWJlbDogZm9sZGVyXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5uZXdTZXNzaW9uSW5Gb2xkZXInLCBcIk5ldyBzZXNzaW9uIGluIHswfVwiLCBzZWxlY3RlZEZvbGRlcj8ubmFtZSA/PyB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihmb2xkZXIpPy5uYW1lID8/IGJhc2VuYW1lKGZvbGRlcikpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5uZXdTZXNzaW9uJywgXCJOZXcgc2Vzc2lvblwiKSxcblx0XHRcdGZvbGRlcixcblx0XHRcdHByb3ZpZGVySWQ6IHNlbGVjdGVkRm9sZGVyPy5wcm92aWRlcklkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9mb2xkZXJGcm9tQXR0YWNobWVudHMoYXR0YWNoZWRDb250ZXh0OiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQsIGZvbGRlcnM6IHJlYWRvbmx5IFJvdXRpbmdGb2xkZXJbXSk6IFJvdXRpbmdGb2xkZXIgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgYXR0YWNobWVudCBvZiBhdHRhY2hlZENvbnRleHQgPz8gW10pIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeS50b1VyaShhdHRhY2htZW50KTtcblx0XHRcdGNvbnN0IGZvbGRlciA9IHJlc291cmNlICYmIGZvbGRlcnNcblx0XHRcdFx0LmZpbHRlcihjYW5kaWRhdGUgPT4gaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCBjYW5kaWRhdGUudXJpKSlcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGIudXJpLnBhdGgubGVuZ3RoIC0gYS51cmkucGF0aC5sZW5ndGgpWzBdO1xuXHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gZm9sZGVyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFdvcmtzcGFjZUNhdGFsb2codG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25Sb3V0aW5nV29ya3NwYWNlQ2F0YWxvZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcm91dGluZ1Byb3ZpZGVyID8/IHRoaXMuaG9zdC5nZXRSb3V0aW5nUHJvdmlkZXI/LigpO1xuXHRcdHRoaXMuX3JvdXRpbmdQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdGlmICghcHJvdmlkZXI/LmdldE5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VDYXRhbG9nID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhdGFsb2cgPSBhd2FpdCBwcm92aWRlci5nZXROZXdTZXNzaW9uV29ya3NwYWNlQ2F0YWxvZygpO1xuXHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl93b3Jrc3BhY2VDYXRhbG9nID0gY2F0YWxvZztcblx0XHRcdH1cblx0XHRcdHJldHVybiB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA/IHVuZGVmaW5lZCA6IGNhdGFsb2c7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tjaGF0U2Vzc2lvblJvdXRpbmddIEZhaWxlZCB0byBsb2FkIG5ldy1zZXNzaW9uIHdvcmtzcGFjZXMnLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMuX3dvcmtzcGFjZUNhdGFsb2cgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFJvdXRpbmdGb2xkZXJzKCk6IFJvdXRpbmdGb2xkZXJbXSB7XG5cdFx0Y29uc3QgZm9sZGVyczogUm91dGluZ0ZvbGRlcltdID0gW107XG5cdFx0Y29uc3QgYWRkID0gKGZvbGRlcjogUm91dGluZ0ZvbGRlcikgPT4ge1xuXHRcdFx0aWYgKCFmb2xkZXJzLnNvbWUoY2FuZGlkYXRlID0+IGlzRXF1YWwoY2FuZGlkYXRlLnVyaSwgZm9sZGVyLnVyaSkgJiYgY2FuZGlkYXRlLnByb3ZpZGVySWQgPT09IGZvbGRlci5wcm92aWRlcklkKSkge1xuXHRcdFx0XHRmb2xkZXJzLnB1c2goZm9sZGVyKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGZvciAoY29uc3Qgd29ya3NwYWNlIG9mIHRoaXMuX3dvcmtzcGFjZUNhdGFsb2c/LndvcmtzcGFjZXMgPz8gW10pIHtcblx0XHRcdGFkZCh7XG5cdFx0XHRcdHVyaTogd29ya3NwYWNlLnVyaSxcblx0XHRcdFx0bmFtZTogd29ya3NwYWNlLmxhYmVsLFxuXHRcdFx0XHRhbGlhc2VzOiB3b3Jrc3BhY2UuZGVzY3JpcHRpb24gPyBbd29ya3NwYWNlLmRlc2NyaXB0aW9uXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvdmlkZXJJZDogd29ya3NwYWNlLnByb3ZpZGVySWQsXG5cdFx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0V29ya3NwYWNlID0gdGhpcy5fd29ya3NwYWNlQ2F0YWxvZz8uZGVmYXVsdFdvcmtzcGFjZTtcblx0XHRpZiAoZGVmYXVsdFdvcmtzcGFjZSkge1xuXHRcdFx0YWRkKHtcblx0XHRcdFx0dXJpOiBkZWZhdWx0V29ya3NwYWNlLnVyaSxcblx0XHRcdFx0bmFtZTogZGVmYXVsdFdvcmtzcGFjZS5sYWJlbCxcblx0XHRcdFx0YWxpYXNlczogZGVmYXVsdFdvcmtzcGFjZS5kZXNjcmlwdGlvbiA/IFtkZWZhdWx0V29ya3NwYWNlLmRlc2NyaXB0aW9uXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvdmlkZXJJZDogZGVmYXVsdFdvcmtzcGFjZS5wcm92aWRlcklkLFxuXHRcdFx0XHR3b3Jrc3BhY2U6IGRlZmF1bHRXb3Jrc3BhY2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRhZGQoZm9sZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvbGRlcnM7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kUm91dGluZ0ZvbGRlcihmb2xkZXJVcmk6IFVSSSB8IHVuZGVmaW5lZCwgcHJlZmVycmVkUHJvdmlkZXJJZD86IHN0cmluZyk6IFJvdXRpbmdGb2xkZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghZm9sZGVyVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5fZ2V0Um91dGluZ0ZvbGRlcnMoKS5maWx0ZXIoZm9sZGVyID0+IGlzRXF1YWwoZm9sZGVyLnVyaSwgZm9sZGVyVXJpKSk7XG5cdFx0cmV0dXJuIGZvbGRlcnMuZmluZChmb2xkZXIgPT4gZm9sZGVyLnByb3ZpZGVySWQgPT09IHByZWZlcnJlZFByb3ZpZGVySWQpID8/IGZvbGRlcnNbMF07XG5cdH1cblxuXHRwcml2YXRlIF9oYXNXb3Jrc3BhY2VQaWNrZXJPcHRpb25zKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl93b3Jrc3BhY2VDYXRhbG9nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlQ2F0YWxvZy53b3Jrc3BhY2VzLmxlbmd0aCA+IDAgfHwgdGhpcy5fd29ya3NwYWNlQ2F0YWxvZy5icm93c2VBY3Rpb25zLmxlbmd0aCA+IDA7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoID4gMTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnJpY2ggdGhlIHNob3J0bGlzdGVkIGNhbmRpZGF0ZXMgd2l0aCBjb252ZXJzYXRpb24gY29udGVudCAoZmlyc3Rcblx0ICogcmVxdWVzdCwgbW9zdCByZWNlbnQgcmVxdWVzdCwgYW5kIGEgdHJ1bmNhdGVkIG1vc3QgcmVjZW50IHJlc3BvbnNlKSBzbyB0aGVcblx0ICogZmluYWwgc2NvcmUgY2FuIG1hdGNoIG9uIHdoYXQgYSBzZXNzaW9uIGlzIGFjdHVhbGx5IGFib3V0IHJhdGhlciB0aGFuIGp1c3Rcblx0ICogaXRzIHRpdGxlLiBFYWNoIGZldGNoIGRlZ3JhZGVzIGluZGVwZW5kZW50bHk6IGEgc2Vzc2lvbiB3aG9zZSBjb250ZW50IGNhbid0XG5cdCAqIGJlIHJlc29sdmVkIGlzIGtlcHQgYXMtaXMgb24gaXRzIG1ldGFkYXRhLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5yaWNoQ2FuZGlkYXRlcyhjYW5kaWRhdGVzOiBJUm91dGFibGVTZXNzaW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJvdXRhYmxlU2Vzc2lvbltdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKGNhbmRpZGF0ZXMubWFwKGNhbmRpZGF0ZSA9PiB0aGlzLl9lbnJpY2hDYW5kaWRhdGUoY2FuZGlkYXRlLCB0b2tlbikpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VucmljaENhbmRpZGF0ZShjYW5kaWRhdGU6IElSb3V0YWJsZVNlc3Npb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJvdXRhYmxlU2Vzc2lvbj4ge1xuXHRcdGlmICh0aGlzLl9yb3V0aW5nUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0fVxuXHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5wYXJzZShjYW5kaWRhdGUuc2Vzc2lvbklkKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gYXdhaXQgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uSGlzdG9yeT8uKHJlc291cmNlLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBoaXN0b3J5ID8gdGhpcy5fYXBwbHlIaXN0b3J5KGNhbmRpZGF0ZSwgaGlzdG9yeSkgOiBjYW5kaWRhdGU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW2NoYXRTZXNzaW9uUm91dGluZ10gZW5yaWNoaW5nIGNhbmRpZGF0ZSBmYWlsZWQsIHVzaW5nIG1ldGFkYXRhIG9ubHk6JywgY2FuZGlkYXRlLnNlc3Npb25JZCwgZXJyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEZvbGQgdGhlIGZpcnN0L21vc3QtcmVjZW50IHJlcXVlc3QgYW5kIG1vc3QtcmVjZW50IHJlc3BvbnNlIGludG8gYSBjYW5kaWRhdGUuICovXG5cdHByaXZhdGUgX2FwcGx5SGlzdG9yeShjYW5kaWRhdGU6IElSb3V0YWJsZVNlc3Npb24sIGhpc3Rvcnk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10pOiBJUm91dGFibGVTZXNzaW9uIHtcblx0XHRsZXQgZmlyc3RSZXF1ZXN0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3RSZXF1ZXN0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3RSZXNwb25zZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBoaXN0b3J5KSB7XG5cdFx0XHRpZiAoaXRlbS50eXBlID09PSAncmVxdWVzdCcpIHtcblx0XHRcdFx0Y29uc3QgcHJvbXB0ID0gaXRlbS5wcm9tcHQudHJpbSgpO1xuXHRcdFx0XHRpZiAocHJvbXB0KSB7XG5cdFx0XHRcdFx0Zmlyc3RSZXF1ZXN0ID8/PSBwcm9tcHQ7XG5cdFx0XHRcdFx0bGFzdFJlcXVlc3QgPSBwcm9tcHQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBoaXN0b3J5UmVzcG9uc2VUb1RleHQoaXRlbSk7XG5cdFx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlID0gdGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWZpcnN0UmVxdWVzdCAmJiAhbGFzdFJlcXVlc3QgJiYgIWxhc3RSZXNwb25zZSkge1xuXHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgLi4uY2FuZGlkYXRlLCBmaXJzdFJlcXVlc3QsIGxhc3RSZXF1ZXN0LCBsYXN0UmVzcG9uc2UgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93IHRoZSBhZHZpc29yeSBkZXN0aW5hdGlvbiBwaWNrZXIuIFRoZSBzZWxlY3RlZCBkZXN0aW5hdGlvbiBjb3VudHMgZG93blxuXHQgKiBhbmQgYXV0by1zZW5kcyB1bmxlc3MgdGhlIHVzZXIgYmVnaW5zIGNoYW5naW5nIHRoZSBzZWxlY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9iZWdpblBlbmRpbmdTZW5kKFxuXHRcdHRhcmdldDogUGVuZGluZ1RhcmdldCxcblx0XHRuZXdTZXNzaW9uVGFyZ2V0OiBOZXdTZXNzaW9uVGFyZ2V0LFxuXHRcdHJlc3VsdHM6IElTZXNzaW9uUm91dGVSZXN1bHRbXSxcblx0XHRjYW5kaWRhdGVzOiBJUm91dGFibGVTZXNzaW9uW10sXG5cdFx0c3VibWl0dGVkSW5wdXQ6IHN0cmluZyxcblx0XHRzdWJtaXR0ZWRBdHRhY2htZW50SWRzOiByZWFkb25seSBzdHJpbmdbXSxcblx0XHR1dHRlcmFuY2U6IHN0cmluZyxcblx0XHRyZXF1ZXN0T3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsXG5cdFx0Y3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgYmFkZ2UgPSBkb20uJCgnLmNoYXQtcm91dGluZy1iYWRnZScpO1xuXHRcdHRoaXMuaG9zdC5wbGFjZUJhZGdlKGJhZGdlKTtcblx0XHRpZiAoIWJhZGdlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbY2hhdFNlc3Npb25Sb3V0aW5nXSBubyBzdXJmYWNlIGF2YWlsYWJsZSBmb3IgZGVzdGluYXRpb24gcmV2aWV3OyBwcmVzZXJ2aW5nIGRyYWZ0Jyk7XG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLmhvc3Qub25EaWRSZWplY3RSb3V0ZT8uKHVuZGVmaW5lZCwgcmVxdWVzdE9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCk7XG5cdFx0XHR0aGlzLl9zdWJtaXREcmFmdExpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fc2V0U3VibWlzc2lvblBoYXNlKCdpZGxlJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBiYWRnZS5yZW1vdmUoKSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N1Ym1pdEN0cy52YWx1ZSA9PT0gY3RzKSB7XG5cdFx0XHRcdHRoaXMuX3N1Ym1pdERyYWZ0TGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3BlbmRpbmdTZW5kLnZhbHVlID0gc3RvcmU7XG5cblx0XHR0aGlzLl9yZW5kZXJDb3VudGRvd25CYWRnZShiYWRnZSwgc3RvcmUsIHRhcmdldCwgbmV3U2Vzc2lvblRhcmdldCwgcmVzdWx0cywgY2FuZGlkYXRlcywgc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMsIHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMsIGN0cyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29uZmlkZW50LW1hdGNoIGJhZGdlOiBuYW1lcyB0aGUgcm91dGVkIHNlc3Npb24gYW5kIGNvdW50cyBkb3duLCB0aGVuXG5cdCAqIGF1dG8tc2VuZHMuIFRoZSB1c2VyIGNhbiBzZWxlY3QgYW5vdGhlciBkZXN0aW5hdGlvbiwgY2hvb3NlIHNldmVyYWwsXG5cdCAqIGFib3J0LCBvciBrZWVwIHR5cGluZyB0byBjYW5jZWwgYmVmb3JlIGl0IGZpcmVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyQ291bnRkb3duQmFkZ2UoXG5cdFx0YmFkZ2U6IEhUTUxFbGVtZW50LFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0dGFyZ2V0OiBQZW5kaW5nVGFyZ2V0LFxuXHRcdG5ld1Nlc3Npb25UYXJnZXQ6IE5ld1Nlc3Npb25UYXJnZXQsXG5cdFx0cmVzdWx0czogSVNlc3Npb25Sb3V0ZVJlc3VsdFtdLFxuXHRcdGNhbmRpZGF0ZXM6IElSb3V0YWJsZVNlc3Npb25bXSxcblx0XHRzdWJtaXR0ZWRJbnB1dDogc3RyaW5nLFxuXHRcdHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRcdHV0dGVyYW5jZTogc3RyaW5nLFxuXHRcdHJlcXVlc3RPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyxcblx0XHRjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KGJhZGdlKTtcblx0XHRjb25zdCByb3V0ZUF1dG9zZW5kRGVsYXkgPSBST1VURV9BVVRPU0VORF9ERUxBWV9NUztcblx0XHRiYWRnZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXJvdXRpbmctYmFkZ2UtcmFua2VkJyk7XG5cblx0XHRjb25zdCBsYWJlbEJ5SWQgPSBuZXcgTWFwKGNhbmRpZGF0ZXMubWFwKGNhbmRpZGF0ZSA9PiBbY2FuZGlkYXRlLnNlc3Npb25JZCwgY2FuZGlkYXRlLmxhYmVsXSkpO1xuXHRcdGNvbnN0IHJhbmtlZCA9IHJlc3VsdHNcblx0XHRcdC5maWx0ZXIocmVzdWx0ID0+IGxhYmVsQnlJZC5oYXMocmVzdWx0LnNlc3Npb25JZCkgJiYgaXNIaWdoQ29uZmlkZW5jZVNlc3Npb25Sb3V0ZShyZXN1bHQpKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGIuY29uZmlkZW5jZSAtIGEuY29uZmlkZW5jZSlcblx0XHRcdC5zbGljZSgwLCBST1VURV9NQVhfQ0hPSUNFUylcblx0XHRcdC5tYXAocmVzdWx0ID0+ICh7XG5cdFx0XHRcdGtpbmQ6ICdzZXNzaW9uJyBhcyBjb25zdCxcblx0XHRcdFx0c2Vzc2lvbklkOiByZXN1bHQuc2Vzc2lvbklkLFxuXHRcdFx0XHRsYWJlbDogbGFiZWxCeUlkLmdldChyZXN1bHQuc2Vzc2lvbklkKSA/PyByZXN1bHQuc2Vzc2lvbklkLFxuXHRcdFx0XHRjb25maWRlbmNlOiByZXN1bHQuY29uZmlkZW5jZSxcblx0XHRcdH0pKTtcblx0XHRjb25zdCBvcHRpb25zOiBQZW5kaW5nVGFyZ2V0W10gPSBbXG5cdFx0XHQuLi5yYW5rZWQsXG5cdFx0XHRuZXdTZXNzaW9uVGFyZ2V0LFxuXHRcdF07XG5cdFx0Y29uc3QgcHJlc2VsZWN0ZWQgPSBNYXRoLm1heCgwLCBvcHRpb25zLmZpbmRJbmRleChvcHRpb24gPT5cblx0XHRcdHRhcmdldC5raW5kID09PSAnc2Vzc2lvbidcblx0XHRcdFx0PyBvcHRpb24ua2luZCA9PT0gJ3Nlc3Npb24nICYmIG9wdGlvbi5zZXNzaW9uSWQgPT09IHRhcmdldC5zZXNzaW9uSWRcblx0XHRcdFx0OiBvcHRpb24ua2luZCA9PT0gJ25ldycpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBuZXcgU2V0PG51bWJlcj4oW3ByZXNlbGVjdGVkXSk7XG5cblx0XHRjb25zdCBoZWFkID0gZG9tLmFwcGVuZChiYWRnZSwgZG9tLiQoJy5jaGF0LXJvdXRpbmctYmFkZ2UtaGVhZCcpKTtcblx0XHRjb25zdCBoZWFkTGFiZWwgPSBkb20uYXBwZW5kKGhlYWQsIGRvbS4kKCdzcGFuLmNoYXQtcm91dGluZy1iYWRnZS10aXRsZScpKTtcblx0XHRjb25zdCBjb3VudGRvd25FbCA9IGRvbS5hcHBlbmQoaGVhZCwgZG9tLiQoJ3NwYW4uY2hhdC1yb3V0aW5nLWJhZGdlLWNvdW50ZG93bicpKTtcblx0XHRjb25zdCBsaXN0ID0gZG9tLmFwcGVuZChiYWRnZSwgZG9tLiQoJy5jaGF0LXJvdXRpbmctYmFkZ2UtbGlzdCcsIHsgcm9sZTogJ2xpc3Rib3gnLCAnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VuZFRvJywgXCJTZW5kIHRvXCIpLCAnYXJpYS1tdWx0aXNlbGVjdGFibGUnOiAndHJ1ZScgfSkpO1xuXHRcdGxldCBmb2xkZXJQaWNrZXI6IENoYXRTZXNzaW9uUm91dGluZ0ZvbGRlclBpY2tlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRsZXQgZm9jdXNlZEluZGV4ID0gcHJlc2VsZWN0ZWQ7XG5cdFx0Y29uc3Qgcm93cyA9IG9wdGlvbnMubWFwKChvcHRpb24sIGluZGV4KSA9PiB7XG5cdFx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKGxpc3QsIGRvbS4kKCcuY2hhdC1yb3V0aW5nLWJhZGdlLXJvdycsIHsgcm9sZTogJ29wdGlvbicsIHRhYmluZGV4OiAnMCcgfSkpO1xuXHRcdFx0Y29uc3QgbWFyayA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnc3Bhbi5jaGF0LXJvdXRpbmctYmFkZ2UtbWFyaycpKTtcblx0XHRcdG1hcmsuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLnBhc3MpKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChyb3csIGRvbS4kKCdzcGFuLmNoYXQtcm91dGluZy1iYWRnZS1uYW1lJykpO1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBvcHRpb24ubGFiZWw7XG5cdFx0XHRjb25zdCBzY29yZSA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnc3Bhbi5jaGF0LXJvdXRpbmctYmFkZ2Utc2NvcmUnKSk7XG5cdFx0XHRzY29yZS50ZXh0Q29udGVudCA9IG9wdGlvbi5raW5kID09PSAnc2Vzc2lvbidcblx0XHRcdFx0PyBpbmRleCA9PT0gMFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5iZXN0TWF0Y2hTZXNzaW9uTW9kZWwnLCBcIkJlc3QgTWF0Y2ggXHUwMEI3IFNlc3Npb24gbW9kZWxcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuaGlnaENvbmZpZGVuY2VTZXNzaW9uTW9kZWwnLCBcIkhpZ2ggQ29uZmlkZW5jZSBcdTAwQjcgU2Vzc2lvbiBtb2RlbFwiKVxuXHRcdFx0XHQ6IHJlcXVlc3RPcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsSWRcblx0XHRcdFx0XHQ/IHRoaXMuaG9zdC5nZXRTZWxlY3RlZE1vZGVsTGFiZWw/LigpID8/IHJlcXVlc3RPcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsSWRcblx0XHRcdFx0XHQ6ICcnO1xuXHRcdFx0aWYgKG9wdGlvbi5raW5kID09PSAnbmV3JyAmJiB0aGlzLl9oYXNXb3Jrc3BhY2VQaWNrZXJPcHRpb25zKCkpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRGb2xkZXJOYW1lID0gb3B0aW9uLmZvbGRlclxuXHRcdFx0XHRcdD8gdGhpcy5fZmluZFJvdXRpbmdGb2xkZXIob3B0aW9uLmZvbGRlciwgb3B0aW9uLnByb3ZpZGVySWQpPy5uYW1lID8/IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKG9wdGlvbi5mb2xkZXIpPy5uYW1lID8/IGJhc2VuYW1lKG9wdGlvbi5mb2xkZXIpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvbGRlclBpY2tlciA9IHN0b3JlLmFkZChuZXcgQ2hhdFNlc3Npb25Sb3V0aW5nRm9sZGVyUGlja2VyKFxuXHRcdFx0XHRcdHJvdyxcblx0XHRcdFx0XHR0aGlzLmhvc3QsXG5cdFx0XHRcdFx0eyB1cmk6IG9wdGlvbi5mb2xkZXIsIHByb3ZpZGVySWQ6IG9wdGlvbi5wcm92aWRlcklkLCBsYWJlbDogc2VsZWN0ZWRGb2xkZXJOYW1lIH0sXG5cdFx0XHRcdFx0dGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdFx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLFxuXHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdCkpO1xuXHRcdFx0XHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihmb2xkZXJQaWNrZXIuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgYXN5bmMgZXZlbnQgPT4ge1xuXHRcdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0c2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHRcdFx0c2VsZWN0aW9uLmFkZChpbmRleCk7XG5cdFx0XHRcdFx0cmVuZGVyU2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0Y291bnRkb3duVGltZXIuY2xlYXIoKTtcblx0XHRcdFx0XHRjb3VudGRvd25FbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcud2FpdGluZycsIFwid2FpdGluZyBmb3IgeW91XCIpO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgZm9sZGVyUGlja2VyIS5waWNrKHtcblx0XHRcdFx0XHRcdHByb3ZpZGVyOiB0aGlzLl9yb3V0aW5nUHJvdmlkZXIsXG5cdFx0XHRcdFx0XHRnZXRDYXRhbG9nOiB0b2tlbiA9PiB0aGlzLl9yZWZyZXNoV29ya3NwYWNlQ2F0YWxvZyh0b2tlbiksXG5cdFx0XHRcdFx0XHR0b2tlbjogY3RzLnRva2VuLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChzZWxlY3RlZCAmJiAhZGlzcG9zZWQgJiYgIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiAhZGlkRGlzcGF0Y2ggJiYgb3B0aW9uc1tpbmRleF0ua2luZCA9PT0gJ25ldycpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBzZWxlY3RlZC5sYWJlbCA/PyBiYXNlbmFtZShzZWxlY3RlZC51cmkhKTtcblx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRUYXJnZXQ6IE5ld1Nlc3Npb25UYXJnZXQgPSB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICduZXcnLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5uZXdTZXNzaW9uSW5Gb2xkZXInLCBcIk5ldyBzZXNzaW9uIGluIHswfVwiLCBuYW1lKSxcblx0XHRcdFx0XHRcdFx0Zm9sZGVyOiBzZWxlY3RlZC51cmksXG5cdFx0XHRcdFx0XHRcdHByb3ZpZGVySWQ6IHNlbGVjdGVkLnByb3ZpZGVySWQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0b3B0aW9uc1tpbmRleF0gPSB1cGRhdGVkVGFyZ2V0O1xuXHRcdFx0XHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSB1cGRhdGVkVGFyZ2V0LmxhYmVsO1xuXHRcdFx0XHRcdFx0Zm9sZGVyUGlja2VyIS5zZXRUYXJnZXQoc2VsZWN0ZWQpO1xuXHRcdFx0XHRcdFx0YXJpYUFsZXJ0KGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcudGFyZ2V0Rm9sZGVyQ2hhbmdlZCcsIFwiTmV3IHNlc3Npb24gd2lsbCB1c2UgZm9sZGVyIHswfS5cIiwgbmFtZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWRpc3Bvc2VkICYmICFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgIWRpZERpc3BhdGNoKSB7XG5cdFx0XHRcdFx0XHRzdGFydENvdW50ZG93bigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0c3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocm93LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBldmVudCA9PiB7XG5cdFx0XHRcdGZvY3VzZWRJbmRleCA9IGluZGV4O1xuXHRcdFx0XHRpZiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSB7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbi5oYXMoaW5kZXgpICYmIHNlbGVjdGlvbi5zaXplID4gMSkge1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uLmRlbGV0ZShpbmRleCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNlbGVjdGlvbi5hZGQoaW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb3VudGRvd25UaW1lci5jbGVhcigpO1xuXHRcdFx0XHRcdGNvdW50ZG93bkVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy53YWl0aW5nJywgXCJ3YWl0aW5nIGZvciB5b3VcIik7XG5cdFx0XHRcdFx0cmVuZGVyU2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlbGVjdGlvbi5jbGVhcigpO1xuXHRcdFx0XHRzZWxlY3Rpb24uYWRkKGluZGV4KTtcblx0XHRcdFx0cmVuZGVyU2VsZWN0aW9uKCk7XG5cdFx0XHRcdHNlbmQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHJldHVybiByb3c7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBmb290ID0gZG9tLmFwcGVuZChiYWRnZSwgZG9tLiQoJy5jaGF0LXJvdXRpbmctYmFkZ2UtZm9vdCcpKTtcblx0XHRjb25zdCBjaGFuZ2VIaW50ID0gZG9tLmFwcGVuZChmb290LCBkb20uJCgnc3BhbicpKTtcblx0XHRjaGFuZ2VIaW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5jaGFuZ2VIaW50JywgXCJUYWIgdG8gY2hvb3NlIFx1MDBCNyBBcnJvdyBrZXlzIG1vdmUgXHUwMEI3IFNwYWNlIHNlbGVjdHMgc2V2ZXJhbCBcdTAwQjcgRXNjYXBlIGNhbmNlbHNcIik7XG5cdFx0Y29uc3Qgc2VuZEhpbnQgPSBkb20uYXBwZW5kKGZvb3QsIGRvbS4kKCdzcGFuLmNoYXQtcm91dGluZy1iYWRnZS1mb290LWVuZCcpKTtcblxuXHRcdGNvbnN0IHJlbmRlclNlbGVjdGlvbiA9ICgpID0+IHtcblx0XHRcdHJvd3MuZm9yRWFjaCgocm93LCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IHNlbGVjdGlvbi5oYXMoaW5kZXgpO1xuXHRcdFx0XHRyb3cuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBzZWxlY3RlZCk7XG5cdFx0XHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCBTdHJpbmcoc2VsZWN0ZWQpKTtcblx0XHRcdFx0cm93LnRhYkluZGV4ID0gZm9jdXNlZEluZGV4ID09PSBpbmRleCA/IDAgOiAtMTtcblx0XHRcdH0pO1xuXHRcdFx0bGlzdC5jbGFzc0xpc3QudG9nZ2xlKCdtdWx0aXBsZScsIHNlbGVjdGlvbi5zaXplID4gMSk7XG5cdFx0XHRoZWFkTGFiZWwudGV4dENvbnRlbnQgPSBzZWxlY3Rpb24uc2l6ZSA+IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnNlbmRUb01hbnknLCBcIlNlbmQgdG8gezB9IHNlc3Npb25zXCIsIHNlbGVjdGlvbi5zaXplKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VuZFRvJywgXCJTZW5kIHRvXCIpO1xuXHRcdFx0c2VuZEhpbnQudGV4dENvbnRlbnQgPSBzZWxlY3Rpb24uc2l6ZSA+IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnNlbmRBbGxIaW50JywgXCJFbnRlciB0byBzZW5kIHRvIGFsbFwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VuZE5vd0hpbnQnLCBcIkVudGVyIHRvIHNlbmQgbm93XCIpO1xuXHRcdH07XG5cdFx0cmVuZGVyU2VsZWN0aW9uKCk7XG5cdFx0Y29uc3QgaW5pdGlhbFRhcmdldCA9IG9wdGlvbnNbcHJlc2VsZWN0ZWRdO1xuXHRcdGFyaWFBbGVydChpbml0aWFsVGFyZ2V0LmtpbmQgPT09ICdzZXNzaW9uJ1xuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnNlbmRpbmdUb0luJywgXCJTZW5kaW5nIHRvIHswfSBpbiB7MX0gc2Vjb25kcy4gUHJlc3MgRXNjYXBlIHRvIGNhbmNlbC5cIiwgaW5pdGlhbFRhcmdldC5sYWJlbCwgTWF0aC5jZWlsKHJvdXRlQXV0b3NlbmREZWxheSAvIDEwMDApKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLmNvbmZpcm1OZXdTZXNzaW9uJywgXCJObyBjb25maWRlbnQgbWF0Y2guIENob29zZSBhIGRlc3RpbmF0aW9uIGJlZm9yZSBzZW5kaW5nLlwiKSk7XG5cblx0XHRsZXQgcmVtYWluaW5nU2Vjb25kcyA9IE1hdGguY2VpbChyb3V0ZUF1dG9zZW5kRGVsYXkgLyAxMDAwKTtcblx0XHRjb25zdCByZW5kZXJDb3VudGRvd24gPSAoKSA9PiB7XG5cdFx0XHRjb3VudGRvd25FbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VuZGluZ0luJywgXCJzZW5kaW5nIGluIHswfXNcIiwgcmVtYWluaW5nU2Vjb25kcyk7XG5cdFx0fTtcblxuXHRcdGxldCBkaWREaXNwYXRjaCA9IGZhbHNlO1xuXHRcdGNvbnN0IHNlbmQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZGlkRGlzcGF0Y2gpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGlkRGlzcGF0Y2ggPSB0cnVlO1xuXHRcdFx0Y291bnRkb3duVGltZXIuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3N1Ym1pdERyYWZ0TGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9zZXRTdWJtaXNzaW9uUGhhc2UoJ2Rpc3BhdGNoaW5nJyk7XG5cdFx0XHRiYWRnZS5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJvdXRpbmctYmFkZ2UtcmFua2VkJyk7XG5cdFx0XHRiYWRnZS5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdGNvbnN0IHByb2dyZXNzID0gZG9tLmFwcGVuZChiYWRnZSwgZG9tLiQoJ3NwYW4uY2hhdC1yb3V0aW5nLWJhZGdlLXNlbnQtbWFyaycpKTtcblx0XHRcdHByb2dyZXNzLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5sb2FkaW5nKSk7XG5cdFx0XHRjb25zdCBwcm9ncmVzc0xhYmVsID0gZG9tLmFwcGVuZChiYWRnZSwgZG9tLiQoJ3NwYW4uY2hhdC1yb3V0aW5nLWJhZGdlLWxhYmVsJykpO1xuXHRcdFx0cHJvZ3Jlc3NMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuZGlzcGF0Y2hpbmcnLCBcIlNlbmRpbmcgcmVxdWVzdFx1MjAyNlwiKTtcblx0XHRcdGNvbnN0IHNlbnQgPSBbLi4uc2VsZWN0aW9uXS5zb3J0KChhLCBiKSA9PiBhIC0gYikubWFwKGluZGV4ID0+IG9wdGlvbnNbaW5kZXhdKTtcblx0XHRcdGlmICghc2VudC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5ob3N0Lm9uRGlkUmVqZWN0Um91dGU/Lih1bmRlZmluZWQsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQpO1xuXHRcdFx0XHR0aGlzLl9zZXRTdWJtaXNzaW9uUGhhc2UoJ2lkbGUnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlbnQubGVuZ3RoID4gMSkge1xuXHRcdFx0XHR0aGlzLmhvc3Qub25EaWRSZXNvbHZlUm91dGU/Lih1bmRlZmluZWQsIHVuZGVmaW5lZCwgcmVxdWVzdE9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaXNwYXRjaGVzID0gc2VudC5tYXAoc2VsZWN0ZWQgPT5cblx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hUbyhzZWxlY3RlZCwgc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMsIHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMsIGN0cy50b2tlbiwgc2VudC5sZW5ndGggPT09IDEpXG5cdFx0XHQpO1xuXHRcdFx0aWYgKHNlbnQubGVuZ3RoID4gMSkge1xuXHRcdFx0XHR2b2lkIFByb21pc2UuYWxsKGRpc3BhdGNoZXMpLnRoZW4ocmVzdWx0cyA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N1Ym1pdEN0cy52YWx1ZSA9PT0gY3RzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXRTdWJtaXNzaW9uUGhhc2UoJ2lkbGUnKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dGYW5vdXRPdXRjb21lcyhzZW50LCByZXN1bHRzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR2b2lkIGRpc3BhdGNoZXNbMF0udGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fc3VibWl0Q3RzLnZhbHVlICE9PSBjdHMpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2V0U3VibWlzc2lvblBoYXNlKCdpZGxlJyk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkID0gc2VudFswXTtcblx0XHRcdFx0aWYgKChyZXN1bHQuc3RhdHVzID09PSAnc2VudCcgfHwgcmVzdWx0LnN0YXR1cyA9PT0gJ3F1ZXVlZCcpICYmIHJlc3VsdC5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dEZWxpdmVyeUNvbmZpcm1hdGlvbihzZWxlY3RlZC5sYWJlbCwgcmVzdWx0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zaG93RGlzcGF0Y2hGYWlsdXJlKHNlbGVjdGVkLmxhYmVsLCByZXN1bHQucmVhc29uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvdW50ZG93blRpbWVyID0gc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCBzdGFydENvdW50ZG93biA9ICgpID0+IHtcblx0XHRcdHJlbmRlckNvdW50ZG93bigpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gdGFyZ2V0V2luZG93LnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0cmVtYWluaW5nU2Vjb25kcy0tO1xuXHRcdFx0XHRpZiAocmVtYWluaW5nU2Vjb25kcyA8PSAwKSB7XG5cdFx0XHRcdFx0c2VuZCgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZW5kZXJDb3VudGRvd24oKTtcblx0XHRcdH0sIDEwMDApO1xuXHRcdFx0Y291bnRkb3duVGltZXIudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gdGFyZ2V0V2luZG93LmNsZWFySW50ZXJ2YWwoaGFuZGxlKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNhbmNlbCA9ICgpID0+IHtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuaG9zdC5vbkRpZFJlamVjdFJvdXRlPy4odW5kZWZpbmVkLCByZXF1ZXN0T3B0aW9ucy5pc1ZvaWNlTW9kZUlucHV0KTtcblx0XHRcdHRoaXMuX3BlbmRpbmdTZW5kLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9zZXRTdWJtaXNzaW9uUGhhc2UoJ2lkbGUnKTtcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBldmVudCA9PiB7XG5cdFx0XHRpZiAoZm9sZGVyUGlja2VyPy5pc0FjdGl2ZSB8fCAoZG9tLmlzSFRNTEVsZW1lbnQoZXZlbnQudGFyZ2V0KSAmJiBldmVudC50YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXJvdXRpbmctYmFkZ2UtZm9sZGVyLWFjdGlvbicpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCk7XG5cdFx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y2FuY2VsKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlzUm91dGluZ0ludGVyYWN0aW9uID0gZG9tLmlzSFRNTEVsZW1lbnQoZXZlbnQudGFyZ2V0KSAmJiBiYWRnZS5jb250YWlucyhldmVudC50YXJnZXQpO1xuXHRcdFx0Y29uc3QgaXNMaXN0SW50ZXJhY3Rpb24gPSBpc1JvdXRpbmdJbnRlcmFjdGlvbiAmJiAhIWV2ZW50LnRhcmdldC5jbG9zZXN0KCcuY2hhdC1yb3V0aW5nLWJhZGdlLXJvdycpO1xuXHRcdFx0aWYgKGlzTGlzdEludGVyYWN0aW9uICYmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkhvbWUpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW5kKSkpIHtcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5Ib21lKSkge1xuXHRcdFx0XHRcdGZvY3VzZWRJbmRleCA9IDA7XG5cdFx0XHRcdH0gZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbmQpKSB7XG5cdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gcm93cy5sZW5ndGggLSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGRlbHRhID0ga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSA/IC0xIDogMTtcblx0XHRcdFx0XHRmb2N1c2VkSW5kZXggPSAoZm9jdXNlZEluZGV4ICsgZGVsdGEgKyByb3dzLmxlbmd0aCkgJSByb3dzLmxlbmd0aDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZW5kZXJTZWxlY3Rpb24oKTtcblx0XHRcdFx0cm93c1tmb2N1c2VkSW5kZXhdLmZvY3VzKCk7XG5cdFx0XHRcdGNvdW50ZG93blRpbWVyLmNsZWFyKCk7XG5cdFx0XHRcdGNvdW50ZG93bkVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy53YWl0aW5nJywgXCJ3YWl0aW5nIGZvciB5b3VcIik7XG5cdFx0XHR9IGVsc2UgaWYgKGlzTGlzdEludGVyYWN0aW9uICYmIGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5oYXMoZm9jdXNlZEluZGV4KSAmJiBzZWxlY3Rpb24uc2l6ZSA+IDEpIHtcblx0XHRcdFx0XHRzZWxlY3Rpb24uZGVsZXRlKGZvY3VzZWRJbmRleCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uLmFkZChmb2N1c2VkSW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlbmRlclNlbGVjdGlvbigpO1xuXHRcdFx0XHRjb3VudGRvd25UaW1lci5jbGVhcigpO1xuXHRcdFx0XHRjb3VudGRvd25FbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcud2FpdGluZycsIFwid2FpdGluZyBmb3IgeW91XCIpO1xuXHRcdFx0fSBlbHNlIGlmIChpc0xpc3RJbnRlcmFjdGlvbiAmJiBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHNlbmQoKTtcblx0XHRcdH1cblx0XHR9LCB0cnVlKSk7XG5cblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHR9KSk7XG5cblx0XHRzdGFydENvdW50ZG93bigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0RlbGl2ZXJ5Q29uZmlybWF0aW9uKGxhYmVsOiBzdHJpbmcsIHJlc3VsdDogSUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSByZXN1bHQucmVzb3VyY2U7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fc2hvd0Rpc3BhdGNoRmFpbHVyZShsYWJlbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdTZW5kLmNsZWFyKCk7XG5cdFx0Y29uc3QgYmFkZ2UgPSBkb20uJCgnLmNoYXQtcm91dGluZy1iYWRnZScpO1xuXHRcdGNvbnN0IG1hcmsgPSBkb20uYXBwZW5kKGJhZGdlLCBkb20uJCgnc3Bhbi5jaGF0LXJvdXRpbmctYmFkZ2Utc2VudC1tYXJrJykpO1xuXHRcdG1hcmsuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihyZXN1bHQuc3RhdHVzID09PSAncXVldWVkJyA/IENvZGljb24uY2xvY2sgOiBDb2RpY29uLnBhc3MpKTtcblx0XHRjb25zdCBsYWJlbEVsID0gZG9tLmFwcGVuZChiYWRnZSwgZG9tLiQoJ3NwYW4uY2hhdC1yb3V0aW5nLWJhZGdlLWxhYmVsJykpO1xuXHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSByZXN1bHQuc3RhdHVzID09PSAncXVldWVkJ1xuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnF1ZXVlZEZvcicsIFwiUXVldWVkIGZvciB7MH1cIiwgbGFiZWwpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VudFRvJywgXCJTZW50IHRvIHswfVwiLCBsYWJlbCk7XG5cdFx0dGhpcy5ob3N0LnBsYWNlQmFkZ2UoYmFkZ2UpO1xuXHRcdGlmICghYmFkZ2UucGFyZW50RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGl2ZXJ5SWQgPSArK3RoaXMuX2RlbGl2ZXJ5Q29uZmlybWF0aW9uSWQ7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBiYWRnZS5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IGRlbGl2ZXJ5OiBJRGVsaXZlcnlDb25maXJtYXRpb24gPSB7XG5cdFx0XHRjb21wbGV0ZWQ6IGZhbHNlLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpLFxuXHRcdH07XG5cdFx0Y29uc3QgcmV2ZWFsID0gcmVzdWx0LnJldmVhbCA/PyAoKCkgPT4gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbihyZXNvdXJjZSkpO1xuXHRcdHRoaXMuX2FkZEFjdGlvbkxpbmsoc3RvcmUsIGJhZGdlLCBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLm9wZW4nLCBcIk9wZW5cIiksICgpID0+IHZvaWQgcmV2ZWFsKCkpO1xuXHRcdHRoaXMuX2FkZEFjdGlvbkxpbmsoc3RvcmUsIGJhZGdlLCBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLmRpc21pc3MnLCBcIkRpc21pc3NcIiksICgpID0+IHtcblx0XHRcdHRoaXMuaG9zdC5vbkRpZERpc21pc3NSb3V0ZT8uKHJlc291cmNlLCByZXN1bHQucmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX2RlbGl2ZXJ5Q29uZmlybWF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGRlbGl2ZXJ5SWQpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2RlbGl2ZXJ5Q29uZmlybWF0aW9ucy5zZXQoZGVsaXZlcnlJZCwgZGVsaXZlcnkpO1xuXHRcdGNvbnN0IGFubm91bmNlbWVudCA9IHJlc3VsdC5zdGF0dXMgPT09ICdxdWV1ZWQnXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcucXVldWVkRm9yJywgXCJRdWV1ZWQgZm9yIHswfVwiLCBsYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5zZW50VG8nLCBcIlNlbnQgdG8gezB9XCIsIGxhYmVsKTtcblx0XHRhcmlhQWxlcnQoYW5ub3VuY2VtZW50KTtcblx0XHRsZXQgdHJhY2tpbmdBY3Rpdml0eSA9IGZhbHNlO1xuXHRcdGNvbnN0IHRyYWNrQWN0aXZpdHkgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRyYWNraW5nQWN0aXZpdHkpIHtcblx0XHRcdFx0dHJhY2tpbmdBY3Rpdml0eSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3RyYWNrRGVsaXZlcnlBY3Rpdml0eShzdG9yZSwgcmVzb3VyY2UsIGxhYmVsLCBtYXJrLCBsYWJlbEVsLCByZXN1bHQuc3RhdHVzID09PSAncXVldWVkJywgcmVzdWx0LmFjdGl2aXR5QmFzZWxpbmUsIGNvbXBsZXRlZCA9PiBkZWxpdmVyeS5jb21wbGV0ZWQgPSBjb21wbGV0ZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgcm91dGluZ1Byb3ZpZGVyID0gdGhpcy5fcm91dGluZ1Byb3ZpZGVyID8/IHRoaXMuaG9zdC5nZXRSb3V0aW5nUHJvdmlkZXI/LigpO1xuXHRcdGlmICghcmVzdWx0LnJldmVhbCB8fCByb3V0aW5nUHJvdmlkZXI/LmdldFNlc3Npb25TbmFwc2hvdCkge1xuXHRcdFx0dHJhY2tBY3Rpdml0eSgpO1xuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQuY29tcGxldGlvbikge1xuXHRcdFx0dm9pZCByZXN1bHQuY29tcGxldGlvbi50aGVuKGNvbXBsZXRpb24gPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fZGVsaXZlcnlDb25maXJtYXRpb25zLmdldChkZWxpdmVyeUlkKSAhPT0gZGVsaXZlcnkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbXBsZXRpb24uc3RhdHVzID09PSAnc2VudCcpIHtcblx0XHRcdFx0XHRtYXJrLnJlcGxhY2VDaGlsZHJlbihyZW5kZXJJY29uKENvZGljb24ucGFzcykpO1xuXHRcdFx0XHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnNlbnRUbycsIFwiU2VudCB0byB7MH1cIiwgbGFiZWwpO1xuXHRcdFx0XHRcdGFyaWFBbGVydChsYWJlbEVsLnRleHRDb250ZW50KTtcblx0XHRcdFx0XHR0cmFja0FjdGl2aXR5KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWFyay5yZXBsYWNlQ2hpbGRyZW4ocmVuZGVySWNvbihjb21wbGV0aW9uLnJlYXNvbkNvZGUgPT09ICdwcm92aWRlclJlbW92ZWQnID8gQ29kaWNvbi5jaXJjbGVTbGFzaCA6IENvZGljb24uZXJyb3IpKTtcblx0XHRcdFx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gY29tcGxldGlvbi5yZWFzb25Db2RlID09PSAncHJvdmlkZXJSZW1vdmVkJ1xuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLm5vTG9uZ2VyUXVldWVkJywgXCJSZXF1ZXN0IGlzIG5vIGxvbmdlciBxdWV1ZWQgZm9yIHswfVwiLCBsYWJlbClcblx0XHRcdFx0XHRcdDogY29tcGxldGlvbi5yZWFzb25Db2RlID09PSAnY2FuY2VsbGVkJ1xuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcucXVldWVDYW5jZWxsZWQnLCBcIlF1ZXVlZCByZXF1ZXN0IHRvIHswfSB3YXMgY2FuY2VsbGVkXCIsIGxhYmVsKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcucXVldWVkTm90U2VudCcsIFwiUXVldWVkIHJlcXVlc3QgdG8gezB9IHdhcyBub3Qgc2VudFwiLCBsYWJlbCk7XG5cdFx0XHRcdFx0YXJpYUFsZXJ0KGxhYmVsRWwudGV4dENvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckNvbXBsZXRlZERlbGl2ZXJ5Q29uZmlybWF0aW9ucygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGRlbGl2ZXJ5SWQgb2YgWy4uLnRoaXMuX2RlbGl2ZXJ5Q29uZmlybWF0aW9ucy5rZXlzKCldKSB7XG5cdFx0XHRpZiAodGhpcy5fZGVsaXZlcnlDb25maXJtYXRpb25zLmdldChkZWxpdmVyeUlkKT8uY29tcGxldGVkKSB7XG5cdFx0XHRcdHRoaXMuX2RlbGl2ZXJ5Q29uZmlybWF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGRlbGl2ZXJ5SWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrRGVsaXZlcnlBY3Rpdml0eShzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCByZXNvdXJjZTogVVJJLCBsYWJlbDogc3RyaW5nLCBtYXJrOiBIVE1MRWxlbWVudCwgbGFiZWxFbGVtZW50OiBIVE1MRWxlbWVudCwgd2FpdEZvckFjdGl2aXR5OiBib29sZWFuLCBhY3Rpdml0eUJhc2VsaW5lOiBudW1iZXIgfCB1bmRlZmluZWQsIHNldENvbXBsZXRlZDogKGNvbXBsZXRlZDogYm9vbGVhbikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJvdXRpbmdQcm92aWRlciA9IHRoaXMuX3JvdXRpbmdQcm92aWRlciA/PyB0aGlzLmhvc3QuZ2V0Um91dGluZ1Byb3ZpZGVyPy4oKTtcblx0XHRpZiAocm91dGluZ1Byb3ZpZGVyPy5nZXRTZXNzaW9uU25hcHNob3QpIHtcblx0XHRcdHRoaXMuX3RyYWNrUHJvdmlkZXJEZWxpdmVyeUFjdGl2aXR5KHN0b3JlLCByb3V0aW5nUHJvdmlkZXIsIHJlc291cmNlLCBsYWJlbCwgbWFyaywgbGFiZWxFbGVtZW50LCBhY3Rpdml0eUJhc2VsaW5lLCBzZXRDb21wbGV0ZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVuZGVyZWRQcmV2aWV3ID0gc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0bGV0IGxhc3RBbm5vdW5jZW1lbnQgPSBsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQ7XG5cdFx0bGV0IG9ic2VydmVkQWN0aXZpdHkgPSAhd2FpdEZvckFjdGl2aXR5O1xuXHRcdGNvbnN0IHVwZGF0ZSA9IChyZXF1ZXN0SW5Qcm9ncmVzcyA9IG1vZGVsPy5yZXF1ZXN0SW5Qcm9ncmVzcy5nZXQoKSA/PyBmYWxzZSwgbmVlZHNJbnB1dCA9ICEhbW9kZWw/LnJlcXVlc3ROZWVkc0lucHV0LmdldCgpKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5nZXRTZXNzaW9uKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25MYWJlbCA9IHNlc3Npb24/LmxhYmVsIHx8IGxhYmVsO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXR1cyA9IHNlc3Npb24/LnN0YXR1cztcblx0XHRcdGxldCBpY29uID0gd2FpdEZvckFjdGl2aXR5ICYmICFvYnNlcnZlZEFjdGl2aXR5ID8gQ29kaWNvbi5jbG9jayA6IENvZGljb24ucGFzcztcblx0XHRcdGxldCBzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VudFRvJywgXCJTZW50IHRvIHswfVwiLCBzZXNzaW9uTGFiZWwpO1xuXHRcdFx0bGV0IGlzQ29tcGxldGVkID0gZmFsc2U7XG5cdFx0XHRpZiAobmVlZHNJbnB1dCB8fCBzZXNzaW9uU3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCkge1xuXHRcdFx0XHRvYnNlcnZlZEFjdGl2aXR5ID0gdHJ1ZTtcblx0XHRcdFx0aWNvbiA9IENvZGljb24ucXVlc3Rpb247XG5cdFx0XHRcdHN0YXR1c0xhYmVsID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5uZWVkc0lucHV0SW4nLCBcInswfSBuZWVkcyB5b3VyIGlucHV0XCIsIHNlc3Npb25MYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlcXVlc3RJblByb2dyZXNzIHx8IHNlc3Npb25TdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSB7XG5cdFx0XHRcdG9ic2VydmVkQWN0aXZpdHkgPSB0cnVlO1xuXHRcdFx0XHRpY29uID0gQ29kaWNvbi5sb2FkaW5nO1xuXHRcdFx0XHRzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuaW5Qcm9ncmVzcycsIFwiSW4gcHJvZ3Jlc3M6IHswfVwiLCBzZXNzaW9uTGFiZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChzZXNzaW9uU3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuRmFpbGVkKSB7XG5cdFx0XHRcdG9ic2VydmVkQWN0aXZpdHkgPSB0cnVlO1xuXHRcdFx0XHRpY29uID0gQ29kaWNvbi5lcnJvcjtcblx0XHRcdFx0c3RhdHVzTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLmZhaWxlZEluJywgXCJGYWlsZWQgaW4gezB9XCIsIHNlc3Npb25MYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKG9ic2VydmVkQWN0aXZpdHkgJiYgKHNlc3Npb25TdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgfHwgbW9kZWw/Lmhhc1JlcXVlc3RzKSkge1xuXHRcdFx0XHRzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuY29tcGxldGVkJywgXCJDb21wbGV0ZWQgezB9XCIsIGxvd2VyY2FzZUZpcnN0TGV0dGVyKHNlc3Npb25MYWJlbCkpO1xuXHRcdFx0XHRpc0NvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRzZXRDb21wbGV0ZWQoaXNDb21wbGV0ZWQpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBtb2RlbD8ubGFzdFJlcXVlc3Q/LnJlc3BvbnNlO1xuXHRcdFx0Y29uc3QgcHJldmlldyA9IGlzQ29tcGxldGVkICYmIHJlc3BvbnNlPy5pc0NvbXBsZXRlXG5cdFx0XHRcdD8gcmVzcG9uc2VQcmV2aWV3KHJlc3BvbnNlLnJlc3BvbnNlLmdldE1hcmtkb3duKCkpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHByZXZpZXcpIHtcblx0XHRcdFx0cmVuZGVyZWRQcmV2aWV3LnZhbHVlID0gcmVuZGVyQ29tcGxldGVkUmVzcG9uc2UobGFiZWxFbGVtZW50LCBzZXNzaW9uTGFiZWwsIHByZXZpZXcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVuZGVyZWRQcmV2aWV3LmNsZWFyKCk7XG5cdFx0XHRcdGxhYmVsRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJvdXRpbmctYmFkZ2UtY29tcGxldGVkJyk7XG5cdFx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IHN0YXR1c0xhYmVsO1xuXHRcdFx0fVxuXHRcdFx0bWFyay5yZXBsYWNlQ2hpbGRyZW4ocmVuZGVySWNvbihpY29uKSk7XG5cdFx0XHRpZiAoc3RhdHVzTGFiZWwgIT09IGxhc3RBbm5vdW5jZW1lbnQpIHtcblx0XHRcdFx0bGFzdEFubm91bmNlbWVudCA9IHN0YXR1c0xhYmVsO1xuXHRcdFx0XHRhcmlhQWxlcnQobGFzdEFubm91bmNlbWVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB1cGRhdGUobW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MucmVhZChyZWFkZXIpLCAhIW1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnJlYWQocmVhZGVyKSkpKTtcblx0XHRcdGlmIChtb2RlbC5sYXN0UmVxdWVzdD8ucmVzcG9uc2UpIHtcblx0XHRcdFx0c3RvcmUuYWRkKG1vZGVsLmxhc3RSZXF1ZXN0LnJlc3BvbnNlLm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZSgpKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHVwZGF0ZSgpO1xuXHRcdH1cblx0XHRzdG9yZS5hZGQodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHVwZGF0ZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF90cmFja1Byb3ZpZGVyRGVsaXZlcnlBY3Rpdml0eShcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdHByb3ZpZGVyOiBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXIsXG5cdFx0cmVzb3VyY2U6IFVSSSxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdG1hcms6IEhUTUxFbGVtZW50LFxuXHRcdGxhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0YWN0aXZpdHlCYXNlbGluZTogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHNldENvbXBsZXRlZDogKGNvbXBsZXRlZDogYm9vbGVhbikgPT4gdm9pZCxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdGNvbnN0IHJlbmRlcmVkUHJldmlldyA9IHN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRcdGxldCB1cGRhdGVTZXF1ZW5jZSA9IDA7XG5cdFx0bGV0IHByZXZpb3VzOiBJUm91dGFibGVTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBvYnNlcnZlZEFjdGl2aXR5ID0gZmFsc2U7XG5cdFx0bGV0IGxhc3RBbm5vdW5jZW1lbnQgPSBsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQ7XG5cdFx0Y29uc3QgdXBkYXRlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VxdWVuY2UgPSArK3VwZGF0ZVNlcXVlbmNlO1xuXHRcdFx0bGV0IHNlc3Npb246IElSb3V0YWJsZVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZXNzaW9uID0gYXdhaXQgcHJvdmlkZXIuZ2V0U2Vzc2lvblNuYXBzaG90IShyZXNvdXJjZSwgY3RzLnRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICghY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tjaGF0U2Vzc2lvblJvdXRpbmddIHRyYWNraW5nIHByb3ZpZGVyIGRlbGl2ZXJ5IGZhaWxlZDonLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCBzZXF1ZW5jZSAhPT0gdXBkYXRlU2VxdWVuY2UgfHwgIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhbmdlZFNpbmNlUHJldmlvdXMgPSBwcmV2aW91cyAhPT0gdW5kZWZpbmVkICYmIChcblx0XHRcdFx0c2Vzc2lvbi5sYWJlbCAhPT0gcHJldmlvdXMubGFiZWxcblx0XHRcdFx0fHwgc2Vzc2lvbi5zdGF0dXMgIT09IHByZXZpb3VzLnN0YXR1c1xuXHRcdFx0XHR8fCBzZXNzaW9uLmxhc3RBY3Rpdml0eSAhPT0gcHJldmlvdXMubGFzdEFjdGl2aXR5XG5cdFx0XHRcdHx8IHNlc3Npb24ubGFzdFJlc3BvbnNlICE9PSBwcmV2aW91cy5sYXN0UmVzcG9uc2Vcblx0XHRcdCk7XG5cdFx0XHRvYnNlcnZlZEFjdGl2aXR5ID0gb2JzZXJ2ZWRBY3Rpdml0eVxuXHRcdFx0XHR8fCBjaGFuZ2VkU2luY2VQcmV2aW91c1xuXHRcdFx0XHR8fCBzZXNzaW9uLmxhYmVsICE9PSBsYWJlbFxuXHRcdFx0XHR8fCAoYWN0aXZpdHlCYXNlbGluZSAhPT0gdW5kZWZpbmVkICYmIHNlc3Npb24ubGFzdEFjdGl2aXR5ICE9PSBhY3Rpdml0eUJhc2VsaW5lKVxuXHRcdFx0XHR8fCBzZXNzaW9uLnN0YXR1cyA9PT0gJ3dvcmtpbmcnXG5cdFx0XHRcdHx8IHNlc3Npb24uc3RhdHVzID09PSAnbmVlZHNJbnB1dCdcblx0XHRcdFx0fHwgc2Vzc2lvbi5zdGF0dXMgPT09ICdmYWlsZWQnO1xuXHRcdFx0cHJldmlvdXMgPSBzZXNzaW9uO1xuXG5cdFx0XHRsZXQgaWNvbiA9IENvZGljb24ucGFzcztcblx0XHRcdGxldCBzdGF0dXNMYWJlbCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VudFRvJywgXCJTZW50IHRvIHswfVwiLCBzZXNzaW9uLmxhYmVsKTtcblx0XHRcdGxldCBpc0NvbXBsZXRlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHNlc3Npb24uc3RhdHVzID09PSAnbmVlZHNJbnB1dCcpIHtcblx0XHRcdFx0aWNvbiA9IENvZGljb24ucXVlc3Rpb247XG5cdFx0XHRcdHN0YXR1c0xhYmVsID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5uZWVkc0lucHV0SW4nLCBcInswfSBuZWVkcyB5b3VyIGlucHV0XCIsIHNlc3Npb24ubGFiZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChzZXNzaW9uLnN0YXR1cyA9PT0gJ3dvcmtpbmcnKSB7XG5cdFx0XHRcdGljb24gPSBDb2RpY29uLmxvYWRpbmc7XG5cdFx0XHRcdHN0YXR1c0xhYmVsID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5pblByb2dyZXNzJywgXCJJbiBwcm9ncmVzczogezB9XCIsIHNlc3Npb24ubGFiZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChzZXNzaW9uLnN0YXR1cyA9PT0gJ2ZhaWxlZCcpIHtcblx0XHRcdFx0aWNvbiA9IENvZGljb24uZXJyb3I7XG5cdFx0XHRcdHN0YXR1c0xhYmVsID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5mYWlsZWRJbicsIFwiRmFpbGVkIGluIHswfVwiLCBzZXNzaW9uLmxhYmVsKTtcblx0XHRcdH0gZWxzZSBpZiAob2JzZXJ2ZWRBY3Rpdml0eSAmJiBzZXNzaW9uLnN0YXR1cyA9PT0gJ2lkbGUnKSB7XG5cdFx0XHRcdHN0YXR1c0xhYmVsID0gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5jb21wbGV0ZWQnLCBcIkNvbXBsZXRlZCB7MH1cIiwgbG93ZXJjYXNlRmlyc3RMZXR0ZXIoc2Vzc2lvbi5sYWJlbCkpO1xuXHRcdFx0XHRpc0NvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRzZXRDb21wbGV0ZWQoaXNDb21wbGV0ZWQpO1xuXG5cdFx0XHRjb25zdCBwcmV2aWV3ID0gaXNDb21wbGV0ZWQgPyByZXNwb25zZVByZXZpZXcoc2Vzc2lvbi5sYXN0UmVzcG9uc2UpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHByZXZpZXcpIHtcblx0XHRcdFx0cmVuZGVyZWRQcmV2aWV3LnZhbHVlID0gcmVuZGVyQ29tcGxldGVkUmVzcG9uc2UobGFiZWxFbGVtZW50LCBzZXNzaW9uLmxhYmVsLCBwcmV2aWV3KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlbmRlcmVkUHJldmlldy5jbGVhcigpO1xuXHRcdFx0XHRsYWJlbEVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yb3V0aW5nLWJhZGdlLWNvbXBsZXRlZCcpO1xuXHRcdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSBzdGF0dXNMYWJlbDtcblx0XHRcdH1cblx0XHRcdG1hcmsucmVwbGFjZUNoaWxkcmVuKHJlbmRlckljb24oaWNvbikpO1xuXHRcdFx0aWYgKHN0YXR1c0xhYmVsICE9PSBsYXN0QW5ub3VuY2VtZW50KSB7XG5cdFx0XHRcdGxhc3RBbm5vdW5jZW1lbnQgPSBzdGF0dXNMYWJlbDtcblx0XHRcdFx0YXJpYUFsZXJ0KGxhc3RBbm5vdW5jZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dm9pZCB1cGRhdGUoKTtcblx0XHRpZiAocHJvdmlkZXIud2F0Y2hTZXNzaW9uKSB7XG5cdFx0XHRzdG9yZS5hZGQocHJvdmlkZXIud2F0Y2hTZXNzaW9uKHJlc291cmNlLCAoKSA9PiB2b2lkIHVwZGF0ZSgpKSk7XG5cdFx0fSBlbHNlIGlmIChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKSB7XG5cdFx0XHRzdG9yZS5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB2b2lkIHVwZGF0ZSgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0Zhbm91dE91dGNvbWVzKHRhcmdldHM6IHJlYWRvbmx5IFBlbmRpbmdUYXJnZXRbXSwgcmVzdWx0czogcmVhZG9ubHkgSUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0W10pOiB2b2lkIHtcblx0XHRjb25zdCBiYWRnZSA9IGRvbS4kKCcuY2hhdC1yb3V0aW5nLWJhZGdlJyk7XG5cdFx0YmFkZ2UuY2xhc3NMaXN0LmFkZCgnY2hhdC1yb3V0aW5nLWJhZGdlLW91dGNvbWVzJyk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBiYWRnZS5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IGhlYWRpbmcgPSBkb20uYXBwZW5kKGJhZGdlLCBkb20uJCgnc3Bhbi5jaGF0LXJvdXRpbmctYmFkZ2UtbGFiZWwnKSk7XG5cdFx0aGVhZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuZGVsaXZlcnlSZXN1bHRzJywgXCJEZWxpdmVyeSByZXN1bHRzXCIpO1xuXHRcdGNvbnN0IGxpc3QgPSBkb20uYXBwZW5kKGJhZGdlLCBkb20uJCgnLmNoYXQtcm91dGluZy1vdXRjb21lLWxpc3QnKSk7XG5cdFx0cmVzdWx0cy5mb3JFYWNoKChyZXN1bHQsIGluZGV4KSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0YXJnZXRzW2luZGV4XTtcblx0XHRcdGNvbnN0IHJvdyA9IGRvbS5hcHBlbmQobGlzdCwgZG9tLiQoJy5jaGF0LXJvdXRpbmctb3V0Y29tZS1yb3cnKSk7XG5cdFx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChyb3csIGRvbS4kKCdzcGFuLmNoYXQtcm91dGluZy1iYWRnZS1zZW50LW1hcmsnKSk7XG5cdFx0XHRpY29uLmFwcGVuZENoaWxkKHJlbmRlckljb24ocmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IENvZGljb24uZXJyb3IgOiByZXN1bHQuc3RhdHVzID09PSAncXVldWVkJyA/IENvZGljb24uY2xvY2sgOiBDb2RpY29uLnBhc3MpKTtcblx0XHRcdGNvbnN0IHRleHQgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJ3NwYW4uY2hhdC1yb3V0aW5nLWJhZGdlLWxhYmVsJykpO1xuXHRcdFx0dGV4dC50ZXh0Q29udGVudCA9IHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnRhcmdldEZhaWxlZCcsIFwiezB9OiBmYWlsZWRcIiwgdGFyZ2V0LmxhYmVsKVxuXHRcdFx0XHQ6IHJlc3VsdC5zdGF0dXMgPT09ICdxdWV1ZWQnXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLnRhcmdldFF1ZXVlZCcsIFwiezB9OiBxdWV1ZWRcIiwgdGFyZ2V0LmxhYmVsKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy50YXJnZXRTZW50JywgXCJ7MH06IHNlbnRcIiwgdGFyZ2V0LmxhYmVsKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gcmVzdWx0LnJlc291cmNlO1xuXHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IHJldmVhbCA9IHJlc3VsdC5yZXZlYWwgPz8gKCgpID0+IHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24ocmVzb3VyY2UpKTtcblx0XHRcdFx0dGhpcy5fYWRkQWN0aW9uTGluayhzdG9yZSwgcm93LCBsb2NhbGl6ZSgnY2hhdFNlc3Npb25Sb3V0aW5nLm9wZW4nLCBcIk9wZW5cIiksICgpID0+IHZvaWQgcmV2ZWFsKCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5jb21wbGV0aW9uKSB7XG5cdFx0XHRcdHZvaWQgcmVzdWx0LmNvbXBsZXRpb24udGhlbihjb21wbGV0aW9uID0+IHtcblx0XHRcdFx0XHRpY29uLnJlcGxhY2VDaGlsZHJlbihyZW5kZXJJY29uKGNvbXBsZXRpb24uc3RhdHVzID09PSAnc2VudCdcblx0XHRcdFx0XHRcdD8gQ29kaWNvbi5wYXNzXG5cdFx0XHRcdFx0XHQ6IGNvbXBsZXRpb24ucmVhc29uQ29kZSA9PT0gJ3Byb3ZpZGVyUmVtb3ZlZCcgPyBDb2RpY29uLmNpcmNsZVNsYXNoIDogQ29kaWNvbi5lcnJvcikpO1xuXHRcdFx0XHRcdHRleHQudGV4dENvbnRlbnQgPSBjb21wbGV0aW9uLnN0YXR1cyA9PT0gJ3NlbnQnXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcudGFyZ2V0U2VudCcsIFwiezB9OiBzZW50XCIsIHRhcmdldC5sYWJlbClcblx0XHRcdFx0XHRcdDogY29tcGxldGlvbi5yZWFzb25Db2RlID09PSAncHJvdmlkZXJSZW1vdmVkJ1xuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcudGFyZ2V0Tm9Mb25nZXJRdWV1ZWQnLCBcInswfTogbm8gbG9uZ2VyIHF1ZXVlZFwiLCB0YXJnZXQubGFiZWwpXG5cdFx0XHRcdFx0XHRcdDogY29tcGxldGlvbi5yZWFzb25Db2RlID09PSAnY2FuY2VsbGVkJ1xuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy50YXJnZXRDYW5jZWxsZWQnLCBcInswfTogY2FuY2VsbGVkXCIsIHRhcmdldC5sYWJlbClcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcudGFyZ2V0RmFpbGVkJywgXCJ7MH06IGZhaWxlZFwiLCB0YXJnZXQubGFiZWwpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLmhvc3QucGxhY2VCYWRnZShiYWRnZSk7XG5cdFx0aWYgKCFiYWRnZS5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWRkQWN0aW9uTGluayhzdG9yZSwgYmFkZ2UsIGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuZGlzbWlzcycsIFwiRGlzbWlzc1wiKSwgKCkgPT4gdGhpcy5fcGVuZGluZ1NlbmQuY2xlYXIoKSk7XG5cdFx0dGhpcy5fcGVuZGluZ1NlbmQudmFsdWUgPSBzdG9yZTtcblx0XHRjb25zdCBzZW50ID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+IHJlc3VsdC5zdGF0dXMgPT09ICdzZW50JykubGVuZ3RoO1xuXHRcdGNvbnN0IHF1ZXVlZCA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiByZXN1bHQuc3RhdHVzID09PSAncXVldWVkJykubGVuZ3RoO1xuXHRcdGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMubGVuZ3RoIC0gc2VudCAtIHF1ZXVlZDtcblx0XHRhcmlhQWxlcnQobG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5mYW5vdXRSZXN1bHQnLCBcInswfSBzZW50LCB7MX0gcXVldWVkLCB7Mn0gZmFpbGVkLlwiLCBzZW50LCBxdWV1ZWQsIGZhaWxlZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0Rpc3BhdGNoRmFpbHVyZShsYWJlbD86IHN0cmluZywgcmVhc29uPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFkZ2UgPSBkb20uJCgnLmNoYXQtcm91dGluZy1iYWRnZScpO1xuXHRcdGNvbnN0IG1hcmsgPSBkb20uYXBwZW5kKGJhZGdlLCBkb20uJCgnc3Bhbi5jaGF0LXJvdXRpbmctYmFkZ2Utc2VudC1tYXJrJykpO1xuXHRcdG1hcmsuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmVycm9yKSk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGRvbS5hcHBlbmQoYmFkZ2UsIGRvbS4kKCdzcGFuLmNoYXQtcm91dGluZy1iYWRnZS1sYWJlbCcpKTtcblx0XHRtZXNzYWdlLnRleHRDb250ZW50ID0gbGFiZWwgJiYgcmVhc29uXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VuZEZhaWxlZFRvV2l0aFJlYXNvbicsIFwiQ291bGQgbm90IHNlbmQgdG8gezB9OiB7MX0gWW91ciBkcmFmdCB3YXMgcHJlc2VydmVkLlwiLCBsYWJlbCwgcmVhc29uKVxuXHRcdFx0OiBsYWJlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0U2Vzc2lvblJvdXRpbmcuc2VuZEZhaWxlZFRvJywgXCJDb3VsZCBub3Qgc2VuZCB0byB7MH0uIFlvdXIgZHJhZnQgd2FzIHByZXNlcnZlZC5cIiwgbGFiZWwpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5zZW5kRmFpbGVkJywgXCJDb3VsZCBub3Qgc2VuZCB0aGUgcmVxdWVzdC4gWW91ciBkcmFmdCB3YXMgcHJlc2VydmVkLlwiKTtcblx0XHR0aGlzLmhvc3QucGxhY2VCYWRnZShiYWRnZSk7XG5cdFx0aWYgKCFiYWRnZS5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYmFkZ2UucmVtb3ZlKCkpKTtcblx0XHR0aGlzLl9hZGRBY3Rpb25MaW5rKHN0b3JlLCBiYWRnZSwgbG9jYWxpemUoJ2NoYXRTZXNzaW9uUm91dGluZy5kaXNtaXNzJywgXCJEaXNtaXNzXCIpLCAoKSA9PiB0aGlzLl9wZW5kaW5nU2VuZC5jbGVhcigpKTtcblx0XHR0aGlzLl9wZW5kaW5nU2VuZC52YWx1ZSA9IHN0b3JlO1xuXHRcdGFyaWFBbGVydChtZXNzYWdlLnRleHRDb250ZW50KTtcblx0fVxuXG5cdC8qKiBBcHBlbmQgYW4gYWNjZXNzaWJsZSBsaW5rLXN0eWxlIGFjdGlvbiB0byB0aGUgYmFkZ2UuICovXG5cdHByaXZhdGUgX2FkZEFjdGlvbkxpbmsoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgYmFkZ2U6IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIHJ1bjogKCkgPT4gdm9pZCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBlbCA9IGRvbS5hcHBlbmQoYmFkZ2UsIGRvbS4kKCdhLmNoYXQtcm91dGluZy1iYWRnZS1hY3Rpb24nLCB7IHJvbGU6ICdidXR0b24nLCB0YWJpbmRleDogJzAnIH0pKTtcblx0XHRlbC50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0c3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWwsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIHJ1bikpO1xuXHRcdHN0b3JlLmFkZChkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoZWwsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGUuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiBlbDtcblx0fVxuXG5cdC8qKiBEaXNwYXRjaCBhIHJlc29sdmVkIHBlbmRpbmcgdGFyZ2V0LiAqL1xuXHRwcml2YXRlIGFzeW5jIF9kaXNwYXRjaFRvKHRhcmdldDogUGVuZGluZ1RhcmdldCwgc3VibWl0dGVkSW5wdXQ6IHN0cmluZywgc3VibWl0dGVkQXR0YWNobWVudElkczogcmVhZG9ubHkgc3RyaW5nW10sIHV0dGVyYW5jZTogc3RyaW5nLCByZXF1ZXN0T3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgbm90aWZ5Um91dGUgPSB0cnVlKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQ+IHtcblx0XHRpZiAodGFyZ2V0LmtpbmQgPT09ICduZXcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGlzcGF0Y2hUb05ld1Nlc3Npb24oc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMsIHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMsIHRva2VuLCBub3RpZnlSb3V0ZSwgdGFyZ2V0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3BhdGNoVG9TZXNzaW9uKHRhcmdldC5zZXNzaW9uSWQsIHN1Ym1pdHRlZElucHV0LCBzdWJtaXR0ZWRBdHRhY2htZW50SWRzLCB1dHRlcmFuY2UsIHJlcXVlc3RPcHRpb25zLCB0b2tlbiwgbm90aWZ5Um91dGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzcGF0Y2hUb1Nlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIHN1Ym1pdHRlZElucHV0OiBzdHJpbmcsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLCB1dHRlcmFuY2U6IHN0cmluZywgcmVxdWVzdE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG5vdGlmeVJvdXRlOiBib29sZWFuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQ+IHtcblx0XHRjb25zdCByb3V0aW5nUHJvdmlkZXIgPSB0aGlzLl9yb3V0aW5nUHJvdmlkZXIgPz8gdGhpcy5ob3N0LmdldFJvdXRpbmdQcm92aWRlcj8uKCk7XG5cdFx0aWYgKHJvdXRpbmdQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Rpc3BhdGNoVG9Qcm92aWRlclNlc3Npb24ocm91dGluZ1Byb3ZpZGVyLCBzZXNzaW9uSWQsIHN1Ym1pdHRlZElucHV0LCBzdWJtaXR0ZWRBdHRhY2htZW50SWRzLCB1dHRlcmFuY2UsIHJlcXVlc3RPcHRpb25zLCB0b2tlbiwgbm90aWZ5Um91dGUpO1xuXHRcdH1cblxuXHRcdGxldCB0YXJnZXQ6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0dGFyZ2V0ID0gVVJJLnBhcnNlKHNlc3Npb25JZCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAobm90aWZ5Um91dGUpIHtcblx0XHRcdFx0dGhpcy5ob3N0Lm9uRGlkUmVqZWN0Um91dGU/Lih1bmRlZmluZWQsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tjaGF0U2Vzc2lvblJvdXRpbmddIGludmFsaWQgc2Vzc2lvbiBpZCBmb3Igcm91dGluZzonLCBzZXNzaW9uSWQsIGVycik7XG5cdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdyZWplY3RlZCcgfTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbih0YXJnZXQsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHRva2VuLCBgJHt0aGlzLmRlYnVnT3duZXJ9LXJvdXRlYCk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmVmPy5kaXNwb3NlKCk7XG5cdFx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaG9zdC5vbkRpZFJlamVjdFJvdXRlPy4odGFyZ2V0LCByZXF1ZXN0T3B0aW9ucy5pc1ZvaWNlTW9kZUlucHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdyZWplY3RlZCcgfTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVmKSB7XG5cdFx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaG9zdC5vbkRpZFJlamVjdFJvdXRlPy4odGFyZ2V0LCByZXF1ZXN0T3B0aW9ucy5pc1ZvaWNlTW9kZUlucHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW2NoYXRTZXNzaW9uUm91dGluZ10gY291bGQgbm90IGxvYWQgcm91dGVkIHNlc3Npb246Jywgc2Vzc2lvbklkKTtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAncmVqZWN0ZWQnIH07XG5cdFx0XHR9XG5cdFx0XHRsZXQgcmVzdWx0OiBJQ2hhdFNlc3Npb25Sb3V0aW5nRGlzcGF0Y2hSZXN1bHQ7XG5cdFx0XHRsZXQgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZGlzcG9zZVJlZmVyZW5jZSA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAobm90aWZ5Um91dGUpIHtcblx0XHRcdFx0XHR0aGlzLmhvc3Qub25XaWxsRGlzcGF0Y2hSb3V0ZT8uKHRhcmdldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fc2VuZFJlcXVlc3QodGFyZ2V0LCB1dHRlcmFuY2UsIHtcblx0XHRcdFx0XHQuLi5yZXF1ZXN0T3B0aW9ucyxcblx0XHRcdFx0XHQvLyBFeGlzdGluZyBBZ2VudCBIb3N0IHF1ZXVlcyByZXRhaW4gdGhlaXIgc2Vzc2lvbiBtb2RlbC4gVGhlaXJcblx0XHRcdFx0XHQvLyByZW1vdGUgcXVldWUgcHJvdG9jb2wgaGFzIG5vIHBlci1yZXF1ZXN0IG1vZGVsIG92ZXJyaWRlLlxuXHRcdFx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhZ2VudElkU2lsZW50OiBnZXRDaGF0U2Vzc2lvblR5cGUodGFyZ2V0KSxcblx0XHRcdFx0XHRxdWV1ZTogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdxdWV1ZWQnICYmIHJlc3VsdC5jb21wbGV0aW9uKSB7XG5cdFx0XHRcdFx0ZGlzcG9zZVJlZmVyZW5jZSA9IGZhbHNlO1xuXHRcdFx0XHRcdHJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0XHRcdGNvbXBsZXRpb246IHJlc3VsdC5jb21wbGV0aW9uLmZpbmFsbHkoKCkgPT4gcmVmLmRpc3Bvc2UoKSksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXF1ZXN0SWQgPSByZXN1bHQucmVxdWVzdElkID8/IChyZXN1bHQuc3RhdHVzID09PSAnc2VudCcgPyByZWYub2JqZWN0Lmxhc3RSZXF1ZXN0Py5pZCA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAoZGlzcG9zZVJlZmVyZW5jZSkge1xuXHRcdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaG9zdC5vbkRpZFJlamVjdFJvdXRlPy4odGFyZ2V0LCByZXF1ZXN0T3B0aW9ucy5pc1ZvaWNlTW9kZUlucHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW2NoYXRTZXNzaW9uUm91dGluZ10gcm91dGVkIHNlc3Npb24gcmVqZWN0ZWQgdGhlIHJlcXVlc3Q6Jywgc2Vzc2lvbklkKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHRcdGlmIChub3RpZnlSb3V0ZSAmJiByZXN1bHQucmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5ob3N0Lm9uRGlkUmVzb2x2ZVJvdXRlPy4ocmVzdWx0LnJlc291cmNlLCAnZXhpc3Rpbmdfc2Vzc2lvbicsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQsIHJlcXVlc3RJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhcklucHV0SWZVbmNoYW5nZWQoc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHR0aGlzLmhvc3Qub25EaWRSZWplY3RSb3V0ZT8uKHRhcmdldCwgcmVxdWVzdE9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAncmVqZWN0ZWQnIH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW2NoYXRTZXNzaW9uUm91dGluZ10gZXJyb3IgZGlzcGF0Y2hpbmcgdG8gcm91dGVkIHNlc3Npb246JywgZXJyKTtcblx0XHRcdHJldHVybiB7IHN0YXR1czogJ3JlamVjdGVkJyB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3BhdGNoVG9Qcm92aWRlclNlc3Npb24ocm91dGluZ1Byb3ZpZGVyOiBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXIsIHNlc3Npb25JZDogc3RyaW5nLCBzdWJtaXR0ZWRJbnB1dDogc3RyaW5nLCBzdWJtaXR0ZWRBdHRhY2htZW50SWRzOiByZWFkb25seSBzdHJpbmdbXSwgdXR0ZXJhbmNlOiBzdHJpbmcsIHJlcXVlc3RPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBub3RpZnlSb3V0ZTogYm9vbGVhbik6IFByb21pc2U8SUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0PiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcm91dGluZ1Byb3ZpZGVyLnJlc29sdmVTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvbklkKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKG5vdGlmeVJvdXRlICYmIHRhcmdldCkge1xuXHRcdFx0XHR0aGlzLmhvc3Qub25XaWxsRGlzcGF0Y2hSb3V0ZT8uKHRhcmdldCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByb3V0aW5nUHJvdmlkZXIuZGlzcGF0Y2hUb1Nlc3Npb24oc2Vzc2lvbklkLCB1dHRlcmFuY2UsIHJlcXVlc3RPcHRpb25zLCB0b2tlbik7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlc3VsdC5yZXNvdXJjZSA/PyB0YXJnZXQ7XG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyB8fCAhcmVzb3VyY2UpIHtcblx0XHRcdFx0aWYgKG5vdGlmeVJvdXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5ob3N0Lm9uRGlkUmVqZWN0Um91dGU/LihyZXNvdXJjZSwgcmVxdWVzdE9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcgPyByZXN1bHQgOiB7IHN0YXR1czogJ3JlamVjdGVkJywgcmVhc29uQ29kZTogJ3Byb3ZpZGVyUmVtb3ZlZCcgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHJlc3VsdC5yZXF1ZXN0SWQgPz8gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHJlc291cmNlKT8ubGFzdFJlcXVlc3Q/LmlkO1xuXHRcdFx0aWYgKG5vdGlmeVJvdXRlKSB7XG5cdFx0XHRcdHRoaXMuaG9zdC5vbkRpZFJlc29sdmVSb3V0ZT8uKHJlc291cmNlLCAnZXhpc3Rpbmdfc2Vzc2lvbicsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQsIHJlcXVlc3RJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhcklucHV0SWZVbmNoYW5nZWQoc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4ucmVzdWx0LFxuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0XHRyZXZlYWw6ICgpID0+IHJvdXRpbmdQcm92aWRlci5yZXZlYWxTZXNzaW9uKHJlc291cmNlKSxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHR0aGlzLmhvc3Qub25EaWRSZWplY3RSb3V0ZT8uKHRhcmdldCwgcmVxdWVzdE9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbY2hhdFNlc3Npb25Sb3V0aW5nXSBlcnJvciBkaXNwYXRjaGluZyB0byBwcm92aWRlciBzZXNzaW9uOicsIGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHN0YXR1czogJ3JlamVjdGVkJywgcmVzb3VyY2U6IHRhcmdldCwgcmVhc29uQ29kZTogdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPyAnY2FuY2VsbGVkJyA6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3BhdGNoVG9OZXdTZXNzaW9uKHN1Ym1pdHRlZElucHV0OiBzdHJpbmcsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLCB1dHRlcmFuY2U6IHN0cmluZywgcmVxdWVzdE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG5vdGlmeVJvdXRlOiBib29sZWFuLCB0YXJnZXQ/OiBJQ2hhdFNlc3Npb25Sb3V0aW5nTmV3U2Vzc2lvblRhcmdldCk6IFByb21pc2U8SUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0PiB7XG5cdFx0Y29uc3Qgcm91dGluZ1Byb3ZpZGVyID0gdGhpcy5fcm91dGluZ1Byb3ZpZGVyID8/IHRoaXMuaG9zdC5nZXRSb3V0aW5nUHJvdmlkZXI/LigpO1xuXHRcdGlmIChyb3V0aW5nUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kaXNwYXRjaFRvUHJvdmlkZXJOZXdTZXNzaW9uKHJvdXRpbmdQcm92aWRlciwgc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMsIHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMsIHRva2VuLCBub3RpZnlSb3V0ZSwgdGFyZ2V0KTtcblx0XHR9XG5cblx0XHRsZXQgcm91dGVSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZm9sZGVyID0gdGFyZ2V0Py5mb2xkZXI7XG5cdFx0XHRjb25zdCBzZXNzaW9uVGFyZ2V0ID0gdGhpcy5ob3N0LmdldE5ld1Nlc3Npb25UYXJnZXQ/LigpID8/IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbDtcblx0XHRcdGNvbnN0IHJlZiA9IHNlc3Npb25UYXJnZXQgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbFxuXHRcdFx0XHQ/IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBkZWJ1Z093bmVyOiBgJHt0aGlzLmRlYnVnT3duZXJ9LW5ld2AgfSlcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKFxuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBzZXNzaW9uVGFyZ2V0LCBwYXRoOiBgL3VudGl0bGVkLSR7Z2VuZXJhdGVVdWlkKCl9YCB9KSxcblx0XHRcdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRcdHRva2VuLFxuXHRcdFx0XHRcdGAke3RoaXMuZGVidWdPd25lcn0tbmV3YCxcblx0XHRcdFx0KTtcblx0XHRcdGlmICghcmVmKSB7XG5cdFx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaG9zdC5vbkRpZFJlamVjdFJvdXRlPy4odW5kZWZpbmVkLCByZXF1ZXN0T3B0aW9ucy5pc1ZvaWNlTW9kZUlucHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW2NoYXRTZXNzaW9uUm91dGluZ10gdW5hYmxlIHRvIGNyZWF0ZSBhIG5ldyAke3Nlc3Npb25UYXJnZXR9IHNlc3Npb25gKTtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAncmVqZWN0ZWQnIH07XG5cdFx0XHR9XG5cdFx0XHRyb3V0ZVJlc291cmNlID0gcmVmLm9iamVjdC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKG5vdGlmeVJvdXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5ob3N0Lm9uRGlkUmVqZWN0Um91dGU/Lihyb3V0ZVJlc291cmNlLCByZXF1ZXN0T3B0aW9ucy5pc1ZvaWNlTW9kZUlucHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdyZWplY3RlZCcgfTtcblx0XHRcdH1cblx0XHRcdGZvbGRlciA/Pz0gdGhpcy5fcmVzb2x2ZU5ld1Nlc3Npb25UYXJnZXQodXR0ZXJhbmNlLCByZXF1ZXN0T3B0aW9ucy5hdHRhY2hlZENvbnRleHQsIFtdLCBbXSkuZm9sZGVyO1xuXHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHR0aGlzLm5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLnNldEZvbGRlcihyZWYub2JqZWN0LnNlc3Npb25SZXNvdXJjZSwgZm9sZGVyKTtcblx0XHRcdH1cblx0XHRcdGxldCByZXN1bHQ6IElDaGF0U2Vzc2lvblJvdXRpbmdEaXNwYXRjaFJlc3VsdDtcblx0XHRcdGxldCByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaG9zdC5vbldpbGxEaXNwYXRjaFJvdXRlPy4ocmVmLm9iamVjdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KHJlZi5vYmplY3Quc2Vzc2lvblJlc291cmNlLCB1dHRlcmFuY2UsIHtcblx0XHRcdFx0XHQuLi5yZXF1ZXN0T3B0aW9ucyxcblx0XHRcdFx0XHRhZ2VudElkU2lsZW50OiBzZXNzaW9uVGFyZ2V0ID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwgPyB1bmRlZmluZWQgOiBzZXNzaW9uVGFyZ2V0LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVxdWVzdElkID0gcmVzdWx0LnJlcXVlc3RJZCA/PyAocmVzdWx0LnN0YXR1cyA9PT0gJ3NlbnQnID8gcmVmLm9iamVjdC5sYXN0UmVxdWVzdD8uaWQgOiB1bmRlZmluZWQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaG9zdC5vbkRpZFJlamVjdFJvdXRlPy4ocmVmLm9iamVjdC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbY2hhdFNlc3Npb25Sb3V0aW5nXSBuZXcgc2Vzc2lvbiByZWplY3RlZCB0aGUgcmVxdWVzdCcpO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5vdGlmeVJvdXRlICYmIHJlc3VsdC5yZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLmhvc3Qub25EaWRSZXNvbHZlUm91dGU/LihyZXN1bHQucmVzb3VyY2UsICduZXdfc2Vzc2lvbicsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQsIHJlcXVlc3RJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhcklucHV0SWZVbmNoYW5nZWQoc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHR0aGlzLmhvc3Qub25EaWRSZWplY3RSb3V0ZT8uKHJvdXRlUmVzb3VyY2UsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB7IHN0YXR1czogJ3JlamVjdGVkJyB9O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tjaGF0U2Vzc2lvblJvdXRpbmddIGVycm9yIHN0YXJ0aW5nIGEgbmV3IHNlc3Npb246JywgZXJyKTtcblx0XHRcdHJldHVybiB7IHN0YXR1czogJ3JlamVjdGVkJyB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3BhdGNoVG9Qcm92aWRlck5ld1Nlc3Npb24ocm91dGluZ1Byb3ZpZGVyOiBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXIsIHN1Ym1pdHRlZElucHV0OiBzdHJpbmcsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLCB1dHRlcmFuY2U6IHN0cmluZywgcmVxdWVzdE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG5vdGlmeVJvdXRlOiBib29sZWFuLCB0YXJnZXQ/OiBJQ2hhdFNlc3Npb25Sb3V0aW5nTmV3U2Vzc2lvblRhcmdldCk6IFByb21pc2U8SUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkVGFyZ2V0ID0gdGFyZ2V0ID8/IHRoaXMuX3Jlc29sdmVOZXdTZXNzaW9uVGFyZ2V0KHV0dGVyYW5jZSwgcmVxdWVzdE9wdGlvbnMuYXR0YWNoZWRDb250ZXh0LCBbXSwgW10pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcm91dGluZ1Byb3ZpZGVyLmRpc3BhdGNoVG9OZXdTZXNzaW9uKHtcblx0XHRcdFx0Zm9sZGVyOiByZXNvbHZlZFRhcmdldC5mb2xkZXIsXG5cdFx0XHRcdHByb3ZpZGVySWQ6IHJlc29sdmVkVGFyZ2V0LnByb3ZpZGVySWQsXG5cdFx0XHR9LCB1dHRlcmFuY2UsIHJlcXVlc3RPcHRpb25zLCB0b2tlbik7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlc3VsdC5yZXNvdXJjZTtcblx0XHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnIHx8ICFyZXNvdXJjZSkge1xuXHRcdFx0XHRpZiAobm90aWZ5Um91dGUpIHtcblx0XHRcdFx0XHR0aGlzLmhvc3Qub25EaWRSZWplY3RSb3V0ZT8uKHJlc291cmNlLCByZXF1ZXN0T3B0aW9ucy5pc1ZvaWNlTW9kZUlucHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IHJlc3VsdCA6IHsgc3RhdHVzOiAncmVqZWN0ZWQnLCByZWFzb25Db2RlOiAncHJvdmlkZXJSZW1vdmVkJyB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVxdWVzdElkID0gcmVzdWx0LnJlcXVlc3RJZCA/PyB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVzb3VyY2UpPy5sYXN0UmVxdWVzdD8uaWQ7XG5cdFx0XHRpZiAobm90aWZ5Um91dGUpIHtcblx0XHRcdFx0dGhpcy5ob3N0Lm9uRGlkUmVzb2x2ZVJvdXRlPy4ocmVzb3VyY2UsICduZXdfc2Vzc2lvbicsIHJlcXVlc3RPcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQsIHJlcXVlc3RJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhcklucHV0SWZVbmNoYW5nZWQoc3VibWl0dGVkSW5wdXQsIHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHMpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4ucmVzdWx0LFxuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0XHRyZXZlYWw6ICgpID0+IHJvdXRpbmdQcm92aWRlci5yZXZlYWxTZXNzaW9uKHJlc291cmNlKSxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChub3RpZnlSb3V0ZSkge1xuXHRcdFx0XHR0aGlzLmhvc3Qub25EaWRSZWplY3RSb3V0ZT8uKHVuZGVmaW5lZCwgcmVxdWVzdE9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbY2hhdFNlc3Npb25Sb3V0aW5nXSBlcnJvciBkaXNwYXRjaGluZyB0byBwcm92aWRlciBuZXcgc2Vzc2lvbjonLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdyZWplY3RlZCcsIHJlYXNvbkNvZGU6IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID8gJ2NhbmNlbGxlZCcgOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kUmVxdWVzdChyZXNvdXJjZTogVVJJLCB1dHRlcmFuY2U6IHN0cmluZywgb3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElDaGF0U2Vzc2lvblJvdXRpbmdEaXNwYXRjaFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3QocmVzb3VyY2UsIHV0dGVyYW5jZSwgb3B0aW9ucyk7XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRyZXR1cm4geyBzdGF0dXM6ICdyZWplY3RlZCcsIHJlYXNvbjogcmVzdWx0LnJlYXNvbiwgcmVhc29uQ29kZTogcmVzdWx0LnJlYXNvbkNvZGUgfTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAncXVldWVkJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3RhdHVzOiAncXVldWVkJyxcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVzdWx0LnJlcXVlc3RJZCxcblx0XHRcdFx0Y29tcGxldGlvbjogdGhpcy5fcmVzb2x2ZVF1ZXVlZENvbXBsZXRpb24ocmVzb3VyY2UsIHJlc3VsdC5kZWZlcnJlZCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHQvLyBBIHNlbnQgcmVzdWx0IGRvZXMgbm90IGNhcnJ5IHRoZSByZXF1ZXN0IGlkIGRpcmVjdGx5LCBhbmQgcmVhZGluZ1xuXHRcdC8vIGBtb2RlbC5sYXN0UmVxdWVzdGAgaGVyZSByYWNlcyByZXF1ZXN0IGNyZWF0aW9uIChlc3BlY2lhbGx5IHdoZW4gYW5cblx0XHQvLyB1bnRpdGxlZCBhZ2VudCBzZXNzaW9uIGlzIHJlcGxhY2VkIGJ5IGl0cyBkdXJhYmxlIHJlc291cmNlKS4gVGhlIHJlc3BvbnNlXG5cdFx0Ly8gbW9kZWwgaXMgdGhlIGF1dGhvcml0YXRpdmUgb3duZXIgb2YgdGhlIHN0YWJsZSByZXF1ZXN0IGlkIGFuZCBpcyBjcmVhdGVkXG5cdFx0Ly8gaW5kZXBlbmRlbnRseSBvZiByZXNwb25zZSBjb21wbGV0aW9uLCBzbyB3YWl0IG9ubHkgZm9yIHRoYXQgbW9kZWwuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXN1bHQuZGF0YS5yZXNwb25zZUNyZWF0ZWRQcm9taXNlO1xuXHRcdHJldHVybiB7IHN0YXR1czogJ3NlbnQnLCByZXNvdXJjZTogcmVzdWx0Lm5ld1Nlc3Npb25SZXNvdXJjZSA/PyByZXNvdXJjZSwgcmVxdWVzdElkOiByZXNwb25zZS5yZXF1ZXN0SWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVRdWV1ZWRDb21wbGV0aW9uKHJlc291cmNlOiBVUkksIGRlZmVycmVkOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0Pik6IFByb21pc2U8SUNoYXRTZXNzaW9uUm91dGluZ0Rpc3BhdGNoUmVzdWx0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCByZXN1bHQgPSBhd2FpdCBkZWZlcnJlZDtcblx0XHRcdHdoaWxlIChyZXN1bHQua2luZCA9PT0gJ3F1ZXVlZCcpIHtcblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgcmVzdWx0LmRlZmVycmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdC5raW5kID09PSAnc2VudCdcblx0XHRcdFx0PyB7IHN0YXR1czogJ3NlbnQnLCByZXNvdXJjZTogcmVzdWx0Lm5ld1Nlc3Npb25SZXNvdXJjZSA/PyByZXNvdXJjZSB9XG5cdFx0XHRcdDogeyBzdGF0dXM6ICdyZWplY3RlZCcsIHJlc291cmNlOiByZXN1bHQubmV3U2Vzc2lvblJlc291cmNlID8/IHJlc291cmNlLCByZWFzb246IHJlc3VsdC5yZWFzb24sIHJlYXNvbkNvZGU6IHJlc3VsdC5yZWFzb25Db2RlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbY2hhdFNlc3Npb25Sb3V0aW5nXSBxdWV1ZWQgcmVxdWVzdCBmYWlsZWQ6JywgZXJyb3IpO1xuXHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAncmVqZWN0ZWQnLCByZXNvdXJjZSwgcmVhc29uOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikgfTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgdGhlIGlucHV0IChhbmQgaXRzIGV4cGxpY2l0IGF0dGFjaG1lbnRzKSBvbmx5IGlmIHRoZSBlZGl0b3Igc3RpbGxcblx0ICogaG9sZHMgZXhhY3RseSB3aGF0IHdhcyBzdWJtaXR0ZWQsIHNvIGEgbmV3ZXIgZHJhZnQgdHlwZWQgd2hpbGUgdGhlIHJlcXVlc3Rcblx0ICogd2FzIGluIGZsaWdodCBpcyBwcmVzZXJ2ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9hdHRhY2htZW50SWRzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5ob3N0LndpZGdldC5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMubWFwKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5pZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhcklucHV0SWZVbmNoYW5nZWQoc3VibWl0dGVkSW5wdXQ6IHN0cmluZywgc3VibWl0dGVkQXR0YWNobWVudElkczogcmVhZG9ubHkgc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmhvc3Qud2lkZ2V0LmlucHV0RWRpdG9yO1xuXHRcdGNvbnN0IGN1cnJlbnRBdHRhY2htZW50SWRzID0gdGhpcy5fYXR0YWNobWVudElkcygpO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzVW5jaGFuZ2VkID0gY3VycmVudEF0dGFjaG1lbnRJZHMubGVuZ3RoID09PSBzdWJtaXR0ZWRBdHRhY2htZW50SWRzLmxlbmd0aFxuXHRcdFx0JiYgY3VycmVudEF0dGFjaG1lbnRJZHMuZXZlcnkoKGlkLCBpbmRleCkgPT4gaWQgPT09IHN1Ym1pdHRlZEF0dGFjaG1lbnRJZHNbaW5kZXhdKTtcblx0XHRpZiAoZWRpdG9yLmdldFZhbHVlKCkgPT09IHN1Ym1pdHRlZElucHV0ICYmIGF0dGFjaG1lbnRzVW5jaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9zdWJtaXREcmFmdExpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0ZWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHRcdHRoaXMuaG9zdC53aWRnZXQuYXR0YWNobWVudE1vZGVsLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBUaGUgaG9zdCB3aWRnZXQgY2FuIGJlIGRpc3Bvc2VkIGJlZm9yZSB0aGlzIGNvbnRyb2xsZXIgYnkgYSBzaGFyZWRcblx0XHQvLyBkaXNwb3NhYmxlIHN0b3JlLCBzbyB0ZWFyZG93biBtdXN0IGNhbmNlbCB3aXRob3V0IHRvdWNoaW5nIGl0cyBVSS5cblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nKGZhbHNlKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNB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
