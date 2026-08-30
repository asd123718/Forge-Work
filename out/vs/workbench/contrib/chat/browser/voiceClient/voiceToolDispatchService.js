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
import { constObservable } from "../../../../../base/common/observable.js";
import { localize } from "../../../../../nls.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { AgentSessionStatus, getAgentChangesSummary } from "../agentSessions/agentSessionsModel.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../common/chatService/chatService.js";
import { resolveQuestionAnswers } from "../../common/voiceClient/voiceQuestionAnswers.js";
import { ChatQuestionCarouselData } from "../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { ChatPlanReviewData } from "../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { markPendingIdResolved, peekPendingId } from "../../common/voiceClient/voiceClientService.js";
import { getVoiceConfirmationType } from "../../common/voiceClient/voiceConfirmation.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { isExplicitFileOrImageVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { toAgentHostBackendSessionUri } from "../agentSessions/agentHost/agentHostSessionUri.js";
function voiceModelReference(model) {
  return {
    identifier: model.identifier,
    name: model.metadata.name,
    vendor: model.metadata.vendor
  };
}
function normalizeModelName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function resolveVoiceModel(models, requestedModel) {
  const exactIdentifier = models.find((model) => model.identifier === requestedModel);
  if (exactIdentifier) {
    return { ok: true, identifier: exactIdentifier.identifier, selected_model: voiceModelReference(exactIdentifier) };
  }
  const normalized = normalizeModelName(requestedModel);
  const exactMatches = models.filter((model) => [
    model.metadata.name,
    model.metadata.id,
    model.metadata.family,
    `${model.metadata.name} ${model.metadata.vendor}`
  ].some((candidate) => normalizeModelName(candidate) === normalized));
  if (exactMatches.length === 1) {
    return { ok: true, identifier: exactMatches[0].identifier, selected_model: voiceModelReference(exactMatches[0]) };
  }
  if (exactMatches.length > 1) {
    return { ok: false, reason: "ambiguous_model", available_models: exactMatches.map(voiceModelReference) };
  }
  const related = normalized ? models.filter((model) => [model.metadata.name, model.metadata.id, model.metadata.family].some((candidate) => normalizeModelName(candidate).includes(normalized) || normalized.includes(normalizeModelName(candidate)))) : [];
  return {
    ok: false,
    reason: related.length > 1 ? "ambiguous_model" : "model_not_found",
    available_models: (related.length > 0 ? related : models).slice(0, 10).map(voiceModelReference)
  };
}
const IVoiceToolDispatchService = createDecorator("voiceToolDispatchService");
const ACTION_LABELS = {
  send_to_chat: localize("agentsVoice.action.sendToChat", "Sending to chat..."),
  get_session_info: localize("agentsVoice.action.getSessionInfo", "Checking sessions..."),
  get_session_changes: localize("agentsVoice.action.getSessionChanges", "Checking changes..."),
  get_session_thread: localize("agentsVoice.action.getSessionThread", "Checking conversation..."),
  respond_to_session: localize("agentsVoice.action.respond", "Responding..."),
  focus_session: localize("agentsVoice.action.focusSession", "Focusing session..."),
  set_model: localize("agentsVoice.action.setModel", "Changing model..."),
  auto_approve_session: localize("agentsVoice.action.autoApprove", "Auto-approving session..."),
  revoke_auto_approve: localize("agentsVoice.action.revokeAutoApprove", "Revoking auto-approve...")
};
let VoiceToolDispatchService = class {
  constructor(agentSessionsService, chatService, toolsService) {
    this.agentSessionsService = agentSessionsService;
    this.chatService = chatService;
    this.toolsService = toolsService;
  }
  setDelegate(delegate) {
    this._delegate = delegate;
  }
  /** Get the action label for a tool call name. */
  static getActionLabel(name) {
    return ACTION_LABELS[name] ?? localize("agentsVoice.action.working", "Working...");
  }
  get _agentModeOptions() {
    const allTools = {};
    for (const tool of this.toolsService.getTools(void 0)) {
      allTools[tool.id] = true;
    }
    return {
      modeInfo: {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0
      },
      instructionContext: {
        modeKind: ChatModeKind.Agent,
        enabledTools: allTools
      },
      userSelectedTools: constObservable(allTools)
    };
  }
  async dispatchToolCall(toolCall) {
    const delegate = this._delegate;
    if (!delegate) {
      return "error: no delegate set";
    }
    const args = toolCall.args;
    const argString = (k) => {
      const v = args[k];
      return typeof v === "string" ? v : "";
    };
    switch (toolCall.name) {
      case "send_to_chat": {
        const text = argString("text");
        if (text) {
          if (!delegate.acceptInput(text)) {
            const resource = await delegate.getCurrentSessionResource();
            if (resource) {
              await this.chatService.sendRequest(resource, text, this._agentModeOptions);
            } else {
              const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
              await this.chatService.sendRequest(ref.object.sessionResource, text, this._agentModeOptions);
              ref.dispose();
            }
          }
        }
        break;
      }
      case "focus_session": {
        const targetSessionId = argString("coding_session_id");
        const targetResource = this._findSessionResource(targetSessionId);
        if (targetResource) {
          const currentResource = await delegate.getCurrentSessionResource();
          const switched = targetResource.toString() === currentResource?.toString() || await delegate.switchToSession(targetResource);
          if (switched) {
            delegate.setTargetSession(targetResource);
            return JSON.stringify({ ok: true, session_id: targetResource.toString() });
          }
        }
        return JSON.stringify({ ok: false, reason: targetResource ? "switch_failed" : "session_not_found" });
      }
      case "set_model": {
        const requestedModel = argString("model_id") || argString("model");
        if (!requestedModel) {
          return JSON.stringify({ ok: false, reason: "model_not_found" });
        }
        const target = await this._showActionTarget(argString("coding_session_id"));
        if (!target.ok) {
          return JSON.stringify(target);
        }
        return JSON.stringify(await delegate.selectModel(requestedModel));
      }
      case "auto_approve_session": {
        delegate.addAllAutoApprovedSessions();
        break;
      }
      case "revoke_auto_approve": {
        const sessionResource = await delegate.getCurrentSessionResource();
        if (sessionResource) {
          delegate.removeAutoApprovedSession(sessionResource.toString());
        }
        break;
      }
      case "get_session_info": {
        return await this._gatherSessionInfo();
      }
      case "get_session_changes": {
        const sessionId = typeof toolCall.args?.coding_session_id === "string" ? toolCall.args.coding_session_id : void 0;
        return await this._gatherSessionChanges(sessionId);
      }
      case "get_session_thread": {
        const sessionId = typeof toolCall.args?.coding_session_id === "string" ? toolCall.args.coding_session_id : void 0;
        const rawN = toolCall.args?.last_n_turns;
        const lastN = typeof rawN === "number" && rawN > 0 ? Math.min(10, Math.floor(rawN)) : 3;
        return await this._gatherSessionThread(sessionId, lastN);
      }
    }
    return "ok";
  }
  _findSessionResource(sessionId) {
    if (!sessionId) {
      return void 0;
    }
    const agentSession = this.agentSessionsService.model.sessions.find((session) => !session.isArchived() && session.resource.toString() === sessionId);
    if (agentSession) {
      return agentSession.resource;
    }
    for (const model of this.chatService.chatModels.get()) {
      if (model.sessionResource.toString() === sessionId) {
        return model.sessionResource;
      }
    }
    return void 0;
  }
  async _showActionTarget(sessionId) {
    const delegate = this._delegate;
    if (!delegate) {
      return { ok: false, reason: "no_session" };
    }
    const resource = sessionId ? this._findSessionResource(sessionId) : delegate.getTargetSessionResource() ?? await delegate.getCurrentSessionResource();
    if (!resource) {
      return { ok: false, reason: sessionId ? "session_not_found" : "no_session" };
    }
    const current = await delegate.getCurrentSessionResource();
    if (current?.toString() !== resource.toString() && !await delegate.switchToSession(resource)) {
      return { ok: false, reason: "switch_failed" };
    }
    if (sessionId) {
      delegate.setTargetSession(resource);
    }
    return { ok: true, resource };
  }
  /**
   * Apply a backend-resolved response to the exact pending part it names.
   *
   * Routing is by `pending_id` + `request_id` with no fallback: the path this
   * replaces fell back to the focused session, so a spoken "yes" could approve
   * a prompt the user was not looking at. A response that cannot find its part
   * is reported as stale instead. Answer values are matched exactly; see
   * `resolveQuestionAnswers`.
   */
  async respondToSession(toolCall) {
    const args = toolCall.args;
    const argString = (key) => {
      const value = args[key];
      return typeof value === "string" ? value : "";
    };
    const response = args["response"];
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      return { ok: false, reason: "unsupported" };
    }
    const responseType = response["type"];
    if (responseType !== "approve" && responseType !== "reject" && responseType !== "answer" && responseType !== "skip") {
      return { ok: false, reason: "unsupported" };
    }
    const resolved = await this._resolveModelForResponse(argString("coding_session_id"));
    if (!resolved) {
      return { ok: false, reason: "no_session" };
    }
    try {
      return await this._applyResponse(
        resolved.model,
        argString("request_id"),
        argString("pending_id"),
        responseType,
        response
      );
    } finally {
      resolved.dispose();
    }
  }
  async _applyResponse(model, requestId, pendingId, responseType, response) {
    const request = model.getRequests().find((candidate) => candidate.id === requestId);
    const parts = request?.response?.response.value;
    if (!request || !parts) {
      return { ok: false, reason: "stale_pending" };
    }
    const index = parts.findIndex((candidate) => peekPendingId(request.id, candidate) === pendingId);
    if (index < 0) {
      return { ok: false, reason: "stale_pending" };
    }
    const part = parts[index];
    if (part.kind === "questionCarousel") {
      if (responseType !== "answer" && responseType !== "skip") {
        return { ok: false, reason: "unsupported" };
      }
      return this._answerCarousel(request.id, part, response, responseType === "skip");
    }
    if (responseType === "answer" || responseType === "skip") {
      return { ok: false, reason: "unsupported" };
    }
    const approve = responseType === "approve";
    if (part.kind === "planReview" && part instanceof ChatPlanReviewData) {
      return this._resolvePlanReview(part, approve) ? { ok: true } : { ok: false, reason: "stale_pending" };
    }
    if (part.kind === "toolInvocation") {
      if (getVoiceConfirmationType([part]) !== "tool") {
        return { ok: false, reason: "unsupported" };
      }
      markPendingIdResolved(pendingId);
      const confirmed = IChatToolInvocation.confirmWith(
        part,
        approve ? { type: ToolConfirmKind.UserAction } : { type: ToolConfirmKind.Denied }
      );
      return confirmed ? { ok: true } : { ok: false, reason: "stale_pending" };
    }
    return { ok: false, reason: "unsupported" };
  }
  _resolvePlanReview(plan, approve) {
    if (plan.isUsed) {
      return false;
    }
    let result;
    if (approve) {
      const action = plan.actions.find((candidate) => candidate.default) ?? plan.actions[0];
      if (!action) {
        return false;
      }
      result = {
        action: action.label,
        actionId: action.id,
        rejected: false
      };
    } else {
      result = { rejected: true };
    }
    plan.data = result;
    plan.isUsed = true;
    void plan.completion.complete(result);
    return true;
  }
  /** Resolve a coding session id to its chat model, never falling back to the focused session. */
  async _resolveModelForResponse(codingSessionId) {
    if (!codingSessionId) {
      return void 0;
    }
    const agentSession = this.agentSessionsService.model.sessions.find((session) => !session.isArchived() && session.resource.toString() === codingSessionId);
    if (agentSession) {
      const loaded = this.chatService.getSession(agentSession.resource);
      if (loaded) {
        return { model: loaded, dispose: () => {
        } };
      }
    }
    for (const chatModel of this.chatService.chatModels.get()) {
      if (chatModel.sessionResource.toString() === codingSessionId) {
        return { model: chatModel, dispose: () => {
        } };
      }
    }
    if (!agentSession) {
      return void 0;
    }
    const cts = new CancellationTokenSource();
    const ref = await this.chatService.acquireOrLoadSession(agentSession.resource, ChatAgentLocation.Chat, cts.token, "voice-respond").catch(() => void 0);
    cts.dispose();
    if (!ref) {
      return void 0;
    }
    const model = this.chatService.getSession(agentSession.resource);
    if (!model) {
      ref.dispose();
      return void 0;
    }
    return { model, dispose: () => ref.dispose() };
  }
  /**
   * Fill in a question carousel exactly as the widget's own submit path does.
   *
   * A `skip` carries whatever the user answered before saying "skip", which on
   * an untouched form is nothing at all. That empty case is why skipping is its
   * own response type: an `answer` with zero answers is indistinguishable from
   * a backend that resolved nothing, and is correctly refused below.
   */
  _answerCarousel(requestId, carousel, response, skip) {
    if (carousel.isUsed || carousel.answeredExternally) {
      return { ok: false, reason: "stale_pending" };
    }
    if (skip && !carousel.allowSkip) {
      return { ok: false, reason: "stale_pending" };
    }
    const raw = response["answers"];
    if (raw !== void 0 && !Array.isArray(raw)) {
      return { ok: false, reason: "invalid_answer" };
    }
    const rawAnswers = raw ?? [];
    let answers;
    if (rawAnswers.length > 0) {
      answers = resolveQuestionAnswers(carousel.questions, rawAnswers);
      if (!answers) {
        return { ok: false, reason: "invalid_answer" };
      }
    } else if (!skip) {
      return { ok: false, reason: "invalid_answer" };
    }
    if (!skip && carousel.questions.some((question) => question.required && answers?.[question.id] === void 0)) {
      return { ok: false, reason: "invalid_answer" };
    }
    if (!(carousel instanceof ChatQuestionCarouselData) && !carousel.resolveId) {
      return { ok: false, reason: "unsupported" };
    }
    if (carousel instanceof ChatQuestionCarouselData) {
      carousel.dismiss(answers);
    } else {
      carousel.data = answers;
      carousel.isUsed = true;
    }
    if (carousel.resolveId) {
      this.chatService.notifyQuestionCarouselAnswer(requestId, carousel.resolveId, answers);
    }
    return { ok: true };
  }
  async _gatherSessionInfo() {
    const agentSessions = this.agentSessionsService.model.sessions.filter((session) => !session.isArchived());
    const currentResource = await this._delegate?.getCurrentSessionResource();
    const activeResource = this._delegate?.getTargetSessionResource() ?? currentResource;
    const agentResources = new Set(agentSessions.map((session) => session.resource.toString()));
    const inputDetails = (model) => {
      const state = model?.inputModel?.state?.get();
      const selected = state?.selectedModel;
      const attachments = state?.attachments.filter(isExplicitFileOrImageVariableEntry) ?? [];
      return {
        ...selected ? { selected_model: voiceModelReference(selected) } : {},
        ...attachments.length ? {
          attachment_names: attachments.map((attachment) => attachment.name).slice(0, 10),
          attachment_count: attachments.length
        } : {}
      };
    };
    const lastResponseSummary = (model) => {
      const summary = model?.getRequests().at(-1)?.response?.response.value.filter((part) => part.kind === "markdownContent").map((part) => part.content.value).join(" ").slice(0, 500);
      return summary || void 0;
    };
    const sessionData = agentSessions.map((session) => {
      const model = this.chatService.getSession(session.resource);
      const changes = getAgentChangesSummary(session.changes);
      const state = session.status === AgentSessionStatus.InProgress ? "working" : session.status === AgentSessionStatus.NeedsInput ? "waiting_for_input" : session.status === AgentSessionStatus.Completed ? "idle" : "unknown";
      const lastActivity = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created ?? 0;
      return {
        id: (toAgentHostBackendSessionUri(session.resource) ?? session.resource).toString(),
        label: session.label || void 0,
        session_type: "agent",
        state,
        is_active: activeResource?.toString() === session.resource.toString(),
        insertions: changes?.insertions ?? 0,
        deletions: changes?.deletions ?? 0,
        last_activity: lastActivity,
        last_activity_minutes_ago: lastActivity ? Math.max(0, Math.round((Date.now() - lastActivity) / 6e4)) : void 0,
        last_response_summary: lastResponseSummary(model),
        ...inputDetails(model)
      };
    });
    for (const model of this.chatService.chatModels.get()) {
      const sessionId = model.sessionResource.toString();
      const isActive = activeResource?.toString() === sessionId;
      if (agentResources.has(sessionId) || model.getRequests().length === 0 && !isActive) {
        continue;
      }
      const needsInput = model.requestNeedsInput?.get();
      const inProgress = model.hasActiveRequest?.get();
      const lastActivity = model.lastMessageDate || 0;
      sessionData.push({
        id: (toAgentHostBackendSessionUri(model.sessionResource) ?? model.sessionResource).toString(),
        label: model.title || void 0,
        session_type: "chat",
        state: needsInput ? "waiting_for_input" : inProgress ? "working" : "idle",
        is_active: isActive,
        insertions: 0,
        deletions: 0,
        last_activity: lastActivity,
        last_activity_minutes_ago: lastActivity ? Math.max(0, Math.round((Date.now() - lastActivity) / 6e4)) : void 0,
        last_response_summary: lastResponseSummary(model),
        ...inputDetails(model)
      });
    }
    sessionData.sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.last_activity - a.last_activity);
    const counts = sessionData.reduce((result, session) => {
      if (session.state === "working") {
        result.working++;
      } else if (session.state === "waiting_for_input") {
        result.waiting_for_input++;
      } else if (session.state === "idle") {
        result.idle++;
      }
      return result;
    }, { working: 0, waiting_for_input: 0, idle: 0 });
    const visibleSessions = sessionData.slice(0, 20).map(({ last_activity, ...session }) => session);
    return JSON.stringify({
      total_sessions: sessionData.length,
      counts,
      sessions: visibleSessions,
      truncated: visibleSessions.length < sessionData.length
    });
  }
  /**
   * Resolve a coding_session_id (resource URI string) to an IAgentSession.
   * Falls back to the currently active session when id is missing/unknown.
   */
  async _resolveSession(coding_session_id) {
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    if (coding_session_id) {
      const match = sessions.find((s) => s.resource.toString() === coding_session_id);
      if (match) {
        return match;
      }
    }
    const currentResource = await this._delegate?.getCurrentSessionResource();
    if (currentResource) {
      const active = sessions.find((s) => s.resource.toString() === currentResource.toString());
      if (active) {
        return active;
      }
    }
    return sessions[0];
  }
  /**
   * Gather files touched + per-file insertions/deletions for a session.
   * Returns a JSON string keyed for the LLM follow-up to summarize.
   */
  async _gatherSessionChanges(coding_session_id) {
    const session = await this._resolveSession(coding_session_id);
    if (!session) {
      return JSON.stringify({ session_id: coding_session_id ?? null, files: [], note: "session_not_found" });
    }
    const changes = session.changes;
    const files = [];
    let totalInsertions = 0;
    let totalDeletions = 0;
    let totalFiles = 0;
    if (Array.isArray(changes)) {
      for (const c of changes) {
        const uri = c.modifiedUri ?? c.uri;
        const path = uri ? this._formatPath(uri) : "(unknown)";
        files.push({ path, insertions: c.insertions, deletions: c.deletions });
        totalInsertions += c.insertions;
        totalDeletions += c.deletions;
      }
      totalFiles = files.length;
    } else if (changes && !Array.isArray(changes)) {
      const summary = changes;
      totalInsertions = summary.insertions;
      totalDeletions = summary.deletions;
      totalFiles = summary.files;
    }
    return JSON.stringify({
      session_id: session.resource.toString(),
      total_files: totalFiles,
      total_insertions: totalInsertions,
      total_deletions: totalDeletions,
      files: files.slice(0, 20),
      // cap so LLM context stays bounded
      truncated: files.length > 20
    });
  }
  /**
   * Gather the last N user/assistant turns of a coding session — actual
   * conversation content, trimmed for spoken summarization.
   */
  async _gatherSessionThread(coding_session_id, lastN) {
    const session = await this._resolveSession(coding_session_id);
    if (!session) {
      return JSON.stringify({ session_id: coding_session_id ?? null, turns: [], note: "session_not_found" });
    }
    const model = this.chatService.getSession(session.resource);
    if (!model) {
      return JSON.stringify({
        session_id: session.resource.toString(),
        turns: [],
        note: "chat_model_not_loaded"
      });
    }
    const reqs = model.getRequests().slice(-lastN);
    const turns = reqs.map((req) => {
      const userText = req.message.text || "";
      const assistantText = req.response?.response.value.filter((p) => p.kind === "markdownContent").map((p) => p.content.value).join(" ").slice(0, 600) || "";
      return {
        user: userText.slice(0, 400),
        assistant: assistantText
      };
    });
    return JSON.stringify({
      session_id: session.resource.toString(),
      turn_count: turns.length,
      turns
    });
  }
  /** Render a URI as a short relative-ish path for spoken summaries. */
  _formatPath(uri) {
    const parts = uri.path.split("/").filter(Boolean);
    if (parts.length <= 2) {
      return uri.path.replace(/^\//, "");
    }
    return parts.slice(-2).join("/");
  }
};
VoiceToolDispatchService = __decorateClass([
  __decorateParam(0, IAgentSessionsService),
  __decorateParam(1, IChatService),
  __decorateParam(2, ILanguageModelToolsService)
], VoiceToolDispatchService);
registerSingleton(IVoiceToolDispatchService, VoiceToolDispatchService, InstantiationType.Delayed);
export {
  IVoiceToolDispatchService,
  VoiceToolDispatchService,
  resolveVoiceModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx2b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TdGF0dXMsIGdldEFnZW50Q2hhbmdlc1N1bW1hcnkgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQsIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBJQ2hhdFNlcnZpY2UsIElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQmFja2VuZFF1ZXN0aW9uQW5zd2VyLCByZXNvbHZlUXVlc3Rpb25BbnN3ZXJzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlUXVlc3Rpb25BbnN3ZXJzLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VEaXNwYXRjaFJlc3VsdCwgSVZvaWNlTW9kZWxSZWZlcmVuY2UsIElWb2ljZVRvb2xDYWxsLCBtYXJrUGVuZGluZ0lkUmVzb2x2ZWQsIHBlZWtQZW5kaW5nSWQgfSBmcm9tICcuLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFZvaWNlQ29uZmlybWF0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi92b2ljZUNsaWVudC92b2ljZUNvbmZpcm1hdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgdG9BZ2VudEhvc3RCYWNrZW5kU2Vzc2lvblVyaSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25VcmkuanMnO1xuXG4vKipcbiAqIENhbGxiYWNrcyB0aGF0IHJlcXVpcmUgYWNjZXNzIHRvIHRoZSBjaGF0IHdpZGdldCBvciB2aWV3IHN0YXRlLlxuICogSW1wbGVtZW50ZWQgYnkgdGhlIENoYXRWaWV3UGFuZSB0byBicmlkZ2UgVUkgY29uY2VybnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlVG9vbERpc3BhdGNoRGVsZWdhdGUge1xuXHQvKiogQWNjZXB0IGlucHV0IHRleHQgaW4gdGhlIGN1cnJlbnQgY2hhdCB3aWRnZXQuIFJldHVybnMgZmFsc2UgaWYgbm8gd2lkZ2V0IGF2YWlsYWJsZS4gKi9cblx0YWNjZXB0SW5wdXQodGV4dDogc3RyaW5nKTogYm9vbGVhbjtcblx0LyoqIEdldCB0aGUgcmVzb3VyY2UgVVJJIG9mIHRoZSBjdXJyZW50bHkgYWN0aXZlIHNlc3Npb24uICovXG5cdGdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHQvKiogU3dpdGNoIHRoZSB2aWV3IHRvIGEgZGlmZmVyZW50IHNlc3Npb24gYnkgcmVzb3VyY2UgVVJJLiAqL1xuXHRzd2l0Y2hUb1Nlc3Npb24ocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj47XG5cdC8qKiBTZXQgdGhlIHNlc3Npb24gYWxsIHN1YnNlcXVlbnQgdm9pY2UgdHVybnMgYW5kIGFjdGlvbnMgYmVsb25nIHRvLiAqL1xuXHRzZXRUYXJnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiB2b2lkO1xuXHQvKiogVGhlIGV4cGxpY2l0IHZvaWNlIHRhcmdldCwgb3IgdGhlIGN1cnJlbnRseSBzaG93biBzZXNzaW9uIHdoZW4gdW5waW5uZWQuICovXG5cdGdldFRhcmdldFNlc3Npb25SZXNvdXJjZSgpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKiBTZWxlY3QgYSBtb2RlbCBpbiB0aGUgY3VycmVudGx5IHNob3duIHZvaWNlIGlucHV0LiAqL1xuXHRzZWxlY3RNb2RlbChyZXF1ZXN0ZWRNb2RlbDogc3RyaW5nKTogUHJvbWlzZTxJVm9pY2VNb2RlbFNlbGVjdGlvblJlc3VsdD47XG5cdC8qKiBHZXQgdGhlIHNldCBvZiBhdXRvLWFwcHJvdmVkIHNlc3Npb24gcmVzb3VyY2Ugc3RyaW5ncy4gKi9cblx0Z2V0QXV0b0FwcHJvdmVkU2Vzc2lvbnMoKTogU2V0PHN0cmluZz47XG5cdC8qKiBNYXJrIGFsbCBjdXJyZW50IHNlc3Npb25zIGFzIGF1dG8tYXBwcm92ZWQuICovXG5cdGFkZEFsbEF1dG9BcHByb3ZlZFNlc3Npb25zKCk6IHZvaWQ7XG5cdC8qKiBSZW1vdmUgYSBzZXNzaW9uIGZyb20gYXV0by1hcHByb3ZlZCBzZXQuICovXG5cdHJlbW92ZUF1dG9BcHByb3ZlZFNlc3Npb24ocmVzb3VyY2U6IHN0cmluZyk6IHZvaWQ7XG5cdC8qKiBUcmlnZ2VyIGFuIGF1dG8tYXBwcm92ZSBjaGVjayBjeWNsZS4gKi9cblx0dHJpZ2dlckF1dG9BcHByb3ZlQ2hlY2soKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVm9pY2VNb2RlbFNlbGVjdGlvblJlc3VsdCB7XG5cdHJlYWRvbmx5IG9rOiBib29sZWFuO1xuXHRyZWFkb25seSByZWFzb24/OiAnbm9faW5wdXQnIHwgJ21vZGVsX25vdF9mb3VuZCcgfCAnYW1iaWd1b3VzX21vZGVsJyB8ICdzZWxlY3Rpb25fZmFpbGVkJztcblx0cmVhZG9ubHkgc2VsZWN0ZWRfbW9kZWw/OiBJVm9pY2VNb2RlbFJlZmVyZW5jZTtcblx0cmVhZG9ubHkgYXZhaWxhYmxlX21vZGVscz86IHJlYWRvbmx5IElWb2ljZU1vZGVsUmVmZXJlbmNlW107XG59XG5cbmZ1bmN0aW9uIHZvaWNlTW9kZWxSZWZlcmVuY2UobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcik6IElWb2ljZU1vZGVsUmVmZXJlbmNlIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiBtb2RlbC5pZGVudGlmaWVyLFxuXHRcdG5hbWU6IG1vZGVsLm1ldGFkYXRhLm5hbWUsXG5cdFx0dmVuZG9yOiBtb2RlbC5tZXRhZGF0YS52ZW5kb3IsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU1vZGVsTmFtZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHZhbHVlLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldL2csICcnKTtcbn1cblxuLyoqIFJlc29sdmUgb25seSBleGFjdCBpZGVudGlmaWVycyBvciB1bmlxdWUgbm9ybWFsaXplZCBuYW1lczsgbmV2ZXIgZ3Vlc3MgYW1vbmcgc2ltaWxhciBtb2RlbHMuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVZvaWNlTW9kZWwobW9kZWxzOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSwgcmVxdWVzdGVkTW9kZWw6IHN0cmluZyk6IElWb2ljZU1vZGVsU2VsZWN0aW9uUmVzdWx0ICYgeyByZWFkb25seSBpZGVudGlmaWVyPzogc3RyaW5nIH0ge1xuXHRjb25zdCBleGFjdElkZW50aWZpZXIgPSBtb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSByZXF1ZXN0ZWRNb2RlbCk7XG5cdGlmIChleGFjdElkZW50aWZpZXIpIHtcblx0XHRyZXR1cm4geyBvazogdHJ1ZSwgaWRlbnRpZmllcjogZXhhY3RJZGVudGlmaWVyLmlkZW50aWZpZXIsIHNlbGVjdGVkX21vZGVsOiB2b2ljZU1vZGVsUmVmZXJlbmNlKGV4YWN0SWRlbnRpZmllcikgfTtcblx0fVxuXG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVNb2RlbE5hbWUocmVxdWVzdGVkTW9kZWwpO1xuXHRjb25zdCBleGFjdE1hdGNoZXMgPSBtb2RlbHMuZmlsdGVyKG1vZGVsID0+IFtcblx0XHRtb2RlbC5tZXRhZGF0YS5uYW1lLFxuXHRcdG1vZGVsLm1ldGFkYXRhLmlkLFxuXHRcdG1vZGVsLm1ldGFkYXRhLmZhbWlseSxcblx0XHRgJHttb2RlbC5tZXRhZGF0YS5uYW1lfSAke21vZGVsLm1ldGFkYXRhLnZlbmRvcn1gLFxuXHRdLnNvbWUoY2FuZGlkYXRlID0+IG5vcm1hbGl6ZU1vZGVsTmFtZShjYW5kaWRhdGUpID09PSBub3JtYWxpemVkKSk7XG5cdGlmIChleGFjdE1hdGNoZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIHsgb2s6IHRydWUsIGlkZW50aWZpZXI6IGV4YWN0TWF0Y2hlc1swXS5pZGVudGlmaWVyLCBzZWxlY3RlZF9tb2RlbDogdm9pY2VNb2RlbFJlZmVyZW5jZShleGFjdE1hdGNoZXNbMF0pIH07XG5cdH1cblx0aWYgKGV4YWN0TWF0Y2hlcy5sZW5ndGggPiAxKSB7XG5cdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdhbWJpZ3VvdXNfbW9kZWwnLCBhdmFpbGFibGVfbW9kZWxzOiBleGFjdE1hdGNoZXMubWFwKHZvaWNlTW9kZWxSZWZlcmVuY2UpIH07XG5cdH1cblxuXHRjb25zdCByZWxhdGVkID0gbm9ybWFsaXplZCA/IG1vZGVscy5maWx0ZXIobW9kZWwgPT4gW21vZGVsLm1ldGFkYXRhLm5hbWUsIG1vZGVsLm1ldGFkYXRhLmlkLCBtb2RlbC5tZXRhZGF0YS5mYW1pbHldXG5cdFx0LnNvbWUoY2FuZGlkYXRlID0+IG5vcm1hbGl6ZU1vZGVsTmFtZShjYW5kaWRhdGUpLmluY2x1ZGVzKG5vcm1hbGl6ZWQpIHx8IG5vcm1hbGl6ZWQuaW5jbHVkZXMobm9ybWFsaXplTW9kZWxOYW1lKGNhbmRpZGF0ZSkpKSkgOiBbXTtcblx0cmV0dXJuIHtcblx0XHRvazogZmFsc2UsXG5cdFx0cmVhc29uOiByZWxhdGVkLmxlbmd0aCA+IDEgPyAnYW1iaWd1b3VzX21vZGVsJyA6ICdtb2RlbF9ub3RfZm91bmQnLFxuXHRcdGF2YWlsYWJsZV9tb2RlbHM6IChyZWxhdGVkLmxlbmd0aCA+IDAgPyByZWxhdGVkIDogbW9kZWxzKS5zbGljZSgwLCAxMCkubWFwKHZvaWNlTW9kZWxSZWZlcmVuY2UpLFxuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgZGVsZWdhdGUgdGhhdCBicmlkZ2VzIHdpZGdldC9VSSBjb25jZXJucy5cblx0ICogTXVzdCBiZSBjYWxsZWQgYmVmb3JlIGRpc3BhdGNoaW5nIHRvb2wgY2FsbHMuXG5cdCAqL1xuXHRzZXREZWxlZ2F0ZShkZWxlZ2F0ZTogSVZvaWNlVG9vbERpc3BhdGNoRGVsZWdhdGUpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEaXNwYXRjaCBhIHRvb2wgY2FsbCBhbmQgcmV0dXJuIHRoZSByZXN1bHQgc3RyaW5nLlxuXHQgKi9cblx0ZGlzcGF0Y2hUb29sQ2FsbCh0b29sQ2FsbDogSVZvaWNlVG9vbENhbGwpOiBQcm9taXNlPHN0cmluZz47XG5cblx0LyoqXG5cdCAqIEFwcGx5IGEgYmFja2VuZC1yZXNvbHZlZCByZXNwb25zZSB0byB3aGF0ZXZlciBhIHNlc3Npb24gaXMgd2FpdGluZyBvbi5cblx0ICpcblx0ICogU2VwYXJhdGUgZnJvbSBgZGlzcGF0Y2hUb29sQ2FsbGAgYmVjYXVzZSBpdCBhbnN3ZXJzIHdpdGggYSBzdHJ1Y3R1cmVkXG5cdCAqIG91dGNvbWUgcmF0aGVyIHRoYW4gYSBzdHJpbmc6IHRoZSBiYWNrZW5kIG9ubHkgc3BlYWtzIGFuIGFja25vd2xlZGdlbWVudFxuXHQgKiBmb3Igc29tZXRoaW5nIGl0IGhhcyBhY3R1YWxseSBvYnNlcnZlZCwgc28gXCJpdCBsYW5kZWRcIiBhbmQgXCJpdCBkaWRuJ3RcIlxuXHQgKiBoYXZlIHRvIGJlIGRpc3Rpbmd1aXNoYWJsZS5cblx0ICovXG5cdHJlc3BvbmRUb1Nlc3Npb24odG9vbENhbGw6IElWb2ljZVRvb2xDYWxsKTogUHJvbWlzZTxJVm9pY2VEaXNwYXRjaFJlc3VsdD47XG59XG5cbmV4cG9ydCBjb25zdCBJVm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2U+KCd2b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UnKTtcblxuLyoqIEFjdGlvbiBsYWJlbHMgZGlzcGxheWVkIGluIHRoZSBzdGF0dXMgYmFyIGR1cmluZyB0b29sIGV4ZWN1dGlvbi4gKi9cbmNvbnN0IEFDVElPTl9MQUJFTFM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdHNlbmRfdG9fY2hhdDogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmFjdGlvbi5zZW5kVG9DaGF0JywgXCJTZW5kaW5nIHRvIGNoYXQuLi5cIiksXG5cdGdldF9zZXNzaW9uX2luZm86IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5hY3Rpb24uZ2V0U2Vzc2lvbkluZm8nLCBcIkNoZWNraW5nIHNlc3Npb25zLi4uXCIpLFxuXHRnZXRfc2Vzc2lvbl9jaGFuZ2VzOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLmdldFNlc3Npb25DaGFuZ2VzJywgXCJDaGVja2luZyBjaGFuZ2VzLi4uXCIpLFxuXHRnZXRfc2Vzc2lvbl90aHJlYWQ6IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5hY3Rpb24uZ2V0U2Vzc2lvblRocmVhZCcsIFwiQ2hlY2tpbmcgY29udmVyc2F0aW9uLi4uXCIpLFxuXHRyZXNwb25kX3RvX3Nlc3Npb246IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5hY3Rpb24ucmVzcG9uZCcsIFwiUmVzcG9uZGluZy4uLlwiKSxcblx0Zm9jdXNfc2Vzc2lvbjogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmFjdGlvbi5mb2N1c1Nlc3Npb24nLCBcIkZvY3VzaW5nIHNlc3Npb24uLi5cIiksXG5cdHNldF9tb2RlbDogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmFjdGlvbi5zZXRNb2RlbCcsIFwiQ2hhbmdpbmcgbW9kZWwuLi5cIiksXG5cdGF1dG9fYXBwcm92ZV9zZXNzaW9uOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLmF1dG9BcHByb3ZlJywgXCJBdXRvLWFwcHJvdmluZyBzZXNzaW9uLi4uXCIpLFxuXHRyZXZva2VfYXV0b19hcHByb3ZlOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLnJldm9rZUF1dG9BcHByb3ZlJywgXCJSZXZva2luZyBhdXRvLWFwcHJvdmUuLi5cIiksXG59O1xuXG5leHBvcnQgY2xhc3MgVm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlIGltcGxlbWVudHMgSVZvaWNlVG9vbERpc3BhdGNoU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZGVsZWdhdGU6IElWb2ljZVRvb2xEaXNwYXRjaERlbGVnYXRlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0c2V0RGVsZWdhdGUoZGVsZWdhdGU6IElWb2ljZVRvb2xEaXNwYXRjaERlbGVnYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVsZWdhdGUgPSBkZWxlZ2F0ZTtcblx0fVxuXG5cdC8qKiBHZXQgdGhlIGFjdGlvbiBsYWJlbCBmb3IgYSB0b29sIGNhbGwgbmFtZS4gKi9cblx0c3RhdGljIGdldEFjdGlvbkxhYmVsKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEFDVElPTl9MQUJFTFNbbmFtZV0gPz8gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmFjdGlvbi53b3JraW5nJywgXCJXb3JraW5nLi4uXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2FnZW50TW9kZU9wdGlvbnMoKTogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMge1xuXHRcdGNvbnN0IGFsbFRvb2xzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0aGlzLnRvb2xzU2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKSB7XG5cdFx0XHRhbGxUb29sc1t0b29sLmlkXSA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlSW5mbzoge1xuXHRcdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0aW5zdHJ1Y3Rpb25Db250ZXh0OiB7XG5cdFx0XHRcdG1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGVuYWJsZWRUb29sczogYWxsVG9vbHMsXG5cdFx0XHR9LFxuXHRcdFx0dXNlclNlbGVjdGVkVG9vbHM6IGNvbnN0T2JzZXJ2YWJsZShhbGxUb29scyksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGRpc3BhdGNoVG9vbENhbGwodG9vbENhbGw6IElWb2ljZVRvb2xDYWxsKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2RlbGVnYXRlO1xuXHRcdGlmICghZGVsZWdhdGUpIHtcblx0XHRcdHJldHVybiAnZXJyb3I6IG5vIGRlbGVnYXRlIHNldCc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXJncyA9IHRvb2xDYWxsLmFyZ3M7XG5cdFx0Y29uc3QgYXJnU3RyaW5nID0gKGs6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCB2ID0gYXJnc1trXTtcblx0XHRcdHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB2IDogJyc7XG5cdFx0fTtcblxuXHRcdHN3aXRjaCAodG9vbENhbGwubmFtZSkge1xuXHRcdFx0Y2FzZSAnc2VuZF90b19jaGF0Jzoge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYXJnU3RyaW5nKCd0ZXh0Jyk7XG5cdFx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdFx0aWYgKCFkZWxlZ2F0ZS5hY2NlcHRJbnB1dCh0ZXh0KSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBhd2FpdCBkZWxlZ2F0ZS5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdChyZXNvdXJjZSwgdGV4dCwgdGhpcy5fYWdlbnRNb2RlT3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZWYgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KHJlZi5vYmplY3Quc2Vzc2lvblJlc291cmNlLCB0ZXh0LCB0aGlzLl9hZ2VudE1vZGVPcHRpb25zKTtcblx0XHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmb2N1c19zZXNzaW9uJzoge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRTZXNzaW9uSWQgPSBhcmdTdHJpbmcoJ2NvZGluZ19zZXNzaW9uX2lkJyk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gdGhpcy5fZmluZFNlc3Npb25SZXNvdXJjZSh0YXJnZXRTZXNzaW9uSWQpO1xuXHRcdFx0XHRpZiAodGFyZ2V0UmVzb3VyY2UpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50UmVzb3VyY2UgPSBhd2FpdCBkZWxlZ2F0ZS5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0Y29uc3Qgc3dpdGNoZWQgPSB0YXJnZXRSZXNvdXJjZS50b1N0cmluZygpID09PSBjdXJyZW50UmVzb3VyY2U/LnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdHx8IGF3YWl0IGRlbGVnYXRlLnN3aXRjaFRvU2Vzc2lvbih0YXJnZXRSZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHN3aXRjaGVkKSB7XG5cdFx0XHRcdFx0XHRkZWxlZ2F0ZS5zZXRUYXJnZXRTZXNzaW9uKHRhcmdldFJlc291cmNlKTtcblx0XHRcdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlLCBzZXNzaW9uX2lkOiB0YXJnZXRSZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIHJlYXNvbjogdGFyZ2V0UmVzb3VyY2UgPyAnc3dpdGNoX2ZhaWxlZCcgOiAnc2Vzc2lvbl9ub3RfZm91bmQnIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2V0X21vZGVsJzoge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0ZWRNb2RlbCA9IGFyZ1N0cmluZygnbW9kZWxfaWQnKSB8fCBhcmdTdHJpbmcoJ21vZGVsJyk7XG5cdFx0XHRcdGlmICghcmVxdWVzdGVkTW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBvazogZmFsc2UsIHJlYXNvbjogJ21vZGVsX25vdF9mb3VuZCcgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5fc2hvd0FjdGlvblRhcmdldChhcmdTdHJpbmcoJ2NvZGluZ19zZXNzaW9uX2lkJykpO1xuXHRcdFx0XHRpZiAoIXRhcmdldC5vaykge1xuXHRcdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh0YXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShhd2FpdCBkZWxlZ2F0ZS5zZWxlY3RNb2RlbChyZXF1ZXN0ZWRNb2RlbCkpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYXV0b19hcHByb3ZlX3Nlc3Npb24nOiB7XG5cdFx0XHRcdGRlbGVnYXRlLmFkZEFsbEF1dG9BcHByb3ZlZFNlc3Npb25zKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAncmV2b2tlX2F1dG9fYXBwcm92ZSc6IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gYXdhaXQgZGVsZWdhdGUuZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpO1xuXHRcdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdFx0ZGVsZWdhdGUucmVtb3ZlQXV0b0FwcHJvdmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdnZXRfc2Vzc2lvbl9pbmZvJzoge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZ2F0aGVyU2Vzc2lvbkluZm8oKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dldF9zZXNzaW9uX2NoYW5nZXMnOiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IHR5cGVvZiB0b29sQ2FsbC5hcmdzPy5jb2Rpbmdfc2Vzc2lvbl9pZCA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQ/IHRvb2xDYWxsLmFyZ3MuY29kaW5nX3Nlc3Npb25faWRcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2dhdGhlclNlc3Npb25DaGFuZ2VzKHNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdnZXRfc2Vzc2lvbl90aHJlYWQnOiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IHR5cGVvZiB0b29sQ2FsbC5hcmdzPy5jb2Rpbmdfc2Vzc2lvbl9pZCA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQ/IHRvb2xDYWxsLmFyZ3MuY29kaW5nX3Nlc3Npb25faWRcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcmF3TiA9IHRvb2xDYWxsLmFyZ3M/Lmxhc3Rfbl90dXJucztcblx0XHRcdFx0Y29uc3QgbGFzdE4gPSB0eXBlb2YgcmF3TiA9PT0gJ251bWJlcicgJiYgcmF3TiA+IDAgPyBNYXRoLm1pbigxMCwgTWF0aC5mbG9vcihyYXdOKSkgOiAzO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZ2F0aGVyU2Vzc2lvblRocmVhZChzZXNzaW9uSWQsIGxhc3ROKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuICdvayc7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kU2Vzc2lvblJlc291cmNlKHNlc3Npb25JZDogc3RyaW5nKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9uc1xuXHRcdFx0LmZpbmQoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5pc0FyY2hpdmVkKCkgJiYgc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpID09PSBzZXNzaW9uSWQpO1xuXHRcdGlmIChhZ2VudFNlc3Npb24pIHtcblx0XHRcdHJldHVybiBhZ2VudFNlc3Npb24ucmVzb3VyY2U7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgdGhpcy5jaGF0U2VydmljZS5jaGF0TW9kZWxzLmdldCgpKSB7XG5cdFx0XHRpZiAobW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25JZCkge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd0FjdGlvblRhcmdldChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8eyBvazogdHJ1ZTsgcmVzb3VyY2U6IFVSSSB9IHwgeyBvazogZmFsc2U7IHJlYXNvbjogJ25vX3Nlc3Npb24nIHwgJ3Nlc3Npb25fbm90X2ZvdW5kJyB8ICdzd2l0Y2hfZmFpbGVkJyB9PiB7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSB0aGlzLl9kZWxlZ2F0ZTtcblx0XHRpZiAoIWRlbGVnYXRlKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vX3Nlc3Npb24nIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gc2Vzc2lvbklkXG5cdFx0XHQ/IHRoaXMuX2ZpbmRTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvbklkKVxuXHRcdFx0OiBkZWxlZ2F0ZS5nZXRUYXJnZXRTZXNzaW9uUmVzb3VyY2UoKSA/PyBhd2FpdCBkZWxlZ2F0ZS5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IHNlc3Npb25JZCA/ICdzZXNzaW9uX25vdF9mb3VuZCcgOiAnbm9fc2Vzc2lvbicgfTtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudCA9IGF3YWl0IGRlbGVnYXRlLmdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKTtcblx0XHRpZiAoY3VycmVudD8udG9TdHJpbmcoKSAhPT0gcmVzb3VyY2UudG9TdHJpbmcoKSAmJiAhYXdhaXQgZGVsZWdhdGUuc3dpdGNoVG9TZXNzaW9uKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzd2l0Y2hfZmFpbGVkJyB9O1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbklkKSB7XG5cdFx0XHRkZWxlZ2F0ZS5zZXRUYXJnZXRTZXNzaW9uKHJlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgb2s6IHRydWUsIHJlc291cmNlIH07XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgYSBiYWNrZW5kLXJlc29sdmVkIHJlc3BvbnNlIHRvIHRoZSBleGFjdCBwZW5kaW5nIHBhcnQgaXQgbmFtZXMuXG5cdCAqXG5cdCAqIFJvdXRpbmcgaXMgYnkgYHBlbmRpbmdfaWRgICsgYHJlcXVlc3RfaWRgIHdpdGggbm8gZmFsbGJhY2s6IHRoZSBwYXRoIHRoaXNcblx0ICogcmVwbGFjZXMgZmVsbCBiYWNrIHRvIHRoZSBmb2N1c2VkIHNlc3Npb24sIHNvIGEgc3Bva2VuIFwieWVzXCIgY291bGQgYXBwcm92ZVxuXHQgKiBhIHByb21wdCB0aGUgdXNlciB3YXMgbm90IGxvb2tpbmcgYXQuIEEgcmVzcG9uc2UgdGhhdCBjYW5ub3QgZmluZCBpdHMgcGFydFxuXHQgKiBpcyByZXBvcnRlZCBhcyBzdGFsZSBpbnN0ZWFkLiBBbnN3ZXIgdmFsdWVzIGFyZSBtYXRjaGVkIGV4YWN0bHk7IHNlZVxuXHQgKiBgcmVzb2x2ZVF1ZXN0aW9uQW5zd2Vyc2AuXG5cdCAqL1xuXHRhc3luYyByZXNwb25kVG9TZXNzaW9uKHRvb2xDYWxsOiBJVm9pY2VUb29sQ2FsbCk6IFByb21pc2U8SVZvaWNlRGlzcGF0Y2hSZXN1bHQ+IHtcblx0XHRjb25zdCBhcmdzID0gdG9vbENhbGwuYXJncztcblx0XHRjb25zdCBhcmdTdHJpbmcgPSAoa2V5OiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhcmdzW2tleV07XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogJyc7XG5cdFx0fTtcblx0XHRjb25zdCByZXNwb25zZSA9IGFyZ3NbJ3Jlc3BvbnNlJ107XG5cdFx0aWYgKCFyZXNwb25zZSB8fCB0eXBlb2YgcmVzcG9uc2UgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkocmVzcG9uc2UpKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9O1xuXHRcdH1cblx0XHRjb25zdCByZXNwb25zZVR5cGUgPSAocmVzcG9uc2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWyd0eXBlJ107XG5cdFx0aWYgKHJlc3BvbnNlVHlwZSAhPT0gJ2FwcHJvdmUnICYmIHJlc3BvbnNlVHlwZSAhPT0gJ3JlamVjdCcgJiYgcmVzcG9uc2VUeXBlICE9PSAnYW5zd2VyJyAmJiByZXNwb25zZVR5cGUgIT09ICdza2lwJykge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNb2RlbEZvclJlc3BvbnNlKGFyZ1N0cmluZygnY29kaW5nX3Nlc3Npb25faWQnKSk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdub19zZXNzaW9uJyB9O1xuXHRcdH1cblx0XHQvLyBBIGZyZXNobHkgbG9hZGVkIHNlc3Npb24gaG9sZHMgaXRzIG9ubHkgcmVmZXJlbmNlIGhlcmUsIHNvIGV2ZXJ5dGhpbmdcblx0XHQvLyB0aGF0IHJlYWRzIHRoZSBtb2RlbCwgaW5jbHVkaW5nIHRoZSBhd2FpdGVkIGNvbmZpcm1hdGlvbiBzZW5kLCBoYXMgdG9cblx0XHQvLyBoYXBwZW4gYmVmb3JlIGl0IGlzIHJlbGVhc2VkLlxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fYXBwbHlSZXNwb25zZShcblx0XHRcdFx0cmVzb2x2ZWQubW9kZWwsXG5cdFx0XHRcdGFyZ1N0cmluZygncmVxdWVzdF9pZCcpLFxuXHRcdFx0XHRhcmdTdHJpbmcoJ3BlbmRpbmdfaWQnKSxcblx0XHRcdFx0cmVzcG9uc2VUeXBlLFxuXHRcdFx0XHRyZXNwb25zZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcblx0XHRcdCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlc29sdmVkLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseVJlc3BvbnNlKFxuXHRcdG1vZGVsOiBJQ2hhdE1vZGVsLFxuXHRcdHJlcXVlc3RJZDogc3RyaW5nLFxuXHRcdHBlbmRpbmdJZDogc3RyaW5nLFxuXHRcdHJlc3BvbnNlVHlwZTogJ2FwcHJvdmUnIHwgJ3JlamVjdCcgfCAnYW5zd2VyJyB8ICdza2lwJyxcblx0XHRyZXNwb25zZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdCk6IFByb21pc2U8SVZvaWNlRGlzcGF0Y2hSZXN1bHQ+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgPT09IHJlcXVlc3RJZCk7XG5cdFx0Y29uc3QgcGFydHMgPSByZXF1ZXN0Py5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWU7XG5cdFx0aWYgKCFyZXF1ZXN0IHx8ICFwYXJ0cykge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGFsZV9wZW5kaW5nJyB9O1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IHBhcnRzLmZpbmRJbmRleChjYW5kaWRhdGUgPT4gcGVla1BlbmRpbmdJZChyZXF1ZXN0LmlkLCBjYW5kaWRhdGUpID09PSBwZW5kaW5nSWQpO1xuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RhbGVfcGVuZGluZycgfTtcblx0XHR9XG5cdFx0Y29uc3QgcGFydCA9IHBhcnRzW2luZGV4XTtcblxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJykge1xuXHRcdFx0aWYgKHJlc3BvbnNlVHlwZSAhPT0gJ2Fuc3dlcicgJiYgcmVzcG9uc2VUeXBlICE9PSAnc2tpcCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9hbnN3ZXJDYXJvdXNlbChyZXF1ZXN0LmlkLCBwYXJ0IGFzIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgcmVzcG9uc2UsIHJlc3BvbnNlVHlwZSA9PT0gJ3NraXAnKTtcblx0XHR9XG5cblx0XHRpZiAocmVzcG9uc2VUeXBlID09PSAnYW5zd2VyJyB8fCByZXNwb25zZVR5cGUgPT09ICdza2lwJykge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfTtcblx0XHR9XG5cdFx0Y29uc3QgYXBwcm92ZSA9IHJlc3BvbnNlVHlwZSA9PT0gJ2FwcHJvdmUnO1xuXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnICYmIHBhcnQgaW5zdGFuY2VvZiBDaGF0UGxhblJldmlld0RhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlUGxhblJldmlldyhwYXJ0LCBhcHByb3ZlKSA/IHsgb2s6IHRydWUgfSA6IHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGFsZV9wZW5kaW5nJyB9O1xuXHRcdH1cblxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdGlmIChnZXRWb2ljZUNvbmZpcm1hdGlvblR5cGUoW3BhcnRdKSAhPT0gJ3Rvb2wnKSB7XG5cdFx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAndW5zdXBwb3J0ZWQnIH07XG5cdFx0XHR9XG5cdFx0XHQvLyBBIHByb3ZpZGVyIG1heSBrZWVwIG11bHRpcGxlIHJlaHlkcmF0ZWQgY29waWVzIHBlbmRpbmcgd2hpbGUgaXQgc2VuZHNcblx0XHRcdC8vIHRoaXMgcmVzcG9uc2UuIFJldGlyZSB0aGUgc2hhcmVkIG9jY3VycmVuY2UgYmVmb3JlIGludm9raW5nIHRoZSBjYWxsYmFja1xuXHRcdFx0Ly8gc28gbm9uZSBvZiB0aG9zZSBjb3BpZXMgY2FuIHN1Ym1pdCB0aGUgc2FtZSBhcHByb3ZhbCBhIHNlY29uZCB0aW1lLlxuXHRcdFx0bWFya1BlbmRpbmdJZFJlc29sdmVkKHBlbmRpbmdJZCk7XG5cdFx0XHRjb25zdCBjb25maXJtZWQgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKFxuXHRcdFx0XHRwYXJ0IGFzIElDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0XHRcdGFwcHJvdmUgPyB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0gOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5EZW5pZWQgfSxcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gY29uZmlybWVkID8geyBvazogdHJ1ZSB9IDogeyBvazogZmFsc2UsIHJlYXNvbjogJ3N0YWxlX3BlbmRpbmcnIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVQbGFuUmV2aWV3KHBsYW46IENoYXRQbGFuUmV2aWV3RGF0YSwgYXBwcm92ZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmIChwbGFuLmlzVXNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0OiBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQ7XG5cdFx0aWYgKGFwcHJvdmUpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHBsYW4uYWN0aW9ucy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuZGVmYXVsdCkgPz8gcGxhbi5hY3Rpb25zWzBdO1xuXHRcdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0ID0ge1xuXHRcdFx0XHRhY3Rpb246IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0YWN0aW9uSWQ6IGFjdGlvbi5pZCxcblx0XHRcdFx0cmVqZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0geyByZWplY3RlZDogdHJ1ZSB9O1xuXHRcdH1cblx0XHRwbGFuLmRhdGEgPSByZXN1bHQ7XG5cdFx0cGxhbi5pc1VzZWQgPSB0cnVlO1xuXHRcdHZvaWQgcGxhbi5jb21wbGV0aW9uLmNvbXBsZXRlKHJlc3VsdCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogUmVzb2x2ZSBhIGNvZGluZyBzZXNzaW9uIGlkIHRvIGl0cyBjaGF0IG1vZGVsLCBuZXZlciBmYWxsaW5nIGJhY2sgdG8gdGhlIGZvY3VzZWQgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZU1vZGVsRm9yUmVzcG9uc2UoY29kaW5nU2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHsgbW9kZWw6IElDaGF0TW9kZWw7IGRpc3Bvc2UoKTogdm9pZCB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFjb2RpbmdTZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnNcblx0XHRcdC5maW5kKHNlc3Npb24gPT4gIXNlc3Npb24uaXNBcmNoaXZlZCgpICYmIHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY29kaW5nU2Vzc2lvbklkKTtcblx0XHRpZiAoYWdlbnRTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBsb2FkZWQgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oYWdlbnRTZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdGlmIChsb2FkZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZWw6IGxvYWRlZCwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgY2hhdE1vZGVsIG9mIHRoaXMuY2hhdFNlcnZpY2UuY2hhdE1vZGVscy5nZXQoKSkge1xuXHRcdFx0aWYgKGNoYXRNb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY29kaW5nU2Vzc2lvbklkKSB7XG5cdFx0XHRcdHJldHVybiB7IG1vZGVsOiBjaGF0TW9kZWwsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWFnZW50U2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZVxuXHRcdFx0LmFjcXVpcmVPckxvYWRTZXNzaW9uKGFnZW50U2Vzc2lvbi5yZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3RzLnRva2VuLCAndm9pY2UtcmVzcG9uZCcpXG5cdFx0XHQuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihhZ2VudFNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBUaGlzIHJlZmVyZW5jZSBpcyB0aGUgb25seSB0aGluZyBrZWVwaW5nIHRoZSBqdXN0LWxvYWRlZCBzZXNzaW9uIGFsaXZlO1xuXHRcdC8vIHJlbGVhc2luZyBpdCBoZXJlIHdvdWxkIGxldCB0aGUgbW9kZWwgYmUgZGlzcG9zZWQgb3V0IGZyb20gdW5kZXIgdGhlXG5cdFx0Ly8gY2FsbGVyLCBwb3RlbnRpYWxseSBtaWQtYHNlbmRSZXF1ZXN0YC5cblx0XHRyZXR1cm4geyBtb2RlbCwgZGlzcG9zZTogKCkgPT4gcmVmLmRpc3Bvc2UoKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbGwgaW4gYSBxdWVzdGlvbiBjYXJvdXNlbCBleGFjdGx5IGFzIHRoZSB3aWRnZXQncyBvd24gc3VibWl0IHBhdGggZG9lcy5cblx0ICpcblx0ICogQSBgc2tpcGAgY2FycmllcyB3aGF0ZXZlciB0aGUgdXNlciBhbnN3ZXJlZCBiZWZvcmUgc2F5aW5nIFwic2tpcFwiLCB3aGljaCBvblxuXHQgKiBhbiB1bnRvdWNoZWQgZm9ybSBpcyBub3RoaW5nIGF0IGFsbC4gVGhhdCBlbXB0eSBjYXNlIGlzIHdoeSBza2lwcGluZyBpcyBpdHNcblx0ICogb3duIHJlc3BvbnNlIHR5cGU6IGFuIGBhbnN3ZXJgIHdpdGggemVybyBhbnN3ZXJzIGlzIGluZGlzdGluZ3Vpc2hhYmxlIGZyb21cblx0ICogYSBiYWNrZW5kIHRoYXQgcmVzb2x2ZWQgbm90aGluZywgYW5kIGlzIGNvcnJlY3RseSByZWZ1c2VkIGJlbG93LlxuXHQgKi9cblx0cHJpdmF0ZSBfYW5zd2VyQ2Fyb3VzZWwoXG5cdFx0cmVxdWVzdElkOiBzdHJpbmcsXG5cdFx0Y2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCxcblx0XHRyZXNwb25zZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdFx0c2tpcDogYm9vbGVhbixcblx0KTogSVZvaWNlRGlzcGF0Y2hSZXN1bHQge1xuXHRcdGlmIChjYXJvdXNlbC5pc1VzZWQgfHwgY2Fyb3VzZWwuYW5zd2VyZWRFeHRlcm5hbGx5KSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3N0YWxlX3BlbmRpbmcnIH07XG5cdFx0fVxuXHRcdGlmIChza2lwICYmICFjYXJvdXNlbC5hbGxvd1NraXApIHtcblx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RhbGVfcGVuZGluZycgfTtcblx0XHR9XG5cdFx0Y29uc3QgcmF3ID0gcmVzcG9uc2VbJ2Fuc3dlcnMnXTtcblx0XHQvLyBPbmx5IGFuIGFic2VudCBgYW5zd2Vyc2AgbWVhbnMgXCJub25lXCIuIEEgcHJlc2VudCBub24tYXJyYXkgaXMgYVxuXHRcdC8vIG1hbGZvcm1lZCBjYWxsLCBhbmQgY29lcmNpbmcgaXQgdG8gZW1wdHkgd291bGQgbGV0IGEgc2tpcCBzdWNjZWVkIHdoaWxlXG5cdFx0Ly8gZGlzY2FyZGluZyB3aGF0ZXZlciB3YXMgYWN0dWFsbHkgbWVhbnQuXG5cdFx0aWYgKHJhdyAhPT0gdW5kZWZpbmVkICYmICFBcnJheS5pc0FycmF5KHJhdykpIHtcblx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnaW52YWxpZF9hbnN3ZXInIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJhd0Fuc3dlcnMgPSAocmF3ID8/IFtdKSBhcyBJQmFja2VuZFF1ZXN0aW9uQW5zd2VyW107XG5cdFx0bGV0IGFuc3dlcnM6IElDaGF0UXVlc3Rpb25BbnN3ZXJzIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyYXdBbnN3ZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdGFuc3dlcnMgPSByZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKGNhcm91c2VsLnF1ZXN0aW9ucywgcmF3QW5zd2Vycyk7XG5cdFx0XHRpZiAoIWFuc3dlcnMpIHtcblx0XHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdpbnZhbGlkX2Fuc3dlcicgfTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCFza2lwKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ludmFsaWRfYW5zd2VyJyB9O1xuXHRcdH1cblx0XHQvLyBUaGUgd2lkZ2V0IHJlZnVzZXMgdG8gc3VibWl0IHdoaWxlIGEgcmVxdWlyZWQgcXVlc3Rpb24gaXMgYmxhbmssIHNvIGFcblx0XHQvLyBzcG9rZW4gYW5zd2VyIG11c3Qgbm90IGJlIGFibGUgdG8gc3VibWl0IHdoYXQgYSBjbGljayBjYW5ub3QuIEFic2VuY2UgaXNcblx0XHQvLyB0aGUgb25seSBibGFuayBwb3NzaWJsZTogYHJlc29sdmVRdWVzdGlvbkFuc3dlcnNgIHJlamVjdHMgcmF0aGVyIHRoYW5cblx0XHQvLyBlbWl0dGluZyBhbiBlbXB0eSB2YWx1ZS4gVGhlIGJhY2tlbmQgb25seSBkaXNwYXRjaGVzIGEgZnVsbHkgYW5zd2VyZWRcblx0XHQvLyBmb3JtLCBzbyB0aGlzIGlzIGEgYmFja3N0b3AuXG5cdFx0aWYgKCFza2lwICYmIGNhcm91c2VsLnF1ZXN0aW9ucy5zb21lKHF1ZXN0aW9uID0+IHF1ZXN0aW9uLnJlcXVpcmVkICYmIGFuc3dlcnM/LltxdWVzdGlvbi5pZF0gPT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnaW52YWxpZF9hbnN3ZXInIH07XG5cdFx0fVxuXHRcdC8vIENoZWNrZWQgYmVmb3JlIG11dGF0aW5nOiBhIGZvcm0gd2l0aCBuZWl0aGVyIGEgZGVmZXJyZWQgY29tcGxldGlvbiBub3Jcblx0XHQvLyBhbiBpZCB0byBub3RpZnkgY2Fubm90IGJlIHJlc29sdmVkLCBhbmQgbWFya2luZyBpdCB1c2VkIHdvdWxkIGxlYXZlIGl0XG5cdFx0Ly8gYW5zd2VyZWQgb24gc2NyZWVuIHdoaWxlIHRoZSBhc3Npc3RhbnQgcmVwb3J0cyB0aGF0IGl0IGRpZCBub3QgbGFuZC5cblx0XHRpZiAoIShjYXJvdXNlbCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkgJiYgIWNhcm91c2VsLnJlc29sdmVJZCkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfTtcblx0XHR9XG5cdFx0Ly8gYGRpc21pc3NgIGFsc28gY29tcGxldGVzIHRoZSBkZWZlcnJlZCBwcm9taXNlIGFuIGFnZW50LWhvc3RlZCBjYXJvdXNlbFxuXHRcdC8vIGlzIGJsb2NrZWQgb247IG1hcmtpbmcgaXQgdXNlZCB3aXRob3V0IHRoYXQgbGVhdmVzIHRoZSBhZ2VudCB3YWl0aW5nLlxuXHRcdGlmIChjYXJvdXNlbCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkge1xuXHRcdFx0Y2Fyb3VzZWwuZGlzbWlzcyhhbnN3ZXJzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2Fyb3VzZWwuZGF0YSA9IGFuc3dlcnM7XG5cdFx0XHRjYXJvdXNlbC5pc1VzZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoY2Fyb3VzZWwucmVzb2x2ZUlkKSB7XG5cdFx0XHR0aGlzLmNoYXRTZXJ2aWNlLm5vdGlmeVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIocmVxdWVzdElkLCBjYXJvdXNlbC5yZXNvbHZlSWQsIGFuc3dlcnMpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBvazogdHJ1ZSB9O1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF9nYXRoZXJTZXNzaW9uSW5mbygpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnMgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+ICFzZXNzaW9uLmlzQXJjaGl2ZWQoKSk7XG5cdFx0Y29uc3QgY3VycmVudFJlc291cmNlID0gYXdhaXQgdGhpcy5fZGVsZWdhdGU/LmdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKTtcblx0XHRjb25zdCBhY3RpdmVSZXNvdXJjZSA9IHRoaXMuX2RlbGVnYXRlPy5nZXRUYXJnZXRTZXNzaW9uUmVzb3VyY2UoKSA/PyBjdXJyZW50UmVzb3VyY2U7XG5cdFx0Y29uc3QgYWdlbnRSZXNvdXJjZXMgPSBuZXcgU2V0KGFnZW50U2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0Y29uc3QgaW5wdXREZXRhaWxzID0gKG1vZGVsOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsPy5pbnB1dE1vZGVsPy5zdGF0ZT8uZ2V0KCk7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IHN0YXRlPy5zZWxlY3RlZE1vZGVsO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudHMgPSBzdGF0ZT8uYXR0YWNobWVudHMuZmlsdGVyKGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnkpID8/IFtdO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uKHNlbGVjdGVkID8geyBzZWxlY3RlZF9tb2RlbDogdm9pY2VNb2RlbFJlZmVyZW5jZShzZWxlY3RlZCkgfSA6IHt9KSxcblx0XHRcdFx0Li4uKGF0dGFjaG1lbnRzLmxlbmd0aCA/IHtcblx0XHRcdFx0XHRhdHRhY2htZW50X25hbWVzOiBhdHRhY2htZW50cy5tYXAoYXR0YWNobWVudCA9PiBhdHRhY2htZW50Lm5hbWUpLnNsaWNlKDAsIDEwKSxcblx0XHRcdFx0XHRhdHRhY2htZW50X2NvdW50OiBhdHRhY2htZW50cy5sZW5ndGgsXG5cdFx0XHRcdH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH07XG5cdFx0Y29uc3QgbGFzdFJlc3BvbnNlU3VtbWFyeSA9IChtb2RlbDogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbW9kZWw/LmdldFJlcXVlc3RzKCkuYXQoLTEpPy5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWVcblx0XHRcdFx0LmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcpXG5cdFx0XHRcdC5tYXAocGFydCA9PiAocGFydCBhcyB7IGNvbnRlbnQ6IHsgdmFsdWU6IHN0cmluZyB9IH0pLmNvbnRlbnQudmFsdWUpXG5cdFx0XHRcdC5qb2luKCcgJylcblx0XHRcdFx0LnNsaWNlKDAsIDUwMCk7XG5cdFx0XHRyZXR1cm4gc3VtbWFyeSB8fCB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlc3Npb25EYXRhOiBBcnJheTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiAmIHsgc3RhdGU6IHN0cmluZzsgaXNfYWN0aXZlOiBib29sZWFuOyBsYXN0X2FjdGl2aXR5OiBudW1iZXIgfT4gPSBhZ2VudFNlc3Npb25zLm1hcChzZXNzaW9uID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGdldEFnZW50Q2hhbmdlc1N1bW1hcnkoc2Vzc2lvbi5jaGFuZ2VzKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzID8gJ3dvcmtpbmcnXG5cdFx0XHRcdDogc2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0ID8gJ3dhaXRpbmdfZm9yX2lucHV0J1xuXHRcdFx0XHRcdDogc2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgPyAnaWRsZSdcblx0XHRcdFx0XHRcdDogJ3Vua25vd24nO1xuXHRcdFx0Y29uc3QgbGFzdEFjdGl2aXR5ID0gc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/PyBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQgPz8gc2Vzc2lvbi50aW1pbmcuY3JlYXRlZCA/PyAwO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6ICh0b0FnZW50SG9zdEJhY2tlbmRTZXNzaW9uVXJpKHNlc3Npb24ucmVzb3VyY2UpID8/IHNlc3Npb24ucmVzb3VyY2UpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiBzZXNzaW9uLmxhYmVsIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vzc2lvbl90eXBlOiAnYWdlbnQnIGFzIGNvbnN0LFxuXHRcdFx0XHRzdGF0ZSxcblx0XHRcdFx0aXNfYWN0aXZlOiBhY3RpdmVSZXNvdXJjZT8udG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRpbnNlcnRpb25zOiBjaGFuZ2VzPy5pbnNlcnRpb25zID8/IDAsXG5cdFx0XHRcdGRlbGV0aW9uczogY2hhbmdlcz8uZGVsZXRpb25zID8/IDAsXG5cdFx0XHRcdGxhc3RfYWN0aXZpdHk6IGxhc3RBY3Rpdml0eSxcblx0XHRcdFx0bGFzdF9hY3Rpdml0eV9taW51dGVzX2FnbzogbGFzdEFjdGl2aXR5ID8gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIGxhc3RBY3Rpdml0eSkgLyA2MDAwMCkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYXN0X3Jlc3BvbnNlX3N1bW1hcnk6IGxhc3RSZXNwb25zZVN1bW1hcnkobW9kZWwpLFxuXHRcdFx0XHQuLi5pbnB1dERldGFpbHMobW9kZWwpLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgdGhpcy5jaGF0U2VydmljZS5jaGF0TW9kZWxzLmdldCgpKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBtb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gYWN0aXZlUmVzb3VyY2U/LnRvU3RyaW5nKCkgPT09IHNlc3Npb25JZDtcblx0XHRcdGlmIChhZ2VudFJlc291cmNlcy5oYXMoc2Vzc2lvbklkKSB8fCAobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGggPT09IDAgJiYgIWlzQWN0aXZlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5lZWRzSW5wdXQgPSBtb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dD8uZ2V0KCk7XG5cdFx0XHRjb25zdCBpblByb2dyZXNzID0gbW9kZWwuaGFzQWN0aXZlUmVxdWVzdD8uZ2V0KCk7XG5cdFx0XHRjb25zdCBsYXN0QWN0aXZpdHkgPSBtb2RlbC5sYXN0TWVzc2FnZURhdGUgfHwgMDtcblx0XHRcdHNlc3Npb25EYXRhLnB1c2goe1xuXHRcdFx0XHRpZDogKHRvQWdlbnRIb3N0QmFja2VuZFNlc3Npb25VcmkobW9kZWwuc2Vzc2lvblJlc291cmNlKSA/PyBtb2RlbC5zZXNzaW9uUmVzb3VyY2UpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiBtb2RlbC50aXRsZSB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb25fdHlwZTogJ2NoYXQnLFxuXHRcdFx0XHRzdGF0ZTogbmVlZHNJbnB1dCA/ICd3YWl0aW5nX2Zvcl9pbnB1dCcgOiBpblByb2dyZXNzID8gJ3dvcmtpbmcnIDogJ2lkbGUnLFxuXHRcdFx0XHRpc19hY3RpdmU6IGlzQWN0aXZlLFxuXHRcdFx0XHRpbnNlcnRpb25zOiAwLFxuXHRcdFx0XHRkZWxldGlvbnM6IDAsXG5cdFx0XHRcdGxhc3RfYWN0aXZpdHk6IGxhc3RBY3Rpdml0eSxcblx0XHRcdFx0bGFzdF9hY3Rpdml0eV9taW51dGVzX2FnbzogbGFzdEFjdGl2aXR5ID8gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIGxhc3RBY3Rpdml0eSkgLyA2MDAwMCkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYXN0X3Jlc3BvbnNlX3N1bW1hcnk6IGxhc3RSZXNwb25zZVN1bW1hcnkobW9kZWwpLFxuXHRcdFx0XHQuLi5pbnB1dERldGFpbHMobW9kZWwpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0c2Vzc2lvbkRhdGEuc29ydCgoYSwgYikgPT4gTnVtYmVyKGIuaXNfYWN0aXZlKSAtIE51bWJlcihhLmlzX2FjdGl2ZSkgfHwgYi5sYXN0X2FjdGl2aXR5IC0gYS5sYXN0X2FjdGl2aXR5KTtcblx0XHRjb25zdCBjb3VudHMgPSBzZXNzaW9uRGF0YS5yZWR1Y2UoKHJlc3VsdCwgc2Vzc2lvbikgPT4ge1xuXHRcdFx0aWYgKHNlc3Npb24uc3RhdGUgPT09ICd3b3JraW5nJykgeyByZXN1bHQud29ya2luZysrOyB9XG5cdFx0XHRlbHNlIGlmIChzZXNzaW9uLnN0YXRlID09PSAnd2FpdGluZ19mb3JfaW5wdXQnKSB7IHJlc3VsdC53YWl0aW5nX2Zvcl9pbnB1dCsrOyB9XG5cdFx0XHRlbHNlIGlmIChzZXNzaW9uLnN0YXRlID09PSAnaWRsZScpIHsgcmVzdWx0LmlkbGUrKzsgfVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCB7IHdvcmtpbmc6IDAsIHdhaXRpbmdfZm9yX2lucHV0OiAwLCBpZGxlOiAwIH0pO1xuXHRcdGNvbnN0IHZpc2libGVTZXNzaW9ucyA9IHNlc3Npb25EYXRhLnNsaWNlKDAsIDIwKS5tYXAoKHsgbGFzdF9hY3Rpdml0eSwgLi4uc2Vzc2lvbiB9KSA9PiBzZXNzaW9uKTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0dG90YWxfc2Vzc2lvbnM6IHNlc3Npb25EYXRhLmxlbmd0aCxcblx0XHRcdGNvdW50cyxcblx0XHRcdHNlc3Npb25zOiB2aXNpYmxlU2Vzc2lvbnMsXG5cdFx0XHR0cnVuY2F0ZWQ6IHZpc2libGVTZXNzaW9ucy5sZW5ndGggPCBzZXNzaW9uRGF0YS5sZW5ndGgsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhIGNvZGluZ19zZXNzaW9uX2lkIChyZXNvdXJjZSBVUkkgc3RyaW5nKSB0byBhbiBJQWdlbnRTZXNzaW9uLlxuXHQgKiBGYWxscyBiYWNrIHRvIHRoZSBjdXJyZW50bHkgYWN0aXZlIHNlc3Npb24gd2hlbiBpZCBpcyBtaXNzaW5nL3Vua25vd24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU2Vzc2lvbihjb2Rpbmdfc2Vzc2lvbl9pZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzID0+ICFzLmlzQXJjaGl2ZWQoKSk7XG5cdFx0aWYgKGNvZGluZ19zZXNzaW9uX2lkKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGNvZGluZ19zZXNzaW9uX2lkKTtcblx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRSZXNvdXJjZSA9IGF3YWl0IHRoaXMuX2RlbGVnYXRlPy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0aWYgKGN1cnJlbnRSZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gc2Vzc2lvbnMuZmluZChzID0+IHMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY3VycmVudFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRyZXR1cm4gYWN0aXZlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbnNbMF07XG5cdH1cblxuXHQvKipcblx0ICogR2F0aGVyIGZpbGVzIHRvdWNoZWQgKyBwZXItZmlsZSBpbnNlcnRpb25zL2RlbGV0aW9ucyBmb3IgYSBzZXNzaW9uLlxuXHQgKiBSZXR1cm5zIGEgSlNPTiBzdHJpbmcga2V5ZWQgZm9yIHRoZSBMTE0gZm9sbG93LXVwIHRvIHN1bW1hcml6ZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dhdGhlclNlc3Npb25DaGFuZ2VzKGNvZGluZ19zZXNzaW9uX2lkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2Vzc2lvbihjb2Rpbmdfc2Vzc2lvbl9pZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uX2lkOiBjb2Rpbmdfc2Vzc2lvbl9pZCA/PyBudWxsLCBmaWxlczogW10sIG5vdGU6ICdzZXNzaW9uX25vdF9mb3VuZCcgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhbmdlcyA9IHNlc3Npb24uY2hhbmdlcztcblx0XHRjb25zdCBmaWxlczogeyBwYXRoOiBzdHJpbmc7IGluc2VydGlvbnM6IG51bWJlcjsgZGVsZXRpb25zOiBudW1iZXIgfVtdID0gW107XG5cdFx0bGV0IHRvdGFsSW5zZXJ0aW9ucyA9IDA7XG5cdFx0bGV0IHRvdGFsRGVsZXRpb25zID0gMDtcblx0XHRsZXQgdG90YWxGaWxlcyA9IDA7XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShjaGFuZ2VzKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0Ly8gQm90aCBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlIGFuZCBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiBjYXJyeSBhIFVSSTtcblx0XHRcdFx0Ly8gcHJlZmVyIG1vZGlmaWVkVXJpIChtb3N0IGFjY3VyYXRlIHBvc3QtZWRpdCksIGZhbGwgYmFjayB0byB1cmkuXG5cdFx0XHRcdGNvbnN0IHVyaSA9IChjIGFzIHsgbW9kaWZpZWRVcmk/OiBVUkkgfSkubW9kaWZpZWRVcmkgPz8gKGMgYXMgeyB1cmk/OiBVUkkgfSkudXJpO1xuXHRcdFx0XHRjb25zdCBwYXRoID0gdXJpID8gdGhpcy5fZm9ybWF0UGF0aCh1cmkpIDogJyh1bmtub3duKSc7XG5cdFx0XHRcdGZpbGVzLnB1c2goeyBwYXRoLCBpbnNlcnRpb25zOiBjLmluc2VydGlvbnMsIGRlbGV0aW9uczogYy5kZWxldGlvbnMgfSk7XG5cdFx0XHRcdHRvdGFsSW5zZXJ0aW9ucyArPSBjLmluc2VydGlvbnM7XG5cdFx0XHRcdHRvdGFsRGVsZXRpb25zICs9IGMuZGVsZXRpb25zO1xuXHRcdFx0fVxuXHRcdFx0dG90YWxGaWxlcyA9IGZpbGVzLmxlbmd0aDtcblx0XHR9IGVsc2UgaWYgKGNoYW5nZXMgJiYgIUFycmF5LmlzQXJyYXkoY2hhbmdlcykpIHtcblx0XHRcdC8vIEFscmVhZHkgaW4gc3VtbWFyeSBmb3JtIFx1MjAxNCB3ZSBkb24ndCBoYXZlIHBlci1maWxlIGRhdGEuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gY2hhbmdlcyBhcyB7IGZpbGVzOiBudW1iZXI7IGluc2VydGlvbnM6IG51bWJlcjsgZGVsZXRpb25zOiBudW1iZXIgfTtcblx0XHRcdHRvdGFsSW5zZXJ0aW9ucyA9IHN1bW1hcnkuaW5zZXJ0aW9ucztcblx0XHRcdHRvdGFsRGVsZXRpb25zID0gc3VtbWFyeS5kZWxldGlvbnM7XG5cdFx0XHR0b3RhbEZpbGVzID0gc3VtbWFyeS5maWxlcztcblx0XHR9XG5cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2Vzc2lvbl9pZDogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0dG90YWxfZmlsZXM6IHRvdGFsRmlsZXMsXG5cdFx0XHR0b3RhbF9pbnNlcnRpb25zOiB0b3RhbEluc2VydGlvbnMsXG5cdFx0XHR0b3RhbF9kZWxldGlvbnM6IHRvdGFsRGVsZXRpb25zLFxuXHRcdFx0ZmlsZXM6IGZpbGVzLnNsaWNlKDAsIDIwKSwgLy8gY2FwIHNvIExMTSBjb250ZXh0IHN0YXlzIGJvdW5kZWRcblx0XHRcdHRydW5jYXRlZDogZmlsZXMubGVuZ3RoID4gMjAsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogR2F0aGVyIHRoZSBsYXN0IE4gdXNlci9hc3Npc3RhbnQgdHVybnMgb2YgYSBjb2Rpbmcgc2Vzc2lvbiBcdTIwMTQgYWN0dWFsXG5cdCAqIGNvbnZlcnNhdGlvbiBjb250ZW50LCB0cmltbWVkIGZvciBzcG9rZW4gc3VtbWFyaXphdGlvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dhdGhlclNlc3Npb25UaHJlYWQoY29kaW5nX3Nlc3Npb25faWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbGFzdE46IG51bWJlcik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVTZXNzaW9uKGNvZGluZ19zZXNzaW9uX2lkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25faWQ6IGNvZGluZ19zZXNzaW9uX2lkID8/IG51bGwsIHR1cm5zOiBbXSwgbm90ZTogJ3Nlc3Npb25fbm90X2ZvdW5kJyB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRzZXNzaW9uX2lkOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHR1cm5zOiBbXSxcblx0XHRcdFx0bm90ZTogJ2NoYXRfbW9kZWxfbm90X2xvYWRlZCcsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCByZXFzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5zbGljZSgtbGFzdE4pO1xuXHRcdGNvbnN0IHR1cm5zID0gcmVxcy5tYXAocmVxID0+IHtcblx0XHRcdGNvbnN0IHVzZXJUZXh0ID0gcmVxLm1lc3NhZ2UudGV4dCB8fCAnJztcblx0XHRcdGNvbnN0IGFzc2lzdGFudFRleHQgPSByZXEucmVzcG9uc2U/LnJlc3BvbnNlLnZhbHVlXG5cdFx0XHRcdC5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKVxuXHRcdFx0XHQubWFwKHAgPT4gKHAgYXMgeyBjb250ZW50OiB7IHZhbHVlOiBzdHJpbmcgfSB9KS5jb250ZW50LnZhbHVlKVxuXHRcdFx0XHQuam9pbignICcpXG5cdFx0XHRcdC5zbGljZSgwLCA2MDApIHx8ICcnO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXNlcjogdXNlclRleHQuc2xpY2UoMCwgNDAwKSxcblx0XHRcdFx0YXNzaXN0YW50OiBhc3Npc3RhbnRUZXh0LFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzZXNzaW9uX2lkOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHR0dXJuX2NvdW50OiB0dXJucy5sZW5ndGgsXG5cdFx0XHR0dXJucyxcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBSZW5kZXIgYSBVUkkgYXMgYSBzaG9ydCByZWxhdGl2ZS1pc2ggcGF0aCBmb3Igc3Bva2VuIHN1bW1hcmllcy4gKi9cblx0cHJpdmF0ZSBfZm9ybWF0UGF0aCh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0Ly8gVGFrZSBsYXN0IDIgc2VnbWVudHMgXHUyMDE0IGVub3VnaCBmb3IgdGhlIG1vZGVsIHRvIGlkZW50aWZ5IHRoZSBmaWxlXG5cdFx0Ly8gd2l0aG91dCBkdW1waW5nIGZ1bGwgd29ya3NwYWNlIHBhdGhzIGludG8gdGhlIHByb21wdC5cblx0XHRjb25zdCBwYXJ0cyA9IHVyaS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdGlmIChwYXJ0cy5sZW5ndGggPD0gMikge1xuXHRcdFx0cmV0dXJuIHVyaS5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJ0cy5zbGljZSgtMikuam9pbignLycpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UsIFZvaWNlVG9vbERpc3BhdGNoU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQiw4QkFBOEI7QUFDM0QsU0FBc0csY0FBYyxxQkFBcUIsdUJBQXVCO0FBQ2hLLFNBQWlDLDhCQUE4QjtBQUMvRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUduQyxTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBcUUsdUJBQXVCLHFCQUFxQjtBQUNqSCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLG9DQUFvQztBQW9DN0MsU0FBUyxvQkFBb0IsT0FBc0U7QUFDbEcsU0FBTztBQUFBLElBQ04sWUFBWSxNQUFNO0FBQUEsSUFDbEIsTUFBTSxNQUFNLFNBQVM7QUFBQSxJQUNyQixRQUFRLE1BQU0sU0FBUztBQUFBLEVBQ3hCO0FBQ0Q7QUFFQSxTQUFTLG1CQUFtQixPQUF1QjtBQUNsRCxTQUFPLE1BQU0sWUFBWSxFQUFFLFFBQVEsY0FBYyxFQUFFO0FBQ3BEO0FBR08sU0FBUyxr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
